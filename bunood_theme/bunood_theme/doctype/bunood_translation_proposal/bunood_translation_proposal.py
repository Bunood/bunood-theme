# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""One machine-proposed translation, awaiting a human. The runtime mirror of
the PO's ``#, fuzzy`` flag: providers write here, never into ``Translation``
directly, and only :func:`bunood_theme.i18n.apply.accept_proposal` promotes a
row — so a wrong machine guess cannot reach a desk unreviewed."""

from frappe.model.document import Document


class BunoodTranslationProposal(Document):
    pass
