"""The sign-in page's server-rendered context (``context._auth_context``).

Runs the real function from ``bunood_theme/context.py`` against a fake ``frappe``,
the way ``test_print_preview.py`` does: the function and the module constants it
reads are lifted out of the source with ``ast``, and every seam it calls into
(brand sheet, vendor marks, identity meta) is a recording stub. No site, no bench.
"""

import ast
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "bunood_theme" / "context.py"

ARABIC = {
	"Login": "تسجيل الدخول",
	"Update Password": "تحديث كلمة المرور",
	"Language": "اللغة",
}


class Context(dict):
	"""Frappe's ``_dict``: attribute access over a dict."""

	__getattr__ = dict.get

	def __setattr__(self, key, value):
		self[key] = value


def load(names, frappe, **extra):
	"""Exec the named top-level functions and constants of context.py in a fake scope."""
	tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
	wanted = []
	for node in tree.body:
		if isinstance(node, ast.FunctionDef) and node.name in names:
			wanted.append(node)
		elif isinstance(node, ast.Assign) and any(
			isinstance(t, ast.Name) and t.id in names for t in node.targets
		):
			wanted.append(node)
	scope = {"frappe": frappe, **extra}
	exec(compile(ast.Module(body=wanted, type_ignores=[]), str(SOURCE), "exec"), scope)
	return scope


def fake_frappe(lang="ar", query=b""):
	translate = ARABIC if lang == "ar" else {}
	return SimpleNamespace(
		_=lambda text: translate.get(text, text),
		get_cached_value=lambda *args: None,
		get_hooks=lambda name: [],
		local=SimpleNamespace(lang=lang, request=SimpleNamespace(path="/login", query_string=query)),
	)


SHIPPED_PAIR = [{"code": "ar", "name": "العربية"}, {"code": "en", "name": "English"}]


def run_auth_context(frappe, template="www/login.html", title="Login", offered=SHIPPED_PAIR, banner=None):
	seen = {}

	def identity_meta(context, compose_title=False):
		seen["title"] = context.get("title")

	scope = load(
		{"_auth_context", "_auth_language_switch", "AUTH_BODY_CLASS", "AUTH_CLASSES", "VENDOR_MARK"},
		frappe,
		_add_brand_sheet=lambda context: None,
		_vendor_marks=lambda context: None,
		_tenant_branding=lambda: {"logo": "", "company_name": ""},
		_attr=lambda value: value,
		_identity_meta=identity_meta,
	)
	presets = SimpleNamespace(
		LOGIN_DEFAULTS={"login_style": "Split", "login_action": "Neutral", "login_theme": "Follow OS"}
	)
	language = SimpleNamespace(offered_languages=lambda settings=None: list(offered))
	setup = SimpleNamespace(is_rtl=lambda code: code.split("-")[0] in {"ar", "fa", "he", "ur"})
	context = Context(template=template, title=title, body_class="")
	if banner is not None:
		context.banner_html = banner
	modules = {
		"bunood_theme": SimpleNamespace(presets=presets, language=language, setup=setup),
		"bunood_theme.presets": presets,
		"bunood_theme.language": language,
		"bunood_theme.setup": setup,
	}
	with patch.dict(sys.modules, modules):
		scope["_auth_context"](context)
	return context, seen


class AuthTitleTests(unittest.TestCase):
	def test_the_sign_in_tab_title_follows_the_page_language(self):
		context, seen = run_auth_context(fake_frappe("ar"))
		self.assertEqual(seen["title"], "تسجيل الدخول", "translated before the tenant name is composed onto it")
		self.assertIn("bnd-auth", context.body_class.split())

	def test_the_update_password_route_gets_its_own_title(self):
		_, seen = run_auth_context(fake_frappe("ar"), template="www/update-password.html", title="")
		self.assertEqual(seen["title"], "تحديث كلمة المرور")

	def test_an_english_page_keeps_frappes_title(self):
		_, seen = run_auth_context(fake_frappe("en"))
		self.assertEqual(seen["title"], "Login")


def choices(context):
	"""The switch's links as (attributes, text) pairs, parsed from banner_html."""
	from html.parser import HTMLParser

	found = []

	class Parser(HTMLParser):
		def handle_starttag(self, tag, attrs):
			if tag == "a":
				found.append([dict(attrs), ""])

		def handle_data(self, data):
			if found and found[-1][1] == "":
				found[-1][1] = data

	Parser().feed(context.banner_html or "")
	return found


class AuthLanguageSwitchTests(unittest.TestCase):
	def test_the_switch_offers_the_sites_languages_in_their_own_script(self):
		context, _ = run_auth_context(fake_frappe("ar"))
		self.assertIn('class="bnd-auth-language-switch" role="group" aria-label="اللغة"', context.banner_html)
		(ar, ar_text), (en, en_text) = choices(context)
		self.assertEqual((ar_text, ar["lang"], ar["dir"], ar["hreflang"]), ("العربية", "ar", "rtl", "ar"))
		self.assertEqual((en_text, en["lang"], en["dir"]), ("English", "en", "ltr"))
		self.assertEqual(ar.get("aria-current"), "true", "the page's own language is the current choice")
		self.assertNotIn("aria-current", en)

	def test_the_offered_list_decides_not_a_fixed_pair(self):
		three = SHIPPED_PAIR + [{"code": "ur", "name": "اردو"}]
		context, _ = run_auth_context(fake_frappe("en"), offered=three)
		self.assertEqual([attrs["lang"] for attrs, _ in choices(context)], ["ar", "en", "ur"])
		self.assertEqual([a.get("aria-current") for a, _ in choices(context)], [None, "true", None])

	def test_one_offered_language_draws_no_switch(self):
		context, _ = run_auth_context(fake_frappe("ar"), offered=SHIPPED_PAIR[:1])
		self.assertNotIn("bnd-auth-language-switch", context.banner_html or "")

	def test_a_dialect_marks_its_parent_language_current(self):
		context, _ = run_auth_context(fake_frappe("ar-SA"))
		self.assertEqual([a.get("aria-current") for a, _ in choices(context)], ["true", None])

	def test_the_links_keep_the_query_and_carry_no_path(self):
		frappe = fake_frappe("en", query=b"redirect-to=%2Fdesk%2Fhome&_lang=en")
		context, _ = run_auth_context(frappe)
		hrefs = [attrs["href"] for attrs, _ in choices(context)]
		self.assertEqual(hrefs, ["?redirect-to=%2Fdesk%2Fhome&_lang=ar", "?redirect-to=%2Fdesk%2Fhome&_lang=en"])
		self.assertNotIn("/login", context.banner_html, "the request path is never echoed")

	def test_a_hostile_query_stays_inert_text(self):
		frappe = fake_frappe("en", query=b'x="><script>alert(1)</script>')
		context, _ = run_auth_context(frappe)
		self.assertNotIn("<script", context.banner_html)
		links = choices(context)
		self.assertEqual(len(links), 2, "the payload opened no element of its own")
		self.assertEqual(links[0][0]["href"], "?x=%22%3E%3Cscript%3Ealert%281%29%3C%2Fscript%3E&_lang=ar")

	def test_an_admin_language_name_is_escaped(self):
		odd = [{"code": "ar", "name": "<b>عربي</b>"}, {"code": "en", "name": "English"}]
		context, _ = run_auth_context(fake_frappe("ar"), offered=odd)
		self.assertIn("&lt;b&gt;عربي&lt;/b&gt;", context.banner_html)

	def test_a_site_banner_is_kept_first(self):
		context, _ = run_auth_context(fake_frappe("ar"), banner="<p>Maintenance tonight</p>")
		self.assertTrue(context.banner_html.startswith("<p>Maintenance tonight</p><div class=\"bnd-auth-language-switch\""))

	def test_the_reset_route_gets_the_switch_too(self):
		frappe = fake_frappe("ar", query=b"key=abc123")
		context, _ = run_auth_context(frappe, template="www/update-password.html", title="")
		self.assertEqual(choices(context)[1][0]["href"], "?key=abc123&_lang=en")


if __name__ == "__main__":
	unittest.main()
