# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from bunood_theme.migration_rehearsal import validate_rehearsal_document


class BunoodMigrationRehearsal(Document):
    """Immutable result of one native import on an isolated restored site."""

    def validate(self):
        validate_rehearsal_document(self)

    def before_cancel(self):
        frappe.throw(
            _(
                "Migration rehearsal receipts are immutable. Create a new rehearsal for another file or retry."
            )
        )
