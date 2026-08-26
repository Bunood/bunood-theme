# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Install and migrate lifecycle.

WHAT
    Seeds Theme Settings defaults and regenerates the per-site brand stylesheet.
    Runs on ``after_install`` and on every ``after_migrate``.

WHY after_migrate MATTERS AS MUCH AS after_install
    Two failure modes it repairs, both learned the hard way:

    1. **A field ``default`` only applies to NEW records.** Theme Settings is a Single
       that already exists on every upgraded site, so adding a field with
       ``"default": "C"`` leaves it EMPTY there. The previous version of this theme
       shipped exactly that bug and the value came back blank on the live site. Any new
       field must therefore be seeded here explicitly.

    2. **A database-only restore leaves a stale or absent brand CSS file.** The file
       lives on disk, the URL lives in the database; restoring one without the other
       desynchronises them. Regenerating on migrate makes that self-healing.

    Seeding is idempotent — it only fills values that are currently empty, so a
    customer's choices are never overwritten by an upgrade.
"""

import frappe

from bunood_theme.brand import write_brand_css
from bunood_theme.printing.install import sync_print_theme
from bunood_theme.registry import default_desk_order
from bunood_theme.typography import DEFAULT_FACE as _DEFAULT_FACE
from bunood_theme.presets import (
    CHART_DEFAULTS,
    CHROME_DEFAULTS,
    CRUMB_DEFAULTS,
    EMPTY_DEFAULTS,
    FILTERS_DEFAULTS,
    FORM_DEFAULTS,
    ICON_DEFAULTS,
    LIST_DEFAULTS,
    LOGIN_DEFAULTS,
    OVERLAY_DEFAULTS,
    REPORT_DEFAULTS,
    SKELETON_DEFAULTS,
    WEB_DEFAULTS,
    EMAIL_DEFAULTS,
    PRINT_DEFAULTS,
    VIEWS_DEFAULTS,
    WORKSPACE_DEFAULTS,
    DEFAULT_DESK_LAYOUT,
    DEFAULT_SIDEBAR_PRESET,
    INBOX_DEFAULTS,
    MOBILE_DEFAULTS,
    PALETTE_DEFAULTS,
    SIDEBAR_PRESETS,
    LINKS_DEFAULTS,
    STATUS_DEFAULTS,
    USER_DEFAULTS,
)

#: Check-type fields whose shipped default is 1. These CANNOT go through the
#: truthiness seeding in :data:`DEFAULTS`: an admin's explicit 0 is falsy and
#: would be flipped back to 1 on every migrate. They are seeded only when the
#: value is ``None`` — i.e. the field has never been written at all.
#:
#: The container on/off fields (slice 2c) belong here for a second reason as
#: well as that one: a migration patch writes them from what the site's layout
#: RENDERED, and it runs before this seeder. None-aware seeding is what makes
#: the patch's answer stick — truthiness seeding would overwrite every 0 it had
#: just written, which is precisely "the layout decides" surviving the change
#: meant to end it.
CHECK_DEFAULTS = {
    field: value
    for defaults in (
        CHART_DEFAULTS,
        CRUMB_DEFAULTS,
        EMPTY_DEFAULTS,
        FILTERS_DEFAULTS,
        FORM_DEFAULTS,
        ICON_DEFAULTS,
        LIST_DEFAULTS,
        LOGIN_DEFAULTS,
        OVERLAY_DEFAULTS,
        REPORT_DEFAULTS,
        SKELETON_DEFAULTS,
        WEB_DEFAULTS,
        EMAIL_DEFAULTS,
        PRINT_DEFAULTS,
        VIEWS_DEFAULTS,
        WORKSPACE_DEFAULTS,
        PALETTE_DEFAULTS,
        INBOX_DEFAULTS,
        STATUS_DEFAULTS,
        USER_DEFAULTS,
        LINKS_DEFAULTS,
        CHROME_DEFAULTS,
        MOBILE_DEFAULTS,
    )
    for field, value in defaults.items()
    if isinstance(value, int)
}
# The palette kit's master gate (item 12). Lived in DEFAULTS since item 4,
# where truthiness seeding would flip an admin's explicit 0 back to 1 on
# every migrate — the tagline bug's exact shape, caught by the v0.8.0
# release review before it could bite.
CHECK_DEFAULTS["enable_command_palette"] = 1

#: Values seeded on install and re-checked on every migrate. Only applied when the
#: current value is empty, so this is safe to re-run forever.
DEFAULTS = {
    "company_name": "Bunood",
    "brand_color": "#4d8756",
    "accent_color": "#4463f0",
    # Item 7(b). Read from the face catalogue, never restated: typography.py is
    # the one table, and this seeder is just another of its consumers. Seeded
    # here because a field `default` only applies to NEW records and Theme
    # Settings already exists on every upgraded site.
    "arabic_font": _DEFAULT_FACE,
    # Density site default (decision "G with C"). Seeded here because a field
    # `default` only applies to NEW records and Theme Settings already exists on
    # every upgraded site — the exact bug v1 shipped with nav_layout.
    "default_density": "Comfortable",
    # Desk layout (checklist item 9). "Top Bar" is the layout the user chose as
    # the default: global bar above the page, breadcrumb title row, slim status
    # bar below. Same seeding rationale as default_density.
    #
    # Named in presets.py rather than spelt out here because the CONTAINER
    # defaults are derived from this layout's catalogue row: a literal in both
    # places is a shipped default that can disagree with what the shipped
    # default renders.
    "desk_layout": DEFAULT_DESK_LAYOUT,
    # Sidebar style kit (item 10): seed the default preset's name and every
    # one of its field values. Values, not the name, are the canon — see
    # bunood_theme/presets.py.
    "sidebar_preset": DEFAULT_SIDEBAR_PRESET,
    # E3: the tenants' desk order, seeded from the registry so the field's
    # default and the table cannot drift. The suite pins the doctype's literal
    # default to the same function.
    "desk_order": default_desk_order(),
    **SIDEBAR_PRESETS[DEFAULT_SIDEBAR_PRESET],
    # Breadcrumb (item 11) + palette (item 12) kits: the Select fields only —
    # the Check fields live in CHECK_DEFAULTS above, where None-aware seeding
    # protects an admin's explicit 0.
    **{f: v for f, v in CRUMB_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in CHART_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in WORKSPACE_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in FORM_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in LIST_DEFAULTS.items() if not isinstance(v, int)},
    # Report / datatable surface (item 26): the three Select axes — style,
    # grain and row feedback. The Check (report_checkbox_reveal) is seeded via
    # CHECK_DEFAULTS above, None-aware so an admin's explicit 0 survives.
    **{f: v for f, v in REPORT_DEFAULTS.items() if not isinstance(v, int)},
    # Alternate views surface (item 27): the four Select axes — style, band,
    # mark and media fit. The Check (views_reveal) is seeded via CHECK_DEFAULTS
    # above, None-aware so an admin's explicit 0 survives.
    **{f: v for f, v in VIEWS_DEFAULTS.items() if not isinstance(v, int)},
    # Overlays surface (item 28): the three Select axes — style, scrim and menu
    # row. No Check in this kit; its repairs are contracts, not options.
    **{f: v for f, v in OVERLAY_DEFAULTS.items() if not isinstance(v, int)},
    # Empty states (item 29): one Select, the anchor. No Check in this kit —
    # its repairs are contracts, not options, and the media/action axes are
    # their own slice.
    **{f: v for f, v in EMPTY_DEFAULTS.items() if not isinstance(v, int)},
    # Loading states (item 30): one Select, the anchor. No Check — the bone
    # repair and the geometry floors are contracts, not options.
    **{f: v for f, v in SKELETON_DEFAULTS.items() if not isinstance(v, int)},
    # Filters (item 31): three Selects — the anchor, the applied signal and the
    # saved-filter rows. No Check; the six repairs are contracts, not options.
    **{f: v for f, v in FILTERS_DEFAULTS.items() if not isinstance(v, int)},
    # Sign-in (item 32): one Select, the anchor. No Check — the eight repairs
    # are contracts, and this is the only kit whose anchor is a server-rendered
    # body class rather than an <html> attribute, because /login is a website
    # page with no boot payload and no JS.
    **{f: v for f, v in LOGIN_DEFAULTS.items() if not isinstance(v, int)},
    # Item 33. Same shape as the line above and for the same reason: the website
    # kit is the SECOND whose anchor is a server-rendered body class rather than
    # an <html> attribute, because a website page has no boot payload and no JS.
    **{f: v for f, v in WEB_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in EMAIL_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in PRINT_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in PALETTE_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in INBOX_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in STATUS_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in USER_DEFAULTS.items() if not isinstance(v, int)},
    **{f: v for f, v in LINKS_DEFAULTS.items() if not isinstance(v, int)},
    # Icon system (item 23): the relocated sidebar/crumb fields plus the new
    # axes, all Selects — a fresh install seeds these; existing sites keep their
    # own via the v0_15_0 patch.
    **{f: v for f, v in ICON_DEFAULTS.items() if not isinstance(v, int)},
}

#: The complete shipped-default map: what a fresh install writes, for every
#: field the theme owns.
#:
#: WHY IT IS NAMED HERE AND NOT COMPOSED AT EACH USE SITE
#:     `{**DEFAULTS, **CHECK_DEFAULTS}` was being written out by every consumer
#:     that needed it — the smoke suite, the fingerprint tool — each restating a
#:     composition rule that only this module should own. The split between the
#:     two maps exists for SEEDING (a Check needs None-aware seeding so an
#:     admin's explicit 0 survives a migrate); it is an implementation detail of
#:     installation and means nothing to a reader asking "what ships by default".
#:     They get this.
SHIPPED = {**DEFAULTS, **CHECK_DEFAULTS}

#: Label of the user-menu density toggle. Module-level so the seeder and any
#: future remover agree on the one string that identifies our row.
NAVBAR_DENSITY_LABEL = "Toggle Density"


def after_install() -> None:
    """Seed defaults, the navbar toggle, the first brand stylesheet, and print."""
    _seed_defaults()
    _seed_navbar_density_item()
    write_brand_css()
    # Print Style "Bunood" + the business Print Formats + the bilingual Letter
    # Head, synced from the files in printing/ and letterhead/ (the source of
    # truth). Internally guarded step by step — a failure logs and never blocks
    # an install, and defaults are claimed only from vacancy (a stock print
    # style, a site with no default letter head).
    sync_print_theme()
    print("\n✅ Bunood Theme installed")
    print("→ Configure at /app/theme-settings\n")


#: Languages written right-to-left, per CLDR. A fact table about the world,
#: like ``registry.REGION_LABELS`` — NOT a copy of Frappe's ``is_rtl`` list,
#: which is the four-element subset under indictment here. The smoke suite
#: holds every entry to the browser's own CLDR (``Intl.Locale`` textInfo), so
#: a typo or a wrong entry fails a test rather than mis-warning a tenant.
#: `ku` is deliberately ABSENT: Kurmanji Kurdish is written in Latin script and
#: CLDR marks it LTR — only `ckb` (Sorani) runs right-to-left. It was listed
#: here, called "Sorani" by the design notes, and the suite's CLDR cross-check
#: refused it on its first run. That is the check doing its one job.
RTL_LANGS = frozenset({"ar", "he", "fa", "ps", "ur", "ckb", "sd", "ug", "yi", "dv", "ks"})


def is_rtl(lang: str | None = None) -> bool:
    """Whether ``lang`` (or the current request's language) is RTL — CORRECTLY.

    THE SINGLE SOURCE OF TRUTH for the fix described in
    ``bunood_theme/i18n/rtl_patch.py``, ``hooks.py``'s ``jinja.methods`` entry,
    and ``context.py::desk_context``'s ``layout_direction`` override — all
    three call THIS function rather than each carrying its own language-list
    logic, so ``RTL_LANGS`` stays the one place that can go stale.

    Resolves to the parent language exactly the way
    ``frappe.translate.get_all_translations`` already does for the dialect
    case (strip everything from the first ``-`` or ``_``) — the same
    resolution ``_warn_unreachable_rtl`` used to perform before checking
    Frappe's broken ``is_rtl()``; this function now performs it and answers
    correctly instead of just noticing the mismatch.
    """
    code = lang or getattr(frappe.local, "lang", None) or ""
    parent = code.split("-")[0].split("_")[0]
    return parent in RTL_LANGS


def _defend_identity_overrides(lang: str = "ar") -> None:
    """Restore our translations that a later app erased with identity rows.

    The runtime dictionary is one flat merge in ``installed_apps`` order and
    this app sits third of ten, so any later app's row wins. Measured
    2026-08-10: ksa_compliance ships rows whose "translation" IS the English
    source — ``Errors → Errors``, ``Live → Live``, ``My Profile``, ``Toggle
    Full Width`` — which erased our Arabic for those strings on every desk.

    A ``Translation`` doctype row outranks every app file, and THIS defect
    class is mechanically recognisable: the merged dict serving exactly the
    msgid while our own file ships a real translation is never a vocabulary
    choice, it is a hole punched by a lazily-exported file. So the defense is
    DERIVED on every migrate rather than listed: recompute, upsert a
    ``Translation`` row per hole, delete our row when the hole closes. A later
    app's genuinely DIFFERENT translation is deliberately left to win — that
    is a vocabulary question for the human review pass, not for a migrate
    hook.

    Upsert, never insert: ``Translation`` has no uniqueness constraint, and N
    rows for one (language, source_text) make the winner arbitrary.
    """
    try:
        from frappe.translate import get_translations_from_apps, get_translation_dict_from_file

        ours = get_translation_dict_from_file(
            frappe.get_app_path("bunood_theme", "translations", f"{lang}.csv"),
            lang,
            "bunood_theme",
        )
        if not ours:
            return
        # THE FILE LAYER ONLY, never the merged dict: our own defensive
        # Translation rows feed the merge and outrank every file, so asking
        # the merged dict "is the hole still there?" always answers no while
        # the defense exists — the first draft of this flapped heal/release
        # on alternate migrates for exactly that reason. The files are where
        # the hole lives, so the files are what gets asked.
        files = get_translations_from_apps(lang)

        healed, released = 0, 0
        for msgid, our_value in ours.items():
            hole = files.get(msgid) == msgid and our_value != msgid
            existing = frappe.db.get_value(
                "Translation",
                {"language": lang, "source_text": msgid, "contributed": 0},
                ["name", "translated_text"],
                as_dict=True,
            )
            if hole:
                if existing:
                    if existing.translated_text != our_value:
                        frappe.db.set_value("Translation", existing.name, "translated_text", our_value)
                        healed += 1
                else:
                    frappe.get_doc(
                        {
                            "doctype": "Translation",
                            "language": lang,
                            "source_text": msgid,
                            "translated_text": our_value,
                        }
                    ).insert(ignore_permissions=True)
                    healed += 1
            elif existing and existing.translated_text == our_value:
                # Our defensive row, for a hole that has since closed (the
                # offending app fixed its file, or left). Release it so the
                # file layer answers again — a defense that outlives its
                # defect is just another stale override. Only rows carrying
                # exactly OUR value are released: a row a human edited in the
                # desk is theirs, not ours to reap.
                frappe.delete_doc("Translation", existing.name, ignore_permissions=True, force=True)
                released += 1

        if healed or released:
            frappe.db.commit()
            frappe.translate.clear_cache()
            print(
                "bunood_theme: defended %d translation(s) a later app had erased with "
                "identity rows; released %d whose hole has closed" % (healed, released)
            )
    except Exception:
        frappe.log_error("bunood_theme: _defend_identity_overrides failed")


def after_migrate() -> None:
    """Re-seed newly added fields and regenerate the brand stylesheet.

    Both steps are required on every migrate — see the module docstring for why
    neither is redundant with ``after_install``.
    """
    _seed_defaults()
    _seed_navbar_density_item()
    write_brand_css()
    # Same contract as after_install: the files in printing/ and letterhead/
    # are the source of truth, so every migrate re-syncs the managed records
    # (drift self-heals; local edits to MANAGED records are overwritten by
    # design — duplicate a format to customize, see printing/README.md).
    sync_print_theme()
    # _warn_unreachable_rtl() retired 2026-08-13: it existed to warn about
    # RTL_LANGS codes Frappe's is_rtl() couldn't reach. bunood_theme.i18n
    # .rtl_patch now reaches them at RENDER time (see that module and
    # is_rtl() above) — a language that used to trigger this warning now
    # renders correctly, so warning about it would be noise, not signal.
    _defend_identity_overrides()


def _seed_navbar_density_item() -> None:
    """Put a "Toggle Density" action into Frappe's own user menu, idempotently.

    Navbar Settings is the NATIVE way to add a command to the settings dropdown —
    an ``Action``-type Navbar Item whose ``action`` string is evaluated on click
    (ERPNext seeds "Delete Demo Data" exactly this way). Using it means zero DOM
    manipulation, correct positioning, and Frappe owns the rendering.

    Idempotent by label so migrate can re-run forever; failure never blocks an
    install — a missing menu item degrades to "toggle via console", not a broken
    site.
    """
    try:
        ns = frappe.get_doc("Navbar Settings")
        if any((r.item_label or "") == NAVBAR_DENSITY_LABEL for r in ns.settings_dropdown):
            return
        ns.append(
            "settings_dropdown",
            {
                "item_label": NAVBAR_DENSITY_LABEL,
                "item_type": "Action",
                # bunood.js defines this global; cycles "" -> Comfortable -> Compact.
                "action": "bunood_theme.cycle_density()",
                "is_standard": 0,
                "hidden": 0,
            },
        )
        ns.save(ignore_permissions=True)
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(str(e), "Bunood Theme navbar density item")


def on_theme_settings_update(doc, method=None) -> None:
    """``doc_events`` handler — react to a Theme Settings save.

    Three steps, each needed for a save to actually reach users:

    1. Regenerate the brand stylesheet (colours/density travel by CSS). Passes
       ``doc`` through so :func:`write_brand_css` does not re-read the document
       it was just handed.
    2. Re-substitute the print carriers (item 35): the Print Style record and
       the Letter Head both hold CONCRETE hexes substituted from this doc's
       seeds — without this step a brand change would repaint the desk and
       leave every printed document on the old colours, which is exactly the
       silent-drift class the substitution mechanism exists to remove. Guarded
       inside :func:`printing.install.resync_print_brand` so a print failure
       can never block the save.
    3. Clear the site cache. The desk layout travels in ``frappe.boot``, and
       boot payloads are CACHED PER USER — without this, a layout change would
       reach each user only whenever their session cache happened to expire,
       which reads as "the setting is broken". A full clear on a settings save
       is a deliberate, rare cost.
    """
    write_brand_css(doc)
    try:
        from bunood_theme.printing.install import resync_print_brand

        resync_print_brand(doc)
    except Exception:
        frappe.log_error("bunood_theme: print resync after Theme Settings save failed")
    try:
        frappe.clear_cache()
    except Exception:
        frappe.log_error("bunood_theme: clear_cache after Theme Settings save failed")


def _seed_defaults() -> None:
    """Fill any empty Theme Settings field from :data:`DEFAULTS`.

    Uses ``set_single_value`` rather than ``doc.save()`` deliberately: saving would fire
    ``on_update``, which regenerates the brand CSS, which we are about to do once
    anyway — and during ``after_install`` the document may not be fully constructed.

    ``update_modified=False`` ON EVERY WRITE HERE, AND IT IS NOT AN OPTIMISATION
        ``set_single_value`` bumps ``modified`` unless told not to, and this runs
        on **every** ``after_migrate``. Any upgrade that adds a field therefore
        gave the document a new timestamp — so every Theme Settings form that
        happened to be open anywhere became stale, and the admin's next save
        died with:

            Theme Settings has been modified after you have opened it
            (…, …). Please refresh to get the latest document.

        Reported repeatedly, and reproduced on 2026-08-07 by opening the form,
        performing one seeding-shaped write, and saving. The container split
        added four fields in one session and so produced it four times.

        ``modified`` means "when a user last changed this", and it is what
        Frappe's optimistic-concurrency check compares. Seeding fills values the
        user never set; recording it as their edit is both untrue and the thing
        that breaks their open form. The values still land — only the claim that
        a human made them does not.
    """
    try:
        if not frappe.db.exists("DocType", "Theme Settings"):
            return  # pre-migrate; nothing to seed yet
        for field, value in DEFAULTS.items():
            if not frappe.db.get_single_value("Theme Settings", field):
                frappe.db.set_single_value("Theme Settings", field, value, update_modified=False)
        # Default-on Checks: seed ONLY the never-written state, so an admin
        # who turned one off stays off across migrates. get_single_value is
        # useless here — it CASTS a missing Check to 0 (verified live), so
        # "never written" must be read as row-absence in tabSingles. Raw SQL
        # because Singles is a bare table, not a DocType.
        stored = {
            row[0]
            for row in frappe.db.sql(
                "select field from tabSingles where doctype=%s", ("Theme Settings",)
            )
        }
        for field, value in CHECK_DEFAULTS.items():
            if field not in stored:
                frappe.db.set_single_value("Theme Settings", field, value, update_modified=False)
        frappe.db.commit()
    except Exception as e:
        # Never let seeding block an install or a migrate.
        frappe.log_error(str(e), "Bunood Theme seed defaults")
