import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('delta_fixture', Path(__file__).parents[1] / 'tools' / 'number_card_delta_fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

class FixtureSafety(TestCase):
    def setUp(self):
        token='a'*32
        stem='BND-AA-'+token
        self.receipt=dict(token=token,dashboard=stem,card=stem+'-card',chart=stem+'-chart',marker='['+stem+']',todos=['one','two'])
        filters=fixture.json.dumps([['ToDo','description','=',self.receipt['marker']]])
        def doc(dt,name,**kw): return SimpleNamespace(doctype=dt,name=name,owner='Administrator',**kw)
        self.docs={
          ('Dashboard',stem):doc('Dashboard',stem,dashboard_name=stem,is_standard=0,is_default=0,cards=[SimpleNamespace(card=self.receipt['card'])],charts=[SimpleNamespace(chart=self.receipt['chart'])]),
          ('Number Card',self.receipt['card']):doc('Number Card',self.receipt['card'],label=self.receipt['card'],document_type='ToDo',function='Count',is_standard=0,is_public=0,filters_json=filters),
          ('Dashboard Chart',self.receipt['chart']):doc('Dashboard Chart',self.receipt['chart'],chart_name=self.receipt['chart'],document_type='ToDo',chart_type='Count',is_standard=0,is_public=0,filters_json=filters),
        }
        for name in self.receipt['todos']: self.docs[('ToDo',name)]=doc('ToDo',name,description=self.receipt['marker'],allocated_to=None,reference_type=None,reference_name=None)
        self.frappe=SimpleNamespace(local=SimpleNamespace(site='team-rc.localhost'),conf={'allow_tests':1},session=SimpleNamespace(user='Administrator'),get_doc=lambda dt,name:self.docs[(dt,name)],get_all=Mock(return_value=['one','two']),delete_doc=Mock(),db=SimpleNamespace(commit=Mock(),rollback=Mock()))
    def clear(self):
        with patch.dict('sys.modules',frappe=self.frappe): fixture.clear_fixture(self.receipt,'team-rc.localhost')
    def refuses_without_deletion(self):
        with self.assertRaises((RuntimeError,ValueError)): self.clear()
        self.frappe.delete_doc.assert_not_called()
        self.frappe.db.commit.assert_not_called()
    def test_exact_owned_cleanup_order(self):
        self.clear()
        self.assertEqual([c.args for c in self.frappe.delete_doc.call_args_list],list(self.docs))
        self.frappe.db.commit.assert_called_once()
    def test_wrong_site(self): self.frappe.local.site='production';self.refuses_without_deletion()
    def test_tests_disabled(self): self.frappe.conf['allow_tests']=0;self.refuses_without_deletion()
    def test_last_todo_changed_validates_all_before_first_delete(self): self.docs[('ToDo','two')].description='other';self.refuses_without_deletion()
    def test_other_owner(self): self.docs[('ToDo','two')].owner='Someone';self.refuses_without_deletion()
    def test_dashboard_link_changed(self): self.docs[('Dashboard',self.receipt['dashboard'])].cards.append(SimpleNamespace(card='real'));self.refuses_without_deletion()
    def test_forged_identity(self): self.receipt['card']='real';self.refuses_without_deletion()
    def test_reused_marker(self): self.frappe.get_all.return_value=['one','two','someoneelse'];self.refuses_without_deletion()
    def test_wrong_filters(self): self.docs[('Number Card',self.receipt['card'])].filters_json='[]';self.refuses_without_deletion()
    def test_linked_todo(self): self.docs[('ToDo','two')].reference_type='Sales Invoice';self.refuses_without_deletion()
    def test_native_delete_failure_rolls_back_without_commit(self):
        self.frappe.delete_doc.side_effect=RuntimeError('native delete refused')
        with self.assertRaises(RuntimeError): self.clear()
        self.frappe.db.rollback.assert_called_once();self.frappe.db.commit.assert_not_called()

if __name__=='__main__': main()
