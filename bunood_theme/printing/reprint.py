"""«نسخة مكررة — Copy»: a printed invoice's second and later prints say so (the lead's default for
the owner, 2026-10-15: the market study's reprint rule).

Frappe keeps no print count (its Access Log is a deferred insert, flushed by the scheduler, so a
reprint a minute later would not see the first print), so each document carries its own:
`bnd_print_count` on Sales Invoice and POS Invoice (a hidden custom field, install.py), or a
doctype's own `print_count` (the restaurant's kitchen ticket).

- A PRINT is a render the user asked to put on paper or into a file: `/printview` with
  `trigger_print` (the desk's Print button, the counter's receipt), `download_pdf`, the bulk PDFs,
  `print_by_server`. Those raise the count.
- Every other render — the desk's print preview, an e-mailed PDF, the customer's shared receipt
  link — counts nothing and shows what the next print would be.
- The first print is the original. A draft is never marked and never counted (nor a cancelled
  document, which Frappe prints only on request).

THE COUNT IS WRITTEN AFTER THE RESPONSE, never under the render (the v0.60.0 review, finding 3).
The counter sits on the submitted invoice's own row, which Payment Entry submits and the ZATCA
status writes also update; an UPDATE issued in `before_print` held that row lock until the
request ended — for a bulk PDF, minutes — and their writes timed out behind it. So a print reads
the stored count (no lock), prints number + 1, and leaves the increment to a callback that runs
once the response is sent: one short transaction per document, committed at once, with a short
lock wait. Nothing here may stop a print: a lock timeout, a read-only database or any other
failure is logged and the paper still comes out.

`before_print` (doc_events) records the number of the print being rendered; the templates ask
`mark(doc)` (Jinja: `bunood_print_copy`) and print the copy line when it is a second print or later.
"""

from __future__ import annotations

from types import SimpleNamespace

import frappe
from frappe.utils import cint, now_datetime

#: Seconds the after-response increment waits for a row another transaction holds.
LOCK_WAIT = 5

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
    """The number of the print being rendered (1 = the original), raising the stored count —
    after the response — when this request is a print (and `count`). 0 when the document
    carries no counter, is not printable, or anything fails (logged; the print goes on)."""
    try:
        return _record(doc, count)
    except Exception:
        _log("print number not read", doc)
        return 0


def _record(doc, count: bool) -> int:
    if not doc or not doc.get("name") or not _printable(doc):
        return 0
    field = field_of(doc.doctype)
    if not field:
        return 0
    key = (doc.doctype, doc.name)
    numbers = _numbers()
    if key in numbers:
        return numbers[key]
    number = cint(frappe.db.get_value(doc.doctype, doc.name, field)) + 1
    if count and counted_request():
        # Kept for the request, so the template that follows reads this print's number.
        numbers[key] = number
        _schedule(doc.doctype, doc.name, field)
    return number


def _schedule(doctype: str, name: str, field: str) -> None:
    """Raise the stored count once the response is sent (Frappe's after_response callbacks run
    before the request's connection closes). Without that hook — not an HTTP request as Frappe
    serves it — it is raised at once, still in its own guarded statement."""
    pending = getattr(frappe.local, "bnd_print_pending", None)
    if pending is None:
        pending = frappe.local.bnd_print_pending = []
        request = getattr(frappe.local, "request", None)
        callbacks = getattr(request, "after_response", None)
        if callbacks is None:
            pending.append((doctype, name, field))
            flush(pending, commit=False)
            frappe.local.bnd_print_pending = None
            return
        callbacks.add(lambda: flush(pending))
    pending.append((doctype, name, field))


def flush(pending: list, commit: bool = True) -> None:
    """One short transaction per document: increment, commit. A row another transaction holds
    is waited for LOCK_WAIT seconds at most; any failure is logged and the next one tried."""
    mariadb = getattr(frappe.db, "db_type", "mariadb") == "mariadb"
    prefix = f"SET STATEMENT innodb_lock_wait_timeout={LOCK_WAIT} FOR " if mariadb else ""
    while pending:
        doctype, name, field = pending.pop(0)
        try:
            frappe.db.sql(f"{prefix}update `tab{doctype}` set `{field}` = ifnull(`{field}`, 0) + 1 where name = %s", name)
            if commit:
                frappe.db.commit()
            else:
                frappe.local.flags.commit = True
        except Exception:
            if commit:
                try:
                    frappe.db.rollback()
                except Exception:
                    pass
            _log("print count not raised", SimpleNamespace(doctype=doctype, name=name))


def _log(what: str, doc) -> None:
    try:
        frappe.logger("bunood_theme").warning(
            f"{what}: {getattr(doc, 'doctype', '')} {getattr(doc, 'name', '')}", exc_info=True
        )
    except Exception:
        pass


def before_print(doc, method=None, *args, **kwargs):
    """doc_events: Sales Invoice / POS Invoice `before_print`. Never stops the print."""
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
