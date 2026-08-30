# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Hoist each board's day-one card above the reporting blocks.

WHY
    Measured on the live desk: on Selling, Buying and Stock alike, the first
    ACTIONABLE link card sits ~580px into an 800px viewport. Everything above it
    — a chart and three number cards — reports on work already done. Someone who
    opens an ERP to *do* something scrolls past everything describing what was
    already finished.

WHAT IT DOES, AND WHAT IT REFUSES TO DO
    It moves ONE card block per board to the front of that workspace's ``content``
    array. Nothing is created, deleted, renamed or re-worded, and no block's
    relative order changes except the hoisted one.

    In particular it does NOT invent a heading. An earlier design partitioned the
    array into "daily work" and "reporting" and needed a *"Daily Work"* header to
    label the first group — and a string inside a Workspace ``content`` block is
    invisible to ``assertTranslationCoverage``: ``tools/i18n.mjs`` sources only
    our JS and our own DocType JSON, so it would have shipped untranslated and the
    i18n gate would have stayed green. Hoisting needs no new string at all.

    The existing header is left where it is, and that IMPROVES it: each board's
    single header currently sits above a group that *starts* with the day-one
    card, so lifting that card out leaves the header describing exactly the
    masters, settings and reports beneath it.

WHY IT CLAIMS ONLY FROM PROVABLE VACANCY
    These are records ERPNext owns, not ours. ``_is_pristine`` compares the DB's
    ``content`` against the JSON the owning app ships on disk and writes only when
    they are identical — so a site that has arranged its own board is never
    touched, and "unprovable" counts as "not vacant" (a missing or unreadable
    shipped file returns False).

WHY IT IS A ONE-TIME PATCH AND NOT AN after_migrate SYNC
    ``frappe/modules/import_file.py`` skips importing a record whose DB
    ``modified`` is newer than the shipped file's, so this survives ``bench
    migrate`` — until an ERPNext release ships a newer workspace, which would
    overwrite it. Re-applying on every migrate would defend against that, and
    would also revert a client's own rearrangement forever, silently. A one-time
    claim fails the other way: the order simply reverts to upstream's, visibly,
    and can be re-applied deliberately. Prefer the failure a human can see.

    ``restore_workspace_order`` is the undo, and is valid precisely because we
    only ever claimed from vacancy.
"""

import json
import os

import frappe

#: ``{workspace: (card_name, ...)}`` — the cards to lift to the top of a board.
#:
#: Keyed on ``card_name``, which is a stable identifier in the ``content`` JSON,
#: never a translated label. One card per board on purpose: the hoist is uniform
#: and easy to reason about, and every addition would be another product opinion
#: to defend. Stock is the clearest win — it currently leads with masters (Item,
#: Item Group, Product Bundle) rather than the daily Stock Entry.
HOIST = {
    "Selling": ("Selling",),
    "Buying": ("Buying",),
    "Stock": ("Stock Transactions",),
}


def hoist_blocks(blocks, names):
    """Move the named ``card`` blocks to the front, order otherwise preserved.

    Pure: no frappe import is used in here, so it is testable on a literal list.

    :param blocks: the parsed ``content`` array.
    :param names: card names to lift, in the order they should end up.
    :returns: a new list. Never mutates the input.
    """
    wanted = list(names)
    picked = []
    for name in wanted:
        for block in blocks:
            if block.get("type") == "card" and (block.get("data") or {}).get("card_name") == name:
                picked.append(block)
                break
    rest = [b for b in blocks if b not in picked]
    return picked + rest


def _shipped_content(doc):
    """The ``content`` the owning app ships on disk, or None when unreadable.

    None is deliberately distinct from "empty": an unprovable vacancy is not a
    vacancy, and the caller stands down rather than guessing.
    """
    try:
        path = os.path.join(
            frappe.get_module_path(doc.module),
            "workspace",
            frappe.scrub(doc.name),
            frappe.scrub(doc.name) + ".json",
        )
        with open(path, encoding="utf-8") as handle:
            return json.load(handle).get("content")
    except Exception:
        return None


def _is_pristine(doc):
    """True when the DB's content is byte-equal (as parsed JSON) to the shipped file."""
    shipped = _shipped_content(doc)
    if shipped is None:
        return False
    try:
        return json.loads(doc.content or "[]") == json.loads(shipped or "[]")
    except Exception:
        return False


def sync_workspace_order():
    """Hoist the day-one card on every board in :data:`HOIST` that is pristine.

    Idempotent: a board already in the wanted order compares equal and is
    skipped, so a second run is a true no-op. Defensive per record — one board's
    failure is logged and never blocks the rest, or the patch.
    """
    for name, cards in HOIST.items():
        try:
            if not frappe.db.exists("Workspace", name):
                continue
            doc = frappe.get_doc("Workspace", name)
            if not _is_pristine(doc):
                # Someone has arranged this board. It is theirs.
                continue
            blocks = json.loads(doc.content or "[]")
            wanted = hoist_blocks(blocks, cards)
            if wanted == blocks:
                continue
            # A hoist may not lose or invent a block. This is the multiset check
            # the transform's correctness rests on; a reorder that changes the
            # population is a bug, not a reorder.
            if len(wanted) != len(blocks):
                frappe.log_error(
                    title=f"bunood_theme: workspace hoist changed block count for {name}"[:140],
                    message=f"before={len(blocks)} after={len(wanted)}",
                )
                continue
            doc.content = json.dumps(wanted, separators=(",", ": "))
            # `doc.save()` fires Workspace.on_update, which is registered to
            # api.clear_workspace_cache — so the cache is dropped for us and
            # calling it here as well would run it twice.
            doc.save(ignore_permissions=True)
        except Exception:
            frappe.log_error(
                title=f"bunood_theme: workspace hoist failed for {name}"[:140],
                message=frappe.get_traceback(),
            )


def restore_workspace_order():
    """Put the shipped ``content`` back on every board in :data:`HOIST`.

    The undo. Valid because we only ever wrote to a board whose content matched
    the shipped file, so restoring it cannot discard anyone's arrangement.
    """
    for name in HOIST:
        try:
            if not frappe.db.exists("Workspace", name):
                continue
            doc = frappe.get_doc("Workspace", name)
            shipped = _shipped_content(doc)
            if shipped is None:
                continue
            if json.loads(doc.content or "[]") == json.loads(shipped or "[]"):
                continue
            doc.content = shipped
            doc.save(ignore_permissions=True)
        except Exception:
            frappe.log_error(
                title=f"bunood_theme: workspace restore failed for {name}"[:140],
                message=frappe.get_traceback(),
            )
