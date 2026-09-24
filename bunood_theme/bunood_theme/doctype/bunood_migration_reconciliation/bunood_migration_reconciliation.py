# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from bunood_theme.migration_reconciliation import (
    finalize_migration_reconciliation,
    validate_migration_reconciliation,
)


class BunoodMigrationReconciliation(Document):
    """Immutable comparison of approved source controls to native evidence."""

    def validate(self):
        validate_migration_reconciliation(self)

    def before_submit(self):
        finalize_migration_reconciliation(self)

    def before_cancel(self):
        frappe.throw(
            _(
                "Submitted migration reconciliation receipts are immutable. Correct the source through a new migration packet."
            )
        )
