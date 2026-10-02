"""Disable whole-riyal rounding for new invoices and active POS profiles."""

from bunood_theme.rounding import ensure_exact_halala_defaults


def execute():
    ensure_exact_halala_defaults()
