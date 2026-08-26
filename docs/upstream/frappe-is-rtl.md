# Upstream issue draft — `is_rtl()` misses every RTL language it doesn't name

**Target:** `frappe/frappe` · **Not filed yet.** Filing is an outward action; this
draft exists so doing it is a paste, not a reconstruction. `bunood_theme` now
carries a LOCAL fix (`bunood_theme/i18n/rtl_patch.py`,
`bunood_theme/setup.py::is_rtl`, `context.py::desk_context`, and a matching
`frappe.utils.is_rtl` override in `bunood.js`) that closes the desk shell's
`dir` attribute and its CSS-bundle selection together — see that module's
docstring for exactly how and why a naive one-sided fix was rejected first.
That local fix is itself evidence for filing this, not a reason not to:
it cannot reach `frappe/www/printview.py` or `frappe/utils/pdf.py`, both of
which import `is_rtl` at module load time from code this app doesn't own —
print preview and PDF generation stay wrong for every language upstream
hasn't listed, and no app-level patch can close that. See `ARCHITECTURE.md`
§9 for why correcting `dir` alone, without also correcting the stylesheet
selection, would half-flip the desk.

---

**Title:** `is_rtl()` is an exact-match list of four codes, duplicated in
Python and JS; every other RTL language renders LTR while its translations
resolve RTL

**Body:**

`frappe/utils/jinja_globals.py`:

```python
def is_rtl(rtl=None):
    from frappe import local
    if rtl is None:
        return local.lang in ["ar", "he", "fa", "ps"]
    return rtl
```

`frappe/public/js/frappe/utils/utils.js` carries an independent, second copy
of the exact same four-code list:

```js
is_rtl(lang = null) {
    return ["ar", "he", "fa", "ps"].includes(lang || frappe.boot.lang);
},
```

Neither is derived from the other — `frappe.boot` carries no
`is_rtl`/`layout_direction`/`dir` field a client could instead trust, so the
defect has to be fixed twice, in two languages, or not at all.

Three asymmetries follow:

1. **No parent-language resolution.** `frappe.translate.get_parent_language`
   resolves `ar-SA → ar` for translations, so a dialect-coded site loads Arabic
   strings — but `is_rtl` compares the exact code, so the same site renders
   `dir="ltr"`. Translations and direction disagree for every dialect code.

2. **The list is four languages.** CLDR marks (at least) `ur`, `ckb`, `sd`,
   `ug`, `yi`, `dv`, `ks` as right-to-left in addition to the four already
   handled; all of them ship in `frappe/geo/languages.json`. A site set to
   Urdu gets Urdu translations on a left-to-right desk. (`ku` — Kurmanji
   Kurdish — is deliberately excluded from this list: it is written in Latin
   script and CLDR marks it LTR. Only `ckb`, Sorani Kurdish, is RTL. An
   earlier draft of this issue listed `ku` by mistake.)

3. **Duplicated in JS**, independently, with no shared source of truth — see
   above.

Because `frappe/www/desk.py` derives `layout_direction` from `is_rtl()`
**and** `bundled_asset()` (same module) picks the `rtl_*.bundle.css` variant
from the same call, the failure is at least consistent for the desk — which
also means downstream apps cannot fix the desk piecemeal: overriding
`layout_direction` alone yields RTL markup styled by the LTR stylesheet.
`frappe/www/printview.py` and `frappe/utils/pdf.py` bind `is_rtl` the same
import-time way, and are unreachable by any documented per-app hook — only
a fix in this file reaches them.

**Suggested fix**, preserving the existing shape:

```python
RTL_LANGUAGES = {"ar", "he", "fa", "ps", "ur", "ckb", "sd", "ug", "yi", "dv", "ks"}

def is_rtl(rtl=None):
    from frappe import local
    from frappe.translate import get_parent_language
    if rtl is None:
        lang = local.lang or "en"
        return lang in RTL_LANGUAGES or (get_parent_language(lang) or "") in RTL_LANGUAGES
    return rtl
```

...and the JS mirror in `public/js/frappe/utils/utils.js`, ideally driven by
the SAME list rather than a second hand-copied one (e.g. via a boot value),
so the two runtimes cannot drift apart the way they have.

Reproduction: set `System Settings.language = "ur"` (or create any `ar-*`
Language row), load `/app`, observe `<html dir="ltr">` with RTL translations
applied.

---

## What bunood_theme now closes locally (item 35, 2026-08-26) — and why this filing still matters

The theme's local mitigation grew from one patched module attribute to a
structural closure of the print/PDF half: `/printview`'s `layout_direction` is
overwritten in an `update_website_context` branch (an ordinary context key set
in `get_context`, and `frappe.get_print` renders /printview internally, so PDF
bodies inherit it), and the wkhtml/chrome header+footer sub-documents go
through last-wins `pdf_header_html`/`pdf_footer_html` hook registrations that
delegate to Frappe's implementations and correct the emitted `dir`.

Two findings from that work belong in this filing:

1. **The import-time binding is worse than "unreachable" — it is
   order-dependent.** In the common worker lifecycle `printview.py`/`pdf.py`
   import lazily, AFTER apps load, so a module-attribute patch of
   `jinja_globals.is_rtl` happens to reach their `from … import` bindings; any
   app that imports `frappe.utils.pdf` at module level flips the order and
   silently restores the four-code answer. The same fix in THIS file has no
   such failure mode — which is the argument for fixing it here.

2. **WeasyPrint has no direction plumbing at all** —
   `templates/print_format/print_format.html` hardcodes `<html lang="en">`
   with no `dir` attribute, so builder-beta formats are LTR for every
   language. No app-level hook reaches that render; only this repo can.
