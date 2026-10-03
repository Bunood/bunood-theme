# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Put the riyal AFTER the amount, the way Saudi invoices are read.

WHY
    The Saudi Riyal sign is U+20C1, a 2025 codepoint, and this site already
    stores it as the ``Currency`` record's symbol — so every Frappe surface
    (list, form, report, print) already emits the correct character. What it
    got wrong was the ORDER: ``symbol_on_right`` ships 0, so amounts rendered
    "⃁ 1,000.00" with the sign leading. Measured on this site via
    ``frappe.utils.fmt_money(1000, currency="SAR")``.

    The convention in the market this product serves is the amount first and
    the sign trailing. This flips the one field that decides it, which is why
    the fix is four lines of data rather than a formatter override: Frappe
    already asks the Currency record, on every surface, in both Python and JS.

WHY THE GLYPH NEEDS NO SVG
    A font IS a vector. ``fonts/riyal/bunood-riyal.woff2`` carries exactly one
    glyph at exactly this codepoint with ``unicode-range: U+20C1``, so it can
    never affect any other character, and the desk stack already lists
    "Bunood Riyal" first — verified with ``document.fonts.check`` on the live
    desk. Injecting <svg> at every currency call site would have to reach code
    we do not own (grids, reports, the print engine) and would still have to be
    undone for CSV and clipboard, where a node is not text.

WHY VACANCY-GATED
    Same contract as ``workspace/install.py`` and ``forms/install.py``: we
    write only while the record carries the riyal glyph and a leading sign.
    A custom symbol is left alone. The leading position itself has no provenance
    marker, so an admin setting it back to leading will be normalized on the
    next migrate; this site explicitly requests trailing riyal signs.
"""

import frappe

#: The currency whose sign placement we manage, and the codepoint that proves
#: the record is still the one we think it is. Guarding on the symbol as well
#: as the position means a site that has swapped SAR's symbol for something
#: else keeps its own choice — we would no longer be flipping the riyal.
RIYAL_CURRENCY = "SAR"
RIYAL_SIGN = "⃁"


def sync_currency_symbol_position():
    """Move the riyal sign to the trailing side. Idempotent and defensive."""
    try:
        if not frappe.db.exists("Currency", RIYAL_CURRENCY):
            return
        row = frappe.db.get_value(
            "Currency", RIYAL_CURRENCY, ["symbol", "symbol_on_right"], as_dict=True
        )
        if not row:
            return
        # Already trailing — nothing to do, on every subsequent migrate.
        if row.symbol_on_right:
            return
        # Not the riyal any more: somebody chose a different sign, so the
        # placement is their call and not ours. Unprovable is NOT vacant.
        if (row.symbol or "") != RIYAL_SIGN:
            return
        frappe.db.set_value("Currency", RIYAL_CURRENCY, "symbol_on_right", 1)
        frappe.clear_cache()
    except Exception:
        frappe.log_error(
            title="bunood_theme: riyal symbol position not applied"[:140],
            message=frappe.get_traceback(),
        )


def restore_currency_symbol_position():
    """Put the sign back on the leading side — the undo for the above."""
    try:
        if frappe.db.get_value("Currency", RIYAL_CURRENCY, "symbol") == RIYAL_SIGN:
            frappe.db.set_value("Currency", RIYAL_CURRENCY, "symbol_on_right", 0)
            frappe.clear_cache()
    except Exception:
        frappe.log_error(
            title="bunood_theme: riyal symbol position not restored"[:140],
            message=frappe.get_traceback(),
        )
