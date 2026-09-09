# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Put Home at the top of the Home sidebar — one time, from vacancy.

Measured on the live desk: the Home sidebar shipped ``Item, Home, Customer,
Supplier, Sales Invoice``, so the one entry that is not a doctype list — and the
one a lost user reaches for — rendered SECOND, below a master data list. The
selected-state pill made it worse, drawing the eye to a green row sitting under
a plain one for no reason a user could infer.

ONE TIME, for the same reason as ``hoist_day_one_cards``: re-applying on every
migrate would revert a client's own arrangement forever, silently. Only the
shipped arrangement is touched — see ``workspace/install.py``'s
``SIDEBAR_SHIPPED`` — and ``restore_sidebar_order`` is the deliberate undo.
"""

from bunood_theme.workspace.install import sync_sidebar_order


def execute():
    sync_sidebar_order()
