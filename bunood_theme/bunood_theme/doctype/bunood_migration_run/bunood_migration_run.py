# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from bunood_theme.migration_scope import finalize_migration_run, validate_migration_run


class BunoodMigrationRun(Document):
    """Candidate-bound migration scope; native ERPNext remains data authority."""

    def validate(self):
        validate_migration_run(self)

    def before_submit(self):
        finalize_migration_run(self)

    def before_cancel(self):
        frappe.throw(
            _(
                "Submitted migration packets are immutable. Create a new packet for a changed source or mapping."
            )
        )
