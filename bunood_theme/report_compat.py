# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Narrow report compatibility repairs for the supported Frappe/ERPNext pin.

The fixes in this module are deliberately conditional.  They stop applying when
upstream no longer exposes the measured defect, so Bunood does not permanently
fork either report.
"""

from __future__ import annotations

from io import BytesIO
from functools import wraps
import re
from typing import Any
from zipfile import ZipFile

import frappe


REVIEW_REPORT = "Review"
OBSOLETE_REVIEW_COLUMN = "`tabQuality Action`.document_type"
REVIEW_QUERY = """SELECT
  `tabQuality Action`.name AS "Name:Link/Quality Action:200",
  `tabQuality Action`.corrective_preventive AS "Action:Data:160",
  `tabQuality Action`.review AS "Review:Link/Quality Review:200",
  `tabQuality Action`.date AS "Date:Date:120",
  `tabQuality Action`.status AS "Status:Data:120"
FROM
  `tabQuality Action`
WHERE
  COALESCE(`tabQuality Action`.review, '') != ''
ORDER BY
  `tabQuality Action`.date DESC,
  `tabQuality Action`.name DESC"""


def _missing_module_is_report_controller(expected: str, missing: str | None) -> bool:
    """Return true only when the report's own optional module is absent.

    ``ModuleNotFoundError.name`` can identify either the full controller module
    or one of its missing package parents.  A dependency imported *by* a real
    controller will not be a prefix of the controller path and must still fail.
    """

    return bool(missing and (missing == expected or expected.startswith(f"{missing}.")))


class ReportXlsxStyleCompatibility:
    """Let SQL-only Query Reports use Frappe's default XLSX styles.

    Core correctly treats ``get_xlsx_styles`` as an optional report hook, but
    its lookup only catches ``AttributeError``.  A standard Query Report whose
    query lives in the Report record has no Python controller, so module lookup
    raises ``ModuleNotFoundError`` and aborts an otherwise valid Excel export.

    This mixin is intentionally narrower than catching the exception around an
    entire export: only stored-query reports with their *own* module missing
    fall back. Script Reports, reports with no stored SQL, and missing imports
    inside a real controller keep raising their original error.
    """

    def get_xlsx_styles_from_module(self, metadata):
        try:
            return super().get_xlsx_styles_from_module(metadata)
        except ModuleNotFoundError as exc:
            if (
                self.is_standard == "Yes"
                and self.report_type == "Query Report"
                and bool(self.query)
            ):
                from frappe.core.doctype.report.report import get_report_module_dotted_path

                expected = get_report_module_dotted_path(self.module, self.report_name)
                if _missing_module_is_report_controller(expected, exc.name):
                    return None
            raise


_SHEET_VIEW_WITHOUT_RTL = re.compile(rb'<sheetView\b(?![^>]*\brightToLeft=)')


def _set_xlsx_right_to_left(content: bytes) -> bytes:
    """Mark every worksheet RTL without rebuilding cells or workbook styles."""

    source_buffer = BytesIO(content)
    target_buffer = BytesIO()
    changed = False

    with ZipFile(source_buffer, "r") as source, ZipFile(target_buffer, "w") as target:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename.startswith("xl/worksheets/") and entry.filename.endswith(".xml"):
                data, replacements = _SHEET_VIEW_WITHOUT_RTL.subn(
                    b'<sheetView rightToLeft="1"', data
                )
                changed = changed or bool(replacements)
            target.writestr(entry, data)

    return target_buffer.getvalue() if changed else content


def _is_arabic_language(language: str | None = None) -> bool:
    language = language or getattr(frappe.local, "lang", "")
    return str(language).lower().replace("_", "-").split("-", 1)[0] == "ar"


def _apply_arabic_xlsx_direction(content: bytes, language: str | None = None) -> bytes:
    if not content or not _is_arabic_language(language):
        return content
    return _set_xlsx_right_to_left(content)


@frappe.whitelist()
def export_query():
    """Use native report export and mark Arabic Excel worksheets RTL."""

    from frappe.desk import query_report

    form_params = frappe._dict(frappe.local.form_dict)
    export_in_background = int(form_params.export_in_background or 0)
    if export_in_background:
        from frappe.desk.utils import pop_csv_params

        csv_params = pop_csv_params(form_params)
        query_report.clean_params(form_params)
        query_report.parse_json(form_params)
        report_name = form_params.report_name
        frappe.permissions.can_export(
            frappe.get_cached_value("Report", report_name, "ref_doctype"),
            raise_exception=True,
        )

        user = frappe.session.user
        user_email = frappe.get_cached_value("User", user, "email")
        frappe.enqueue(
            "bunood_theme.report_compat.run_export_query_job",
            user_email=user_email,
            form_params=form_params,
            csv_params=csv_params,
            language=getattr(frappe.local, "lang", None),
            queue="long",
            now=frappe.flags.in_test,
        )
        frappe.msgprint(
            frappe._(
                "Background export requested. Download link email: {0}"
            ).format(user_email)
        )
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
    """Background counterpart of the native job with the same Arabic RTL step."""

    from frappe.desk import query_report
    from frappe.desk.utils import send_report_email

    report_name, file_extension, content = query_report._export_query(
        frappe._dict(form_params), frappe._dict(csv_params), populate_response=False
    )
    if file_extension == "xlsx":
        content = _apply_arabic_xlsx_direction(content, language)
    send_report_email(
        user_email,
        report_name,
        file_extension,
        content,
        attached_to_name=frappe._dict(form_params).report_name,
    )


def _normalise_available_serial_rows(result: Any) -> Any:
    """Collapse ERPNext's invalid empty ``([], [])`` row result to ``[]``.

    ERPNext v16's ``process_stock_ledger_entries`` returns ``([], [])`` only
    when Stock Ledger Entries exist but none has a serial/batch bundle.  Its
    caller already supplied the columns, so the tuple is interpreted as two
    zero-length data rows and Frappe's normalizer raises ``IndexError``.
    Preserve every other return value byte-for-byte.
    """

    if isinstance(result, tuple) and len(result) == 2 and result[0] == [] and result[1] == []:
        return []
    return result


def _install_available_serial_no_patch() -> bool:
    """Install the measured empty-state correction in the current worker."""

    from erpnext.stock.report.available_serial_no import available_serial_no

    original = available_serial_no.process_stock_ledger_entries
    if getattr(original, "_bunood_empty_result_compat", False):
        return False

    @wraps(original)
    def compatible(*args, **kwargs):
        return _normalise_available_serial_rows(original(*args, **kwargs))

    compatible._bunood_empty_result_compat = True
    available_serial_no.process_stock_ledger_entries = compatible
    return True


def sync_report_compatibility() -> dict[str, bool]:
    """Repair the obsolete stored Review query when this exact mismatch exists.

    The guard checks both sides of the compatibility boundary: the installed
    schema must have ``review`` and lack ``document_type``, and the stored query
    must still reference the obsolete column.  A future upstream query, a site
    with a legitimate custom field, or an unrelated customization is untouched.
    """

    result = {"review_query_updated": False}
    try:
        if not frappe.db.exists("Report", REVIEW_REPORT) or not frappe.db.exists(
            "DocType", "Quality Action"
        ):
            return result

        meta = frappe.get_meta("Quality Action")
        if not meta.get_field("review") or meta.get_field("document_type"):
            return result

        query = frappe.db.get_value("Report", REVIEW_REPORT, "query") or ""
        if OBSOLETE_REVIEW_COLUMN not in query:
            return result

        frappe.db.set_value(
            "Report",
            REVIEW_REPORT,
            "query",
            REVIEW_QUERY,
            update_modified=False,
        )
        frappe.clear_document_cache("Report", REVIEW_REPORT)
        frappe.db.commit()
        result["review_query_updated"] = True
    except Exception:
        frappe.log_error("bunood_theme: report compatibility sync failed")
    return result


@frappe.whitelist()
@frappe.read_only()
def run(
    report_name: str,
    filters: str | dict | None = None,
    user: str | None = None,
    ignore_prepared_report: bool = False,
    custom_columns: str | list | None = None,
    is_tree: bool = False,
    parent_field: str | None = None,
    are_default_filters: bool = True,
    js_filters: str | list | None = None,
) -> dict:
    """Delegate to native report execution after the one targeted runtime fix."""

    if report_name == "Available Serial No":
        _install_available_serial_no_patch()

    # Import here so the original callable is captured directly, after Frappe
    # has resolved this override.  Calling it does not re-enter hook lookup.
    from frappe.desk.query_report import run as native_run

    return native_run(
        report_name=report_name,
        filters=filters,
        user=user,
        ignore_prepared_report=ignore_prepared_report,
        custom_columns=custom_columns,
        is_tree=is_tree,
        parent_field=parent_field,
        are_default_filters=are_default_filters,
        js_filters=js_filters,
    )
