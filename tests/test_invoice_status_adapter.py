"""Invoice UI status permission and projection tests, without a live site."""
import ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import pytest

SOURCE = Path(__file__).parents[1] / "bunood_theme/zatca/status.py"

def adapter(*, read=True, create=True, user="sales@example.com", invoice=None):
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "get_invoice_status")
    node.decorator_list = []
    company = SimpleNamespace(check_permission=Mock())
    def get_doc(doctype, name):
        if doctype == "Company": return company
        if invoice is None: raise LookupError(name)
        return invoice
    fake = SimpleNamespace(session=SimpleNamespace(user=user), PermissionError=PermissionError,
        has_permission=lambda dt, perm, **kw: (read if perm == "read" else create) if dt == "Sales Invoice" else False,
        get_doc=Mock(side_effect=get_doc), throw=lambda msg, error=ValueError: (_ for _ in ()).throw(error(msg)))
    snapshot = Mock(return_value={"installed":True,"state":"ready", "settings":{
        "enabled":True,"secret":"DO-NOT-LEAK","security_token":"DO-NOT-LEAK", "route":["List","ZATCA Business Settings"]},
        "invoice":{"name":"restricted-log","integration_status":"Accepted","validation_errors":"DO-NOT-LEAK","invoice_xml":"DO-NOT-LEAK"}})
    ns={"frappe":fake,"_":lambda s:s,"Any":object,"_invoice_doctype":lambda d:d,"get_status":snapshot}
    exec(compile(ast.Module(body=[node],type_ignores=[]),str(SOURCE),"exec"),ns)
    return ns["get_invoice_status"], fake, company, snapshot

@pytest.mark.parametrize("read,create,user", [(False,True,"sales@example.com"),(True,False,"sales@example.com"),(True,True,"Guest")])
def test_draft_requires_authenticated_native_read_and_create(read,create,user):
    call,_,_,snapshot=adapter(read=read,create=create,user=user)
    with pytest.raises(PermissionError): call(company="A")
    snapshot.assert_not_called()

def test_missing_invoice_never_falls_back_to_company():
    call,_,_,snapshot=adapter()
    with pytest.raises(LookupError): call(invoice_name="new-missing",company="A")
    snapshot.assert_not_called()

def test_saved_invoice_and_its_actual_company_are_permission_checked():
    invoice=SimpleNamespace(company="Actual",check_permission=Mock())
    call,_,company,snapshot=adapter(create=False,invoice=invoice)
    value=call(invoice_name="SI",company="Spoofed")
    invoice.check_permission.assert_called_once_with("read")
    company.check_permission.assert_called_once_with("read")
    snapshot.assert_called_once_with("SI","Actual","Sales Invoice")
    assert value["company"]=="Actual"

@pytest.mark.parametrize("target", ["invoice","company"])
def test_denied_record_stops_before_connector_read(target):
    invoice=SimpleNamespace(company="A",check_permission=Mock())
    call,_,company,snapshot=adapter(invoice=invoice)
    (invoice if target=="invoice" else company).check_permission.side_effect=PermissionError()
    with pytest.raises(PermissionError): call(invoice_name="SI")
    snapshot.assert_not_called()

def test_allowed_sales_user_receives_only_credential_free_projection():
    call,_,_,_=adapter()
    result=call(company="A")
    assert result["state"]=="ready"
    assert "DO-NOT-LEAK" not in repr(result)
    assert "route" not in result["settings"]
    assert "name" not in result["invoice"]

def test_only_new_adapter_is_get_endpoint_and_js_uses_it():
    tree=ast.parse(SOURCE.read_text(encoding="utf-8"))
    functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
    assert not functions["get_status"].decorator_list
    decorator=functions["get_invoice_status"].decorator_list[0]
    assert ast.literal_eval(decorator.keywords[0].value)==["GET"]
    js=(SOURCE.parents[1]/"public/js/sales_bill.js").read_text(encoding="utf-8")
    assert "bunood_theme.zatca.status.get_invoice_status" in js
    assert "bunood_theme.zatca.status.get_status" not in js
    assert "bunood_theme.zatca.status.queue_invoice" not in js
