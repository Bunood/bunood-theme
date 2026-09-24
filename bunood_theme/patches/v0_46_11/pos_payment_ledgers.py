"""Provision separate Cash and Network POS ledgers on existing sites."""

from bunood_theme.payments import ensure_pos_payment_setup


def execute():
    ensure_pos_payment_setup()
