# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Open a form on the thing it is about.

WHY
    Measured on a Sales Invoice: the first controls a user meets are **Company
    Tax ID** and the series, and the third column is ten edge-case checkboxes —
    POS, credit note, debit note, tax withholding. `customer` is the fifth
    field. Someone raising an invoice is asked for a tax ID before they are
    asked who they are billing.

WHAT IT DOES
    Hoists a few fields to the front of the first section by writing a
    ``field_order`` Property Setter — Frappe's own customisation API, the same
    one Customize Form writes. No DOM is touched, nothing is hidden, nothing is
    renamed, and no field is removed: only the order changes, and only within
    what the doctype already ships.

WHAT IT DELIBERATELY DOES NOT DO
    * **It does not touch Purchase Invoice.** That form already opens
      `naming_series, supplier, supplier_name, tax_id, company` — the supplier is
      the second field. Reordering it would be change for its own sake, and every
      record we write to is a record ERPNext owns. Measured before deciding.
    * It does not collapse sections. ERPNext already ships `collapsible: 1` on
      More Info, Accounting Dimensions, Currency and Price List and most of the
      advanced tabs; the problem was never that the advanced material was open,
      it was that the essential material was buried under it.
    * It adds no string. The labels are ERPNext's, untouched, so nothing here
      can ship untranslated — which matters because a Property Setter's contents
      are invisible to ``assertTranslationCoverage``.

WHY IT CLAIMS ONLY FROM PROVABLE VACANCY
    Same contract as ``workspace/install.py``: the shipped order is read from
    the app's own JSON on disk, and we write only when the site is still on it
    AND no ``field_order`` setter already exists. A site that has customised
    this form is never touched, and an unreadable shipped file counts as "not
    vacant" rather than as permission.

WHY A ONE-TIME PATCH
    An ERPNext release that inserts a field will not know about our order, and
    ours would then be stale — which is exactly what ``npm run upstream``
    exists to catch: ``field_order`` for this doctype is pinned, so the gate
    reddens and a human decides. Re-applying on every migrate would instead
    overwrite a client's own customisation forever, silently.

    ``restore_form_order()`` is the undo.
"""

import json
import os

import frappe

#: ``{doctype: (fieldname, ...)}`` — fields to lift to the front of the form.
#:
#: Sales Invoice only, and three fields only: who is being billed, their name,
#: and their tax id. Everything else keeps its shipped relative order, so the
#: company block simply follows the customer block instead of preceding it.
HOIST = {
    "Sales Invoice": ("customer", "customer_name", "tax_id"),
}


def hoist_fields(order, names):
    """Move ``names`` to the front of ``order``, preserving all other order.

    Pure, so it is testable on a literal list. Names not present are ignored
    rather than invented — a field ERPNext has removed must not resurrect here.
    """
    picked = [n for n in names if n in order]
    return picked + [n for n in order if n not in picked]


def _shipped_order(doctype):
    """The field order the owning app ships on disk, or None when unreadable."""
    try:
        meta = frappe.get_meta(doctype)
        path = os.path.join(
            frappe.get_module_path(meta.module),
            "doctype",
            frappe.scrub(doctype),
            frappe.scrub(doctype) + ".json",
        )
        with open(path, encoding="utf-8") as handle:
            shipped = json.load(handle)
        return shipped.get("field_order") or [f.get("fieldname") for f in shipped.get("fields", [])]
    except Exception:
        return None


def _is_vacant(doctype):
    """True when nobody has customised this form's order yet.

    Two conditions, because either alone is insufficient: an existing setter
    means somebody chose an order, and a live order differing from the shipped
    one means something else moved it.
    """
    if frappe.db.exists(
        "Property Setter",
        {"doc_type": doctype, "property": "field_order", "doctype_or_field": "DocType"},
    ):
        return False
    shipped = _shipped_order(doctype)
    if not shipped:
        return False
    live = [f.fieldname for f in frappe.get_meta(doctype).fields]
    return live == shipped


def sync_form_order():
    """Apply :data:`HOIST` to every vacant form. Idempotent and defensive."""
    for doctype, names in HOIST.items():
        try:
            if not frappe.db.exists("DocType", doctype):
                continue
            if not _is_vacant(doctype):
                continue
            shipped = _shipped_order(doctype)
            wanted = hoist_fields(shipped, names)
            if wanted == shipped:
                continue
            # A reorder may not lose or invent a field. Same guard as the
            # workspace hoist: a transform that changes the population is a bug.
            if sorted(wanted) != sorted(shipped):
                frappe.log_error(
                    title=f"bunood_theme: form hoist changed the field set for {doctype}"[:140],
                    message=f"before={len(shipped)} after={len(wanted)}",
                )
                continue
            frappe.make_property_setter(
                {
                    "doctype": doctype,
                    "doctype_or_field": "DocType",
                    "property": "field_order",
                    "value": json.dumps(wanted),
                    "property_type": "Data",
                },
                is_system_generated=False,
            )
            frappe.clear_cache(doctype=doctype)
        except Exception:
            frappe.log_error(
                title=f"bunood_theme: form hoist failed for {doctype}"[:140],
                message=frappe.get_traceback(),
            )


def restore_form_order():
    """Delete our ``field_order`` setters, returning each form to shipped order."""
    for doctype in HOIST:
        try:
            for name in frappe.get_all(
                "Property Setter",
                filters={
                    "doc_type": doctype,
                    "property": "field_order",
                    "doctype_or_field": "DocType",
                },
                pluck="name",
            ):
                frappe.delete_doc("Property Setter", name, ignore_permissions=True, force=True)
            frappe.clear_cache(doctype=doctype)
        except Exception:
            frappe.log_error(
                title=f"bunood_theme: form restore failed for {doctype}"[:140],
                message=frappe.get_traceback(),
            )


#: ``{doctype: {fieldname: default}}`` — defaults for fields that render
#: REQUIRED AND EMPTY before the user has done anything.
#:
#: Sales Invoice ``due_date`` only. Measured on a new invoice: before a customer
#: is chosen the field is blank; the moment one is, ERPNext's own
#: ``set_due_date`` fills it (from the customer's payment terms, or the posting
#: date when there are none) and simultaneously flips it to mandatory. So the
#: form asks in red for a value it is about to supply itself, and a first-time
#: user reads that as an error they caused.
#:
#: "Today" matches what ERPNext computes for a customer with no payment terms,
#: which is this site's case, so the default agrees with the engine rather than
#: competing with it — and any customer WITH terms overwrites it on selection,
#: because that recalculation runs after this default is applied.
#:
#: Nothing else needed one. The other required fields measured on a new invoice
#: — company, series, posting date, currency, price list, both exchange rates —
#: already arrive filled; ``customer`` is the question the form exists to ask,
#: and ``debit_to`` resolves from it.
DEFAULTS = {
    "Sales Invoice": {"due_date": "Today"},
}


def sync_form_defaults():
    """Apply :data:`DEFAULTS` as Property Setters. Idempotent and defensive."""
    for doctype, fields in DEFAULTS.items():
        for fieldname, value in fields.items():
            try:
                if not frappe.db.exists("DocType", doctype):
                    continue
                meta = frappe.get_meta(doctype)
                field = meta.get_field(fieldname)
                if not field:
                    continue
                # Vacancy: only claim a field nobody has given a default to.
                if field.default:
                    continue
                if frappe.db.exists("Property Setter", {
                    "doc_type": doctype, "field_name": fieldname, "property": "default"
                }):
                    continue  # An explicit empty default is also an admin choice.
                frappe.make_property_setter(
                    {
                        "doctype": doctype,
                        "fieldname": fieldname,
                        "property": "default",
                        "value": value,
                        "property_type": "Text",
                    },
                    is_system_generated=False,
                )
                frappe.clear_cache(doctype=doctype)
            except Exception:
                frappe.log_error(
                    title=f"bunood_theme: default not set for {doctype}.{fieldname}"[:140],
                    message=frappe.get_traceback(),
                )


def restore_form_defaults():
    """Delete our ``default`` setters — the undo for the above."""
    for doctype, fields in DEFAULTS.items():
        for fieldname, value in fields.items():
            try:
                for name in frappe.get_all(
                    "Property Setter",
                    filters={"doc_type": doctype, "field_name": fieldname, "property": "default", "value": value},
                    pluck="name",
                ):
                    frappe.delete_doc("Property Setter", name, ignore_permissions=True, force=True)
                frappe.clear_cache(doctype=doctype)
            except Exception:
                frappe.log_error(
                    title=f"bunood_theme: default not restored for {doctype}.{fieldname}"[:140],
                    message=frappe.get_traceback(),
                )
