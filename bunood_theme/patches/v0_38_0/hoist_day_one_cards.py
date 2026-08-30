# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Lift each board's day-one card above its charts — one time, from vacancy.

Measured on the live desk before this existed: on Selling, Buying and Stock the
first actionable link card sat ~580px into an 800px viewport, below a chart and
three number cards.

ONE TIME, DELIBERATELY. `frappe/modules/import_file.py` skips a record whose DB
`modified` is newer than the shipped file's, so this survives `bench migrate` —
until an ERPNext release ships a newer workspace, which overwrites it. Running
on every migrate instead would defend against that and would also revert a
client's own rearrangement forever, silently. This fails the other way: the
order reverts to upstream's, visibly, and `workspace.install.restore_workspace_order`
is the deliberate undo.

Only pristine boards are touched — see `workspace/install.py`.
"""

from bunood_theme.workspace.install import sync_workspace_order


def execute():
    sync_workspace_order()
