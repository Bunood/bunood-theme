"""A POS sale priced from a channel's price list instead of its profile's.

An installed app opts in with the ``bunood_pos_price_list`` hook: each method is
called as ``method(doc=doc, profile=profile)`` with the native POS invoice and its
POS Profile, and returns a selling Price List name, or None for the profile's own.
The last installed app that answers wins.

The answer must follow from the document itself, never from what the browser sent:
a held sale, its checkout, every validation of the invoice and an offline sale
synced later all ask again, and they must get the same list. Without the hook,
nothing changes.

A channel's list prices only what differs: an item it has no price for keeps the
profile's price (pos._native_catalog_item).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

PRICE_LIST_HOOK = "bunood_pos_price_list"


def channel_price_list(profile, doc) -> str | None:
    """The channel's price list for this sale, or None when it is priced from the profile's."""
    if doc is None or cint(doc.get("is_return")):
        return None
    methods = frappe.get_hooks(PRICE_LIST_HOOK)
    if not methods:
        return None
    chosen = None
    for method in reversed(methods):
        chosen = frappe.get_attr(method)(doc=doc, profile=profile)
        if chosen:
            break
    if not chosen or chosen == profile.get("selling_price_list"):
        return None
    chosen = str(chosen)
    found = frappe.db.get_value("Price List", chosen, ["enabled", "selling", "currency"], as_dict=True)
    if not found or not found.enabled or not found.selling:
        frappe.throw(_("This sale's price list is not an enabled selling price list: {0}").format(chosen))
    if found.currency != frappe.db.get_value("Price List", profile.get("selling_price_list"), "currency"):
        frappe.throw(_("This sale's price list is not in the POS Profile's currency: {0}").format(chosen))
    return chosen


class ChannelPriceList:
    """Sales Invoice and POS Invoice: a POS sale names the price list it was priced from.

    ERPNext's set_pos_fields puts the customer's, the customer group's or the
    profile's list on the invoice at every validation, before pricing rules and
    item details read it. A channel's list is put back in that same step, so its
    pricing rules apply and the invoice records it.
    """

    def set_pos_fields(self, for_validate=False):
        profile = super().set_pos_fields(for_validate)
        if profile and cint(self.get("is_pos")):
            chosen = channel_price_list(profile, self)
            if chosen:
                self.selling_price_list = chosen
        return profile
