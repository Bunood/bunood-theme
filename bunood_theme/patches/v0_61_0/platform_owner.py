"""«مالك المنصة» (THE OWNER, 2026-10-17): the Platform Owner role and its rows on the ZATCA DocTypes.

WHAT IT DOES
    Creates the ``Platform Owner`` role (desk access, two-factor sign-in on), or holds an existing
    one to that; then, on each of ksa_compliance's ZATCA DocTypes that has no Platform Owner row
    yet, copies the standard rows into Custom DocPerm (so no role loses the DocType), leaves the
    tenant's System Manager READ only on ``ZATCA Business Settings`` and ``ZATCA EGS``, and adds the
    role's own row (``platform_owner.ZATCA_PERMISSIONS``).

    The doc_events and the wrapped methods are the lock (``platform_owner.py``); these rows only
    stop the Desk offering a tenant a Save it would refuse. A site without ksa_compliance gets the
    role and nothing else; ``after_migrate`` adds the rows when the app arrives later.
"""

import frappe


def execute():
    from bunood_theme.platform_owner import ensure_role, ensure_zatca_permissions

    created = ensure_role()
    done = ensure_zatca_permissions()
    # Commit, then clear (CLAUDE.md, the cache trap).
    frappe.db.commit()
    frappe.clear_cache()
    print("bunood_theme platform owner: role", "created" if created else "kept", "· ZATCA rows on", done or "nothing new")
