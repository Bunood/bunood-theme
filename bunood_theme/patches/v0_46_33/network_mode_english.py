"""Give the Network payment method one language-neutral database key.

The original setup created the Mode of Payment itself as ``شبكة``.  Because
Mode of Payment is a translated DocType, its persistent name must instead be
the source-language value ``Network``; the Arabic catalogue supplies the label
shown to Arabic users.  Renaming through Frappe keeps every Link field intact.
"""

import frappe
from frappe.model.rename_doc import rename_doc


LEGACY_NETWORK_MODE = "شبكة"
CANONICAL_NETWORK_MODE = "Network"


def _preserve_account_mappings() -> None:
    """Copy unique legacy mappings before merging two pre-existing records."""
    if not (
        frappe.db.exists("Mode of Payment", LEGACY_NETWORK_MODE)
        and frappe.db.exists("Mode of Payment", CANONICAL_NETWORK_MODE)
    ):
        return

    legacy = frappe.get_doc("Mode of Payment", LEGACY_NETWORK_MODE)
    canonical = frappe.get_doc("Mode of Payment", CANONICAL_NETWORK_MODE)
    by_company = {row.company: row for row in canonical.accounts}
    changed = False
    for row in legacy.accounts:
        existing = by_company.get(row.company)
        if existing:
            if not existing.default_account and row.default_account:
                existing.default_account = row.default_account
                changed = True
            continue
        canonical.append(
            "accounts",
            {"company": row.company, "default_account": row.default_account},
        )
        changed = True
    if changed:
        canonical.save(ignore_permissions=True)


def _rename_legacy_mode() -> None:
    if not frappe.db.exists("Mode of Payment", LEGACY_NETWORK_MODE):
        return

    canonical_exists = bool(
        frappe.db.exists("Mode of Payment", CANONICAL_NETWORK_MODE)
    )
    if canonical_exists:
        _preserve_account_mappings()
    rename_doc(
        "Mode of Payment",
        LEGACY_NETWORK_MODE,
        CANONICAL_NETWORK_MODE,
        force=True,
        merge=canonical_exists,
        ignore_permissions=True,
        show_alert=False,
        rebuild_search=False,
    )


def _rename_saved_invoice_choices() -> None:
    """Select values are plain text and are not followed by rename_doc."""
    if not frappe.db.exists("DocType", "Sales Invoice"):
        return
    meta = frappe.get_meta("Sales Invoice")
    if not meta.has_field("bunood_settlement_method"):
        return
    invoice = frappe.qb.DocType("Sales Invoice")
    (
        frappe.qb.update(invoice)
        .set(invoice.bunood_settlement_method, CANONICAL_NETWORK_MODE)
        .where(invoice.bunood_settlement_method == LEGACY_NETWORK_MODE)
    ).run()


def execute() -> None:
    from bunood_theme.payments import ensure_pos_payment_setup
    from bunood_theme.printing.install import configure_sales_invoice_for_mvp

    _rename_legacy_mode()
    _rename_saved_invoice_choices()
    ensure_pos_payment_setup()
    configure_sales_invoice_for_mvp()
    frappe.clear_cache(doctype="Mode of Payment")
