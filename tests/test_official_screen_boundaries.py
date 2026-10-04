"""Executable boundaries for the official screen import; no live site or network."""

import ast
from datetime import date
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

import pytest

ROOT = Path(__file__).parents[1]


def load(path, modules):
    spec = importlib.util.spec_from_file_location("official_screen_test", ROOT / path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, modules):
        spec.loader.exec_module(module)
    return module


def test_company_access_is_checked_before_reading_accounting_evidence():
    frappe = ModuleType("frappe")
    frappe.whitelist = lambda **kwargs: lambda fn: fn
    frappe._ = lambda value: value
    frappe.get_doc = Mock(return_value=SimpleNamespace(check_permission=Mock(side_effect=PermissionError)))
    reader = ModuleType("bunood_theme.accounting_desk")
    reader.get_accounting_desk = Mock()
    module = load("bunood_theme/accounting_page.py", {"frappe": frappe, "bunood_theme.accounting_desk": reader})
    with pytest.raises(PermissionError):
        module.read("Restricted company")
    reader.get_accounting_desk.assert_not_called()


def test_accounting_role_and_currency_are_enforced():
    frappe = ModuleType("frappe")
    frappe.whitelist = lambda **kwargs: lambda fn: fn
    frappe._ = lambda value: value
    frappe.PermissionError = PermissionError
    frappe.throw = lambda message, error=ValueError: (_ for _ in ()).throw(error(message))
    frappe.get_doc = Mock(return_value=SimpleNamespace(check_permission=Mock(), default_currency="SAR"))
    frappe.get_roles = Mock(return_value=["Sales User"])
    reader = ModuleType("bunood_theme.accounting_desk")
    reader.get_accounting_desk = Mock(return_value={"queue": []})
    module = load("bunood_theme/accounting_page.py", {"frappe": frappe, "bunood_theme.accounting_desk": reader})
    with pytest.raises(PermissionError):
        module.read("Company")
    reader.get_accounting_desk.assert_not_called()
    frappe.get_roles.return_value = ["Accounts User"]
    assert module.read("Company") == {"queue": []}
    reader.get_accounting_desk.assert_called_once_with("Company", "SAR")


def test_owner_logo_inlines_public_and_private_files_and_drops_missing(tmp_path):
    source = (ROOT / "bunood_theme/printing/jinja.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    names = {"_MAX_INLINE_BYTES", "_MIME_BY_SUFFIX"}
    nodes = [node for node in tree.body if (
        isinstance(node, ast.FunctionDef) and node.name == "bunood_print_image_src"
    ) or (isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in node.targets))]
    public = tmp_path / "public/files"; public.mkdir(parents=True)
    private = tmp_path / "private/files"; private.mkdir(parents=True)
    (public / "logo.png").write_bytes(b"public-logo")
    (private / "logo.png").write_bytes(b"private-logo")
    fake = SimpleNamespace(get_site_path=lambda *parts: str(tmp_path.joinpath(*parts)), log_error=Mock())
    namespace = {"frappe": fake}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "logo", "exec"), namespace)
    resolve = namespace["bunood_print_image_src"]
    assert resolve("/files/logo.png").startswith("data:image/png;base64,")
    assert resolve("/private/files/logo.png").startswith("data:image/png;base64,")
    assert resolve("/files/missing.png") == ""
    (public / "large.png").write_bytes(b"x" * (512 * 1024 + 1))
    assert resolve("/files/large.png") == ""


def test_original_financial_policy_hooks_remain_unregistered():
    hooks = (ROOT / "bunood_theme/hooks.py").read_text(encoding="utf-8")
    tree = ast.parse(hooks)
    events = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == "doc_events" for t in node.targets))
    assert "Sales Invoice" not in events
    assert "Purchase Invoice" not in events
    assert "POS Invoice" not in events
    assert "before_migrate" not in hooks


def test_accounting_queue_preserves_categories_and_marks_unavailable():
    fake = ModuleType("frappe")
    utils = ModuleType("frappe.utils")
    utils.flt = float
    utils.getdate = lambda value: date.fromisoformat(value)
    utils.nowdate = lambda: "2026-10-04"
    module = load("bunood_theme/accounting_desk.py", {"frappe": fake, "frappe.utils": utils})
    groups = [{"count": 20, "rows": [{"name": f"draft-{i}", "priority": 2} for i in range(5)]},
              {"count": None, "rows": []}]
    due = {"count": 20, "rows": [{"name": f"due-{i}", "priority": 1} for i in range(5)]}
    with patch.object(module, "_source_groups", return_value=groups), \
         patch.object(module, "_due_group", return_value=due), \
         patch.object(module, "_bank_evidence", return_value={"available": False, "accounts": []}):
        result = module.get_accounting_desk("Company", "SAR")
    assert result["checks_incomplete"] is True
    assert result["queue_truncated"] is True
    assert len(result["queue"]) == 10
    assert any(row["name"] == "draft-0" for row in result["queue"])
