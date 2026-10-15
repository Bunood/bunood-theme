"""The product's name where a site still carries the OLD SHIPPED one (THE OWNER, 2026-10-15:
the system is renamed Zero One, «زيرو ون»).

WHAT IT MOVES
    1. Theme Settings ``company_name``, only where the stored value, stripped, is the old
       shipped default "Bunood" or its Arabic «بنود». Both are the vendor's name, never a
       tenant's: ``presets.SITE_DEFAULTS`` seeded "Bunood" on install and on every migrate
       that found the field empty, and the Arabic is how an Arabic-speaking administrator
       retyped it. A tenant's own name (any other value) is never touched, and an empty field
       stays empty — ``setup._seed_defaults`` fills it with the new default right after.
    2. The custom-field texts whose installers only INSERT when the field is missing, so a
       changed label in the source would never reach a site that has the field: the Payment
       Entry checkout origin, the held-sale flag on Sales/POS Invoice, and the payment-row
       reference's description (its installer reconciles, but only inside the held
       ``ensure_pos_retail``). Each moves only where it still reads the old shipped text
       EXACTLY; an edited label is a choice and stays. The readiness and data-import fields
       need nothing here: ``ensure_custom_fields`` reconciles them on every migrate.

WHY A PATCH AND NOT THE SEEDER
    The seeder writes only an EMPTY field, so a site seeded "Bunood" keeps it forever; and it
    is the field the desk, the sign-in page, the tab title and the website footer all read.

ONE PATCH, RUN ONCE. Released sites record it by module path; a later brand change is a new
patch, not a case added here.
"""

import frappe

#: The old shipped name, as the site may hold it. Compared after ``strip()``.
OLD_NAMES = ("Bunood", "بنود")

#: (doctypes, fieldname, property, old shipped text, new text). The new text is the
#: installer's own in ``payments.py`` / ``pos.py``; the old is what it shipped before.
FIELD_TEXTS = (
    (("Payment Entry",), "custom_bunood_payment_origin", "label",
     "Bunood Payment Origin", "Zero One Payment Origin"),
    (("Sales Invoice", "POS Invoice"), "custom_bunood_is_held", "label",
     "Held in Bunood POS", "Held in Zero One POS"),
    (("Sales Invoice Payment",), "custom_bunood_reference_no", "description",
     "Card, network, or external tender reference captured at Bunood POS checkout.",
     "Card, network, or external tender reference captured at Zero One POS checkout."),
)


def execute():
    from bunood_theme.presets import SITE_DEFAULTS

    changed = _rename_company(SITE_DEFAULTS["company_name"])
    if changed:
        # Commit, then clear: a worker that re-reads the Single between the two would
        # cache the old row behind a clear nobody repeats (CLAUDE.md, the cache trap).
        frappe.db.commit()
        frappe.clear_cache(doctype="Theme Settings")
    fields = _rename_field_texts()
    print("bunood_theme zerONE brand:", (changed + fields) or "nothing to rename")


def _rename_company(new_name: str) -> list[str]:
    # Raw tabSingles, so no cached copy answers. `set_single_value` fires no hooks, and none
    # is owed: `company_name` is not in `brand.BRAND_INPUTS`, so the brand sheet is unchanged.
    stored = frappe.db.sql(
        "select value from tabSingles where doctype = 'Theme Settings' and field = 'company_name'"
    )
    value = (stored[0][0] if stored else None) or ""
    if value.strip() not in OLD_NAMES:
        return []
    frappe.db.set_single_value("Theme Settings", "company_name", new_name)
    return [f"company_name: {value.strip()} -> {new_name}"]


def _rename_field_texts() -> list[str]:
    done = []
    for doctypes, fieldname, prop, old, new in FIELD_TEXTS:
        for doctype in doctypes:
            name = frappe.db.get_value("Custom Field", {"dt": doctype, "fieldname": fieldname}, "name")
            if not name:
                continue
            field = frappe.get_doc("Custom Field", name)
            if field.get(prop) != old:
                continue
            # Saved like the installers save (`custom_fields.ensure_custom_fields`).
            field.set(prop, new)
            field.save(ignore_permissions=True)
            frappe.clear_cache(doctype=doctype)
            done.append(f"{doctype}.{fieldname} {prop}")
    return done
