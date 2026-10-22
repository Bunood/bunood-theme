"""The page that serves /people and every route under it.

It carries nothing of its own to look at: the colours, the Arabic face and the
riyal sign come from bunood-theme's two stylesheets, the web sheet (the compiled
tokens, light and dark) and the site's brand sheet (the tenant's seeds and face).
The page links both and stamps ``data-hr-theme="bunood"`` on <html>, and the
app's bridge points frappe-ui's semantic variables at the tokens under that
attribute. A site without the theme gets ``data-hr-theme="frappe-ui"``: no bridge
rule matches, and the app renders on frappe-ui's own defaults.
"""

import frappe
from frappe import _
from frappe.sessions import get_csrf_token
from frappe.translate import get_all_translations

from bunood_hr.api.access import has_hr_role

no_cache = 1

RTL_LANGS = {"ar", "fa", "he", "ur"}


def theme_sheets() -> list[str]:
	"""The theme's web sheet and the site's brand sheet, or nothing.

	Read through the theme's own helpers so the hashed filenames are never
	restated here. ``_brand_css_url`` is private to the theme; if it moves, the
	brand sheet drops out and the page keeps the web sheet's shipped palette.
	"""
	if "bunood_theme" not in frappe.get_installed_apps():
		return []
	sheets = []
	try:
		from bunood_theme.assets import WEB_CSS

		sheets.append(WEB_CSS)
	except ImportError:
		return []
	try:
		from bunood_theme.context import _brand_css_url

		brand = _brand_css_url()
		if brand:
			sheets.append(brand)
	except Exception:
		frappe.log_error(title="Bunood HR: brand sheet unavailable")
	return sheets


#: Every string the app shows carries this translation context, so the page can
#: send only its own messages instead of the whole bench's dictionary.
CONTEXT = "Bunood HR"


def app_messages(lang: str) -> dict[str, str]:
	if lang == "en":
		return {}
	every = get_all_translations(lang)
	marker = ":" + CONTEXT
	messages = {k: v for k, v in every.items() if marker in k}
	# Record names the screens show as words: leave types and nationalities.
	# Frappe and HRMS translate these themselves; the page only forwards them.
	for name in frappe.get_all("Leave Type", pluck="name") + frappe.get_all("Country", pluck="name"):
		if name in every:
			messages[name] = every[name]
	return messages


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=" + frappe.request.path
		raise frappe.Redirect
	if not has_hr_role():
		frappe.throw(_("Only HR users can open this page.", context="Bunood HR"), frappe.PermissionError)

	lang = frappe.local.lang or "en"
	sheets = theme_sheets()
	context.lang = lang
	context.dir = "rtl" if lang.split("-")[0] in RTL_LANGS else "ltr"
	context.hr_theme = "bunood" if sheets else "frappe-ui"
	# The person's own Light / Dark / Automatic, as the Desk uses it. Automatic is
	# resolved in the browser (main.js), where the OS preference is known.
	desk_theme = frappe.db.get_value("User", frappe.session.user, "desk_theme")
	context.theme = {"Dark": "dark", "Automatic": "automatic"}.get(desk_theme, "light")
	context.theme_sheets = sheets
	context.title = _("HR", context="Bunood HR")
	context.boot = {
		"bnd_hr": {
			"user": frappe.session.user,
			"full_name": frappe.utils.get_fullname(frappe.session.user),
			"lang": lang,
			"dir": context.dir,
			"company": frappe.defaults.get_user_default("Company"),
			"messages": app_messages(lang),
		},
		"csrf_token": get_csrf_token(),
		"site_name": frappe.local.site,
	}
	return context
