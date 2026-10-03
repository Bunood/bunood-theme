# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The Translations surface's server API. Every entry point is System Manager
only — this surface reads every app's string catalogue and writes rows that
change what every user of a language sees, which is an administrator's power
and nobody else's. The check is explicit rather than left to doctype
permissions, because half these calls never touch a doctype."""

import json

import frappe

from bunood_theme.i18n import apply as apply_mod
from bunood_theme.i18n import providers as providers_mod
from bunood_theme.i18n import scan as scan_mod


def _require_system_manager():
    if "System Manager" not in frappe.get_roles():
        frappe.throw(frappe._("Only a System Manager can manage translations."), frappe.PermissionError)


@frappe.whitelist()
def start_scan(language: str = "ar") -> dict:
    _require_system_manager()
    return {"scan": scan_mod.enqueue_scan(language)}


@frappe.whitelist()
def get_state(language: str = "ar") -> dict:
    """Everything the surface needs to draw, in one call: the latest scan of
    each status, per-app totals, pending-proposal count, provider readiness."""
    _require_system_manager()
    latest = frappe.get_all(
        "Bunood Translation Scan",
        filters={"language": language},
        fields=["name", "status", "started_at", "finished_at", "total_strings",
                "missing_total", "new_since_previous", "apps_json", "error"],
        order_by="creation desc",
        limit=1,
    )
    state = {"scan": None, "running": bool(frappe.cache.get_value(scan_mod.LOCK_KEY))}
    if latest:
        row = latest[0]
        row["apps"] = json.loads(row.pop("apps_json") or "{}")
        state["scan"] = row

    state["pending_proposals"] = frappe.db.count(
        "Bunood Translation Proposal", {"language": language, "status": "Pending"}
    )

    settings = frappe.get_single("Bunood Translation Settings")
    state["provider"] = settings.provider or "Claude"
    ok, reason = providers_mod.PROVIDERS[state["provider"]]["available"](settings)
    state["provider_ready"] = ok
    state["provider_reason"] = reason
    return state


@frappe.whitelist()
def estimate_provider_run(scan: str) -> dict:
    _require_system_manager()
    settings = frappe.get_single("Bunood Translation Settings")
    provider = settings.provider or "Claude"
    doc = frappe.get_doc("Bunood Translation Scan", scan)
    missing = [m for gaps in json.loads(doc.missing_json or "{}").values() for m in gaps]
    est = providers_mod.PROVIDERS[provider]["estimate"](missing, settings)
    return {
        "provider": provider,
        "strings": len(missing),
        "chars": est["chars"],
        "usd": est["usd"],
        "cap": settings.spend_cap_usd or 5.0,
    }


@frappe.whitelist()
def start_provider_run(scan: str) -> dict:
    _require_system_manager()
    settings = frappe.get_single("Bunood Translation Settings")
    provider = settings.provider or "Claude"
    ok, reason = providers_mod.PROVIDERS[provider]["available"](settings)
    if not ok:
        frappe.throw(reason)
    frappe.enqueue(
        "bunood_theme.i18n.providers.run_provider",
        queue="long",
        timeout=3600,
        scan_name=scan,
        provider=provider,
    )
    return {"queued": True, "provider": provider}


@frappe.whitelist()
def export_untranslated(scan: str):
    """The scan's gaps as a downloadable CSV."""
    _require_system_manager()
    frappe.response["filename"] = f"untranslated_{scan}.csv"
    frappe.response["filecontent"] = apply_mod.export_untranslated_csv(scan)
    frappe.response["type"] = "download"


@frappe.whitelist()
def import_csv(language: str, content: str) -> dict:
    _require_system_manager()
    return apply_mod.import_translations_csv(language, content)


@frappe.whitelist()
def save_translation(language: str, source_text: str, translated_text: str) -> dict:
    """The manual path: one row, applied directly — the human IS the review."""
    _require_system_manager()
    outcome = apply_mod.upsert_translation(language, source_text, (translated_text or "").strip())
    frappe.db.commit()
    frappe.translate.clear_cache()
    return {"outcome": outcome}


@frappe.whitelist()
def list_proposals(language: str = "ar", start: int = 0, page_length: int = 20) -> dict:
    _require_system_manager()
    rows = frappe.get_all(
        "Bunood Translation Proposal",
        filters={"language": language, "status": "Pending"},
        fields=["name", "source_text", "proposed_text", "provider", "app"],
        order_by="app asc, source_text asc",
        start=int(start),
        page_length=int(page_length),
    )
    return {
        "rows": rows,
        "total": frappe.db.count("Bunood Translation Proposal", {"language": language, "status": "Pending"}),
    }


@frappe.whitelist()
def review_proposal(name: str, action: str) -> dict:
    _require_system_manager()
    if action == "accept":
        return {"outcome": apply_mod.accept_proposal(name)}
    if action == "reject":
        apply_mod.reject_proposal(name)
        return {"outcome": "rejected"}
    frappe.throw(frappe._("Unknown action."))
