"""Complete the native payment mappings required by invoices and dashboards."""

from bunood_theme.payments import ensure_pos_payment_setup


def execute():
    """Run the idempotent native Mode of Payment setup for active POS companies."""
    ensure_pos_payment_setup()
