"""Keep commercial totals at currency precision instead of whole-riyal rounding."""

from __future__ import annotations

import frappe


def enforce_exact_halalas(doc, _method=None) -> None:
    """Require exact currency totals on every editable invoice.

    ERPNext still owns every calculation. Setting its native flag makes the
    authoritative total ``grand_total`` (two decimal places for SAR), removes
    the round-off GL line, and leaves submitted historical documents intact.
    """
    if int(doc.docstatus or 0) == 0 and doc.meta.has_field("disable_rounded_total"):
        doc.disable_rounded_total = 1


def ensure_exact_halala_defaults() -> dict[str, object]:
    """Set the native site/POS defaults used by new commercial documents."""
    changed: list[str] = []

    if frappe.db.exists("DocType", "Global Defaults"):
        defaults = frappe.get_single("Global Defaults")
        if defaults.meta.has_field("disable_rounded_total") and not defaults.disable_rounded_total:
            defaults.disable_rounded_total = 1
            defaults.save(ignore_permissions=True)
            changed.append("Global Defaults")

    profiles: list[str] = []
    if frappe.db.exists("DocType", "POS Profile"):
        profiles = frappe.get_all(
            "POS Profile", filters={"disabled": 0}, pluck="name", order_by="name asc"
        )
        for name in profiles:
            profile = frappe.get_doc("POS Profile", name)
            if not profile.disable_rounded_total:
                profile.disable_rounded_total = 1
                profile.save(ignore_permissions=True)
                changed.append(f"POS Profile:{name}")

    return {"changed": changed, "profiles": profiles}
