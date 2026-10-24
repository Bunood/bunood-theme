"""v0.62.0's «مستخلص - فاتورة ضريبية - A4» is now «فاتورة ضريبية - مقاولات - A4»: the owner's approved
contracting invoice (2026-10-22) replaced its design and its title («فاتورة ضريبية / Tax Invoice»;
the certificate number is a fact on it, not the title).

A site that installed v0.62.0 keeps its record, its links and its default under the new name
(``rename_doc``); one whose record of the new name is already ours merges the old into it; a record
of either name that is not ours (another module's, the tenant's) is left alone. The request hook
(``printing/renames.py``) reads a kept link's old name as the new one.
"""

import frappe

#: (doctype, old name, new name).
RENAMES = (("Print Format", "مستخلص - فاتورة ضريبية - A4", "فاتورة ضريبية - مقاولات - A4"),)
FORMAT_RENAMES = {old: new for doctype, old, new in RENAMES if doctype == "Print Format"}
MODULE = "Bunood Theme"


def _ours(doctype: str, name: str) -> bool:
    return frappe.db.get_value(doctype, name, "module") == MODULE


def execute():
    for doctype, old, new in RENAMES:
        if not frappe.db.exists(doctype, old) or not _ours(doctype, old):
            continue
        if frappe.db.exists(doctype, new):
            if not _ours(doctype, new):
                continue
            frappe.rename_doc(doctype, old, new, merge=True, force=True)
        else:
            frappe.rename_doc(doctype, old, new, force=True)
        print(f"bunood_theme print names: {old} → {new}")
