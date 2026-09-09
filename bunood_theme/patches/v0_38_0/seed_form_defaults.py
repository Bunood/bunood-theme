# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Give Payment Due Date a default so it never renders required-and-empty.

Measured on a new Sales Invoice: `due_date` is blank until a customer is
chosen, and choosing one both fills it and flips it to mandatory. The form
therefore asked in red for a value it was about to supply itself.

Vacancy-gated (a field that already has a default is left alone) — see
`forms/install.py`.
"""

from bunood_theme.forms.install import sync_form_defaults


def execute():
    sync_form_defaults()
