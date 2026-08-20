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
    "sidebar_active_style",
    "sidebar_section_layout",
    "sidebar_hue_wash",
    "sidebar_surface_intensity",
    "sidebar_menu_rail",
    "sidebar_rail_trigger",
    "sidebar_rail_button",
    "sidebar_rail_button_shape",
    "sidebar_pane_width",
    "sidebar_apps_rail",
    "sidebar_badges",
    "sidebar_remember_sections",
    "sidebar_scroll_fades",
]

#: The preset catalogue. "Bunood Night" is the shipped default — the user's
#: chosen combination, re-chosen on 2026-08-08: attached and solid rather than
#: floating glass, a step wider, the pane following the theme colour, and no
#: rail button (its rendering was broken; the rail still opens on hover).
#: "Bunood Light" keeps the earlier floating-glass look, so the old shipped
#: appearance remains one click away rather than gone.
SIDEBAR_PRESETS = {
    "Bunood Night": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        # Inert while the material is Solid, kept so flipping back to Glass
        # restores the look that was tuned, not a default.
        "sidebar_glass_opacity": "4",
        "sidebar_blur": "Soft",
        "sidebar_color": "Match Theme",
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Rich",
        "sidebar_surface_intensity": "3",
        # Always expanded, because the re-chosen look is "attached, solid, a
        # step wider" — a pane that collapses to a 52px rail shows none of
        # those. The rail lives on in Bunood Light and the picker.
        "sidebar_menu_rail": "Always Expanded",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        # Trigger, shape and icon are inert while the mode has no rail and the
        # button is None — kept so flipping back restores a tuned look, same
        # rule as the glass fields above.
        "sidebar_rail_button_shape": "Circle",
        "sidebar_pane_width": "3",
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
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Rich",
        "sidebar_surface_intensity": "3",
        "sidebar_menu_rail": "Rail",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "Edge",
        "sidebar_rail_button_shape": "Circle",
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
        "sidebar_active_style": "Solid Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
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
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Off",
        "sidebar_surface_intensity": "1",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
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
        "sidebar_active_style": "Glow Ring",
        "sidebar_section_layout": "Plain",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
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
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
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
        "sidebar_active_style": "Soft Pill",
        "sidebar_section_layout": "Mini-Cards",
        "sidebar_hue_wash": "Subtle",
        "sidebar_surface_intensity": "2",
        "sidebar_menu_rail": "Always Expanded",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
        "sidebar_pane_width": "2",
        "sidebar_apps_rail": 0,
        "sidebar_badges": "Off",
        "sidebar_remember_sections": 0,
        "sidebar_scroll_fades": 1,
    },
    # Renamed from "Operator" for item 7. ERPNext already translates "Operator"
    # as a MACHINE OPERATOR — a person — in Manufacturing (downtime_entry,
    # downtime_analysis). Frappe's dictionary is one flat global map, so the
    # word cannot mean a person there and a sidebar preset here: whichever
    # Arabic ships, one of the two reads wrong. Renaming ours is the only fix
    # with no blast radius. "Workbench" also says what the preset IS — solid,
    # minimal colour, monochrome icons, no blur — where "Operator" named the
    # person it was for.
    "Workbench": {
        "sidebar_placement": "Attached",
        "sidebar_material": "Solid",
        "sidebar_glass_opacity": "3",
        "sidebar_blur": "Off",
        "sidebar_color": "Minimal",
        "sidebar_active_style": "Accent Rail",
        "sidebar_section_layout": "Divided",
        "sidebar_hue_wash": "Off",
        "sidebar_surface_intensity": "1",
        "sidebar_menu_rail": "Manual Collapse",
        "sidebar_rail_trigger": "Hover",
        "sidebar_rail_button": "None",
        "sidebar_rail_button_shape": "Circle",
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


#: Icon system fields (item 23), relocated from the sidebar and breadcrumb kits
#: into one axis. Presets no longer write these; a fresh install seeds the
#: values below, and the v0_15_0 patch carries each existing site's own choice
#: across the rename. Values are Select LABELS; bunood.js owns label -> css-slug.
ICON_FIELDS = [
    "icon_style",
    "icon_weight",
    "icon_source",
    "icon_rail_button",
    "icon_crumbs",
]

ICON_DEFAULTS = {
    "icon_style": "Colored Chips",
    # New axis (Phase 3): the glyph stroke, normalised across the sprite grids so
    # this is the weight you actually get. 1.5 is Frappe's own declared value,
    # made true everywhere for the first time.
    "icon_weight": "1.5",
    "icon_source": "Smart",
    "icon_rail_button": "Chevron",
    "icon_crumbs": "First Crumb",
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
    "home_placement": "Side Pane Start",
    "apps_placement": "Side Pane Start",
}

USER_DEFAULTS = {"user_placement": "Top Bar End"}

#: List view kit fields (item 16), matching theme_settings.json. Like crumbs
#: and unlike the sidebar, there is NO preset catalogue: the style IS the
#: top-level choice and the two treatments compose with any style.
LIST_FIELDS = [
    "list_style",
    "list_hover",
    "list_selection",
    "list_checkbox_reveal",
]

#: The shipped list defaults — the user's own picks from the item-16 wireframe
#: round (2026-08-09): 1C Floating Cards, 2B Edge Rail, 3C Bold Bar, 4A reveal.
#: The bolder option each time, consistent with the sidebar re-choice the day
#: before. "Original" stays one click away for anyone who wants stock rows.
LIST_DEFAULTS = {
    "list_style": "Floating Cards",
    "list_hover": "Edge Rail",
    # One treatment for checked rows AND the bulk header: they are one state,
    # and splitting them is how a solid brand bar ends up over neutral rows.
    "list_selection": "Bold Bar",
    # A Check, and default-on: rows rest clean, selection is one gesture away,
    # and the option stands down wholesale on touch screens ((hover: none)).
    "list_checkbox_reveal": 1,
}

#: Form view kit fields (item 18), matching theme_settings.json. Like the
#: list and unlike the sidebar, there is NO preset catalogue: the style IS
#: the top-level choice and the treatments compose with any style.
FORM_FIELDS = [
    "form_style",
    "form_tabs",
    "form_sidebar",
    "form_grid_checkbox_reveal",
]

#: The shipped form defaults — the user's own picks from the item-18 wireframe
#: round (2026-08-10): 1C Floating Panels, 2C Solid Pill, 3C Floating Pane,
#: 4A reveal. The bolder option each time, consistent with the item-16 round.
#: "Original" stays one click away for anyone who wants the stock form.
FORM_DEFAULTS = {
    # One treatment for sections, the child grid's frame AND the connections
    # dashboard: they are one container statement, and splitting them is how
    # a floating section ends up beside a naked flat grid.
    "form_style": "Floating Panels",
    "form_tabs": "Solid Pill",
    # Styling only — the sidebar has no Off here. Hiding chrome is a
    # container concern; attachments and assignments must stay reachable.
    "form_sidebar": "Floating Pane",
    # A Check, default-on: the same three-door contract as the list kit's
    # reveal (hover, :focus-within, any-checked), stood down on touch.
    "form_grid_checkbox_reveal": 1,
}

#: Workspace tile surface fields (item 25), matching theme_settings.json. Like the
#: other surface kits, no preset catalogue: the style IS the top-level choice.
#: workspace_metric (the number-card interior) is a separate axis, added in slice 5.
WORKSPACE_FIELDS = [
    "workspace_style",
    "workspace_metric",
    "workspace_rows",
    "workspace_menu_reveal",
]

#: The shipped workspace defaults — the item-25 wireframe picks (2026-08-16):
#: 1C Hairline Grid, 4C Edge Rail, reveal on. "Original" stays one click away.
#: Hairline Grid was picked over the recommended Mixed Weights "for now"; both
#: ship, so switching the default later is one value and no code.
WORKSPACE_DEFAULTS = {
    # One statement over canvas, tile and gutter — a gapless style requires zero
    # gutter, so they cannot be separate fields without composing a non-style.
    "workspace_style": "Hairline Grid",
    # The number card's interior (axis 2). Display: an eyebrow label over a value
    # that steps up with the card's own width.
    "workspace_metric": "Display",
    # One treatment over link rows AND quick-list rows: a style cannot ship
    # divided links beside undivided quick-list rows.
    "workspace_rows": "Edge Rail",
    # A Check, default-on: the tile ⋯ menus rest hidden, revealed on hover or
    # keyboard focus, stood down wholesale on touch.
    "workspace_menu_reveal": 1,
}

#: Chart surface fields (item 25), matching theme_settings.json. One axis, and
#: NO "Original": the base --charts-* theming is always on (raw vendor hex is
#: worse, never a choice), so the axis picks only where the visual weight sits.
CHART_FIELDS = [
    "chart_grid",
]

#: The shipped chart default — the item-25 wireframe pick (2026-08-16): 3E Filled
#: Area, the area under a line carrying the chart, over the three-product-agreed
#: Ruled Baseline and the other frame treatments.
CHART_DEFAULTS = {
    "chart_grid": "Filled Area",
}

#: Report / datatable surface fields (item 26), matching theme_settings.json.
#: The family shape the other kits established: one anchor whose first option is
#: "Original", two composing treatment axes, one presence-only Check. The
#: fieldnames stay report_* though the picker is labelled "Data tables" — the
#: build guard requires the prefix, and the label is independent of it.
REPORT_FIELDS = [
    "report_style",
    "report_grain",
    "report_rows",
    "report_checkbox_reveal",
]

#: The shipped report defaults — the item-26 wireframe picks (2026-08-17):
#: Pinned Slab · Row Stripes · Edge Rail · reveal on. "Original" stays one click
#: away and is a total stand-down. Edge Rail (not Bold Bar) is the row default
#: on purpose: it keeps a 30-column report legible during a large multi-select
#: AND adds no new contrast pair to the gate.
REPORT_DEFAULTS = {
    # The anchor: one statement over cell canvas, grid lines, and the header
    # band — a header slab cannot ship beside a naked total row (they are the
    # same structural object), so they compose, not split.
    "report_style": "Pinned Slab",
    # The table's background grain — Row Stripes reads the eye down a 500-row
    # report the way grouping would. Plain is the neutral.
    "report_grain": "Row Stripes",
    # One treatment over hover AND selection: both write background on the same
    # opaque .dt-cell, so two fields would let a hover read louder than a select.
    "report_rows": "Edge Rail",
    # A Check, default-on: a row's checkbox rests hidden, revealed on hover or
    # keyboard focus, stood down wholesale on touch. Route-gated to the two
    # report routes (hiding it in a MultiSelectDialog removes that surface's
    # whole point) — the guard lives in the stylesheet's scope, item 26 slice 3.
    "report_checkbox_reveal": 1,
}

#: Alternate-views surface fields (item 27), matching theme_settings.json. ONE
#: kit over four views — kanban, calendar, gantt, gallery — so the anchor
#: (views_style) dresses all four and each treatment axis reaches only the views
#: that can honestly take it: the band is the kanban column, the mark is the
#: calendar event, the media fit is the gallery tile. Gantt takes the anchor and
#: the dark-mode repairs and no axis of its own. The family shape the other four
#: kits established: one anchor whose first option is "Original", composing
#: treatment axes, one presence-only Check.
VIEWS_FIELDS = [
    "views_style",
    "views_band",
    "views_mark",
    "views_media",
    "views_reveal",
]

#: The shipped alternate-views defaults — the item-27 wireframe picks
#: (2026-08-17): Floating Cards · Tinted · Chip · Cover · reveal on. "Original"
#: stays one click away and is a total stand-down across all four views.
VIEWS_DEFAULTS = {
    # The anchor: how a record becomes an OBJECT — a kanban card, a gallery
    # tile, a calendar chip, a gantt bar — as one statement of fill, boundary
    # and elevation. Floating Cards is the bolder option, consistent with every
    # prior round. Split from the axes below so a style cannot ship a floating
    # card beside a naked flat tile.
    "views_style": "Floating Cards",
    # The kanban column band (the grouping band item 26 deferred here). Tinted
    # washes the whole column in its status hue with legible ink over it — never
    # a solid fill under a label, the WCAG failure item 22 closed on the pill.
    "views_band": "Tinted",
    # The calendar EVENT mark — its shape, not its colour (colour is inline and
    # JS-fed, themed separately by the prepare_colors wrap). Chip is the filled
    # block; Dot and Outlined are the quieter reads. Calendar only: a gantt bar
    # cannot be a dot, so offering it there would be a picker that lies.
    "views_mark": "Chip",
    # The gallery tile's image fit. Cover fills the frame (Frappe's own default,
    # object-fit: cover at image_view.scss:148); Contain shows the whole image.
    "views_media": "Cover",
    # A Check, default-on: a gallery tile's zoom/checkbox and a kanban card's
    # menu rest hidden, revealed on hover or keyboard focus, stood down wholesale
    # under (hover: none) so touch always shows them.
    "views_reveal": 1,
}

OVERLAY_FIELDS = [
    "overlay_style",
    "overlay_scrim",
    "overlay_menu",
]

#: The shipped overlay defaults — the item-28 wireframe picks (2026-08-18):
#: Floating · Tinted · Inset. "Original" stays one click away and is a total
#: stand-down of the STYLE; the kit's repairs are contracts and survive it.
OVERLAY_DEFAULTS = {
    # The anchor: how a floating thing separates itself from the page beneath,
    # as ONE statement of fill, boundary, radius and elevation. Split, the
    # picker would permit "no boundary and no shadow" — a panel you cannot
    # find. Floating is frappe-ui's own dialog recipe (ring + deep shadow, no
    # border), so the desk agrees with Frappe's own design system.
    "overlay_style": "Floating",
    # The scrim behind a dialog, reaching the modal backdrop, #freeze and the
    # grid-row editor's backdrop together. Tinted is the theme's own ink,
    # mode-aware from one token; Dim is Frappe's unmapped --gray-800 wash.
    # MEASURED CONSTRAINT: two stacked dialogs paint TWO backdrops, both at
    # z 1040, so scrims COMPOUND — the value is tuned for the stacked case.
    "overlay_scrim": "Tinted",
    # The menu row's hover shape, over four dropdown vocabularies at once.
    # Inset is the majority idiom (frappe-ui, Discourse, shadcn, Directus) and
    # the only one that stays correct as the anchor's radius grows.
    "overlay_menu": "Inset",
}

EMPTY_FIELDS = [
    "empty_style",
]

#: The shipped empty-state defaults — the item-29 wireframe picks (2026-08-19),
#: as amended by the deep survey the same day.
EMPTY_DEFAULTS = {
    # The anchor: how a "nothing here" block separates itself from the surface
    # it sits in, as ONE statement of air, boundary and tone.
    #
    # OPEN, AND IT IS THE FIRST DEFAULT IN THIS PROJECT THAT IS NOT THE BOLDEST
    # OPTION. Every reference product's primary empty component is unframed —
    # the container's own frame does the framing — and this block sits INSIDE
    # containers other kits already frame, so boldness compounds instead of
    # standing alone. The original pick was Framed, on the reading that shadcn
    # frames its Empty in all eight styles; the deep survey overturned it
    # (the dashed edge is declared with no width, so it renders at zero in
    # every one), and Framed lost the evidence it was chosen on.
    #
    # Framed (a solid hairline) and Filled (a wash) remain the explicit bolder
    # choices; they never combine, because a box that separates by boundary AND
    # by tone is neither.
    "empty_style": "Open",
}

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
SHIPPED_CONTAINERS = ("topbar", "pagehead", "dock", "sidepane", "bottombar")

#: What a fresh install writes for each container it ships, derived from the
#: catalogue rather than restated beside it.
CHROME_DEFAULTS = {
    c["toggle"]: LAYOUT_CHROME[DEFAULT_DESK_LAYOUT][c["key"]]
    for c in CONTAINERS
    if c["key"] in SHIPPED_CONTAINERS
}

#: Mobile bar contents (item 24). Which tenants join search in the phone bottom
#: bar below 768px. Search has no toggle — it is the only search on a phone
#: (Frappe drops its own and Ctrl+K is unreachable on touch), so it is always
#: there; these three choose what joins it. All on by default: the shipped bar
#: is search / apps / alerts / you.
MOBILE_DEFAULTS = {
    "mobile_inbox": 1,
    "mobile_user": 1,
    "mobile_apps": 1,
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
    "inbox_placement": "Top Bar End",
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
