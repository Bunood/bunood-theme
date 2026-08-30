# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Open the Sales Invoice on the customer, not on a tax ID — one time, from vacancy.

Measured before this existed: the first controls on a Sales Invoice were Company
Tax ID and the series, with `customer` fifth and a column of ten edge-case
checkboxes beside them.

Purchase Invoice is deliberately untouched — it already opens on the supplier.

Only a form nobody has customised is written to, and `field_order` for this
doctype is pinned by `bunood_theme/upstream.py`, so an ERPNext release that
inserts a field reddens `npm run upstream` and a human decides what our order
should become. See `forms/install.py`.
"""

from bunood_theme.forms.install import sync_form_order


def execute():
    sync_form_order()
