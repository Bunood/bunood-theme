"""Migration rejection contracts; no bench, database or stored pins are mutated."""
import copy
import ast
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("upstream_under_test", ROOT / "bunood_theme/upstream.py")
upstream = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"frappe": types.ModuleType("frappe")}):
    spec.loader.exec_module(upstream)


class UpgradeGateTests(unittest.TestCase):
    def test_guard_is_registered_before_schema_migration(self):
        tree = ast.parse((ROOT / "bunood_theme/hooks.py").read_text(encoding="utf-8"))
        hooks = [n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "before_migrate" for t in n.targets)]
        self.assertEqual(len(hooks), 1)
        self.assertEqual(ast.literal_eval(hooks[0].value), "bunood_theme.upstream.assert_compatible")

    def setUp(self):
        self.pins = json.loads((ROOT / "bunood_theme/data/upstream-pins.json").read_text(encoding="utf-8"))

    def test_reviewed_state_is_allowed(self):
        with patch.object(upstream, "fingerprint", return_value=self.pins):
            upstream.assert_compatible()

    def test_new_version_is_rejected_before_migration(self):
        changed = copy.deepcopy(self.pins)
        changed["versions"]["erpnext"] = "unreviewed-upgrade"
        with patch.object(upstream, "fingerprint", return_value=changed):
            with self.assertRaisesRegex(RuntimeError, "versions.erpnext"):
                upstream.assert_compatible()

    def test_missing_dependency_is_rejected(self):
        changed = copy.deepcopy(self.pins)
        del changed["field_order"]
        with patch.object(upstream, "fingerprint", return_value=changed):
            with self.assertRaisesRegex(RuntimeError, "field_order"):
                upstream.assert_compatible()

    def test_missing_pins_fail_closed(self):
        with patch("builtins.open", side_effect=FileNotFoundError):
            with self.assertRaisesRegex(RuntimeError, "pins are missing"):
                upstream.assert_compatible()


if __name__ == "__main__":
    unittest.main()
