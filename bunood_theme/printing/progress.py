"""«مستخلص - فاتورة ضريبية - A4»: what a progress invoice prints beyond the kit's invoice figures.

The certificate (its number, the PO, the project, the works, the supply period) and the summary in
the owner's sample order (2026-10-22, «زي النموذج بالضبط … ديناميك»): the certificate value, each
advance recovery and each deduction (with its reason) that the user added, the taxable amount, the
VAT, «إجمالي الفاتورة شامل الضريبة», then the retention and «الصافي المستحق الآن». A row the invoice
does not carry is not printed; without a retention (or an advance paid) the invoice total is last.

Every figure is ERPNext's own: the value is `total`, the taxable amount `net_total`, the VAT the
VAT rows, the invoice total `grand_total` (what ZATCA's XML and QR carry). The rows' amounts come
from bunood_business, which owns the fields (`bnd_is_progress`, `bnd_progress_adjustments`, …);
each read is guarded by `meta.has_field`, so the theme never breaks without it.
"""

import frappe
from frappe.utils import cint, flt

from bunood_theme.printing.view import _is_vat, date, num

RECOVERY, DEDUCTION, RETENTION = "Advance Recovery", "Progress Deduction", "Performance Retention"


def _field(doc, meta, name):
    return doc.get(name) if meta.has_field(name) else None


def is_progress(doc) -> bool:
    """A progress invoice, on a site whose invoices have the field (bunood_business installed)."""
    if not doc or not doc.get("doctype") or cint(doc.get("is_return")):
        return False
    meta = frappe.get_meta(doc.doctype)
    return bool(meta.has_field("bnd_is_progress") and cint(doc.get("bnd_is_progress")))


def _percent(value) -> str:
    value = flt(value)
    return f"{value:g}%" if value else ""


def progress_view(doc) -> dict:
    """The certificate block and the summary rows, in the sample's order, as they print."""
    meta = frappe.get_meta(doc.doctype)
    rows = _field(doc, meta, "bnd_progress_adjustments") or []
    currency = doc.get("currency") or ""
    value = abs(flt(doc.get("total")))
    recoveries = [row for row in rows if row.get("kind") == RECOVERY and flt(row.get("amount"))]
    deductions = [row for row in rows if row.get("kind") == DEDUCTION and flt(row.get("amount"))]
    retention = next((row for row in rows if row.get("kind") == RETENTION and flt(row.get("amount"))), None)
    vat_rows = [tax for tax in doc.get("taxes") or [] if _is_vat(tax)]
    rates = {flt(tax.get("rate")) for tax in vat_rows if tax.get("rate")}
    rate = f"{rates.pop():g}%" if len(rates) == 1 else ""
    vat = abs(flt(doc.get("total_taxes_and_charges")))
    grand = abs(flt(doc.get("grand_total")))
    advance_paid = abs(flt(doc.get("total_advance")))

    summary = [{"ar": "قيمة المستخلص", "en": "Certificate value", "amount": num(value)}]
    for row in recoveries:
        share = _percent(row.get("percent"))
        summary.append({
            "ar": "استرداد الدفعة المقدمة" + (f" ({share} من القيمة)" if share else ""),
            "en": "Advance payment recovery" + (f" ({share} of the value)" if share else ""),
            "note": row.get("advance_invoice") or "",
            "amount": f"({num(row.get('amount'))})",
        })
    for row in deductions:
        summary.append({
            "ar": "خصم",
            "en": "Deduction",
            "note": (row.get("reason") or "").strip(),
            "amount": f"({num(row.get('amount'))})",
        })
    if recoveries or deductions:
        summary.append({"ar": "الإجمالي الخاضع للضريبة", "en": "Taxable amount", "amount": num(doc.get("net_total"))})
    summary.append({"ar": "ضريبة القيمة المضافة" + (f" {rate}" if rate else ""), "en": "VAT" + (f" {rate}" if rate else ""), "amount": num(vat)})
    summary.append({"ar": "إجمالي الفاتورة شامل الضريبة", "en": "Invoice total incl. VAT", "amount": num(grand), "key": "total"})
    if retention:
        share = _percent(retention.get("percent"))
        due = date(retention.get("due_date"))
        summary.append({
            "ar": "محتجز ضمان التنفيذ" + (f" {share}" if share else ""),
            "en": "Performance retention" + (f" {share}" if share else ""),
            "note": f"يستحق في {due}" if due else "يستحق عند التسليم",
            "amount": f"({num(retention.get('amount'))})",
        })
    if advance_paid >= 0.005:
        summary.append({"ar": "الدفعات المستلمة مقدماً", "en": "Advance paid", "amount": f"({num(advance_paid)})"})
    if retention or advance_paid >= 0.005:
        now = grand - (flt(retention.get("amount")) if retention else 0) - advance_paid
        summary.append({"ar": "الصافي المستحق الآن", "en": "Net payable now", "amount": num(now), "key": "now"})
    # The last row is the one the eye looks for: the net payable now, else the invoice total.
    summary[-1]["last"] = True

    start, end = date(_field(doc, meta, "bnd_supply_from")), date(_field(doc, meta, "bnd_supply_to"))
    project = doc.get("project") or ""
    if project:
        project = frappe.db.get_value("Project", project, "project_name") or project
    return {
        "currency": currency,
        "certificate": _field(doc, meta, "bnd_certificate_no") or "",
        "po": doc.get("po_no") or "",
        "project": project,
        "works": (_field(doc, meta, "bnd_work_description") or "").strip(),
        "period": " — ".join(part for part in (start, end) if part),
        "rows": summary,
    }
