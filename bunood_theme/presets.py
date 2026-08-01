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
    "sidebar_quick_links",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
        "sidebar_quick_links": "Sidebar Top",
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
