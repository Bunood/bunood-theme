"""Native report presentation compatibility for the pinned Frappe/ERPNext.

Execution, export permission checks and financial calculations stay native.
Owner report customizations are never replaced by a substring match.
"""

from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

import frappe


PAYMENT_ORIGIN_FIELD = "custom_bunood_payment_origin"
OBSOLETE_REVIEW_COLUMN = "`tabQuality Action`.document_type"
REVIEW_QUERY = """SELECT
  `tabQuality Action`.name AS "Name:Link/Quality Action:200",
  `tabQuality Action`.corrective_preventive AS "Action:Data:160",
  `tabQuality Action`.review AS "Review:Link/Quality Review:200",
  `tabQuality Action`.date AS "Date:Date:120",
  `tabQuality Action`.status AS "Status:Data:120"
FROM `tabQuality Action`
WHERE COALESCE(`tabQuality Action`.review, '') != ''
ORDER BY `tabQuality Action`.date DESC, `tabQuality Action`.name DESC"""


def _missing_module_is_report_controller(expected: str, missing: str | None) -> bool:
    return bool(missing and (missing == expected or expected.startswith(missing + ".")))


def _normalise_available_serial_rows(result):
    """Only correct the measured no-bundle tuple; retain legitimate data."""
    if isinstance(result, tuple) and len(result) == 2 and result[0] == [] and result[1] == []:
        return []
    return result


class ReportCompatibility:
    """Extend the native Report, including worker and direct export callers."""

    def get_xlsx_styles_from_module(self, metadata):
        try:
            return super().get_xlsx_styles_from_module(metadata)
        except ModuleNotFoundError as exc:
            if self.is_standard == "Yes" and self.report_type == "Query Report" and self.query:
                from frappe.core.doctype.report.report import get_report_module_dotted_path
                expected = get_report_module_dotted_path(self.module, self.report_name)
                if _missing_module_is_report_controller(expected, exc.name):
                    return None
            raise

    def execute_script_report(self, filters):
        result = super().execute_script_report(filters)
        if (self.report_name == "Available Serial No" and self.is_standard == "Yes"
                and self.report_type == "Script Report" and not self.get("snapshot_report")
                and isinstance(result, (tuple, list)) and len(result) >= 2):
            normalised = _normalise_available_serial_rows(result[1])
            if normalised is not result[1]:
                values = list(result)
                values[1] = normalised
                return tuple(values) if isinstance(result, tuple) else values
        if (self.report_name == "General Ledger" and self.is_standard == "Yes"
                and self.report_type == "Script Report" and not self.get("snapshot_report")
                and isinstance(result, (tuple, list)) and len(result) >= 2):
            _add_ledger_statement({"columns": result[0], "result": result[1]})
        return result


_SHEET_VIEW = re.compile(rb'<sheetView\b[^>]*>')
_RTL_ATTRIBUTE = re.compile(rb'\brightToLeft\s*=\s*["\'][^"\']*["\']')


def _set_xlsx_right_to_left(content: bytes) -> bytes:
    """Change worksheet direction only, preserving cells, styles and ZIP metadata."""
    changed = False

    def rtl(match):
        nonlocal changed
        tag = match.group(0)
        if _RTL_ATTRIBUTE.search(tag):
            updated = _RTL_ATTRIBUTE.sub(b'rightToLeft="1"', tag)
        else:
            updated = tag.replace(b"<sheetView", b'<sheetView rightToLeft="1"', 1)
        changed = changed or updated != tag
        return updated

    target_buffer = BytesIO()
    with ZipFile(BytesIO(content), "r") as source, ZipFile(target_buffer, "w") as target:
        target.comment = source.comment
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename.startswith("xl/worksheets/") and entry.filename.endswith(".xml"):
                data = _SHEET_VIEW.sub(rtl, data)
            target.writestr(entry, data)
    return target_buffer.getvalue() if changed else content


def _apply_arabic_xlsx_direction(content: bytes, language: str | None = None) -> bytes:
    language = language or getattr(frappe.local, "lang", "")
    if not content or str(language).lower().replace("_", "-").split("-", 1)[0] != "ar":
        return content
    return _set_xlsx_right_to_left(content)


@frappe.whitelist()
def export_query():
    """Keep native export and background delivery, with Arabic sheet direction."""
    from frappe.desk import query_report
    form_params = frappe._dict(frappe.local.form_dict)
    if int(form_params.export_in_background or 0):
        from frappe.desk.utils import pop_csv_params
        csv_params = pop_csv_params(form_params)
        query_report.clean_params(form_params)
        query_report.parse_json(form_params)
        report_name = form_params.report_name
        frappe.permissions.can_export(
            frappe.get_cached_value("Report", report_name, "ref_doctype"), raise_exception=True
        )
        user_email = frappe.get_cached_value("User", frappe.session.user, "email")
        frappe.enqueue(
            "bunood_theme.report_compat.run_export_query_job",
            user_email=user_email, form_params=form_params, csv_params=csv_params,
            language=getattr(frappe.local, "lang", None), queue="long", now=frappe.flags.in_test,
        )
        frappe.msgprint(frappe._("Background export requested. Download link email: {0}").format(user_email))
        return None
    result = query_report.export_query()
    if form_params.file_format_type == "Excel":
        content = frappe.local.response.get("filecontent")
        if isinstance(content, str):
            content = content.encode()
        if content:
            frappe.local.response["filecontent"] = _apply_arabic_xlsx_direction(content)
    return result


def run_export_query_job(user_email: str, form_params, csv_params, language=None):
    from frappe.desk import query_report
    from frappe.desk.utils import send_report_email
    report_name, extension, content = query_report._export_query(
        frappe._dict(form_params), frappe._dict(csv_params), populate_response=False
    )
    if extension == "xlsx":
        content = _apply_arabic_xlsx_direction(content, language)
    send_report_email(user_email, report_name, extension, content,
                      attached_to_name=frappe._dict(form_params).report_name)


def sync_report_compatibility():
    """Repair only an unchanged installed native Review query, transactionally."""
    result = {"review_query_updated": False}
    if not frappe.db.exists("Report", "Review") or not frappe.db.exists("DocType", "Quality Action"):
        return result
    meta = frappe.get_meta("Quality Action")
    if not meta.get_field("review") or meta.get_field("document_type"):
        return result
    upstream = json.loads(Path(frappe.get_app_path(
        "erpnext", "quality_management", "report", "review", "review.json"
    )).read_text(encoding="utf-8"))
    query = upstream.get("query") or ""
    if upstream.get("report_name") != "Review" or OBSOLETE_REVIEW_COLUMN not in query:
        return result
    report = frappe.get_doc("Report", "Review")
    if (report.is_standard != "Yes" or report.report_type != "Query Report"
            or report.query != query or report.ref_doctype != upstream.get("ref_doctype")
            or report.module != upstream.get("module")):
        return result
    frappe.db.set_value("Report", "Review", "query", REVIEW_QUERY, update_modified=False)
    frappe.clear_document_cache("Report", "Review")
    result["review_query_updated"] = True
    return result


@frappe.whitelist()
@frappe.read_only()
def run(report_name: str, filters: str | dict | None = None, user: str | None = None,
        ignore_prepared_report: bool = False, custom_columns: str | list | None = None,
        is_tree: bool = False, parent_field: str | None = None,
        are_default_filters: bool = True, js_filters: str | list | None = None) -> dict:
    from frappe.desk.query_report import run as native_run
    result = native_run(report_name=report_name, filters=filters, user=user,
                        ignore_prepared_report=ignore_prepared_report, custom_columns=custom_columns,
                        is_tree=is_tree, parent_field=parent_field,
                        are_default_filters=are_default_filters, js_filters=js_filters)
    if report_name == "General Ledger":
        _add_ledger_statement(result)
    return result


def _ledger_payments(names):
    """Native row AND field permissions; optional hidden details are not queried."""
    if not names or len(names) > 10000 or not frappe.has_permission("Payment Entry", ptype="read"):
        return {}, set()
    from frappe.model import get_permitted_fields
    permitted = set(get_permitted_fields("Payment Entry", permission_type="read"))
    if not {"name", "payment_type"}.issubset(permitted):
        return {}, set()
    fields = [field for field in ("name", "payment_type", "mode_of_payment", "total_allocated_amount",
                                 PAYMENT_ORIGIN_FIELD) if field in permitted]
    payments = frappe.get_list("Payment Entry", filters={"name": ["in", names]},
                               fields=fields, limit_page_length=len(names))
    return {payment.name: payment for payment in payments}, set(fields)


def _add_ledger_statement(result: dict) -> None:
    """Enrich visible native vouchers without inventing historical timing."""
    rows, columns = result.get("result") or [], result.get("columns") or []
    if not rows or not columns or any(isinstance(c, dict) and c.get("fieldname") == "bnd_statement" for c in columns):
        return
    names = sorted({row.get("voucher_no") for row in rows if isinstance(row, dict)
                    and row.get("voucher_type") == "Payment Entry" and row.get("voucher_no")})
    payments, fields = _ledger_payments(names)
    for row in rows:
        if not isinstance(row, dict):
            continue
        voucher_type = row.get("voucher_type")
        if voucher_type != "Payment Entry":
            if voucher_type:
                row["bnd_statement"] = frappe._(voucher_type)
            continue
        payment = payments.get(row.get("voucher_no"))
        if not payment:
            row["bnd_statement"] = frappe._("Payment Entry")
            continue
        if payment.payment_type == "Receive":
            origin = payment.get(PAYMENT_ORIGIN_FIELD) if PAYMENT_ORIGIN_FIELD in fields else None
            if origin == "invoice_checkout":
                source = frappe._("Receipt at invoice checkout")
            elif origin == "credit_collection":
                source = frappe._("Later receipt for credit sale")
                if "total_allocated_amount" in fields and not payment.get("total_allocated_amount"):
                    source += f" ({frappe._('Not allocated to an invoice')})"
            elif origin == "separate_receipt":
                source = frappe._("Separate receipt voucher")
            elif PAYMENT_ORIGIN_FIELD in fields:
                source = frappe._("Receipt Voucher (origin not recorded)")
            else:
                source = frappe._("Receipt Voucher")
        elif payment.payment_type == "Pay":
            source = frappe._("Disbursement Voucher")
        else:
            source = frappe._("Internal Transfer")
        mode = payment.get("mode_of_payment") if "mode_of_payment" in fields else None
        row["bnd_statement"] = f"{source} — {frappe._(mode)}" if mode else source
    column = {"fieldname": "bnd_statement", "label": frappe._("Statement / origin"), "fieldtype": "Data", "width": 300}
    index = next((i + 1 for i, c in enumerate(columns) if isinstance(c, dict) and c.get("fieldname") == "voucher_no"), len(columns))
    columns.insert(index, column)
