from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from bunood_theme.start_readiness import START_STEP_KEYS, derive_start_readiness


def fact(*, exists=False, available=True, can_read=True, can_create=True, query_error=False):
    return {
        "exists": exists,
        "available": available,
        "can_read": can_read,
        "can_create": can_create,
        "query_error": query_error,
    }


class StartReadinessTests(unittest.TestCase):
    def test_fresh_company_exposes_exactly_one_next_step(self):
        result = derive_start_readiness({key: fact() for key in START_STEP_KEYS})
        self.assertEqual(result["state"], "in-progress")
        self.assertEqual(result["current_step"], "company")
        self.assertEqual([step["state"] for step in result["steps"]], [
            "next", "waiting", "waiting", "waiting", "waiting"
        ])
        self.assertEqual(result["complete_count"], 0)

    def test_progress_follows_native_dependency_order(self):
        facts = {key: fact() for key in START_STEP_KEYS}
        facts["company"] = fact(exists=True, can_create=False)
        facts["customer"] = fact(exists=True)
        result = derive_start_readiness(facts)
        self.assertEqual(result["current_step"], "item")
        self.assertEqual([step["state"] for step in result["steps"]], [
            "complete", "complete", "next", "waiting", "waiting"
        ])

    def test_missing_permission_blocks_without_advancing_to_later_work(self):
        facts = {key: fact() for key in START_STEP_KEYS}
        facts["company"] = fact(exists=True)
        facts["customer"] = fact(can_create=False)
        result = derive_start_readiness(facts)
        self.assertEqual(result["state"], "blocked")
        self.assertEqual(result["current_step"], "customer")
        self.assertEqual(result["steps"][1], {
            "key": "customer", "state": "blocked", "reason": "no-create"
        })
        self.assertTrue(all(step["state"] == "waiting" for step in result["steps"][2:]))

    def test_unavailable_and_unreadable_are_explicit_not_false_completion(self):
        unavailable = {key: fact() for key in START_STEP_KEYS}
        unavailable["company"] = fact(available=False)
        unreadable = {key: fact() for key in START_STEP_KEYS}
        unreadable["company"] = fact(can_read=False)
        self.assertEqual(derive_start_readiness(unavailable)["steps"][0]["reason"], "unavailable")
        self.assertEqual(derive_start_readiness(unreadable)["steps"][0]["reason"], "no-read")

    def test_failed_record_lookup_blocks_instead_of_offering_duplicate_creation(self):
        facts = {key: fact() for key in START_STEP_KEYS}
        facts["company"] = fact(query_error=True)
        result = derive_start_readiness(facts)
        self.assertEqual(result["state"], "blocked")
        self.assertEqual(result["steps"][0]["reason"], "query-error")

    def test_complete_means_all_five_persisted_native_milestones_exist(self):
        result = derive_start_readiness({key: fact(exists=True) for key in START_STEP_KEYS})
        self.assertEqual(result["state"], "first-use-complete")
        self.assertEqual(result["current_step"], "")
        self.assertEqual(result["complete_count"], result["total_count"])
        self.assertEqual(result["source"], "persisted-permission-filtered-records")


if __name__ == "__main__":
    unittest.main()
