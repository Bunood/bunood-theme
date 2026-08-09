# Upstream issue draft — `is_rtl()` misses every RTL language it doesn't name

**Target:** `frappe/frappe` · **Not filed yet.** Filing is an outward action; this
draft exists so doing it is a paste, not a reconstruction. Our own mitigation
(detection + migrate-time warning, never correction) is in `bunood_theme/setup.py`
and the suite's `direction:` gate — see `ARCHITECTURE.md` §9 for why correcting
`dir` locally would half-flip the desk.

---

**Title:** `is_rtl()` is an exact-match list of four codes; every other RTL
language renders LTR while its translations resolve RTL

**Body:**

`frappe/utils/jinja_globals.py`:

```python
def is_rtl(rtl=None):
    from frappe import local
    if rtl is None:
        return local.lang in ["ar", "he", "fa", "ps"]
    return rtl
```

Two asymmetries follow:

1. **No parent-language resolution.** `frappe.translate.get_parent_language`
   resolves `ar-SA → ar` for translations, so a dialect-coded site loads Arabic
   strings — but `is_rtl` compares the exact code, so the same site renders
   `dir="ltr"`. Translations and direction disagree for every dialect code.

2. **The list is four languages.** CLDR marks (at least) `ur`, `ckb`, `ku`,
   `sd`, `ug`, `yi`, `dv`, `ks` as right-to-left; all of them ship in
   `frappe/geo/languages.json`. A site set to Urdu gets Urdu translations on a
   left-to-right desk.

Because `www/app.py` derives `layout_direction` from `is_rtl()` **and**
`bundled_asset()` picks the `rtl_*.bundle.css` variant from the same call, the
failure is at least consistent — which also means downstream apps cannot fix it
piecemeal: overriding `layout_direction` alone yields RTL markup styled by the
LTR stylesheet.

**Suggested fix**, preserving the existing shape:

```python
RTL_LANGUAGES = {"ar", "he", "fa", "ps", "ur", "ckb", "ku", "sd", "ug", "yi", "dv", "ks"}

def is_rtl(rtl=None):
    from frappe import local
    from frappe.translate import get_parent_language
    if rtl is None:
        lang = local.lang or "en"
        return lang in RTL_LANGUAGES or (get_parent_language(lang) or "") in RTL_LANGUAGES
    return rtl
```

Reproduction: set `System Settings.language = "ur"` (or create any `ar-*`
Language row), load `/app`, observe `<html dir="ltr">` with RTL translations
applied.
