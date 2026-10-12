"""Sell to the halala (owner, 2026-10-12: «نبيع بالهللة»): new commercial documents and
every active POS profile stop rounding the total to the whole riyal.

ERPNext's own flag (Global Defaults / POS Profile ``disable_rounded_total``) makes the
grand total the amount due, at the currency's two places, with no round-off ledger line.
Submitted documents keep the totals they were posted with. The setup is the one held
since v0.46.12 (bunood_theme.rounding), released here as its own patch.
"""

from bunood_theme.rounding import ensure_exact_halala_defaults


def execute():
    ensure_exact_halala_defaults()
