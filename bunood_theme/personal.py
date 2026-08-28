# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""What a person may decide for themselves — one table, several consumers.

WHY THIS FILE EXISTS
    A per-user layer grew here without anyone designing it. Item 4 added a
    density override, v0.6.0 a side-pane look, item 12 a search ranking, item 13
    a dismissed-notification list — four stores in ``frappe.defaults``, four
    ad-hoc validators, four hand-written cache drops, and no statement anywhere
    of what may be personal and what may not. ``GUIDELINES.md`` said nothing; the
    only rule written down was a comment inside one endpoint.

    Four is where that stops being survivable. Item 38 makes the desk itself
    personal, so "which of these is a preference, who may lock it, what does
    empty mean, and who reads it" has to have one answer in one place.

WHAT IS AND IS NOT IN HERE
    :data:`AXES` describes every ``frappe.defaults`` key this app writes. It is
    deliberately a description of what EXISTS, not of what is planned: a key
    arrives here in the same commit that grows its reader, so
    ``assertPersonalAxes`` can check the table against the code in both
    directions. A table listing tomorrow's keys would make that check
    one-directional and worthless.

    :data:`NATIVE` records the per-user state that is real but is NOT ours to
    write, so that the map is complete. Leaving Frappe's own theme field out of a
    file called "personal" is how a fifth ad-hoc store gets added by someone who
    read this and concluded it was not covered.

THE RULES THIS TABLE ENCODES

    * **Empty means inherit, and it is a state rather than an absence.** No
      sentinel, no "Site default" magic value — the row is simply not there. That
      is what lets an administrator change a site default and have every
      undecided person follow along, and it is the choice Directus makes for
      every one of its own preferences (a nullable column, with the inherit
      option rendered as a real, previewable card rather than an empty state).
      Discourse's ``text_size`` is the deliberate counter-example: it copies the
      site default into the row at signup and pays for it with an opt-in admin
      backfill whenever the default moves. We are not resolving before first
      paint from a cache-friendly ``<html class>``, so we take the nullable side.

    * **A preference is a NAME or an ergonomic value, never a loose style knob.**
      A person picks a whole designed look; option-level freedom is the
      administrator's. Storing a name rather than 124 values is what lets a look
      be improved later without migrating everyone who chose it.

    * **Every write names its parent.** ``frappe.defaults.set_default`` without
      ``parent=`` writes the GLOBAL row (``parent = "__default"``), which every
      account inherits, Guest included. The build guard refuses the unparented
      spelling outright, because the difference between the two calls is one
      keyword argument and the failure is silent and site-wide.

    * **A write costs the whole user cache.** ``set_default`` drops that user's
      entire cache including their cached boot (measured in the v0.8.0 release
      review). Rare, deliberate gestures are fine. Anything a person can trigger
      by clicking repeatedly must batch — which is why the palette's ranking
      flushes on a timer rather than per keystroke.

WHY IT IMPORTS NOTHING FROM FRAPPE
    Same reason as :mod:`bunood_theme.palette`: a build-time guard and the
    contrast gate run on a machine with no site and no database. The catalogues
    it does read — :mod:`bunood_theme.presets` and :mod:`bunood_theme.registry` —
    are frappe-free for that same reason, so the field partition below can be
    DERIVED from the one catalogue rather than restated here.
"""

from __future__ import annotations

from bunood_theme.presets import (
    CHART_FIELDS,
    CRUMB_FIELDS,
    EMAIL_FIELDS,
    EMPTY_FIELDS,
    FILTERS_FIELDS,
    FORM_FIELDS,
    ICON_FIELDS,
    INBOX_FIELDS,
    LIST_FIELDS,
    LOGIN_FIELDS,
    OVERLAY_FIELDS,
    PALETTE_FIELDS,
    PRINT_FIELDS,
    REPORT_FIELDS,
    SIDEBAR_FIELDS,
    SKELETON_FIELDS,
    STATUS_FIELDS,
    THEME_AXES,
    VIEWS_FIELDS,
    WEB_FIELDS,
    WORKSPACE_FIELDS,
)
from bunood_theme.registry import LAYOUT_CHROME, layout_settings

#: The prefix every key this app owns must carry. The guard uses it to find
#: stray writes, so a key outside it is invisible to every check here.
PREFIX = "bnd_"

# ── What kind of thing a row is ──────────────────────────────────────────────

#: A choice a person made about how their desk looks or behaves. Governed by a
#: lock, resettable, and shown in the Appearance dialog.
PREFERENCE = "preference"

#: Something the desk remembers ON a person's behalf — what they dismissed, what
#: they open often. Not a preference: there is no "correct" value to offer, no
#: site default to inherit, and nothing an administrator would sensibly lock.
#: Kept in the same table because it is the same storage with the same parent
#: rule and the same cache cost, and a reader who found only preferences here
#: would conclude the rest was uncovered.
STATE = "state"


# ── The locks ────────────────────────────────────────────────────────────────

#: The three Theme Settings Checks that decide whether an axis is offered at all.
#: Declared here rather than beside the fields because the lock is a property of
#: the PREFERENCE, and the doctype only holds its storage.
#:
#: ``default`` is what a site gets, and the two that already ship must default
#: OPEN: ``bnd_density`` and ``bnd_sidebar_preset`` have live users, so a locked
#: default would silently withdraw a working feature on upgrade. Shape defaults
#: CLOSED because it is new, costs nobody anything to opt into, and is the only
#: axis that invalidates written instructions — "click the bell in the top bar"
#: is wrong in four of the five shapes.
#:
#: READ POLARITY IS LOAD-BEARING. A Check reads back ``None`` before its patch
#: has run, and ``None`` must resolve to ``default`` — never to 0. The opposite
#: reading would drop every stored preference on the site at the first load after
#: an upgrade, silently, and look exactly like the feature being switched off.
LOCKS = {
    "personal_look": {"default": 1, "label": "People may choose their own look"},
    "personal_shape": {"default": 0, "label": "People may choose their own desk shape"},
    "personal_comfort": {"default": 1, "label": "People may set their own comfort"},
}

#: The axis that is deliberately answerable to no lock.
#:
#: Reduced motion is an accessibility floor, not a taste, and a switch letting an
#: administrator decide how much animation an employee sees is not a setting we
#: are willing to ship. Measured precedent agrees and then some: across Discourse,
#: Directus, frappe-ui and shadcn, motion reduction is driven ONLY by the
#: operating system and no product offers a user-level pole at all — so an
#: in-app reduce-only switch is already more generous than the field, and a lock
#: over it would be less. Named as a constant rather than a missing key so the
#: guard can assert the absence is deliberate.
UNLOCKABLE = ("bnd_motion",)


# ── The table ────────────────────────────────────────────────────────────────

#: Every ``frappe.defaults`` key this app writes. One row each; nothing else.
#:
#: ``empty`` is prose for the reader, not a value — the empty state is always the
#: absence of the row, per the file header.
AXES = (
    {
        "key": "bnd_density",
        "kind": PREFERENCE,
        "label": "Density",
        "values": ("Comfortable", "Compact"),
        "lock": "personal_comfort",
        "boot": "bnd_density",
        "empty": "follow the site's default_density",
        "since": "item 4",
        "note": (
            "The one visual value allowed through boot, because every element it "
            "affects is rendered by JS after the splash. See boot.py's header."
        ),
    },
    {
        "key": "bnd_sidebar_preset",
        "kind": PREFERENCE,
        "label": "Side pane look",
        # The catalogue, not a copy of it. Item 37 re-pointed this key at the
        # THEME presets and item 37's release review migrated the stored values;
        # naming the source here is what stops a fifth spelling of that list.
        "values": None,  # resolved by values_for() — see below
        "catalogue": "THEME_PRESETS",
        "lock": "personal_look",
        "boot": "bnd_sidebar.user_preset",
        "empty": "follow the site's side pane",
        "since": "v0.6.0, re-pointed by item 37",
        "note": (
            "Applies the EIGHTEEN sidebar fields of the named look and nothing "
            "else. Item 38 leaves both the name and that meaning alone and adds "
            "the whole-desk look beside it, rather than widening ~100 fields "
            "under people who chose an 18-field one."
        ),
    },
    {
        "key": "bnd_palette_usage",
        "kind": STATE,
        "label": "Command palette ranking",
        "values": None,
        "lock": None,
        "boot": "bnd_palette.usage",
        "empty": "no ranking yet",
        "since": "item 12",
        "note": (
            "A {key: [count, last_used]} blob, capped server-side. BATCHED BY "
            "CONTRACT: the client flushes about once every 90s, because each "
            "write drops this user's whole cache including their cached boot."
        ),
    },
    {
        "key": "bnd_inbox_done",
        "kind": STATE,
        "label": "Dismissed notifications",
        "values": None,
        "lock": None,
        "boot": "bnd_inbox.done",
        "empty": "nothing dismissed",
        "since": "item 13",
        "note": (
            "Ours because Notification Log grants role All no write permission "
            "and ships no mark-as-unread endpoint, and a custom field on a core "
            "doctype would outlive this theme."
        ),
    },
)

#: Per-user state that is real, is read by this app, and is NOT written by it.
#:
#: Here so the map is complete. A reader who found only :data:`AXES` could
#: reasonably conclude the light/dark choice was uncovered and add a fifth store
#: for it — which is exactly the drift this file exists to end, and which the
#: ROADMAP line for this item ("via ``User.desk_theme``, never a parallel
#: localStorage") forbids by name.
NATIVE = (
    {
        "key": "User.desk_theme",
        "owner": "frappe",
        "values": ("Light", "Dark", "Automatic"),
        "written_by": "frappe.core.doctype.user.user.switch_theme",
        "note": (
            "Server-rendered into <html data-theme-mode> by www/desk.html, so it "
            "is correct at first paint and we add nothing. MEASURED 2026-08-29 on "
            "v16.27.0: 'Automatic' IS durable — the field survives repeated desk "
            "loads unchanged and a load does not write the User row. "
            "ARCHITECTURE.md said otherwise for a month; the attribute "
            "data-theme does resolve to a concrete value, the FIELD does not."
        ),
    },
    {
        "key": "__UserSettings",
        "owner": "frappe",
        "values": None,
        "written_by": "frappe.model.user_settings (via Toggle Full Width, list views)",
        "note": (
            "Per-user, per-doctype list state. Lives in redis as well as its "
            "table, and the teardown that actually clears it is "
            'frappe.cache.hdel("_user_settings", f"{doctype}::{user}").'
        ),
    },
)


# ── The field partition ──────────────────────────────────────────────────────
#
# Which Theme Settings fields a personal LOOK may carry, which belong to the
# personal SHAPE, and which are neither. Derived from the one catalogue in every
# case; the only thing stated here is which KITS are which, because that is a
# judgement and judgements belong in one place with their reasons.

#: Exactly what a named layout writes — containers plus tenant placements.
#:
#: The personal shape is this and nothing more. Derived by asking the catalogue
#: rather than listing eight fields, because the day a sixth container arrives
#: this set has to grow with it and a hand-written copy would not.
SHAPE_FIELDS = tuple(
    sorted({field for name in LAYOUT_CHROME for field in layout_settings(name)})
)

#: Surfaces that are not the desk. A personal look may not touch these.
#:
#: NAMED, NOT LEFT TO SUBTRACTION, and the distinction matters: defining the look
#: as "everything else" quietly swept these in. Two of them are forbidden rather
#: than merely wrong — the sign-in page and the website render through a cache
#: keyed on (path, lang) and nothing else, so anything per-user there is served
#: to the next visitor. Email renders in a different process entirely, and print
#: is regenerated as a per-SITE record on every settings save.
OFF_DESK_FIELDS = tuple(sorted(set(LOGIN_FIELDS) | set(WEB_FIELDS) | set(EMAIL_FIELDS) | set(PRINT_FIELDS)))

#: Desk fields that stay the administrator's, with the reason for each.
#:
#: * the five colour seeds — a tenant's brand is their identity, not a
#:   preference, and there is one content-hashed stylesheet per site to carry it.
#:   (Buildable per-user, and Discourse does exactly that with one variable-only
#:   sheet per palette; out of scope for item 38 by decision, not by impossibility.)
#: * ``density_default`` — the SITE's density. The person's own density is an
#:   axis in its own right, and a look that also wrote it would give one setting
#:   two owners.
#: * ``desk_order`` — the order tenants take within a zone. Part of the shape's
#:   grammar but not part of any named layout, so under "names only" there is no
#:   gesture that could set it.
#: * ``home_placement`` / ``apps_placement`` — placements no layout writes. They
#:   move desk chrome, so they are not a look; they are outside
#:   :data:`SHAPE_FIELDS`, so they are not a personal shape either. Site-only is
#:   the honest third answer rather than filing them wherever subtraction lands.
SITE_ONLY_FIELDS = (
    "accent_color",
    "accent_color_dark",
    "apps_placement",
    "brand_color",
    "brand_color_dark",
    "density_default",
    "desk_order",
    "ground_color",
    "home_placement",
)

#: The desk kits a personal look carries — named positively, one line each.
#:
#: This is the judgement. Everything else in the partition is arithmetic.
LOOK_KITS = (
    SIDEBAR_FIELDS,
    ICON_FIELDS,
    CRUMB_FIELDS,
    PALETTE_FIELDS,
    INBOX_FIELDS,
    STATUS_FIELDS,
    LIST_FIELDS,
    FORM_FIELDS,
    WORKSPACE_FIELDS,
    CHART_FIELDS,
    REPORT_FIELDS,
    VIEWS_FIELDS,
    OVERLAY_FIELDS,
    EMPTY_FIELDS,
    SKELETON_FIELDS,
    FILTERS_FIELDS,
)

#: The fields a personal look may carry.
#:
#: The subtraction of :data:`SHAPE_FIELDS` is not tidying: ``STATUS_FIELDS``
#: opens with ``search_placement`` and ``INBOX_FIELDS`` carries
#: ``inbox_placement``, both of which a named layout writes. Without it a look
#: would move the search box, and the derived shape would then disagree with what
#: is on screen.
LOOK_FIELDS = tuple(
    sorted({field for kit in LOOK_KITS for field in kit} - set(SHAPE_FIELDS))
)


# ── Lookups ──────────────────────────────────────────────────────────────────


def axis(key: str) -> dict | None:
    """The row for one key, or ``None`` if this app does not own it."""
    for row in AXES:
        if row["key"] == key:
            return row
    return None


def keys(kind: str | None = None) -> tuple:
    """Every key this app writes, optionally of one :data:`PREFERENCE`/:data:`STATE`."""
    return tuple(r["key"] for r in AXES if kind is None or r["kind"] == kind)


def values_for(key: str) -> tuple | None:
    """The values one key accepts, resolved against the live catalogue.

    ``None`` means the key holds free-form state (a JSON blob) and has no value
    set to check. The empty string is legal for every PREFERENCE and is not
    listed: it is the absence of a choice, per the file header, and a caller that
    treats it as a member would store a row meaning "no row".
    """
    row = axis(key)
    if row is None:
        return None
    if row.get("catalogue") == "THEME_PRESETS":
        from bunood_theme.presets import THEME_PRESETS

        return tuple(THEME_PRESETS)
    return row.get("values")


def lock_for(key: str) -> str | None:
    """The Theme Settings Check governing one key, or ``None`` if it has none."""
    row = axis(key)
    return row.get("lock") if row else None


def lock_open(field: str, value) -> bool:
    """Whether a locked axis is offered, given the Check's stored value.

    ONE IMPLEMENTATION BECAUSE THE POLARITY IS THE WHOLE RISK, and it is the
    inverse of what a careless reader would write. A Check that has never been
    written reads back ``None``, not 0 — the field exists in the doctype from the
    moment it is declared, but its ``tabSingles`` row only appears when something
    stores a value. So on the FIRST load after an upgrade, before the seeding
    patch has run, every lock reads ``None``.

    Read ``None`` as "closed" and that load silently drops every stored preference
    on the site: two features that have shipped since v0.2.0 and v0.6.0 simply
    stop applying, with nothing in the log and nothing on screen to say why, and
    the desks come back only if somebody thinks to look at three new checkboxes.
    Read it as the SHIPPED answer and nothing moves. This function exists so that
    reading is written once, next to the reason, instead of at three call sites.

    The empty string is treated as unwritten for the same reason ``container()``
    does: a Single's value can be ``""`` where a row exists but carries nothing,
    and that is an absence of a decision rather than a decision to close.

    Args:
        field: a key of :data:`LOCKS`.
        value: whatever the Single returned — ``None``, ``""``, ``0``, ``1``.

    Returns:
        True when a person may set this axis for themselves.
    """
    row = LOCKS.get(field)
    if row is None:
        # Not a lock we know. Fail OPEN rather than silently withdrawing an axis
        # over a typo — the same fail-open rule the layout system follows, and
        # the build guard is what turns a typo into a loud failure instead.
        return True
    return bool(int(row["default"] if value in (None, "") else value))


def partition() -> dict:
    """The four field sets and what, if anything, no set claims.

    The arithmetic lives here, beside the judgement it depends on, so the gate
    that asserts it (``tools/contrast_gate.py::check_personal_partition``) is
    measuring this module rather than a second opinion about it — the same reason
    :mod:`bunood_theme.palette` holds the derivation both ``brand.py`` and the
    gate consume.

    ``unclaimed`` and ``overlap`` are the two ways the partition can be wrong,
    and they fail differently. An unclaimed field is one a future kit added and
    nobody filed: harmless today, and tomorrow it is a field a look silently
    cannot carry. An overlap is worse — a field in both LOOK and SHAPE would be
    written by two owners on one request, and which won would depend on
    composition order.
    """
    look, shape = set(LOOK_FIELDS), set(SHAPE_FIELDS)
    off, site = set(OFF_DESK_FIELDS), set(SITE_ONLY_FIELDS)
    claimed = look | shape | off | site
    axes = set(THEME_AXES)

    pairs = (
        ("look", look, "shape", shape),
        ("look", look, "off_desk", off),
        ("look", look, "site_only", site),
        ("shape", shape, "off_desk", off),
        ("shape", shape, "site_only", site),
        ("off_desk", off, "site_only", site),
    )
    overlap = {
        f"{a}&{b}": sorted(sa & sb) for a, sa, b, sb in pairs if sa & sb
    }

    return {
        "look": sorted(look),
        "shape": sorted(shape),
        "off_desk": sorted(off),
        "site_only": sorted(site),
        # In THEME_AXES and filed nowhere.
        "unclaimed": sorted(axes - claimed),
        # Filed here but not an axis a preset writes — a typo, or a field the
        # doctype lost. Either way the set is describing something that is gone.
        "phantom": sorted(claimed - axes),
        "overlap": overlap,
    }
