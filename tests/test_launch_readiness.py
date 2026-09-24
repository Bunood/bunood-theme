from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from bunood_theme.launch_readiness import (
    LAUNCH_CHECK_CONSEQUENCES,
    LAUNCH_CHECK_POLICIES,
    LAUNCH_CHECK_ROLES,
    LAUNCH_CHECK_TITLES,
    derive_launch_readiness,
)


def fact(
    *,
    exists=False,
    available=True,
    can_read=True,
    can_change=False,
    detail="",
    route=None,
    query_error=False,
):
    value = {
        "exists": exists,
        "available": available,
        "can_read": can_read,
        "can_change": can_change,
        "detail": detail,
        "query_error": query_error,
    }
    if route:
        value["route"] = route
    return value


class LaunchReadinessTests(unittest.TestCase):
    def full_facts(self):
        return {key: fact(exists=True) for key, _policy in LAUNCH_CHECK_POLICIES}

    def test_required_missing_configuration_is_attention_not_false_readiness(self):
        facts = self.full_facts()
        facts["commercial"] = fact(
            exists=False,
            can_change=True,
            route=["List", "Price List"],
        )
        result = derive_launch_readiness(facts)
        commercial = next(check for check in result["checks"] if check["key"] == "commercial")
        self.assertEqual(commercial["state"], "missing")
        self.assertEqual(commercial["route"], ["List", "Price List"])
        self.assertEqual(commercial["action_mode"], "change")
        self.assertEqual(result["state"], "attention-required")
        self.assertFalse(result["launch_ready"])

    def test_conditional_stock_absence_requests_applicability_review(self):
        facts = self.full_facts()
        facts["stock"] = fact(exists=False)
        result = derive_launch_readiness(facts)
        stock = next(check for check in result["checks"] if check["key"] == "stock")
        self.assertEqual(stock["state"], "review")
        self.assertEqual(stock["reason"], "applicability-review")

    def test_qualified_domains_remain_review_even_when_records_are_found(self):
        result = derive_launch_readiness(self.full_facts())
        states = {check["key"]: check["state"] for check in result["checks"]}
        for key in (
            "accounting",
            "tax_zatca",
            "parties",
            "payments",
            "access",
            "output",
            "first_transaction",
        ):
            self.assertEqual(states[key], "review", key)
        self.assertEqual(result["state"], "review-required")
        self.assertFalse(result["launch_ready"])

    def test_permission_and_missing_doctype_block_without_an_action_route(self):
        facts = self.full_facts()
        facts["accounting"] = fact(exists=True, can_read=False, route=["List", "Account"])
        facts["commercial"] = fact(available=False, route=["List", "Price List"])
        result = derive_launch_readiness(facts)
        by_key = {check["key"]: check for check in result["checks"]}
        self.assertEqual(by_key["accounting"]["state"], "blocked")
        self.assertNotIn("route", by_key["accounting"])
        self.assertEqual(by_key["commercial"]["state"], "unavailable")
        self.assertNotIn("route", by_key["commercial"])

    def test_read_only_route_remains_view_only_and_names_the_responsible_role(self):
        facts = self.full_facts()
        facts["accounting"] = fact(
            exists=True,
            route=["List", "Account"],
            can_change=False,
        )
        result = derive_launch_readiness(facts)
        accounting = next(check for check in result["checks"] if check["key"] == "accounting")
        self.assertEqual(accounting["action_mode"], "view")
        self.assertEqual(accounting["responsible_role"], "finance-reviewer")
        self.assertEqual(
            accounting["unresolved_consequence"],
            "posting-unavailable-or-wrong-accounts-and-dimensions",
        )

    def test_operations_evidence_is_explicitly_outside_the_home_probe(self):
        result = derive_launch_readiness(self.full_facts())
        operations = next(check for check in result["checks"] if check["key"] == "operations")
        self.assertEqual(operations, {
            "key": "operations",
            "policy": "external",
            "detail": "",
            "responsible_role": "system-and-privacy-owner",
            "unresolved_consequence": "failed-recovery-privacy-security-or-support-response",
            "state": "not-assessed",
            "reason": "external-evidence",
        })
        self.assertEqual(result["source"], "permission-filtered-native-observations")

        integrations = next(check for check in result["checks"] if check["key"] == "integrations")
        self.assertEqual(integrations["state"], "not-assessed")
        self.assertEqual(integrations["reason"], "external-evidence")

    def test_query_failure_is_a_blocker_not_a_missing_configuration_claim(self):
        facts = self.full_facts()
        facts["accounting"] = fact(query_error=True, route=["List", "Account"])
        result = derive_launch_readiness(facts)
        accounting = next(check for check in result["checks"] if check["key"] == "accounting")
        self.assertEqual(accounting["state"], "blocked")
        self.assertEqual(accounting["reason"], "query-error")
        self.assertNotIn("route", accounting)

    def test_policy_keys_match_the_twelve_readiness_rows(self):
        self.assertEqual(len(LAUNCH_CHECK_POLICIES), 12)
        self.assertEqual(
            tuple(key for key, _policy in LAUNCH_CHECK_POLICIES),
            (
                "company",
                "accounting",
                "tax_zatca",
                "stock",
                "commercial",
                "parties",
                "payments",
                "access",
                "output",
                "operations",
                "integrations",
                "first_transaction",
            ),
        )
        self.assertEqual(set(LAUNCH_CHECK_ROLES), set(dict(LAUNCH_CHECK_POLICIES)))
        self.assertEqual(set(LAUNCH_CHECK_CONSEQUENCES), set(dict(LAUNCH_CHECK_POLICIES)))
        self.assertEqual(set(LAUNCH_CHECK_TITLES), set(dict(LAUNCH_CHECK_POLICIES)))


if __name__ == "__main__":
    unittest.main()
