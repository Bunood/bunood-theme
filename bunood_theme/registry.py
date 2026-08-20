# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The component registry — one table, several consumers.

WHAT
    Every piece of desk chrome this theme owns, described once: what kind of
    thing it is, which native affordance it replaces, and which regions it can
    occupy.

WHY IT EXISTS
    A component's existence is currently written out four times — the mount
    ladder in bunood.js, the Desktop stand-down list in _sidebar.scss, the boot
    payload keys, and the settings form order. Four places to remember, in three
    languages. On 2026-07-30 the stand-down list was the one that got forgotten
    and our chrome overlaid the Desktop page's own; on 2026-08-01 the release
    review found status style "Off" deleting the Bottom Bar layout's only
    chrome, because no single place said what that strip actually carries.

    This is that single place. Consumers are converted one at a time — the
    smoke suite's invariant matrix first, because it is the cheapest to move
    and it makes every later conversion verifiable.

WHAT IT IS NOT
    Not a runtime resolver. Placement can only be settled against the live DOM
    (is the header there, has Frappe's sidebar row rendered, is the container
    display:none) — see ARCHITECTURE.md on why the reserve is measured rather
    than declared. This table says what is POSSIBLE; bunood.js decides what
    actually happened and stamps the result.
"""

#: A container owns space on the desk. It mounts, and other things live in it.
CONTAINER = "container"
#: A tenant owns a place. It has no space of its own; it sits in a container.
TENANT = "tenant"

#: Regions a tenant may occupy. "sidepane" means Frappe's own row, where core
#: put it — which is what lets Classic stop being code and become a preset.
REGIONS = ("topbar", "bottombar", "pagehead", "sidepane", "dock")

#: Human labels for the regions, as the placement fields spell them.
REGION_LABELS = {
    "topbar": "Top Bar",
    "bottombar": "Bottom Bar",
    "pagehead": "Page Header",
    "sidepane": "Side Pane",
    "dock": "Dock",
}

#: Where inside a region a tenant sits.
#:
#: ONE VOCABULARY FOR EVERY REGION, and it is the logical one on purpose. This
#: codebase is logical-properties throughout and the build enforces it, so a
#: bar's "Start" is its left in English and its right in Arabic with no second
#: table. The side pane is a column, so the same three words read top / middle /
#: bottom there — the axis is the same, only its direction differs, which is
#: exactly what start and end mean.
#:
#: The settings form may still SAY "Top / Middle / Bottom" over the pane's
#: bands; that is a label for a reader, not a second set of values.
ZONES = ("Start", "Center", "End")

#: Zones a given region actually HAS. Bars have three; the side pane has two.
#:
#: NOT AN OVERSIGHT — measured, then decided. A bar's centre is a real place
#: because a bar has free space along its length. The pane's does not exist: its
#: content fills the column, so "after the workspace list" and "the foot of the
#: pane" are the same position (the list IS the last thing in it), and three
#: separate attempts put centre and end on an identical y. Offering a third
#: choice that lands where the second one does is the "two options, one pixel"
#: defect this vocabulary was written to remove — search's old "Sidebar Top" and
#: "Sidebar Bottom" did exactly that for months.
#:
#: So the pane says two, and says it honestly. If a place below Frappe's own
#: bottom strip is ever wanted, that is a new zone with a new name, not a
#: centre that isn't one.
ZONES_BY_REGION = {"sidepane": ("Start", "End")}

#: Every placement value in existence: "<Region> <Zone>", plus "Off".
#:
#: WHY IT IS DERIVED AND NOT LISTED
#:     Five components x five regions x three zones is 75 Select options that
#:     have to agree with each other, with `regions` above, and with the
#:     runtime. Listing them is how "Dock" ended up on a field whose runtime
#:     dropped it in the sidebar (found 2026-08-07). Here the field options,
#:     the desk diagram's slots and the migration all read the same function.
def slots_for(key: str) -> list:
    """Placement values a component may take, in desk order. "Off" first.

    A component offers a zone only if its RUNTIME implements that zone — see
    the ``zones`` key on the component. Region x zone was the first cut and it
    was too generous: it offered search a Page Header it has no slug for, and
    offered Home a bar centre when ``sb_mount_utils`` inserts at ``firstChild``
    and nowhere else. Both would have been dishonest pickers, which is the one
    thing this vocabulary exists to abolish.
    """
    component = next((c for c in COMPONENTS if c["key"] == key), None)
    if not component:
        return []
    out = ["Off"] if component.get("offable") else []
    limits = component.get("zones") or {}
    for region in REGIONS:
        if region not in component["regions"]:
            continue
        zones = limits.get(region, ZONES_BY_REGION.get(region, ZONES))
        for zone in zones:
            out.append(f"{REGION_LABELS[region]} {zone}")
    return out


def parse_slot(value: str):
    """"Top Bar End" -> ("topbar", "end"). Unknown or "Off" -> (None, None)."""
    if not value or value == "Off":
        return (None, None)
    for region, label in REGION_LABELS.items():
        if value.startswith(label + " "):
            zone = value[len(label) + 1:].lower()
            return (region, zone) if zone in ("start", "center", "end") else (None, None)
    return (None, None)

#: The desk chrome, in settings-form order.
#:
#: ``selector``  what bunood.js mounts (containers) or the affordance a tenant
#:               renders. Used by the Desktop stand-down assertion.
#: ``native``    the stock ERPNext affordance this replaces, if any. A tenant
#:               that fails to mount must leave its native visible — the
#:               ownership-stamp rule. ``None`` means we add something ERPNext
#:               does not have at all.
#: ``regions``   where a tenant may go. Empty for containers, which are fixed.
#: ``toggle``    the Theme Settings field that switches a CONTAINER on and off.
#:               Containers only; a tenant is placed, not switched. It is named
#:               here rather than derived from ``key`` because the two genuinely
#:               differ for the side pane, whose fields have carried the
#:               ``sidebar_`` prefix since item 10 while the registry has always
#:               called the component ``sidepane``. Deriving would have to
#:               special-case that; stating it costs one line and cannot drift.
#: ``offable``   whether the component's placement field offers "Off". Stated,
#:               not inferred: deriving it from ``native`` gave SEARCH an "Off"
#:               it has never had, and inferring a field's options from a
#:               neighbouring fact is exactly how "Dock" ended up on a field
#:               whose runtime dropped it in the sidebar (2026-08-07). Search is
#:               the one tenant with no Off — a desk nobody can search is not a
#:               configuration this theme offers, and Ctrl+K does not count
#:               because it is unreachable on touch.
#: ``zones``     per region, the zones this component's RUNTIME implements, when
#:               that is narrower than the region has. Absent means "all of
#:               them". An empty tuple means the field does not offer that
#:               region at all, though the component may still reach it by
#:               fallback — search's dock is exactly that. This exists because
#:               region x zone offered search a Page Header with no slug behind
#:               it and Home a bar centre `sb_mount_utils` cannot produce.
#: ``critical``  losing every route to this leaves a user unable to work.
#:               These are the invariants the smoke matrix asserts in EVERY
#:               state, because no single kit owns them and so no per-feature
#:               test looks for them.
COMPONENTS = [
    {
        "key": "topbar",
        "part": "topbar",
        "label": "Top bar",
        "type": CONTAINER,
        "selector": ".bnd-topbar",
        "native": None,
        "regions": (),
        "toggle": "topbar_enabled",
        "critical": False,
    },
    {
        "key": "pagehead",
        "part": "pagehead",
        "label": "Page header",
        "type": CONTAINER,
        # The cluster, not the page head itself. Frappe renders the head on
        # every page; what this container contributes is the group our tenants
        # can live in, and that group is the thing that either mounted or did
        # not. Naming the head would report the container present on every desk.
        "selector": ".page-head .bnd-cluster",
        "native": None,
        "regions": (),
        "toggle": "pagehead_enabled",
        "critical": False,
    },
    {
        "key": "bottombar",
        "part": "bottombar",
        "label": "Bottom bar",
        "type": CONTAINER,
        "selector": ".bnd-statusbar",
        "native": None,
        "regions": (),
        "toggle": "bottombar_enabled",
        "critical": False,
    },
    {
        "key": "sidepane",
        "part": "sidepane",
        "label": "Side pane",
        "type": CONTAINER,
        "selector": ".body-sidebar",
        "native": None,
        "regions": (),
        "toggle": "sidebar_enabled",
        "critical": False,
    },
    {
        "key": "dock",
        "part": "dock",
        "label": "Dock",
        "type": CONTAINER,
        "selector": ".bnd-dock",
        "native": None,
        "regions": (),
        "toggle": "dock_enabled",
        "critical": False,
    },
    {
        "key": "search",
        "part": "search",
        "label": "Search",
        "type": TENANT,
        # Two forms, both real: the field we inject into a bar, and the icon
        # the dock and page-head clusters carry. Naming only the field made
        # the matrix report Dock as having no search at all.
        "selector": ".bnd-search-field, .bnd-search-icon",
        "native": ".body-sidebar .navbar-search-bar",
        "regions": REGIONS,
        "toggle": None,
        "offable": False,
        # WHAT THE FIELD OFFERS, which is narrower than where search can END UP.
        # `mount_search_at` works in slugs — sbtop, sbbottom, topedge, topcenter,
        # botedge, botcenter — and a placement with no slug behind it is a
        # picker that does nothing. Two regions are therefore empty:
        #   pagehead  no slug exists at all; offering it would have been the
        #             "Dock on a field whose runtime dropped it in the sidebar"
        #             defect over again (2026-08-07).
        #   dock      a slug DOES exist, but no admin picks it: the Dock layout
        #             reaches it through the fallback chain, which is where the
        #             icon form belongs. Offering it directly would let someone
        #             ask for a dock search on a desk with no dock.
        # The bars carry no "End" because no slug does; that is the next thing
        # to build, not something to offer before it exists.
        "zones": {
            "topbar": ("Start", "Center"),
            "bottombar": ("Start", "Center"),
            "pagehead": (),
            "dock": (),
        },
        # Ctrl+K does NOT satisfy this: it is unreachable on touch, and a
        # user who cannot find anything cannot work.
        "critical": True,
    },
    {
        "key": "inbox",
        "part": "bell",
        "label": "Notifications",
        "type": TENANT,
        # The bell, NOT the badge inside it: the badge is the unread count and
        # is legitimately hidden on a quiet bench.
        "selector": ".bnd-bell",
        "native": ".body-sidebar .sidebar-notification",
        "regions": REGIONS,
        "toggle": None,
        "offable": True,
        "critical": True,
    },
    {
        "key": "user",
        "part": "user",
        "label": "User profile",
        "type": TENANT,
        "selector": ".bnd-avatar-btn",
        "native": ".body-sidebar .sidebar-user-button",
        "regions": REGIONS,
        "toggle": None,
        "offable": True,
        # Identity is the sharpest invariant in the app: lose every route to
        # it and there is no log out, no theme switch, no session defaults.
        "critical": True,
    },
    {
        "key": "home",
        "part": "home",
        "label": "Home link",
        "type": TENANT,
        # BY IDENTITY, not by class, and the audit of 2026-08-07 is why. This
        # said `.bnd-sb-item`, which is the SIDEBAR form of the link; placed in
        # a bar or the dock it renders as `.bnd-icon-btn.bnd-sb-util` instead,
        # so any consumer of this row measured "not there" in three of the four
        # regions the component may occupy. Exactly the defect the `search` row
        # above is annotated against — naming one of two forms — reappearing in
        # a component added later.
        "selector": '[data-bnd-part="home"]',
        # Ours entirely — the sidebar kit adds it; stock ERPNext has no such
        # affordance, so there is nothing to release if it fails to mount.
        "native": None,
        "regions": ("topbar", "bottombar", "sidepane", "dock"),
        "toggle": None,
        "offable": True,
        # START ONLY on the bars and the dock, because that is all
        # `sb_mount_utils` does: it inserts the link wrap at `firstChild` and
        # has no other anchor. The quick links are leading-edge navigation —
        # Home and All Apps sit where a user reaches first — so this is a
        # statement about the component, not a gap waiting to be filled. The
        # pane keeps both of its zones, which it genuinely has.
        "zones": {"topbar": ("Start",), "bottombar": ("Start",), "dock": ("Start",)},
        "critical": False,
    },
    {
        "key": "apps",
        "part": "apps",
        "label": "All apps link",
        "type": TENANT,
        # This said `.bnd-apps-rail`, which is a DIFFERENT COMPONENT: the rail
        # of app icons the sidebar style kit adds under `sidebar_apps_rail`.
        # The All Apps link is what `build_quick_link` renders. Nothing caught
        # it because this row is not `critical`, so the invariant matrix never
        # asks about it — a reminder that "not critical" means unwatched, not
        # harmless.
        "selector": '[data-bnd-part="apps"]',
        "native": None,
        "regions": ("topbar", "bottombar", "sidepane", "dock"),
        "toggle": None,
        "offable": True,
        # START ONLY on the bars and the dock, because that is all
        # `sb_mount_utils` does: it inserts the link wrap at `firstChild` and
        # has no other anchor. The quick links are leading-edge navigation —
        # Home and All Apps sit where a user reaches first — so this is a
        # statement about the component, not a gap waiting to be filled. The
        # pane keeps both of its zones, which it genuinely has.
        "zones": {"topbar": ("Start",), "bottombar": ("Start",), "dock": ("Start",)},
        "critical": False,
    },
]

#: Containers, in mount order.
CONTAINERS = [c for c in COMPONENTS if c["type"] == CONTAINER]
#: Tenants, in settings-form order.
TENANTS = [c for c in COMPONENTS if c["type"] == TENANT]
#: The components a user must never lose every route to.
CRITICAL = [c for c in COMPONENTS if c["critical"]]

#: What each ``desk_layout`` WRITES to the container fields — the catalogue.
#:
#: WHY IT DID NOT EXIST UNTIL NOW
#:     Until slice 2c, ``desk_layout`` did not write anything. It was read at
#:     mount time and a ladder of ``if`` branches decided which containers
#:     appeared, so the layout was not a preset at all — it was a second
#:     governing system sitting beside the per-component settings, and the seam
#:     between the two produced every defect in 0.10.0. Splitting the containers
#:     out is only half the job; a layout has to become a preset that writes
#:     these values and then stops deciding, and a preset with no catalogue is
#:     just a name.
#:
#: WHY IT IS NOT THE 0.11.0 MIGRATION PATCH
#:     ``patches/v0_11_0/chrome_placement.py`` records what 0.10.0 *rendered*
#:     for each layout. That is a one-shot artefact whose job is to leave every
#:     upgraded site looking exactly as it did, including the states nobody
#:     would design on purpose. This is the opposite: what a layout MEANS, going
#:     forward, for somebody who picks it today. The two agree in most cells and
#:     deliberately disagree in at least one — Classic writes no bottom bar
#:     here, while a Classic site that had opted into the status bar keeps it
#:     until the user picks a layout again. Reading either as the other is how a
#:     migration artefact becomes a design.
#:
#: WHY VALUES, NOT A NAME
#:     Same rule as the sidebar presets: the stored per-field values are the
#:     canon and the preset name is a label. Applying a layout = writing these
#:     values. Nothing anywhere has to understand "preset plus overrides",
#:     because there is no such state — which is also what finally lets the
#:     settings form derive a "Custom" label for the layout by COMPARING, the
#:     same way the side pane's has always worked.
#:
#: Keys are container ``key``s, not toggle fieldnames: this table is about the
#: desk, and :data:`CONTAINERS` already says which field carries each one.
LAYOUT_CHROME = {
    # Global bar above the page, slim status strip below. The shipped default.
    "Top Bar": {"topbar": 1, "pagehead": 0, "bottombar": 1, "sidepane": 1, "dock": 0},
    # One merged strip: the cluster rides in each page's own title row.
    "Compact": {"topbar": 0, "pagehead": 1, "bottombar": 1, "sidepane": 1, "dock": 0},
    # Stock v16 plus the breadcrumb chip and the ambient strip. The escape
    # hatch: it mounts none of the bars that CARRY controls.
    #
    # THE BOTTOM BAR CELL WAS THE ONE TO ARGUE ABOUT, and slice 2c-4 settled it
    # at 1 — the way it had already been settled on 2026-08-06, when deleting
    # `status_in_classic` made the status bar a component precisely so every
    # layout would have one subject to its own switch. Writing 0 here would
    # have quietly reversed that a day later: a preset that writes a starting
    # point is not the same as a branch in `mount_chrome`, but a user picking
    # Classic and losing their status bar cannot tell the difference. The
    # smoke suite states the older decision outright ("status bar follows
    # status_style, not the layout") and it was right to.
    "Classic": {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 1, "dock": 0},
    # Everything global at the foot of the screen.
    "Bottom Bar": {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 1, "dock": 0},
    # The boldest: no side pane at all, the dock IS the navigation.
    "Dock": {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 0, "dock": 1},
}


#: Where each layout puts the tenants — the OTHER half of what a layout means.
#:
#: `desk_layout`'s own field description promises "where global search,
#: notifications and your profile live", and until slice 2c-4 the preset wrote
#: none of it: it moved the containers and left the controls wherever they had
#: been. A freshly picked "Bottom Bar" therefore mounted a strip at the foot of
#: the desk with a clock in it and nothing else, because the bar used to build
#: a bell and an avatar unconditionally and had stopped.
#:
#: The values are the ones `patches/v0_11_0/chrome_placement.py` read off the
#: 0.10.0 mount ladder. That they coincide is not an accident and not a reason
#: to share the constant: that patch answers "what did this site RENDER", once,
#: and this answers "what does this layout MEAN", forever. They are free to
#: diverge and one day will.
#: THE VALUES ARE SLOTS, and every one of them must be in `slots_for` for that
#: field. This table wrote the OLD region-only vocabulary until E1 and was
#: missed when the vocabulary changed — "Top Bar", "Page Header", "Dock",
#: "Sidebar Top". Frappe rejects an out-of-range Select on save, and Theme
#: Settings is a Single, so ONE illegal value here does not merely lose its own
#: setting: it makes every later write of the whole document fail validation.
#: The bench proved it, with `inbox_placement = "Side Pane Center"` left behind
#: by a test — six unrelated save checks failed until it was healed.
#:
#: The zone each one gains is the one it MEASURED, taken from
#: `patches/v0_11_0/slot_vocabulary.py`, which read the 0.10.0 desk rather than
#: guessing from the names: the bell and the user menu landed in the trailing
#: third of a bar, so they become "End"; search's centre was already a slot.
#: `tests/smoke.mjs` now asserts this table against `slots_for` directly, so
#: the next value added cannot be one the field will not accept.
LAYOUT_TENANTS = {
    "Top Bar": {
        "inbox_placement": "Top Bar End",
        "user_placement": "Top Bar End",
        "search_placement": "Top Bar Center",
    },
    "Compact": {
        "inbox_placement": "Page Header End",
        "user_placement": "Page Header End",
        # Compact exists to NOT grow chrome, so search stays in the sidebar row
        # Frappe already renders rather than widening the page-head strip.
        # "Side Pane Start" is that row: it is where "Sidebar Top" pointed, and
        # the pane's start zone is the only place the row has ever been.
        "search_placement": "Side Pane Start",
    },
    "Classic": {
        # "Off", NOT "Side Pane", and the difference is the whole meaning of
        # this layout. "Side Pane" mounts OUR bell into Frappe's sidebar and
        # stamps `data-bnd-own`, which hides Frappe's own — a themed control in
        # a native place. "Off" releases the token, so the stock affordance is
        # what renders. Classic is the escape hatch to stock v16; it has to
        # reach it by not claiming anything, not by rebuilding it.
        #
        # `patches/v0_11_0/chrome_placement.py` maps Classic to "Side Pane"
        # while its own comment says "nothing of ours -> the sidebar's own bell
        # and user button". Those disagree, and it has already run on real
        # sites; see HANDOVER for the open question of whether to correct them.
        "inbox_placement": "Off",
        "user_placement": "Off",
        # Search is different and the pane's start zone is right: that slot is
        # pure CSS revealing Frappe's OWN row, and mount_search_at deliberately
        # does not claim it. Stock behaviour, reached by naming it.
        "search_placement": "Side Pane Start",
    },
    "Bottom Bar": {
        "inbox_placement": "Bottom Bar End",
        "user_placement": "Bottom Bar End",
        "search_placement": "Bottom Bar Center",
    },
    "Dock": {
        "inbox_placement": "Dock End",
        "user_placement": "Dock End",
        # `search_placement` has no "Dock" option — the dock takes the ICON form
        # and mount_search resolves it through the fallback chain, which puts
        # the dock first for this layout. Naming a slot the field does not offer
        # would write an illegal value into a Select.
        "search_placement": "Bottom Bar Center",
    },
}


#: MOBILE / NARROW MODE (item 24) — the desk's shape below Frappe's 768 boundary.
#:
#: WHY A SEPARATE CATALOGUE AND NOT A LAYOUT
#:     A layout is a preset the USER picks and it is PERSISTED. This is neither:
#:     it is what EVERY layout collapses to on a phone, applied at runtime and
#:     never written back — a resize is not a gesture, and one phone visit must
#:     not rewrite a desk configured on a monitor. `bunood.js` reads these while
#:     the viewport is narrow (`is_narrow`) and the stored fields stay untouched,
#:     so `bnd_match_layout` still names the real layout.
#:
#: WHY THESE VALUES
#:     Below 768 only the bottom bar can stand: it is the one container that
#:     mounts host-free (`document.body`), while the top bar's <header> host is
#:     swapped away by `toolbar.js` and the side pane becomes Frappe's own
#:     off-canvas drawer. `sidepane` STAYS 1 so we do not fight that drawer — its
#:     top-left menu is the workspace nav, which is why our bar carries only the
#:     tenants Frappe buries and never a second workspaces control.
NARROW_CHROME = {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 1, "dock": 0}

#: Where the tenants sit in the narrow bottom bar. Search is deliberately ABSENT:
#: it walks a fallback chain (`SEARCH_FALLBACKS`), so tearing the top bar down and
#: losing Frappe's sidebar search row (dropped on mobile) lands it in the bottom
#: bar on its own. The tenants that do NOT walk a chain — the bell, the user menu
#: and the All Apps link — are the ones that must be placed explicitly here, or
#: `placement_for` returns "absent" and they vanish. Every value is a slot in
#: `slots_for` for that tenant (apps offers only "Start" on a bar); the suite
#: asserts it, the same guard `LAYOUT_TENANTS` gets.
NARROW_PLACEMENT = {
    "inbox": "Bottom Bar End",
    "user": "Bottom Bar End",
    "apps": "Bottom Bar Start",
    # Home stands down on a phone: the mobile bar is search / alerts / you / apps
    # (the user's chosen four), and Frappe's own drawer carries the rest.
    "home": "Off",
}


#: Surfaces — content the frame contains, as opposed to chrome that owns
#: space (containers) or sits in it (tenants). A surface mounts nothing and
#: injects nothing: it is attributes on <html> and a stylesheet over Frappe's
#: own DOM, so it has no selector to stand down and no native to release —
#: absent attributes ARE the stand-down. Item 16's list view is the first;
#: the form view (item 18) joins it here.
SURFACE = "surface"

SURFACES = [
    {
        "key": "list",
        "part": "list",
        "label": "List view",
        "type": SURFACE,
        # The anchor attribute, not a mounted node: everything the kit does is
        # scoped under html[data-bnd-list], and "Original" clears it.
        "selector": 'html[data-bnd-list]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "form",
        "part": "form",
        "label": "Form view",
        "type": SURFACE,
        # Item 18. Sections, tabs, child grids and the form sidebar, all
        # scoped under html[data-bnd-form]; "Original" clears it.
        "selector": 'html[data-bnd-form]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "workspace",
        "part": "workspace",
        "label": "Workspace",
        "type": SURFACE,
        # Item 25. The tile grid on a workspace and the Dashboard route — the
        # canvas, the tile frame, the gutter, the rows and the tile menus, all
        # scoped under html[data-bnd-ws]; "Original" clears it.
        "selector": 'html[data-bnd-ws]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "chart",
        "part": "chart",
        "label": "Charts",
        "type": SURFACE,
        # Item 25. frappe-charts' chrome, themed through its --charts-* variables,
        # with one axis (chart_grid) scoped under html[data-bnd-chart-grid]. Unlike
        # the list and form kits there is no "Original": the base theming is always
        # on, since raw vendor hex is never a style anyone chooses. Series COLOUR is
        # a separate, JS-fed concern (palette.series_ramp) and is not a surface.
        "selector": 'html[data-bnd-chart-grid]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "report",
        # Labelled "Data tables", not "Report view": the kit reaches EVERY
        # .datatable on the desk — report view, query report, web forms, the
        # multi-select dialog, the data-import preview — so the picker would lie
        # if it named one. The fieldnames stay report_* (the build guard's rule,
        # and labels are independent of them). Item 26.
        "part": "report",
        "label": "Data tables",
        "type": SURFACE,
        # The anchor, scoped under html[data-bnd-report]; "Original" clears it.
        # The grain and row-feedback axes hang off data-bnd-report-* siblings.
        "selector": 'html[data-bnd-report]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "views",
        # Labelled "Alternate views", not any one view: ONE anchor dresses the
        # kanban card, the calendar chip, the gantt bar and the gallery tile as
        # the same object drawn four ways — the report kit's "reaches every
        # datatable" reasoning, transposed to the four view routes. Splitting
        # would let a user ship floating kanban cards beside flat gallery tiles.
        # Item 27.
        "part": "views",
        "label": "Alternate views",
        "type": SURFACE,
        # The anchor, scoped under html[data-bnd-views]; "Original" clears it.
        # The band (kanban), event mark (calendar), image fit (gallery) and the
        # reveal hang off data-bnd-views-* siblings. Gantt takes the anchor
        # plus the dark-mode repairs and no axis of its own.
        "selector": 'html[data-bnd-views]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "overlay",
        # Labelled "Overlays", not any one of them: ONE anchor dresses the
        # dialog, the grid-row editor, the dropdown, the context menu, the
        # autocomplete, the toast, the popover, the datepicker, the report
        # column list, the duration picker and the calendar's "+N more" card as
        # the same floating object drawn several ways — the report kit's
        # "reaches every datatable" reasoning again. NOT the lightbox: its black
        # ground is correct in both modes and it is deliberately left alone
        # (docs/upstream/frappe-overlays.md, "Not filed, and why").
        # Splitting would permit a floating dialog beside a square menu.
        # Item 28.
        "part": "overlay",
        "label": "Overlays",
        "type": SURFACE,
        # The anchor, scoped under html[data-bnd-overlay]; "Original" clears it.
        # The scrim and menu-row axes hang off data-bnd-overlay-* siblings.
        #
        # NOTE: the kit's REPAIRS are deliberately NOT under this anchor. They
        # are scoped html[data-theme] in surfaces/_overlays.scss, because a
        # contract survives Original and a style does not — overlays sit on
        # every page, and three of the repairs are measured WCAG AA failures.
        "selector": 'html[data-bnd-overlay]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "empty",
        # Labelled "Empty states", plural, because ONE anchor dresses every
        # "there is nothing here" block the desk draws: the list's no-result,
        # the query report's box, the dashboard's, the inbox view's and the
        # 404 page — the same object drawn five places. Item 29.
        #
        # The kit is a SURFACE by the definition above: it mounts nothing and
        # injects nothing. That is worth stating, because the roadmap's brief
        # for this item is "an action, not a zero", and an action a stylesheet
        # cannot add would have made it something else. It does not have to:
        # Frappe ALREADY renders the create button (list_view.js:562) and
        # already distinguishes first-run from filtered-to-zero in both copy
        # and label. The kit promotes what exists; what it cannot do — add the
        # "Clear filters" control that copy promises — goes upstream.
        "part": "empty",
        "label": "Empty states",
        "type": SURFACE,
        # The anchor, scoped under html[data-bnd-empty]; "Original" clears it.
        #
        # NOTE, exactly as for overlays: the kit's REPAIRS are deliberately NOT
        # under this anchor. surfaces/_empty.scss scopes them html[data-theme],
        # because a contract survives Original and a style does not — the child
        # grid's "No rows" is a measured 2.85:1 AA failure and must not depend
        # on a style choice.
        "selector": 'html[data-bnd-empty]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "skeleton",
        # Labelled "Loading", not "Skeletons": the setting governs every
        # loading state the desk draws, and only two of them are literally
        # skeletons. Item 30.
        #
        # THE 29/30 BOUNDARY IS WHY THIS IS A SEPARATE KIT rather than an axis
        # of item 29. Empty and loading share DOM on several nodes, and the
        # asymmetry decides ownership: a skeleton on an empty node is a promise
        # that never resolves, while a quiet box on a loading node is merely
        # early. So item 29 owns the BOX everywhere, and this owns MOTION and
        # RESERVED GEOMETRY only where the class can mean nothing but loading.
        "part": "skeleton",
        "label": "Loading",
        "type": SURFACE,
        # The anchor, scoped under html[data-bnd-skeleton]; "Original" clears
        # it. As for overlays and empty states, the REPAIRS are not under this
        # anchor — surfaces/_skeleton.scss scopes them html[data-theme],
        # because a bone that is invisible AS a bone (stock's dark
        # --skeleton-bg collides with --control-bg and --subtle-accent) is a
        # legibility failure, not a style choice.
        "selector": 'html[data-bnd-skeleton]',
        "native": None,
        "regions": (),
        "toggle": None,
        "critical": False,
    },
]

#: The tenants' default desk order — REGISTRY ORDER, not a second list. E3's
#: `desk_order` field seeds from this and the runtime falls back to it, so
#: "the order the registry declares components in" and "the order they sit on
#: a desk" are one fact. A tenant added to the table joins the order without
#: anyone remembering a second edit.
def default_desk_order() -> str:
    """Tenant keys in registry order, comma-joined: "search,inbox,user,home,apps"."""
    return ",".join(c["key"] for c in COMPONENTS if c["type"] == TENANT)


def layout_settings(layout: str) -> dict:
    """The Theme Settings values a layout preset writes, keyed by FIELD.

    Returns ``{}`` for an unknown layout rather than raising — the same
    fail-open rule the rest of the layout system follows, where a value nobody
    recognises degrades to the stock desk instead of breaking one.

    IT NAMES FIELDS THE DOCTYPE MAY NOT HAVE YET. The split lands one container
    per slice and this table is complete from the start, so a caller that
    WRITES these values must intersect them with the fields that exist —
    ``presets.SHIPPED_CONTAINERS`` is that list, and it is deleted with the
    last slice. Reading is safe; writing a field the doctype has not grown
    leaves an orphan row in ``tabSingles`` that ``get_single_value`` then
    refuses to read back.
    """
    chrome = LAYOUT_CHROME.get(layout)
    if not chrome:
        return {}
    # Annotated because the two halves are genuinely different types — a
    # container's cell is 0/1 and a tenant's is a slot label — and the checker
    # otherwise infers dict[str, int] from the comprehension and rejects the
    # update. The mixed type is the point: this returns FIELD -> VALUE.
    values: dict = {c["toggle"]: chrome[c["key"]] for c in CONTAINERS if c["key"] in chrome}
    values.update(LAYOUT_TENANTS.get(layout, {}))
    return values


def as_dict() -> dict:
    """The registry as plain data, for the smoke suite and the settings form.

    Returned rather than imported field-by-field so a consumer in another
    language gets the whole table in one round trip and cannot silently read a
    stale half of it.
    """
    return {
        "regions": list(REGIONS),
        "components": COMPONENTS,
        "containers": [c["key"] for c in CONTAINERS],
        "tenants": [c["key"] for c in TENANTS],
        "critical": [c["key"] for c in CRITICAL],
        # The catalogue rides along so a consumer asking "what does this layout
        # mean" gets the answer in the same round trip as "what components are
        # there" — the whole reason this returns a table rather than exposing
        # names to import one at a time.
        "layout_chrome": LAYOUT_CHROME,
        # Field per container, so a JS consumer never has to restate the
        # key -> fieldname mapping the side pane makes non-obvious.
        "toggles": {c["key"]: c["toggle"] for c in CONTAINERS},
    }
