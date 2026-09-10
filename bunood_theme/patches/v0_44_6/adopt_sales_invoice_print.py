"""Adopt Bunood's branded A4 invoice from ERPNext's generated default."""


def execute():
    from bunood_theme.printing.install import adopt_sales_invoice_print_format

    adopt_sales_invoice_print_format()
