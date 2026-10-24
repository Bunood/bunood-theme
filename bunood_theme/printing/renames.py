"""An old print format name in a request, read as its new name (the print redesign, 2026-10-15).

A receipt's QR code (``pos.share_receipt``) and a link a customer kept carry
``/printview?…&format=<old name>``. After ``patches/v0_60_0/print_format_names`` that record has
a new name, and Frappe would answer "Print Format not found". This ``before_request`` hook reads
the old name as the new one for the two native print routes — ``/printview`` and the
``download_pdf`` method — so a customer scanning an old receipt still gets it.

Cheap on every other request: two string checks and out. It changes a name only when the old
record is GONE and the new one exists, so a tenant who kept (or re-created) a format under an old
name still gets that one.
"""

import frappe

#: The two native print routes a kept link can reach.
PRINT_PATHS = ("/printview", "/api/method/frappe.utils.print_format.download_pdf")
#: The request parameters that name a print format on them.
FORMAT_KEYS = ("format", "print_format")


def map_old_format_name():
    request = getattr(frappe.local, "request", None)
    if request is None or request.path not in PRINT_PATHS:
        return
    form = frappe.local.form_dict
    for key in FORMAT_KEYS:
        new = mapped(form.get(key))
        if new:
            form[key] = new


def mapped(name) -> str:
    """The new name for an old one that no longer exists, else ""."""
    if not name or not isinstance(name, str):
        return ""
    from bunood_theme.patches.v0_60_0.print_format_names import FORMAT_RENAMES
    from bunood_theme.patches.v0_63_0.contracting_format_name import (
        FORMAT_RENAMES as CONTRACTING,
    )

    new = FORMAT_RENAMES.get(name) or CONTRACTING.get(name)
    if not new or frappe.db.exists("Print Format", name) or not frappe.db.exists("Print Format", new):
        return ""
    return new
