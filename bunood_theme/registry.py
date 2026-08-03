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
        "critical": False,
    },
]

#: Containers, in mount order.
CONTAINERS = [c for c in COMPONENTS if c["type"] == CONTAINER]
#: Tenants, in settings-form order.
TENANTS = [c for c in COMPONENTS if c["type"] == TENANT]
#: The components a user must never lose every route to.
CRITICAL = [c for c in COMPONENTS if c["critical"]]


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
    }
