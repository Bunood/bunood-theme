# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Configuration for the Translations surface. Behaviour lives in
:mod:`bunood_theme.i18n`; this Single only holds the choices.

The API keys are ``Password`` fields on purpose: Frappe encrypts them at rest,
excludes them from the boot payload, and ``get_password()`` is the only read
path — so a key entered here is never serialised into a page, a log line or a
whitelisted response. Every provider call happens server-side.
"""

from frappe.model.document import Document


class BunoodTranslationSettings(Document):
    pass
