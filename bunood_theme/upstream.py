# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The upstream fingerprint — every Frappe/ERPNext fact this app is built on.

WHY THIS EXISTS
    This theme is a layer over software somebody else ships. Every rule in it
    rests on an upstream fact: a DOM shape, a workspace's block order, a
    DocType's field order, a template we read. When Frappe or ERPNext updates,
    any of those can move silently — and the failure is not a crash. It is a
    rule that still compiles, still passes every gate, and quietly matches
    nothing. This session alone produced three of those:

      * a hiding rule naming `.body-sidebar .navbar-search-bar`, after v16 moved
        search into `.page-head` — so the native search survived beside ours;
      * `data-bnd-layout` scoping, after item 37 stopped stamping it — rules that
        compiled and matched nothing;
      * `frappe.get_route()` returning null mid-boot, which threw out of a chain
        that had worked for a year.

    None of those were caught by a gate. They were caught by looking.

WHAT IT DOES
    Computes a fingerprint of the upstream facts we depend on. A caller pins it
    (``bunood_theme/data/upstream-pins.json``) and the suite fails when the live
    fingerprint no longer matches. A failure is not a bug to silence: it is
    ERPNext telling us something we build on has changed, BEFORE a user finds it.

WHAT IS DEPENDED ON, AND SO WHAT IS PINNED
    versions        the trigger. An app version bump is why everything else here
                    is worth re-reading.
    files           upstream files we read or fork. A fork freezes you at the
                    version you copied; this makes that cost visible.
    workspaces      the shipped ``content`` of every board we reorder. Our hoist
                    claims only from a board matching this exactly, so a change
                    here silently turns the hoist into a no-op on new installs.
    field_order     the shipped field sequence of every DocType we reorder. If
                    ERPNext inserts a field, our order is stale and a user gets
                    a form we did not design.

    DOM contracts are deliberately NOT here: a selector's existence is a
    RENDERED fact and belongs in the browser suite, which already asserts it.
    Pinning a selector string in a JSON file would only pin our own source.
"""

import hashlib
import json
import os

import frappe

#: Boards whose shipped block order our reorder depends on.
#: Keep in step with ``bunood_theme.workspace.install.HOIST``.
PINNED_WORKSPACES = ("Selling", "Buying", "Stock")

#: DocTypes whose shipped field order our form work depends on.
PINNED_DOCTYPES = ("Sales Invoice", "Purchase Invoice")

#: Upstream files we read or fork, as ``(app, relative path)``.
PINNED_FILES = (
    # Quick bill delegates native controls, lifecycle, defaults and amounts.
    ('frappe', 'frappe/public/js/frappe/form/controls/base_input.js'),
    ('frappe', 'frappe/public/js/frappe/form/controls/link.js'),
    ('frappe', 'frappe/public/js/frappe/form/grid.js'),
    ('frappe', 'frappe/public/js/frappe/form/grid_row.js'),
    ('frappe', 'frappe/public/js/frappe/form/script_manager.js'),
    ('frappe', 'frappe/public/js/frappe/form/quick_entry.js'),
    ('frappe', 'frappe/public/js/frappe/ui/dialog.js'),
    ('frappe', 'frappe/public/js/frappe/model/model.js'),
    ('frappe', 'frappe/public/js/frappe/model/meta.js'),
    ('frappe', 'frappe/public/js/frappe/model/perm.js'),
    ('frappe', 'frappe/public/js/frappe/model/create_new.js'),
    ('frappe', 'frappe/public/js/frappe/request.js'),
    ('frappe', 'frappe/public/js/frappe/utils/number_format.js'),
    ('erpnext', 'erpnext/accounts/doctype/sales_invoice/sales_invoice.js'),
    ('erpnext', 'erpnext/public/js/controllers/transaction.js'),
    ('erpnext', 'erpnext/public/js/controllers/taxes_and_totals.js'),
    ('erpnext', 'erpnext/public/js/utils/sales_common.js'),
    # Desktop badge padding and fixed tile heights must not clip themed SVGs.
    ("frappe", "frappe/desk/page/desktop/desktop.css"),
    ("erpnext", "erpnext/workspace_sidebar/home.json"),
    # The initial invoice default must yield to native customer payment terms.
    ("erpnext", "erpnext/accounts/party.py"),
    ("erpnext", "erpnext/public/js/utils/party.js"),
    # Summary subscribes to these native lifecycle and permission contracts.
    ("frappe", "frappe/public/js/frappe/form/form.js"),
    ("frappe", "frappe/public/js/frappe/form/layout.js"),
    ("frappe", "frappe/public/js/frappe/form/tab.js"),
    ("frappe", "frappe/public/js/frappe/form/controls/base_control.js"),
    ("frappe", "frappe/templates/emails/standard.html"),
    ("frappe", "frappe/templates/emails/email_header.html"),
    ("frappe", "frappe/templates/emails/email_footer.html"),
)


def _sha(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _file_hash(app, relative):
    """sha256 of an upstream file, or a marker naming why it could not be read.

    A missing file is itself drift — louder than a hash change, not quieter — so
    it returns a value that cannot match any pin rather than raising.
    """
    try:
        path = os.path.join(os.path.dirname(frappe.get_app_path(app)), relative)
        with open(path, encoding="utf-8") as handle:
            return _sha(handle.read())
    except Exception as exc:  # noqa: BLE001 - the reason is the payload
        return f"UNREADABLE: {type(exc).__name__}"


def _shipped_workspace_content(name):
    """The ``content`` the owning app ships on disk for a workspace."""
    try:
        module = frappe.db.get_value("Workspace", name, "module")
        path = os.path.join(
            frappe.get_module_path(module),
            "workspace",
            frappe.scrub(name),
            frappe.scrub(name) + ".json",
        )
        with open(path, encoding="utf-8") as handle:
            content = json.load(handle).get("content") or "[]"
        # Hash the PARSED shape, so whitespace or key order in the file cannot
        # raise a false alarm. Only a real change of blocks moves this.
        return _sha(json.dumps(json.loads(content), sort_keys=True))
    except Exception as exc:  # noqa: BLE001
        return f"UNREADABLE: {type(exc).__name__}"


def _shipped_field_order(doctype):
    """sha256 of the doctype's field sequence, read from the app's JSON on disk.

    The DB copy is not used on purpose: it carries our own Property Setters, so
    pinning it would pin our changes and never notice upstream's.
    """
    try:
        meta = frappe.get_meta(doctype)
        path = os.path.join(
            frappe.get_module_path(meta.module),
            "doctype",
            frappe.scrub(doctype),
            frappe.scrub(doctype) + ".json",
        )
        with open(path, encoding="utf-8") as handle:
            shipped = json.load(handle)
        order = shipped.get("field_order") or [f.get("fieldname") for f in shipped.get("fields", [])]
        return _sha(json.dumps(order))
    except Exception as exc:  # noqa: BLE001
        return f"UNREADABLE: {type(exc).__name__}"


def fingerprint():
    """The full upstream fingerprint, as a JSON-serialisable dict."""
    versions = {}
    for app in frappe.get_installed_apps():
        if app == "bunood_theme":
            continue  # ours; pinning it would fail on every release we make
        try:
            versions[app] = frappe.get_attr(app + ".__version__")
        except Exception:  # noqa: BLE001
            versions[app] = "UNKNOWN"

    return {
        "versions": versions,
        "files": {f"{app}:{rel}": _file_hash(app, rel) for app, rel in PINNED_FILES},
        "workspaces": {name: _shipped_workspace_content(name) for name in PINNED_WORKSPACES},
        "field_order": {dt: _shipped_field_order(dt) for dt in PINNED_DOCTYPES},
    }


def diff(pinned):
    """Compare a pinned fingerprint against the live one.

    :returns: ``[(path, pinned_value, live_value), ...]``, empty when in step.
    """
    live = fingerprint()
    out = []
    for section in sorted(set(live) | set(pinned or {})):
        entries = live.get(section, {})
        was = (pinned or {}).get(section, {})
        for key in sorted(set(entries) | set(was)):
            if entries.get(key) != was.get(key):
                out.append((f"{section}.{key}", was.get(key), entries.get(key)))
    return out


def assert_compatible():
    """Reject drift before schema patches. Pins ship inside the application.

    This aborts migration; it cannot roll back an image or checkout somebody
    already replaced. Test upgrades on a staging bench before promotion.
    """
    path = os.path.join(os.path.dirname(__file__), "data", "upstream-pins.json")
    try:
        with open(path, encoding="utf-8") as handle:
            pinned = json.load(handle)
    except (OSError, ValueError) as exc:
        raise RuntimeError("Bunood upstream pins are missing or invalid; migration rejected") from exc
    changes = diff(pinned)
    if changes:
        details = "\n".join(f"{key}: {before} -> {after}" for key, before, after in changes)
        raise RuntimeError("Bunood rejected upstream drift before migration. Integrate and review before re-pinning.\n" + details)
