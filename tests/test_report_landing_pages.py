"""The Reports landing's permission gate: ``boot._permitted_pages``.

Runs the real function from ``bunood_theme/boot.py`` against a fake ``frappe``
(lifted out of the source with ``ast``, as ``test_print_preview.py`` does), so it
needs no site.
"""

import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "bunood_theme" / "boot.py"


def load(frappe):
	tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
	wanted = [
		node for node in tree.body
		if (isinstance(node, ast.FunctionDef) and node.name == "_permitted_pages")
		or (isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "REPORT_LANDING_PAGES" for t in node.targets))
	]
	scope = {"frappe": frappe}
	exec(compile(ast.Module(body=wanted, type_ignores=[]), str(SOURCE), "exec"), scope)
	return scope


def fake_frappe(pages):
	"""``pages``: installed Page name -> whether its roles admit this user."""
	return SimpleNamespace(
		db=SimpleNamespace(exists=lambda doctype, name: doctype == "Page" and name in pages),
		get_cached_doc=lambda doctype, name: SimpleNamespace(is_permitted=lambda: pages[name]),
	)


class PermittedPagesTests(unittest.TestCase):
	def test_only_installed_pages_whose_roles_admit_the_user(self):
		scope = load(fake_frappe({"bnd-banking": True, "bnd-report-studio": False, "bnd-finance-close": True}))
		self.assertEqual(
			scope["_permitted_pages"](scope["REPORT_LANDING_PAGES"]),
			["bnd-finance-close", "bnd-banking"],
			"journal workbench is not installed, the studio's roles exclude this user",
		)

	def test_nothing_installed_is_an_empty_gate_not_an_error(self):
		scope = load(fake_frappe({}))
		self.assertEqual(scope["_permitted_pages"](scope["REPORT_LANDING_PAGES"]), [])

	def test_the_gate_covers_every_page_the_landing_links(self):
		scope = load(fake_frappe({}))
		self.assertEqual(
			set(scope["REPORT_LANDING_PAGES"]),
			{"bnd-accounting-home", "bnd-finance-close", "bnd-journal-workbench", "bnd-asset-workbench", "bnd-banking", "bnd-zatca",
			 "bnd-report-studio"},
		)


if __name__ == "__main__":
	unittest.main()
