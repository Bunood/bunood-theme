# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from bunood_theme.readiness_review import (
    finalize_readiness_review,
    validate_readiness_review,
)


class BunoodReadinessReview(Document):
    """An immutable submitted decision receipt, never a replacement for Task."""

    def validate(self):
        validate_readiness_review(self)

    def before_submit(self):
        finalize_readiness_review(self)

    def before_cancel(self):
        frappe.throw(
            frappe._(
                "Submitted readiness receipts are immutable. Create a Reopened receipt instead."
            )
        )
