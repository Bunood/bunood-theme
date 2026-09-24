"""Install native quick-sale customer defaults on existing Bunood sites."""

from bunood_theme.cash_customer import ensure_cash_customer_defaults


def execute():
    ensure_cash_customer_defaults()
