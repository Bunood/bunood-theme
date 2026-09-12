"""Native onboarding wrappers with record-derived Create Entry progress."""

from __future__ import annotations

import frappe

from bunood_theme.onboarding_state import derive_create_entry_progress


def _visible_record_exists(doctype: str) -> bool | None:
    """Return whether the current user can see a persisted record."""

    try:
        if not frappe.db.exists("DocType", doctype) or not frappe.has_permission(doctype, "read"):
            return False
        return bool(frappe.get_list(doctype, fields=["name"], limit_page_length=1))
    except Exception:
        frappe.log_error(title=f"Bunood onboarding progress: {doctype}")
        return None


def _derive(steps):
    return derive_create_entry_progress(steps, _visible_record_exists)


@frappe.whitelist()
@frappe.read_only()
def get_onboarding_data(module: str):
    """Preserve Frappe's role checks and panel shape, correcting record steps."""

    from frappe.desk import desktop

    onboardings = desktop.get_onboarding_data(module)
    if not onboardings:
        return onboardings

    for onboarding in onboardings:
        onboarding["items"], errors = _derive(onboarding.get("items") or [])
        onboarding["bnd_progress_source"] = "persisted_records"
        onboarding["bnd_progress_errors"] = errors

    if all(
        step.get("is_complete") or step.get("is_skipped")
        for onboarding in onboardings
        for step in onboarding.get("items") or []
    ):
        return []
    return onboardings


@frappe.whitelist()
def get_onboarding_steps(ob_steps: str):
    """Apply the same truth to the legacy workspace onboarding block."""

    from frappe.desk.doctype.onboarding_step import onboarding_step

    steps = onboarding_step.get_onboarding_steps(ob_steps)
    steps, errors = _derive(steps)
    for step in steps:
        step["bnd_progress_error"] = step.get("name") in errors
    return steps
