"""Private 0.50.0 release metadata expectations; no native site approval implied."""
import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
CORE = {
    "frappe": "16.33.1", "erpnext": "16.34.1", "telephony": "0.0.1",
    "hrms": "16.18.1", "payments": "0.0.1", "helpdesk": "1.27.0",
    "ksa_compliance": "0.61.7",
}
APPS = {
    "bunood_crm": "0.1.0", "bunood_real_estate": "1.7.0",
    "bunood_engineering": "0.14.0", "bunood_setup": "0.8.0",
    "bunood_dining": "0.1.0", "bunood_tenant": "0.6.0",
}


def literal_assignment(path, name):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    values = [ast.literal_eval(node.value) for node in tree.body
              if isinstance(node, ast.Assign)
              and any(isinstance(target, ast.Name) and target.id == name for target in node.targets)]
    if len(values) != 1:
        raise AssertionError(f"Expected one literal {name}")
    return values[0]


class ReleaseV050Tests(unittest.TestCase):
    def test_both_app_version_declarations_name_v050(self):
        for rel, name in [("bunood_theme/__init__.py", "__version__"),
                          ("bunood_theme/hooks.py", "app_version")]:
            with self.subTest(file=rel):
                self.assertEqual(literal_assignment(ROOT / rel, name), "0.50.0")

    def test_all_reviewed_app_versions_and_no_native_crm(self):
        versions = json.loads((ROOT / "bunood_theme/data/upstream-pins.json").read_text())["versions"]
        for app, version in APPS.items():
            with self.subTest(app=app):
                self.assertEqual(versions.get(app), version)
        self.assertNotIn("crm", versions)
        self.assertEqual(versions, CORE | APPS)


if __name__ == "__main__":
    unittest.main()
