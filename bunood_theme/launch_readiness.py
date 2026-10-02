"""Truthful aggregation for Bunood's pre-live configuration observations.

The server gathers permission-filtered facts from native Frappe/ERPNext records.
This module classifies those facts without importing Frappe, which keeps the policy
testable and prevents a present record from becoming a false compliance claim.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


LAUNCH_CHECK_POLICIES = (
    ("company", "required"),
    ("accounting", "qualified"),
    ("tax_zatca", "qualified"),
    ("stock", "conditional"),
    ("commercial", "required"),
    ("parties", "qualified"),
    ("payments", "qualified"),
    ("access", "qualified"),
    ("output", "qualified"),
    ("operations", "external"),
    ("integrations", "external"),
    ("first_transaction", "qualified"),
)

# Neutral record titles for the native Project/Task work plan.  Keep these on
# the server beside the policy keys so a dashboard label can change without
# changing the durable identity of a readiness task.
LAUNCH_CHECK_TITLES = {
    "company": "Company identity and fiscal setup",
    "accounting": "Accounts and dimensions",
    "tax_zatca": "VAT, ZATCA and legal output",
    "stock": "Warehouse, stock and valuation",
    "commercial": "Items, prices and commercial policy",
    "parties": "Customers, suppliers and terms",
    "payments": "Cash, payments and POS",
    "access": "Users, roles and approvals",
    "output": "Print, numbering and language",
    "operations": "Privacy, backup and support",
    "integrations": "Integrations and credentials",
    "first_transaction": "First transaction and handoff",
}

LAUNCH_CHECK_ROLES = {
    "company": "business-owner",
    "accounting": "finance-reviewer",
    "tax_zatca": "tax-and-zatca-reviewer",
    "stock": "inventory-reviewer",
    "commercial": "sales-and-pricing-owner",
    "parties": "sales-and-procurement-owner",
    "payments": "finance-and-pos-owner",
    "access": "system-and-security-owner",
    "output": "finance-and-tax-reviewer",
    "operations": "system-and-privacy-owner",
    "integrations": "integration-owner",
    "first_transaction": "implementation-lead",
}

LAUNCH_CHECK_CONSEQUENCES = {
    "company": "wrong-identity-currency-period-or-branch",
    "accounting": "posting-unavailable-or-wrong-accounts-and-dimensions",
    "tax_zatca": "incorrect-tax-or-rejected-regulated-output",
    "stock": "incorrect-stock-quantity-value-or-traceability",
    "commercial": "unavailable-items-or-incorrect-pricing-and-discounts",
    "parties": "incorrect-party-history-terms-credit-or-duplicates",
    "payments": "unreconciled-cash-card-bank-or-provider-settlement",
    "access": "excessive-or-insufficient-access-and-approval-conflict",
    "output": "incorrect-numbering-language-communication-or-legal-output",
    "operations": "failed-recovery-privacy-security-or-support-response",
    "integrations": "unowned-provider-failure-secret-or-reconciliation-gap",
    "first_transaction": "go-live-errors-reach-customers-stock-and-ledgers",
}


def derive_launch_readiness(
    facts: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Classify observed setup without claiming production readiness.

    Required records can be *observed* or *missing*. Conditional configuration
    needs review when absent because, for example, a service business may not need a
    warehouse. Accounting, tax/ZATCA, parties, payments, access, output and the first
    transaction always require qualified review even when related records are
    present. Privacy, backup, security, support and integration evidence is
    deliberately external to this lightweight Home check and remains not assessed.
    """

    checks: list[dict[str, Any]] = []
    for key, policy in LAUNCH_CHECK_POLICIES:
        fact = facts.get(key) or {}
        check: dict[str, Any] = {
            "key": key,
            "policy": policy,
            "detail": str(fact.get("detail") or ""),
            "responsible_role": LAUNCH_CHECK_ROLES[key],
            "unresolved_consequence": LAUNCH_CHECK_CONSEQUENCES[key],
        }

        if policy == "external":
            check.update(state="not-assessed", reason="external-evidence")
        elif not fact.get("available", True):
            check.update(state="unavailable", reason="doctype-unavailable")
        elif not fact.get("can_read"):
            check.update(state="blocked", reason="no-read")
        elif fact.get("query_error"):
            check.update(state="blocked", reason="query-error")
        elif policy == "required":
            check.update(
                state="observed" if fact.get("exists") else "missing",
                reason="record-found" if fact.get("exists") else "record-missing",
            )
        elif policy == "conditional":
            check.update(
                state="observed" if fact.get("exists") else "review",
                reason="record-found" if fact.get("exists") else "applicability-review",
            )
        else:
            # A present record in a qualified domain is evidence to review, never
            # automatic accounting, legal, security or production acceptance.
            check.update(
                state="review",
                reason="configured-review" if fact.get("exists") else "setup-review",
            )

        route = fact.get("route")
        if route and check["state"] not in {"blocked", "unavailable", "not-assessed"}:
            check["route"] = list(route)
            check["action_mode"] = "change" if fact.get("can_change") else "view"
        checks.append(check)

    attention_states = {"missing", "blocked", "unavailable"}
    review_states = {"review", "not-assessed"}
    return {
        "state": "attention-required"
        if any(check["state"] in attention_states for check in checks)
        else "review-required",
        "source": "permission-filtered-native-observations",
        "observed_count": sum(check["state"] == "observed" for check in checks),
        "attention_count": sum(check["state"] in attention_states for check in checks),
        "review_count": sum(check["state"] in review_states for check in checks),
        "checks": checks,
        "launch_ready": False,
    }
