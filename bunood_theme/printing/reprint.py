"""«نسخة مكررة — Copy»: a printed invoice's second and later prints say so (the lead's default for
the owner, 2026-10-15: the market study's reprint rule).

Frappe keeps no print count (its Access Log is a deferred insert, flushed by the scheduler, so a
reprint a minute later would not see the first print), so each document carries its own:
`bnd_print_count` on Sales Invoice and POS Invoice (a hidden custom field, install.py), or a
doctype's own `print_count` (the restaurant's kitchen ticket).

- A PRINT is a render the user asked to put on paper or into a file: `/printview` with
  `trigger_print` (the desk's Print button, the counter's receipt), `download_pdf`, the bulk PDFs,
  `print_by_server`. Those raise the count, and the request commits it (a GET request otherwise
  rolls back).
- Every other render — the desk's print preview, an e-mailed PDF, the customer's shared receipt
  link — counts nothing and shows what the next print would be.
- The first print is the original. A draft is never marked and never counted (nor a cancelled
  document, which Frappe prints only on request).

`before_print` (doc_events) records the number of the print being rendered; the templates ask
`mark(doc)` (Jinja: `bunood_print_copy`) and print the copy line when it is a second print or later.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint, now_datetime

#: The counters a document may carry, ours first.
FIELDS = ("bnd_print_count", "print_count")
#: The endpoints that put a document on paper or into a file.
PRINT_METHODS = (
    "frappe.utils.print_format.download_pdf",
    "frappe.utils.print_format.download_multi_pdf",
    "frappe.utils.print_format.download_multi_pdf_async",
    "frappe.utils.print_format.print_by_server",
)


def counted_request() -> bool:
    """Is this request a print (see the module's docstring)?"""
    request = getattr(frappe.local, "request", None)
    if request is None:
        return False
    path = (getattr(request, "path", "") or "").rstrip("/")
    if path == "/printview":
        return bool(cint((frappe.local.form_dict or {}).get("trigger_print")))
    return any(path == "/api/method/" + method for method in PRINT_METHODS)


def field_of(doctype: str) -> str | None:
    meta = frappe.get_meta(doctype)
    return next((field for field in FIELDS if meta.has_field(field)), None)


def _numbers() -> dict:
    numbers = getattr(frappe.local, "bnd_print_numbers", None)
    if numbers is None:
        numbers = frappe.local.bnd_print_numbers = {}
    return numbers


def _printable(doc) -> bool:
    """A submittable document counts once submitted; any other document always."""
    if frappe.get_meta(doc.doctype).is_submittable:
        return cint(doc.get("docstatus")) == 1
    return True


def record(doc, count: bool = True) -> int:
    """The number of the print being rendered (1 = the original), raising the stored count when
    this request is a print (and `count`). 0 when the document carries no counter or is not
    printable."""
    if not doc or not doc.get("name") or not _printable(doc):
        return 0
    field = field_of(doc.doctype)
    if not field:
        return 0
    key = (doc.doctype, doc.name)
    numbers = _numbers()
    if key in numbers:
        return numbers[key]
    if count and counted_request():
        table = f"tab{doc.doctype}"
        frappe.db.sql(f"update `{table}` set `{field}` = ifnull(`{field}`, 0) + 1 where name = %s", doc.name)
        frappe.local.flags.commit = True
        number = cint(frappe.db.get_value(doc.doctype, doc.name, field))
        # Kept for the request, so the template that follows reads this print's number.
        numbers[key] = number
        return number
    return cint(frappe.db.get_value(doc.doctype, doc.name, field)) + 1


def before_print(doc, method=None, *args, **kwargs):
    """doc_events: Sales Invoice / POS Invoice `before_print`."""
    record(doc)


def mark(doc) -> dict:
    """{} for the original (or a draft, or a document without a counter); for a copy
    {"number": n, "at": "YYYY-MM-DD HH:MM"} — the print time the copy line carries."""
    number = _numbers().get((doc.doctype, doc.name)) if doc and doc.get("name") else None
    if number is None:
        # Not seen by a before_print in this request: what this render would be, counting nothing.
        number = record(doc, count=False) if doc is not None else 0
    if number <= 1:
        return {}
    return {"number": number, "at": now_datetime().strftime("%Y-%m-%d %H:%M")}
