# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""One row per scan. The scan itself lives in :mod:`bunood_theme.i18n.scan`;
this document is its ledger — persisted so "new since last scan" is a
DERIVABLE fact (this set minus the previous set) rather than a guess, and so
the export and the providers can work from what a scan actually found instead
of re-scanning a ten-app bench every time someone opens the surface."""

from frappe.model.document import Document


class BunoodTranslationScan(Document):
    pass
