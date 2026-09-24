"""Permission-safe discovery of the site's native VAT treatments.

The invoice workbench never owns a second tax engine.  This module only turns
ERPNext's configured Tax Categories, Tax Rules, and Taxes and Charges Templates
into the two common choices shown by the simple invoice UI.
"""

from __future__ import annotations

import re

import frappe
from frappe import _


RATE_BASED_CHARGE_TYPES = {
    "On Net Total",
    "On Previous Row Amount",
    "On Previous Row Total",
    "On Item Quantity",
}
VAT_PATTERN = re.compile(r"\bvat\b|value added|ضريبة", re.IGNORECASE)
EXEMPT_PATTERN = re.compile(r"\bexempt(?:ed|ion)?\b|معف", re.IGNORECASE)


def _treatment_profiles(templates, tax_rows, rules):
    """Return standard/exempt profiles from already-authoritative ERPNext data."""

    rules_by_template = {}
    for rule in rules:
        template = rule.get("template")
        category = rule.get("tax_category")
        if template and category and template not in rules_by_template:
            rules_by_template[template] = category

    rows_by_template = {}
    for row in tax_rows:
        rows_by_template.setdefault(row.get("parent"), []).append(row)

    candidates = []
    for template in templates:
        name = template.get("name")
        category = template.get("tax_category") or rules_by_template.get(name) or ""
        rows = rows_by_template.get(name, [])
        vat_rows = [
            row
            for row in rows
            if VAT_PATTERN.search(
                f"{row.get('description') or ''} {row.get('account_head') or ''}"
            )
        ]
        if not vat_rows and VAT_PATTERN.search(f"{name or ''} {category}"):
            vat_rows = [
                row
                for row in rows
                if row.get("charge_type") in RATE_BASED_CHARGE_TYPES
            ]
        rates = [float(row.get("rate") or 0) for row in vat_rows]
        if not rates:
            continue
        label = f"{name or ''} {category}"
        candidates.append(
            {
                "template": name,
                "tax_category": category,
                "rate": max(rates),
                "is_default": bool(template.get("is_default")),
                "is_exempt": bool(EXEMPT_PATTERN.search(label)) and all(rate == 0 for rate in rates),
            }
        )

    standard = [candidate for candidate in candidates if candidate["rate"] > 0]
    exempt = [candidate for candidate in candidates if candidate["is_exempt"]]
    standard.sort(key=lambda candidate: (not candidate["is_default"], -candidate["rate"], candidate["template"]))
    exempt.sort(key=lambda candidate: (not bool(candidate["tax_category"]), candidate["template"]))
    return {
        "standard": standard[0] if standard else None,
        "exempt": exempt[0] if exempt else None,
    }


@frappe.whitelist(methods=["GET"])
def get_vat_treatments(company: str, transaction_type: str = "Sales") -> dict:
    """Read the standard and exempt treatments the current user may invoice with."""

    transaction_type = (transaction_type or "").strip().title()
    if transaction_type not in {"Sales", "Purchase"}:
        frappe.throw(_("Transaction type must be Sales or Purchase."), frappe.ValidationError)
    if not company or not frappe.db.exists("Company", company):
        frappe.throw(_("Company not found."), frappe.DoesNotExistError)

    transaction_doctype = f"{transaction_type} Invoice"
    template_doctype = f"{transaction_type} Taxes and Charges Template"
    if (
        not frappe.has_permission("Company", "read", company)
        or not frappe.has_permission(transaction_doctype, "read")
        or not frappe.has_permission(template_doctype, "read")
    ):
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    rule_template_field = f"{transaction_type.lower()}_tax_template"
    templates = frappe.get_all(
        template_doctype,
        filters={"company": company, "disabled": 0},
        fields=["name", "tax_category", "is_default"],
        order_by="is_default desc, name asc",
    )
    names = [template.name for template in templates]
    if not names:
        return {"standard": None, "exempt": None}

    rows = frappe.get_all(
        f"{transaction_type} Taxes and Charges",
        filters={"parenttype": template_doctype, "parent": ["in", names]},
        fields=["parent", "charge_type", "account_head", "description", "rate"],
        order_by="parent asc, idx asc",
    )
    rules = frappe.get_all(
        "Tax Rule",
        filters={
            "company": company,
            "tax_type": transaction_type,
            rule_template_field: ["in", names],
        },
        fields=[f"{rule_template_field} as template", "tax_category", "priority"],
        order_by="priority asc, name asc",
    )
    return _treatment_profiles(templates, rows, rules)
