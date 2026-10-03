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


def run_auth_context(frappe, template="www/login.html", title="Login", **extra):
	seen = {}

	def identity_meta(context, compose_title=False):
		seen["title"] = context.get("title")

	scope = load(
		{"_auth_context", "AUTH_BODY_CLASS", "AUTH_CLASSES", "VENDOR_MARK"} | set(extra.pop("names", ())),
		frappe,
		_add_brand_sheet=lambda context: None,
		_vendor_marks=lambda context: None,
		_tenant_branding=lambda: {"logo": "", "company_name": ""},
		_attr=lambda value: value,
		_identity_meta=identity_meta,
		**extra,
	)
	presets = SimpleNamespace(
		LOGIN_DEFAULTS={"login_style": "Split", "login_action": "Neutral", "login_theme": "Follow OS"}
	)
	context = Context(template=template, title=title, body_class="")
	modules = {"bunood_theme": SimpleNamespace(presets=presets), "bunood_theme.presets": presets}
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


if __name__ == "__main__":
	unittest.main()
