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
        # Identity is the sharpest invariant in the app: lose every route to
        # it and there is no log out, no theme switch, no session defaults.
        "critical": True,
    },
    {
        "key": "home",
        "part": "home",
        "label": "Home link",
        "type": TENANT,
        "selector": ".bnd-sb-item",
        # Ours entirely — the sidebar kit adds it; stock ERPNext has no such
        # affordance, so there is nothing to release if it fails to mount.
        "native": None,
        "regions": ("topbar", "bottombar", "sidepane", "dock"),
        "toggle": None,
        "critical": False,
    },
    {
        "key": "apps",
        "part": "apps",
        "label": "All apps link",
        "type": TENANT,
        "selector": ".bnd-apps-rail",
        "native": None,
        "regions": ("topbar", "bottombar", "sidepane", "dock"),
        "toggle": None,
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
    # Stock v16, plus the breadcrumb chip. The escape hatch, so it mounts
    # nothing — a Classic desk with a bar on it is not Classic.
    #
    # THE BOTTOM BAR CELL IS THE ONE TO ARGUE ABOUT, and slice 2c-4 is where
    # that argument belongs. Deleting `status_in_classic` made the status bar a
    # component so the layout would have no opinion at MOUNT time, and this 0
    # is not that opinion returning: a preset writes a starting point the user
    # can change, which is a different thing from a branch in `mount_chrome`
    # that no setting can overrule. But it does mean picking Classic will turn
    # the strip off once `bottombar_enabled` exists, where today it leaves
    # `status_style` in charge. Written down here rather than discovered then.
    "Classic": {"topbar": 0, "pagehead": 0, "bottombar": 0, "sidepane": 1, "dock": 0},
    # Everything global at the foot of the screen.
    "Bottom Bar": {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 1, "dock": 0},
    # The boldest: no side pane at all, the dock IS the navigation.
    "Dock": {"topbar": 0, "pagehead": 0, "bottombar": 1, "sidepane": 0, "dock": 1},
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
    return {c["toggle"]: chrome[c["key"]] for c in CONTAINERS if c["key"] in chrome}


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
