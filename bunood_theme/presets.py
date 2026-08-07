# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Sidebar style presets — the single source of truth (item 10 / item 30).

WHAT
    Each preset is a complete assignment of every sidebar style field on Theme
    Settings. Three consumers, one dict:

    * ``setup.py``  seeds a fresh site with the default preset's values.
    * ``boot.py``   falls back to the default preset for any empty field, so a
                    half-seeded site still renders a coherent design.
    * ``api.get_sidebar_presets``  hands the dict to the Theme Settings picker,
                    which applies a preset client-side by setting the fields.

WHY VALUES ARE THE CANON AND PRESETS ARE SUGAR
    The stored per-field values are what boot delivers; the preset name is only
    a label. Applying a preset = writing its values into the fields. That means
    a tenant can start from any preset and diverge one option at a time, and
    nothing anywhere needs to understand "preset + overrides" — there is no
    such state, only values.

Field values are the Theme Settings Select LABELS (bunood.js owns the
label -> css-slug mapping). Keep labels in sync with theme_settings.json.
"""

from bunood_theme.registry import CONTAINERS, LAYOUT_CHROME

#: Ordered field names, matching theme_settings.json. Order matters only for
#: the picker's "does the current state match a preset?" comparison.
SIDEBAR_FIELDS = [
    "sidebar_placement",
    "sidebar_material",
    "sidebar_glass_opacity",
    "sidebar_blur",
    "sidebar_color",
    "sidebar_icon_style",
    "sidebar_active_style",
    "sidebar_section_layout",
    "sidebar_hue_wash",
    "sidebar_surface_intensity",
    "sidebar_menu_rail",
    "sidebar_rail_trigger",
    "sidebar_rail_button",
    "sidebar_rail_button_shape",
    "sidebar_rail_button_icon",
    "sidebar_icon_source",
    "sidebar_pane_width",
    "sidebar_apps_rail",
    "sidebar_badges",
    "sidebar_remember_sections",
    "sidebar_scroll_fades",
]

#: The preset catalogue. "Bunood Night" is the shipped default (the user's
#: chosen combination); "Bunood Light" is its daylight sibling — identical in
#: every option except the pane color, which follows the theme instead of
#: staying dark.
SIDEBAR_PRESETS = {
    "Bunood Night": {
        "sidebar_placement": "Floating",
        "sidebar_material": "Glass",
        "sidebar_glass_opacity": "4",
        "sidebar_blur": "Soft",
        "sidebar_color": "Dark Contrast",
        "sidebar_icon_style": "Colored Chips",
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Rich",
        "sidebar_surface_intensity": "3",
        "sidebar_menu_rail": "Rail",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "Edge",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Bunood Light": {
        "sidebar_placement": "Floating",
        "sidebar_material": "Glass",
        "sidebar_glass_opacity": "4",
        "sidebar_blur": "Soft",
        "sidebar_color": "Match Theme",
        "sidebar_icon_style": "Colored Chips",
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Rich",
        "sidebar_surface_intensity": "3",
        "sidebar_menu_rail": "Rail",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "Edge",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Daylight": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Match Theme",
        "sidebar_icon_style": "Colored Chips",
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Ink": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Minimal",
        "sidebar_icon_style": "Monochrome",
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Off",
        "sidebar_surface_intensity": "1",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Carbon": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Dark Contrast",
        "sidebar_icon_style": "Filled Color",
        "sidebar_active_style": "Glow Ring",
        "sidebar_section_layout": "Plain",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Paper": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Match Theme",
        "sidebar_icon_style": "Colored Dots",
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
    "Aurora": {
        "sidebar_placement": "Floating",
        "sidebar_material": "Glass",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Full",
        "sidebar_color": "Match Theme",
        "sidebar_icon_style": "Colored Chips",
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Always Expanded",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 1,
    },
    "Operator": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Minimal",
        "sidebar_icon_style": "Monochrome",
        "sidebar_active_style": "Accent Rail",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Off",
        "sidebar_surface_intensity": "1",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_rail_button_icon": "Chevron",
        "sidebar_icon_source": "Smart",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Counts",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 0,
    },
}

#: The default preset name — the user's chosen combination.
DEFAULT_SIDEBAR_PRESET = "Bunood Night"


#: Breadcrumb kit fields (item 11), matching theme_settings.json. Unlike the
#: sidebar there is no preset catalogue — the style IS the top-level choice
#: and the extras compose with any style, so defaults are a single dict.
CRUMB_FIELDS = [
    "crumb_style",
    "crumb_separator",
    "crumb_icons",
    "crumb_hover",
    "crumb_copy_link",
    "crumb_status_pill",
    "crumb_narrow_collapse",
]

#: The shipped default: "Quiet Trail" (muted ancestors, strong last crumb,
#: chevron separators, module chip on the first crumb, soft-pill hover) —
#: the wireframe the user picked as option A. "Original" leaves v16's stock
#: trail untouched, the same escape hatch the desk-layout picker offers with
#: "Classic". Values are Select LABELS; bunood.js owns label -> css-slug.
CRUMB_DEFAULTS = {
    "crumb_style": "Quiet Trail",
    "crumb_separator": "Chevron",
    "crumb_icons": "First Crumb",
    "crumb_hover": "Soft Pill",
    # Checks: 1/0, not labels. Copy-link defaults ON (hover-only affordance,
    # near-zero visual cost). The status pill AND the narrow collapse default
    # OFF: both visibly change pages, and the collapse in particular replaces
    # the last crumb — which on v16 form pages IS the page heading (no
    # separate h1) — with the parent link, hiding the open document's name on
    # small screens. Release review v0.6.2..HEAD reproduced that live; the
    # option stays opt-in until the collapse design keeps the title visible.
    "crumb_copy_link": 1,
    "crumb_status_pill": 0,
    "crumb_narrow_collapse": 0,
}


#: Command palette kit fields (item 12), matching theme_settings.json.
PALETTE_FIELDS = [
    "palette_style",
    "palette_frecency",
    "palette_footer",
    "palette_newtab",
    "palette_fallbacks",
    "palette_suggest",
    "palette_sigils",
]

#: Chrome placement + status bar fields (item 14, plus the search-placement
#: split the status work forced: search used to be welded into whichever bar
#: the layout mounted, so choosing a layout chose where search lived AND
#: fought the status segments for the same strip).
STATUS_FIELDS = [
    "search_placement",
    "status_style",
    "status_segments_jobs",
    "status_segments_errors",
    "status_segments_scheduler",
    "status_segments_connection",
    "status_segments_density",
    "status_clock",
    "status_interval",
    "status_freshness",
    "status_escalate",
]

#: The shipped defaults. Search sits centred in the top bar — the placement
#: modern desks converged on, and the one that leaves the bottom strip free
#: for status. "Quiet" is the status style: a healthy desk shows almost
#: nothing, and a segment only appears once it has earned attention.
#:
#: PLACEMENT IS A REQUEST, NOT A GUARANTEE: a layout without a top bar
#: (Classic, Dock) cannot honour "Top Bar Center", so bunood.js walks a
#: documented fallback chain rather than dropping the field silently.
STATUS_DEFAULTS = {
    "search_placement": "Top Bar Center",
    "status_style": "Quiet",
    "status_clock": "24 Hour",
    "status_interval": "60s",
    # Checks: segments a user is allowed to see. Permission is decided
    # elsewhere and always wins, so these mean "show if permitted", never
    # "show regardless": jobs and the scheduler are System Manager only,
    # while the error count self-gates on Error Log read — a permission
    # grantable to other roles, and therefore not assumed here.
    "status_segments_jobs": 1,
    "status_segments_errors": 1,
    "status_segments_scheduler": 1,
    "status_segments_connection": 1,
    "status_segments_density": 1,
    "status_freshness": 1,
    "status_escalate": 0,
}


#: Notification centre kit fields (item 13), matching theme_settings.json.
INBOX_FIELDS = [
    "inbox_style",
    "inbox_placement",
    "inbox_badge",
    "inbox_group",
    "inbox_chips",
    "inbox_row_actions",
    "inbox_arrival",
    "inbox_keyboard",
]

#: Where the bell goes, and the user menu. Component rework, slice 1.
#:
#: PLACEMENT IS ONE FIELD WHOSE FIRST OPTION IS "Off", deliberately: an
#: on/off Check plus a separate placement Select can disagree with itself,
#: and every defect in this area has come from two pieces of state
#: describing one thing. One field cannot contradict itself.
#:
#: "Side Pane" means Frappe's OWN row, where core put it — which is what
#: lets Classic stop being a special case in code and become a preset that
#: places everything at Side Pane.
PLACEMENT_FIELDS = ["inbox_placement", "user_placement"]

#: Kept in step with HOSTS in bunood.js. The labels are what the picker
#: shows; the slugs the client resolves are lowercased and de-spaced.
PLACEMENTS = ("Off", "Top Bar", "Bottom Bar", "Page Header", "Side Pane", "Dock")

#: The user menu's own placement. Same reasoning as inbox_placement, and the
#: same fresh-install answer — but this one carries Log Out, so the client
#: refuses to leave it unreachable however it is configured.
#: Home and All Apps place themselves (component rework, slice 2).
#:
#: They used to ride the sidebar style kit as one field, `sidebar_quick_links`,
#: which meant a preset chose where they lived and the two could never be
#: separated. `registry.py` has always called them two components; these are
#: their settings, and a sidebar preset no longer writes them.
LINKS_DEFAULTS = {
    "home_placement": "Sidebar Top",
    "apps_placement": "Sidebar Top",
}

USER_DEFAULTS = {"user_placement": "Top Bar"}

#: The desk layout a fresh install gets. Named once, because it seeds
#: ``desk_layout`` AND decides the container defaults below — two facts that
#: would otherwise be free to disagree, which is how the shipped default and
#: what the shipped default RENDERS drift apart.
DEFAULT_DESK_LAYOUT = "Top Bar"

#: Containers whose on/off field the doctype has actually grown.
#:
#: The container split lands one container per slice (ROADMAP phase 0, slice
#: 2c), and :data:`registry.LAYOUT_CHROME` names all five from the start —
#: authoring half a catalogue would be worse than none. Seeding a field the
#: doctype does not have yet would put an orphan row in ``tabSingles`` that
#: ``get_single_value`` then refuses to read back (it raises; measured), so the
#: seed is filtered to what exists. **This tuple grows with each slice and is
#: deleted with the last one** — when it lists every container it says nothing,
#: and `CHROME_DEFAULTS` should go back to being the whole catalogue row.
SHIPPED_CONTAINERS = ("topbar",)

#: What a fresh install writes for each container it ships, derived from the
#: catalogue rather than restated beside it.
CHROME_DEFAULTS = {
    c["toggle"]: LAYOUT_CHROME[DEFAULT_DESK_LAYOUT][c["key"]]
    for c in CONTAINERS
    if c["key"] in SHIPPED_CONTAINERS
}

#: The shipped default: "Inbox + Page" (the user's pick, option C) — our
#: panel over Frappe's own Notification Log (filter tabs, rollup by
#: document, reason chips, a REAL unread badge — Frappe's own badge code is
#: dead in this version: the selectors it toggles exist in no template, so
#: nothing renders however many unread rows there are) PLUS the full-page
#: triage surface the panel links to. "Bunood Inbox" is the same panel
#: without the page; "Refined" only restyles the stock panel; "Original"
#: leaves it alone entirely.
#:
#: Arrival tiering defaults to approvals-only: an approval blocking a
#: document earns an interruption, a share notification does not.
INBOX_DEFAULTS = {
    "inbox_style": "Inbox + Page",
    # Not a no-op default, and deliberately so: the bell has always been in
    # the top bar for the shipped layout, and seeding "Off" here would take
    # it away from every existing site on upgrade. The migration patch writes
    # what each layout ACTUALLY rendered; this is only what a fresh install
    # gets, and a fresh install gets the Top Bar layout.
    "inbox_placement": "Top Bar",
    "inbox_badge": "Count",
    "inbox_arrival": "Approvals Only",
    # Checks: behaviours inside a user-invoked panel, invisible until opened.
    "inbox_group": 1,
    "inbox_chips": 1,
    "inbox_row_actions": 1,
    "inbox_keyboard": 1,
}

#: The shipped default: "Bunood Palette" (the user's pick, option B) — our
#: shell over Frappe's own search sources, grouped sections, pinned fallback
#: rows, per-user frecency. "Original" leaves the stock Ctrl+K modal
#: untouched; "Refined" only restyles it; "Palette Pro" adds mode sigils and
#: the record-search stage. The legacy visible `enable_command_palette`
#: check is the kit's master gate: 0 forces Original whatever the style.
PALETTE_DEFAULTS = {
    "palette_style": "Bunood Palette",
    # Checks: 1/0, not labels. All default ON — they are behaviours inside a
    # user-invoked overlay, invisible until the palette is opened, unlike
    # the crumb extras that repaint standing chrome.
    "palette_frecency": 1,
    "palette_footer": 1,
    "palette_newtab": 1,
    "palette_fallbacks": 1,
    "palette_suggest": 1,
    "palette_sigils": 1,
}
