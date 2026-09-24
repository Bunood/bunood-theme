import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


class POSOperatorRoleContractTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "bunood_theme" / "pos_permissions.py").read_text(encoding="utf-8")

    def permission_contract(self):
        tree = ast.parse(self.source)
        assignment = next(
            node
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == "POS_OPERATOR_PERMISSIONS" for target in node.targets)
        )
        contract = {}
        for key, value in zip(assignment.value.keys, assignment.value.values):
            rights_call, owner_only = value.elts
            contract[ast.literal_eval(key)] = {
                "rights": set(ast.literal_eval(rights_call.args[0])),
                "owner_only": ast.literal_eval(owner_only),
            }
        return contract

    def test_authority_role_is_separate_from_experience_marker(self):
        self.assertIn('POS_OPERATOR_ROLE = "Bunood POS Operator"', self.source)
        self.assertNotIn('"Bunood Cashier"', self.source)
        self.assertNotIn('"Bunood Owner"', self.source)

    def test_cashier_rights_are_narrow_and_configuration_is_read_only(self):
        contract = self.permission_contract()
        self.assertEqual(contract["POS Profile"], {"rights": {"select", "read"}, "owner_only": False})
        invoice_rights = {"select", "read", "write", "create", "delete", "submit", "print"}
        self.assertEqual(contract["POS Invoice"], {"rights": invoice_rights, "owner_only": True})
        self.assertEqual(contract["Sales Invoice"], {"rights": invoice_rights, "owner_only": True})
        self.assertEqual(contract["Customer"], {"rights": {"select", "read"}, "owner_only": False})
        shift_rights = {"select", "read", "write", "create", "submit"}
        self.assertEqual(contract["POS Opening Entry"], {"rights": shift_rights, "owner_only": True})
        self.assertEqual(contract["POS Closing Entry"], {"rights": shift_rights, "owner_only": True})
        always_forbidden = {"cancel", "amend", "email", "report", "import", "export", "share"}
        all_rights = set().union(*(spec["rights"] for spec in contract.values()))
        self.assertTrue(always_forbidden.isdisjoint(all_rights))

    def test_new_rows_zero_every_standard_right_before_enabling_required_set(self):
        self.assertIn("values.update({right: int(right in required) for right in STANDARD_RIGHTS})", self.source)
        self.assertIn('"export",', self.source)
        self.assertIn('"share",', self.source)

    def test_existing_extra_grants_are_not_silently_removed(self):
        self.assertIn("missing = {right: 1 for right in required if not current.get(right)}", self.source)
        self.assertNotIn("frappe.delete_doc", self.source)

    def test_single_legacy_managed_row_is_tightened_to_the_declared_scope(self):
        self.assertIn("if len(legacy) == 1:", self.source)
        self.assertIn('"if_owner", int(owner_only)', self.source)
        self.assertIn("scope_repaired.append(doctype)", self.source)

    def test_install_and_migrate_apply_contract(self):
        setup = (ROOT / "bunood_theme" / "setup.py").read_text(encoding="utf-8")
        self.assertEqual(setup.count("ensure_pos_operator_permissions()"), 2)

    def test_missing_upstream_pos_doctypes_are_deferred_to_a_later_migrate(self):
        self.assertIn('if not frappe.db.exists("DocType", doctype):', self.source)
        self.assertIn("skipped.append(doctype)", self.source)


if __name__ == "__main__":
    unittest.main()
