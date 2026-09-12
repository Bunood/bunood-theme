from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))

from bunood_theme.onboarding_state import derive_create_entry_progress


class OnboardingProgressTests(unittest.TestCase):
    def test_six_step_fixture_moves_from_fresh_through_partial_to_complete(self):
        steps = [
            {
                "name": f"Create Record {index}",
                "action": "Create Entry",
                "reference_document": f"Record {index}",
                "is_complete": 0,
            }
            for index in range(1, 7)
        ]

        for completed, expected in ((set(), 0), ({"Record 1", "Record 3", "Record 6"}, 3), ({f"Record {index}" for index in range(1, 7)}, 6)):
            result, errors = derive_create_entry_progress(
                [step.copy() for step in steps],
                lambda doctype, completed=completed: doctype in completed,
            )
            self.assertEqual(sum(step["is_complete"] for step in result), expected)
            self.assertEqual(errors, [])

    def test_create_entry_steps_follow_persisted_records(self):
        steps = [
            {"name": "Create Customer", "action": "Create Entry", "reference_document": "Customer", "is_complete": 0},
            {"name": "Create Item", "action": "Create Entry", "reference_document": "Item", "is_complete": 1},
            {"name": "View Report", "action": "View Report", "is_complete": 0},
        ]
        existing = {"Customer": True, "Item": False}
        result, errors = derive_create_entry_progress(
            steps, lambda doctype: existing[doctype]
        )
        self.assertEqual([step["is_complete"] for step in result], [1, 0, 0])
        self.assertEqual(errors, [])

    def test_manual_steps_are_never_inferred_from_dom_or_other_records(self):
        steps = [
            {"name": "View Sales Order Analysis", "action": "View Report", "is_complete": 1},
            {"name": "Review Selling Settings", "action": "Update Settings", "is_complete": 0},
        ]
        result, errors = derive_create_entry_progress(
            steps, lambda doctype: self.fail(f"unexpected lookup: {doctype}")
        )
        self.assertEqual([step["is_complete"] for step in result], [1, 0])
        self.assertEqual(errors, [])

    def test_lookup_failure_preserves_native_state_and_is_reported(self):
        steps = [
            {"name": "Create Customer", "action": "Create Entry", "reference_document": "Customer", "is_complete": 1},
        ]
        result, errors = derive_create_entry_progress(steps, lambda doctype: None)
        self.assertEqual(result[0]["is_complete"], 1)
        self.assertEqual(errors, ["Create Customer"])


if __name__ == "__main__":
    unittest.main()
