"""Move the former bilingual title default onto the selected Print Language.

The launch document family is one language per output.  Existing sites still
holding the former shipped default (``Both``) move with the baseline; explicit
Arabic-only and English-only tenant choices remain untouched.
"""

import frappe


def execute():
    current = frappe.db.get_single_value("Theme Settings", "print_title_lang")
    if current in (None, "", "Both"):
        frappe.db.set_single_value(
            "Theme Settings", "print_title_lang", "Follow print language"
        )
        frappe.clear_cache(doctype="Theme Settings")
