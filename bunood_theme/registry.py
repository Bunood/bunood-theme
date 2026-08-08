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

#: Every placement value in existence: "<Region> <Zone>", plus "Off".
#:
#: WHY IT IS DERIVED AND NOT LISTED
#:     Five components x five regions x three zones is 75 Select options that
#:     have to agree with each other, with `regions` above, and with the
#:     runtime. Listing them is how "Dock" ended up on a field whose runtime
#:     dropped it in the sidebar (found 2026-08-07). Here the field options,
#:     the desk diagram's slots and the migration all read the same function.
def slots_for(key: str) -> list:
    """Placement values a component may take, in desk order. "Off" first."""
    component = next((c for c in COMPONENTS if c["key"] == key), None)
    if not component:
        return []
    out = ["Off"] if component.get("offable") else []
    for region in REGIONS:
        if region not in component["regions"]:
            continue
        for zone in ZONES:
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
        "offable": False,
        "regions": REGIONS,
        "toggle": None,
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
LAYOUT_TENANTS = {
    "Top Bar": {
        "inbox_placement": "Top Bar",
        "user_placement": "Top Bar",
        "search_placement": "Top Bar Center",
    },
    "Compact": {
        "inbox_placement": "Page Header",
        "user_placement": "Page Header",
        # Compact exists to NOT grow chrome, so search stays in the sidebar row
        # Frappe already renders rather than widening the page-head strip.
        "search_placement": "Sidebar Top",
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
        # Search is different and "Sidebar Top" is right: that slot is pure CSS
        # revealing Frappe's OWN row, and mount_search_at deliberately does not
        # claim it. Stock behaviour, reached by naming it.
        "search_placement": "Sidebar Top",
    },
    "Bottom Bar": {
        "inbox_placement": "Bottom Bar",
        "user_placement": "Bottom Bar",
        "search_placement": "Bottom Bar Center",
    },
    "Dock": {
        "inbox_placement": "Dock",
        "user_placement": "Dock",
        # `search_placement` has no "Dock" option — the dock takes the ICON form
        # and mount_search resolves it through the fallback chain, which puts
        # the dock first for this layout. Naming a slot the field does not offer
        # would write an illegal value into a Select.
        "search_placement": "Bottom Bar Center",
    },
}


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
    values = {c["toggle"]: chrome[c["key"]] for c in CONTAINERS if c["key"] in chrome}
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
