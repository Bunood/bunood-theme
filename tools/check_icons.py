# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Guard for the server-side icon inference (`bunood_theme/icons.py`).

Two things this proves, both plain Python — no bench, no site, mirroring
`tools/contrast_gate.py`'s "pure math is testable" stance:

  1. EVERY sprite id the inference can emit exists in Frappe v16's loaded sets.
     A wrong id renders an empty <use> box — worse than a letter chip — so this
     is the load-bearing check. It runs against a committed snapshot of the live
     sprite (`bunood_theme/data/sprite_ids.json` — SHIPPED, not a test fixture,
     because `bunood_theme/api.py`'s runtime doctype-icon map verifies against
     the same file), regenerated deliberately.

  2. Inference is driven by the UNTRANSLATED name, not the display label. This is
     the whole reason the engine moved to the server: `sprite_for_name` keys off
     `link_to` ("Stock Entry" in every language), so an Arabic desk resolves the
     same icons an English one does. The test feeds an Arabic label alongside an
     English link_to and asserts the icon follows the link_to.

Run directly: `python tools/check_icons.py`. Exits non-zero on any failure, so a
CI/build step can gate on it.
"""

import io
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)

from bunood_theme import icons  # noqa: E402

# The sprite-id manifest is SHIPPED (the runtime doctype-icon map verifies against
# it too), so it lives in the package, not tests/fixtures — one canonical copy.
FIXTURE = os.path.join(ROOT, "bunood_theme", "data", "sprite_ids.json")


def _emitted_ids():
    """Every `icon-*` / `es-*` literal the inference module can return, read
    from its source so a new mapping can never dodge the existence check."""
    src = io.open(os.path.join(ROOT, "bunood_theme", "icons.py"), encoding="utf-8").read()
    return set(re.findall(r'"((?:icon|es)-[a-z0-9-]+)"', src))


def check_ids_exist():
    """(1) Every emitted id is present in the snapshot of the live sprite."""
    snap = json.load(io.open(FIXTURE, encoding="utf-8"))
    present = set(snap["ids"])
    emitted = _emitted_ids()
    missing = sorted(e for e in emitted if not e.startswith("es-") and e not in present)
    if missing:
        raise AssertionError(
            "icons.py emits sprite ids that exist in NO loaded set — each renders an "
            "empty box:\n  " + "\n  ".join(missing) +
            "\nFix the mapping, or regenerate bunood_theme/data/sprite_ids.json if the "
            "sprite genuinely grew."
        )
    return len(emitted)


def check_inference():
    """(2) Behaviour, including the language-independence that is the point."""
    # The seven everyday DocTypes have exact, distinct semantics. These checks
    # also prove every selected id is part of the shipped sprite snapshot via
    # `check_ids_exist` above.
    exact_cases = {
        "Customer": "icon-customer",
        "Supplier": "icon-handshake",
        "Item": "icon-package",
        "Warehouse": "icon-warehouse",
        "Property": "icon-land-plot",
        "Real Estate Unit": "icon-building-2",
        "Lease": "icon-key-round",
    }
    assert len(set(exact_cases.values())) == len(exact_cases), \
        "exact everyday DocType icons must be distinct"
    for name, want in exact_cases.items():
        got = icons.sprite_for_name(name)
        assert got == want, f"sprite_for_name({name!r}) = {got!r}, wanted {want!r}"

    # Keyword inference remains the long-tail fallback.
    cases = {
        "Sales Invoice": "icon-receipt",
        "Purchase Invoice": "icon-receipt",
        "Tax Template": "icon-percent",
        "Stock Entry": "icon-stock",
        "Journal Entry": "icon-file-text",
        "Purchase Order": "icon-buying",
        "Sales Order": "icon-shopping-cart",
        "Company": "icon-organization",
        "Project": "icon-project",
    }
    for name, want in cases.items():
        got = icons.sprite_for_name(name)
        assert got == want, f"sprite_for_name({name!r}) = {got!r}, wanted {want!r}"

    # The defect this replaces: "Sales Invoice" and "Tax Template" must NOT
    # collapse onto one glyph the way the old icon-invoice/icon-percentage
    # (both absent) did.
    assert icons.sprite_for_name("Sales Invoice") != icons.sprite_for_name("Tax Template"), \
        "invoice and tax must resolve to different icons"

    # THE ARABIC PROOF. All exact semantic icons follow untranslated `link_to`,
    # never the visible label, so translated desks resolve identically.
    arabic_labels = {
        "Customer": "عميل",
        "Supplier": "مورد",
        "Item": "صنف",
        "Warehouse": "مستودع",
        "Property": "عقار",
        "Real Estate Unit": "وحدة عقارية",
        "Lease": "عقد إيجار",
    }
    for link_to, label in arabic_labels.items():
        got = icons.icon_for_item(
            {"link_to": link_to, "link_type": "DocType", "label": label}
        )
        assert got == exact_cases[link_to], \
            f"Arabic-label parity broken for {link_to!r}: {got!r}"

    # The general untranslated-name contract still holds outside exact names.
    en = icons.icon_for_item({"link_to": "Stock Entry", "link_type": "DocType", "label": "Stock Entry"})
    ar = icons.icon_for_item({"link_to": "Stock Entry", "link_type": "DocType", "label": "قيد مخزون"})
    assert en == ar == "icon-stock", f"Arabic parity broken: en={en!r} ar={ar!r}"

    # Runtime precedence is deliberate: row-owned icon, exact everyday record,
    # explicit DocType/ref-DocType icon, then substring inference. The map
    # below mirrors the generic values observed on the pinned local stack.
    present = set(json.load(io.open(FIXTURE, encoding="utf-8"))["ids"])
    dt_icons = {
        "Sales Invoice": "icon-receipt",
        "Customer": "icon-customer",
        "Supplier": "icon-customer",
        "Item": "icon-tag",
        "Warehouse": "icon-organization",
        "Property": "icon-organization",
        "Real Estate Unit": "icon-organization",
        "Lease": "icon-file-text",
    }
    assert icons.icon_for_item(
        {"link_to": "Warehouse", "link_type": "DocType", "icon": "home"},
        dt_icons,
        present,
    ) == "icon-home", "row-owned icon must outrank exact and explicit mappings"
    for name, want in exact_cases.items():
        got = icons.icon_for_item(
            {"link_to": name, "link_type": "DocType"}, dt_icons
        )
        assert got == want, \
            f"runtime map bypassed exact semantic icon for {name!r}: {got!r}"

    assert icons.icon_for_item(
        {"link_to": "Sales Invoice", "link_type": "DocType"}, dt_icons
    ) == "icon-receipt", "non-exact DocTypes retain their explicit icon"

    # A Report resolves through its ref_doctype.
    assert icons.icon_for_item(
        {"link_to": "Stock Ledger", "link_type": "Report", "report": {"ref_doctype": "Warehouse"}},
        dt_icons,
    ) == "icon-organization", "reports retain the explicit ref-DocType icon"

    # FontAwesome mapping: aliases and the direct path (guarded by the id set).
    assert icons.sprite_for_fa("fa fa-cog") == "icon-setting-gear"
    assert icons.sprite_for_fa("fa fa-truck") == "icon-stock"
    assert icons.sprite_for_fa("fa fa-calendar", present) == "icon-calendar"  # direct
    assert icons.sprite_for_fa("fa fa-frobnicate", present) is None  # unknown → no guess
    assert icons.sprite_for_fa("icon-list", present) == "icon-list"  # already an id
    assert icons.sprite_for_fa("") is None

    # Nothing to say → None, so the caller can fall back to a workspace icon or letter.
    assert icons.sprite_for_name("Xyzzy Widget") is None
    assert icons.icon_for_item({"link_to": "Xyzzy", "link_type": "Page"}) is None


def main():
    n = check_ids_exist()
    check_inference()
    print(f"icons: {n} emitted ids all present in the sprite snapshot; inference and "
          f"Arabic-parity checks pass.")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print("ICON CHECK FAILED:\n" + str(exc), file=sys.stderr)
        sys.exit(1)
