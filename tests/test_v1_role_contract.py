from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class V1RoleContractTests(unittest.TestCase):
    def test_marker_roles_identify_experience_without_granting_document_permission(self):
        source = (ROOT / "bunood_theme" / "roles.py").read_text(encoding="utf-8")
        self.assertIn('CASHIER_ROLE = "Bunood Cashier"', source)
        self.assertIn('OWNER_ROLE = "Bunood Owner"', source)
        self.assertIn('"desk_access": 1', source)
        self.assertIn('"is_custom": 1', source)
        self.assertNotIn('"doctype": "Custom DocPerm"', source)
        self.assertNotIn('"doctype": "DocPerm"', source)

    def test_install_and_migrate_create_missing_markers_idempotently(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        source = (ROOT / "bunood_theme" / "roles.py").read_text(encoding="utf-8")
        self.assertEqual(setup.count("    _ensure_onboarding_migration()"), 2)
        self.assertEqual(setup.count("ensure_v1_marker_roles()"), 1)
        self.assertIn('if frappe.db.exists("Role", role_name):', source)
        self.assertIn("continue", source)
        self.assertIn("if created:", source)

    def test_existing_marker_configuration_is_not_overwritten(self):
        source = (ROOT / "bunood_theme" / "roles.py").read_text(encoding="utf-8")
        existing_branch = source.split('if frappe.db.exists("Role", role_name):', 1)[1].split(
            "frappe.get_doc", 1
        )[0]
        self.assertIn("continue", existing_branch)
        self.assertNotIn("set_value", existing_branch)
        self.assertNotIn("save", existing_branch)


if __name__ == "__main__":
    unittest.main()
