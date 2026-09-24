"""Make the invoice settlement choice explicit on existing sites."""

from bunood_theme.printing.install import configure_sales_invoice_for_mvp


def execute():
    configure_sales_invoice_for_mvp()
