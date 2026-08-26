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
    "empty_media",
    "empty_action",
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
    # The mark above the message. Frappe draws a 40px stroked glyph
    # (`.icon-xl`) and colours it with an INLINE `stroke: var(--text-light)`,
    # which no rule can beat — but it READS a variable, so a scoped re-point
    # wins with no !important. Proven live before this axis was written.
    #
    # Glyph is the NEUTRAL and maps to "": the stock mark, already correct
    # because --text-light is bridged. Marked seats it on a tinted disc (the
    # shadcn/Directus badge idiom). None removes it, for a desk that wants its
    # empty states to be text alone — which is frappe-ui's own choice.
    "empty_media": "Marked",
    # The call to action. MEASURED, and it is this item's thesis: stock renders
    # the create button as `btn btn-default btn-sm` — background
    # rgb(251,253,252) with a 0px border, on a page ground of rgb(248,250,248).
    # A three-unit delta and no boundary, which makes the primary action of an
    # otherwise empty screen the least visible thing on it. Frappe's own
    # "primary" is no help: _bridge.scss:86 leaves --btn-primary unmapped.
    #
    # Plain is the NEUTRAL and maps to "" — stock, warts and all. Primary is
    # the real alternative.
    "empty_action": "Primary",
}

SKELETON_FIELDS = [
    "skeleton_style",
]

#: The shipped loading defaults — the item-30 wireframe picks (2026-08-19).
SKELETON_DEFAULTS = {
    # The anchor: how a loading state moves, if at all.
    #
    # SWEEP, the bolder pick and the market-dominant idiom (Discourse's chat and
    # dashboard skeletons, Directus's v-skeleton-loader). A band travels the
    # bone; prose pulses instead, because a travelling gradient across a
    # sentence is noise rather than information.
    #
    # "Still" is not "off" — it is the full bone treatment with no motion, and
    # it is EXACTLY what Pulse and Sweep render under prefers-reduced-motion.
    # Shipping it as an option makes that state previewable instead of hidden.
    "skeleton_style": "Sweep",
}

FILTERS_FIELDS = [
    "filters_style",
    "filters_applied",
    "filters_saved",
]

#: The shipped filter defaults — the item-31 wireframe picks (2026-08-20), as
#: amended 2026-08-21 by the gap round over Frappe's own newer apps.
FILTERS_DEFAULTS = {
    # The anchor: how a filter SLOT is bounded, answered in all three places at
    # once — the strip's controls, a condition row in the popover, and a saved
    # filter's row.
    #
    # OUTLINED, and it is a REDECISION. The wireframe round picked Trough (the
    # band recessed, slots flush in it), on frappe-ui's `TabButtons` grammar.
    # Reading Frappe's own current apps overturned that: `p-px` — the trough's
    # signature — appears on ZERO filter or toolbar nodes across crm v1.79.0,
    # helpdesk v1.27.0, insights, gameplan and drive, and crm uses `TabButtons`
    # zero times. The trough is reserved there for mutually-exclusive segmented
    # switchers. Outlined is the most directly cited pole instead: Discourse's
    # select-kit header is literally a resting filter control carrying a
    # full-strength named input border.
    #
    # It is also the pole furthest from Original in the one dimension the
    # contracts do NOT occupy — a visible edge at rest — so the anchor earns
    # its existence rather than shading a state R7 already owns. Trough, Pill
    # and Ruled all ship.
    "filters_style": "Outlined",
    # How "this list is filtered" reads. The CONTRACT already guarantees it is
    # legible (stock measures 1.02:1 in dark); this axis chooses its character.
    #
    # ACCENTED, and it KNOWINGLY diverges from Frappe's own language, which is
    # a neutral raised chip plus a shape change and no colour at all — that is
    # this kit's `Quiet` pole, and it ships. The reason for diverging is the
    # phone: the count lives inside `.button-label.hidden-xs`, so below 768 a
    # neutral chip signals nothing, and Accented is the only pole that still
    # reads there. Discourse reaches the same answer independently, repainting
    # the filter header to the same token as an active nav pill.
    #
    # Quiet is the NEUTRAL and maps to "".
    "filters_applied": "Accented",
    # The saved-filter menu's rows. `.saved-filter-item` has ZERO CSS in the
    # entire Frappe bundle, so any treatment is a guaranteed-visible delta from
    # nothing — and three of four reference products ship no saved-view UI at
    # all, which is why a small amount of care here is worth more than
    # anywhere else in the item.
    #
    # LISTED: row height, inline padding, truncation, a hover AND
    # :focus-visible ground, and the create row separated from the saved ones —
    # `data-name="create_new"` is the one CSS-reachable discriminator in the
    # family. What it deliberately does NOT do is mark the ACTIVE saved filter:
    # the DOM carries no bit saying which one it is (no class, no attribute, no
    # aria-current — only a mutated text node, lost on reload), and a surface
    # mounts nothing. That half is filed upstream.
    #
    # Plain is the NEUTRAL and maps to "".
    "filters_saved": "Listed",
}


LOGIN_FIELDS = [
    "login_style",
    "login_action",
    "login_theme",
]

#: The shipped sign-in defaults -- the item-32 wireframe round, closed
#: 2026-08-21. Artifact:
#: https://claude.ai/code/artifact/46b356b4-b1e6-4f50-9285-62af96f98001
LOGIN_DEFAULTS = {
    # THE ANCHOR. Four poles, and the round picked the boldest -- consistent
    # with every previous round (Floating Cards, Bold Bar, Solid Pill, Floating
    # Pane, Floating Panels).
    #
    #   Original  the stand-down. Stock geometry: the card is the same colour as
    #             the page, 0px border, no shadow, pinned 60px from the top
    #             inside a wrapper reserving 220px for a footer the same
    #             stylesheet hides. The eight CONTRACTS still apply -- that is
    #             the whole of the contract/style split.
    #   Panel     the card becomes an object: our surface fill on the page
    #             ground, a hairline ring, a soft lift, vertically centred.
    #   Split     THE DEFAULT. A full-height form column beside a brand panel.
    #             The only pole where the brand gets real estate rather than a
    #             32px logo, and the only one whose composition a visitor reads
    #             before they read any text.
    #   Plate     a brand wash across the ground with the card floating on it.
    #             Brand presence at a fraction of Split's cost.
    #
    # `Bare` was drawn and DROPPED in the round, before a line was written: with
    # no card it discharges the card's identification with nothing, leaning
    # entirely on the field boundaries, and once `Original` carries the contracts
    # the two are visually close. Item 27 dropped `Headed` and item 31 dropped
    # its group-by repair for the same reason.
    #
    # WHY SPLIT IS AFFORDABLE AS A DEFAULT, given it is the expensive pole:
    # its column rides FLEX ORDER rather than insets, so it flips in Arabic with
    # no direction-aware rule at all (Frappe flips this page with its own
    # build-time rtlcss pass, and GUIDELINES 1.3 says ours must not compound);
    # and below Frappe's own 576px collapse the art panel drops and every pole
    # converges, so it costs one media query rather than a second layout.
    "login_style": "Split",
    # THE PRIMARY BUTTON. Stock paints it `var(--gray-900)` -- near-black, and
    # also the page's own colour in dark, which is contract R7's defect. Neutral
    # is that repair left alone; Branded is the customer's seed on the one
    # control the page exists to offer.
    #
    # It costs NO contrast row, which is what made it an axis rather than an
    # argument: `--bnd-on-brand` on `--bnd-brand-solid` is the gate's "label on
    # a brand fill" (AA, eleven seeds, both modes) and the fill's edge against
    # the page is its "brand fill against the chrome" (1.4.11's 3:1, a cross
    # product over every surface). Both rows predate this item.
    #
    # Neutral is the NEUTRAL and maps to "".
    "login_action": "Branded",
    # WHO DECIDES LIGHT OR DARK. A guest has no `User.desk_theme` -- there is no
    # user -- so `prefers-color-scheme` is the only signal a logged-out page has
    # of its own, and it is the default.
    #
    # The axis exists because the DRAWINGS argued for it: Split and Plate carry
    # a brand COMPOSITION, and under OS-follow alone which one a visitor sees is
    # decided by their laptop rather than by the company. Every other visual
    # decision in this theme is the admin's. It costs no new mechanism -- the
    # mode is another body class, so `brand.py` never learns about it and the
    # per-site sheet stays colours-and-fonts.
    #
    # Follow OS is the NEUTRAL and maps to "".
    "login_theme": "Follow OS",
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



WEB_FIELDS = [
    "web_style",
    "web_header",
    "web_theme",
]

#: The shipped website/portal defaults -- the item-33 wireframe round, closed
#: 2026-08-23. Artifact:
#: https://claude.ai/code/artifact/a6d5f3a1-148e-4b38-808c-cf3000d32e96
WEB_DEFAULTS = {
    # THE ANCHOR. THREE poles, not four, and the round did NOT pick the boldest —
    # both of which break with every previous kit, so both are argued here rather
    # than left to look like oversights.
    #
    #   Original  the stand-down. Stock geometry, Frappe's white ground. The
    #             contracts still apply: the focus ring and the nineteen repaired
    #             text nodes are scoped bare `body.bnd-web` and survive this.
    #   Panel     THE DEFAULT. The page ground takes our tint and the content
    #             region becomes an object on it.
    #   Plate     a brand wash across the ground with the content plate floating
    #             on it. Brand presence at no layout cost.
    #
    # `Rail` was drawn and DROPPED in the round, on evidence rather than taste.
    # It gave the navigation rail a real surface — the loudest single defect in
    # the census, a 182px region with no fill and no border — but the rail exists
    # on twelve routes out of roughly twenty, and on `/me`, `/404`, `/message`
    # and the error page there is no navbar or rail at all. To ship it would have
    # had to carry Panel's card wherever its own subject was absent, and a shared
    # layout rule between poles is exactly what stacked item 32's `Split` below
    # its own form for three slices while both its checks stayed green. The rail
    # is repaired under the contracts instead, once for every pole.
    #
    # WHY `Panel` AND NOT THE BOLD ONE. Every previous round picked the boldest
    # pole. Here the argument is COVERAGE, measured: `Panel` and `Plate` both
    # render on every route in scope, but `Panel` is also the pole that resolves
    # the census's two-design-languages defect — `/me` is already a centred card
    # on a tinted ground while `/orders` is flat white, and Panel makes the
    # second look like the first rather than inventing a third language.
    "web_style": "Panel",
    # THE HEADER AXIS. Neutral -- the header on the surface colour -- or Branded,
    # the customer's brand fill. Default Branded because the product is
    # white-labelling and a portal that shows the brand nowhere is the failure
    # mode this item exists to fix; it costs no new contrast row (the
    # on-brand/brand-solid pair and the fill-against-chrome 3:1 row both predate
    # item 33). COMPOSES WITH `Original` unlike `login_action`'s stand-down: the
    # navbar is chrome present identically across all three poles, so branding it
    # is coherent under any geometry -- the Shopify/Stripe minimal-portal look --
    # whereas login's branded CTA sits INSIDE the card that Original leaves stock.
    "web_header": "Branded",
    # THE MODE AXIS, an exact mirror of `login_theme` and for the same reasons.
    # `Follow OS` is the NEUTRAL -- no class, no rule -- and it is the default
    # because a website visitor is not a user: there is no stored preference to
    # read, so their device is the only signal that exists. It is also the only
    # pole that is CACHE-SAFE BY CONSTRUCTION: it resolves in a media query on
    # the client, while the two `Always` poles are site state baked into HTML
    # Frappe caches under a key of (path, lang) and nothing else.
    "web_theme": "Follow OS",
}


EMAIL_FIELDS = [
    "email_style",
    "email_header",
    "email_action",
    "email_theme",
]

#: The shipped email defaults -- the item-34 wireframe round, closed 2026-08-25
#: AFTER the census rather than before it, which is why `Card` won.
EMAIL_DEFAULTS = {
    # THE ANCHOR. Four poles.
    #
    #   Original  the stand-down -- and it is NARROWER here than in any previous
    #             kit, which is the census's doing rather than a design choice.
    #             Contracts E1-E3 survive it: the floor, the footer at 4.17:1 and
    #             every link at 3.15:1. See below.
    #   Card      THE DEFAULT. A framed plate on a tinted ground -- frappe's own
    #             `with_container` intent, applied to every shape instead of one.
    #   Letter    ground, no plate. Typographic, and the pole that degrades best
    #             where a client strips backgrounds.
    #   Masthead  Card plus a brand-coloured band above it.
    #
    # WHY `Card` AND NOT THE BOLD ONE -- the SECOND round running to answer this,
    # after item 33's `Panel`, and for a related reason. The census measured that
    # a Notification email (the commonest shape a site sends, because
    # `notification.py:510` passes neither `header` nor `with_container`) has NO
    # opaque ancestor above any of its text: five of five elements, ink `#171717`,
    # ground whatever the mail client decides. `Card` is the only pole that
    # supplies a ground AND a plate on every shape by construction. `Masthead` was
    # the bolder draw and would have carried a saturated band into exactly the
    # clients whose forced dark inversion mangles one worst.
    #
    # AND THE FLOOR IS NOT THIS FIELD'S JOB. Because the defect is an absence
    # rather than an ugliness, the ground is a CONTRACT scoped outside the anchor
    # -- so `Original` still gets one. A pole may change what the floor LOOKS
    # like; none may take it away. That is item 31's rule ("a pole may not take
    # the slot's fill away") arriving one item later by a different route.
    "email_style": "Card",
    # THE CTA AXIS. Brand fill -- Outline -- Link.
    #
    # Stock is `#171717` at 17.93:1: accessible, and carrying no brand at all.
    # That is a different problem from an illegible one and it is worth being
    # precise about, because it decides the default. Nothing here is a REPAIR --
    # the contrast is already fine -- so the whole axis is style, and the default
    # is the one that does the item's job: the call to action is the single place
    # an email can carry a colour, and `Brand fill` is where it carries it.
    #
    # It costs NO new contrast row. `--bnd-brand-solid` + `--bnd-on-brand` are
    # jointly fitted (3:1 as a fill, 4.5:1 under their own label) at all eleven
    # gate seeds in both modes, so the guarantee comes from a row that has existed
    # since item 17 rather than from one measurement at one seed.
    # THE IDENTITY AXIS. Wordmark -- Logo -- Logo + wordmark -- None.
    #
    # `Logo + wordmark` is the default because it is the only form that
    # SURVIVES A BLOCKED IMAGE, and a blocked image is the normal case rather than
    # the edge: most clients suppress remote images until a reader asks for them.
    # With the name beside the mark the header still says who sent this; with the
    # mark alone it says nothing at all.
    #
    # AND THE MARK IS OFTEN ABSENT EVEN WHEN SET. This theme ships an SVG, and mail
    # clients do not render SVG -- Discourse strips it outright. So on a site that
    # has not uploaded a raster logo, which is most of them, every form that asks
    # for a mark falls through to the wordmark by construction. That is stated in
    # `email.py::RASTER_SUFFIXES` rather than discovered.
    "email_header": "Logo + wordmark",
    "email_action": "Brand fill",
    # THE MODE AXIS -- and the one pole in this kit whose FEASIBILITY had to be
    # established before it could be offered.
    #
    # Frappe ships no dark handling of any kind: no `prefers-color-scheme`, no
    # `color-scheme` meta, nothing. Directus drew a full dark block for its own
    # mail and COMMENTED IT OUT. So "can this even be done" was an open question,
    # and the census answered it: a `prefers-color-scheme` block survives Premailer
    # into a preserved `<style>`, and Premailer ADDS `!important` to every rule it
    # preserves -- which is exactly what lets the dark block beat the inlined light
    # value it would otherwise lose to.
    #
    # `Follow the client` is the NEUTRAL and the default, mirroring `login_theme`
    # and `web_theme`. The reasoning is not quite theirs, though, and the
    # difference matters: for a website page the argument is that HTML is cached
    # under (path, lang) so a stored per-visitor choice would leak. Here nothing is
    # cached -- but a message is composed ONCE and read by many people on many
    # devices, so a media query is still the only thing that can answer per reader.
    #
    # UNLIKE the other two kits, this axis is NOT a body class. It is resolved
    # server-side into which rules `email.py` emits, because a mail client cannot
    # be trusted to resolve a class-scoped media query -- Gmail strips <html> and
    # <body> outright. `email.py::EMAIL_CLASSES` therefore carries `email_style`
    # alone, and that asymmetry is deliberate rather than an omission.
    "email_theme": "Follow the client",
}


PRINT_FIELDS = [
    "print_header_style",
    "print_table_style",
    "print_totals_style",
    "print_heading_style",
    "print_accent",
    "print_letterhead",
]

#: The four SECTION AXES the print anchor decomposed into — the item-35 round's
#: final shape, at the user's direction ("custom customization settings for
#: different features ... to choose their own style with"). There is NO stored
#: preset field: the named styles are :data:`PRINT_PRESETS`, which write these
#: values and stop existing, and the picker's label DERIVES by comparison —
#: "Custom" the moment an axis differs. The settings-architecture doctrine
#: (presets write values, active label derived), applied to paper.
PRINT_AXES = [
    "print_header_style",
    "print_table_style",
    "print_totals_style",
    "print_heading_style",
]

#: The shipped print defaults — the item-35 round, closed 2026-08-26.
PRINT_DEFAULTS = {
    # THE COMPOSITION IS SOFT CARDS' — the user's explicit pick, and the first
    # default in this project chosen for FRIENDLINESS: every section a washed,
    # rounded panel, visually continuous with the desk's Floating Cards. The
    # washes are `--bnd-pane`/`--bnd-hover` — members of contrast_gate.SURFACES,
    # so every ink they carry rides a gate row fitted since item 17 at all
    # eleven seeds. Soft by construction, safe by the same construction.
    #
    # `Original` on every axis is the true stand-down — stock Redesign,
    # untouched — and the census cleared it for AA honestly (labels 7.08:1,
    # values 15.2:1), so offering it is not offering a defect.
    "print_header_style": "Wash Card",
    "print_table_style": "Washed",
    "print_totals_style": "Washed Panel",
    "print_heading_style": "Original",
    # THE ACCENT AXIS — how much of the tenant's colour reaches paper, a real
    # cost/identity trade the tenant owns. `Brand headings` is the NEUTRAL
    # (the sheet as authored: headings and rules in brand ink, fills quiet);
    # `Ink only` is the toner-saver; `Brand panels` — the user's pick for the
    # default — fills the table heads with the jointly fitted
    # brand-solid/on-brand pair, so the strongest presence still costs zero
    # new contrast rows. Thermal never sees any of this: 203dpi heads have no
    # grayscale, and the thermal blocks stay literal black by constraint.
    "print_accent": "Brand panels",
    # THE LETTERHEAD COMPOSITION — selected at SYNC time: the Letter Head
    # record a site stores carries one concrete layout, recomposed from the
    # marked blocks in letterhead/bunood_letterhead_header.html whenever the
    # axis or the seeds change. `Bilingual Split` is the user's pick and the
    # legacy convention kept: Arabic name right, mark centre, English left —
    # deliberately physical, a bilingual-letterhead convention, not RTL.
    # `Frappe's own` is the TRUE stand-down: the sync does not touch the
    # record at all, so a tenant's hand-made letterhead survives every save
    # (proved by a sentinel in the suite).
    "print_letterhead": "Bilingual Split",
}

#: The thirteen named styles of the wireframe round, as compositions over
#: :data:`PRINT_AXES` — minus `Side Column`, which measurement killed: its
#: layout needs CSS grid (or a DOM the formats do not have), and wkhtmltopdf
#: is Qt-WebKit 534 — a pole that renders as stock on the DEFAULT engine is
#: the renders-as-nothing class, recorded here rather than shipped.
#:
#: THE ONE COPY. The picker fetches this table over `bunood_theme.api`
#: (`print_presets`) rather than mirroring it in JS — a second copy is the
#: drift the derived label exists to prevent. The suite holds every row to
#: the doctype's own options and to pairwise distinctness, because two
#: presets with one composition would make the derived label ambiguous.
PRINT_PRESETS = {
    "Original": {
        "print_header_style": "Original",
        "print_table_style": "Original",
        "print_totals_style": "Original",
        "print_heading_style": "Original",
    },
    "Soft Cards": {
        "print_header_style": "Wash Card",
        "print_table_style": "Washed",
        "print_totals_style": "Washed Panel",
        "print_heading_style": "Original",
    },
    "Ruled Ledger": {
        "print_header_style": "Rule",
        "print_table_style": "Ruled",
        "print_totals_style": "Boxed",
        "print_heading_style": "Brand Ink",
    },
    "Quiet Minimal": {
        "print_header_style": "Hairline",
        "print_table_style": "Open",
        "print_totals_style": "Open",
        "print_heading_style": "Small Caps",
    },
    "Striped": {
        "print_header_style": "Band",
        "print_table_style": "Zebra",
        "print_totals_style": "Open",
        "print_heading_style": "Brand Ink",
    },
    "Brand Slab": {
        "print_header_style": "Band",
        "print_table_style": "Boxed",
        "print_totals_style": "Washed Panel",
        "print_heading_style": "Brand Ink",
    },
    "Boxed Classic": {
        "print_header_style": "Rule",
        "print_table_style": "Boxed",
        "print_totals_style": "Boxed",
        "print_heading_style": "Brand Ink",
    },
    "Edge Rail": {
        "print_header_style": "Rail",
        "print_table_style": "Ruled",
        "print_totals_style": "Open",
        "print_heading_style": "Brand Ink",
    },
    "Formal Serif": {
        "print_header_style": "Hairline",
        "print_table_style": "Open",
        "print_totals_style": "Open",
        "print_heading_style": "Serif",
    },
    "Poster Bold": {
        "print_header_style": "Rule",
        "print_table_style": "Ruled",
        "print_totals_style": "Inverse",
        "print_heading_style": "Poster",
    },
    "Bookends": {
        "print_header_style": "Band",
        "print_table_style": "Ruled",
        "print_totals_style": "Open",
        "print_heading_style": "Original",
    },
    "Blueprint": {
        "print_header_style": "Frame",
        "print_table_style": "Ruled",
        "print_totals_style": "Boxed",
        "print_heading_style": "Small Caps",
    },
}


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
