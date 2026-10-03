# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The scan: every installed app's untranslated strings, as a persisted ledger.

WHAT IT MEASURES
    Exactly what ``bench get-untranslated`` measures, one app at a time:
    :func:`frappe.translate.get_messages_for_app` (which reads DocTypes, Pages,
    Reports, Workflows, Custom Fields and Navbar Items from the DATABASE — the
    "scan all modules and their fields" the surface exists for) minus whatever
    :func:`frappe.translate.get_all_translations` already answers.

WHY IT IS A QUEUED JOB AND NOT A REQUEST
    Measured 64 seconds for three apps; this bench now has ten. A button that
    blocks a form for minutes is a button that gets clicked twice — the run
    goes to the LONG queue and reports through ``frappe.publish_realtime``,
    which the surface listens to.

WHY RESULTS PERSIST
    "New since the last scan" is only a fact if the last scan still exists:
    the delta is this scan's missing-set minus the previous completed one's.
    And the export, the providers and the review list all work from a scan's
    stored payload rather than re-scanning — a ten-app sweep is a measurement,
    not a page load.
"""

import json

import frappe
from frappe.utils import now_datetime

#: One scan at a time. A cache-based lock rather than a doctype query so a
#: crashed worker cannot wedge the surface for longer than the TTL.
LOCK_KEY = "bnd_translation_scan_running"
LOCK_TTL = 30 * 60


def enqueue_scan(language: str) -> str:
    """Create the ledger row and hand the work to the long queue.

    Returns the new scan's name. Raises if one is already running — the
    surface disables its button on that answer rather than queueing a second
    ten-app sweep behind the first.
    """
    if frappe.cache.get_value(LOCK_KEY):
        frappe.throw(frappe._("A scan is already running."))

    doc = frappe.get_doc(
        {
            "doctype": "Bunood Translation Scan",
            "language": language,
            "status": "Queued",
        }
    ).insert(ignore_permissions=True)
    frappe.db.commit()

    frappe.enqueue(
        "bunood_theme.i18n.scan.run_scan",
        queue="long",
        timeout=3600,
        scan_name=doc.name,
    )
    return doc.name


def run_scan(scan_name: str) -> None:
    """The job body. Publishes ``bnd_translation_scan`` realtime events."""
    frappe.cache.set_value(LOCK_KEY, scan_name, expires_in_sec=LOCK_TTL)
    doc = frappe.get_doc("Bunood Translation Scan", scan_name)
    doc.db_set("status", "Running", update_modified=False)
    doc.db_set("started_at", now_datetime(), update_modified=False)
    frappe.db.commit()

    try:
        from frappe.translate import get_all_translations, get_messages_for_app

        translated = get_all_translations(doc.language)
        apps = frappe.get_installed_apps()
        per_app: dict[str, dict] = {}
        missing: dict[str, list] = {}

        for i, app in enumerate(apps):
            frappe.publish_realtime(
                "bnd_translation_scan",
                {"scan": scan_name, "app": app, "step": i + 1, "of": len(apps)},
            )
            sources = {
                m[1]
                for m in get_messages_for_app(app)
                if len(m) > 1 and isinstance(m[1], str)
            }
            gaps = sorted(s for s in sources if not translated.get(s))
            per_app[app] = {"total": len(sources), "missing": len(gaps)}
            missing[app] = gaps

        previous = _previous_missing_set(doc)
        current = {m for gaps in missing.values() for m in gaps}
        new_since = len(current - previous) if previous is not None else 0

        doc.db_set("apps_json", json.dumps(per_app), update_modified=False)
        doc.db_set("missing_json", json.dumps(missing), update_modified=False)
        doc.db_set("total_strings", sum(a["total"] for a in per_app.values()), update_modified=False)
        doc.db_set("missing_total", len(current), update_modified=False)
        doc.db_set("new_since_previous", new_since, update_modified=False)
        doc.db_set("status", "Completed", update_modified=False)
        doc.db_set("finished_at", now_datetime(), update_modified=False)
        frappe.db.commit()
        frappe.publish_realtime("bnd_translation_scan", {"scan": scan_name, "done": True})
    except Exception:
        frappe.db.rollback()
        doc.db_set("status", "Failed", update_modified=False)
        doc.db_set("error", frappe.get_traceback()[-1500:], update_modified=False)
        frappe.db.commit()
        frappe.publish_realtime("bnd_translation_scan", {"scan": scan_name, "failed": True})
        raise
    finally:
        frappe.cache.delete_value(LOCK_KEY)


def _previous_missing_set(doc) -> set | None:
    """The union missing-set of the previous COMPLETED scan of this language.

    ``None`` when there is no previous scan — a first scan has no delta, and
    reporting "everything is new" would be noise wearing a number.
    """
    prev = frappe.get_all(
        "Bunood Translation Scan",
        filters={"language": doc.language, "status": "Completed", "name": ("!=", doc.name)},
        order_by="creation desc",
        limit=1,
        pluck="name",
    )
    if not prev:
        return None
    payload = frappe.db.get_value("Bunood Translation Scan", prev[0], "missing_json")
    if not payload:
        return None
    return {m for gaps in json.loads(payload).values() for m in gaps}
