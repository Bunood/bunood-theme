"""Adversarial site-free tests of the real dashboard reader boundary."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
from datetime import date
import unittest
from unittest.mock import Mock, patch


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.frappe = ModuleType('frappe')
        self.frappe._ = lambda value: value
        self.frappe.whitelist = lambda **kw: lambda fn: fn
        self.frappe.ValidationError = ValueError
        self.frappe.PermissionError = PermissionError
        self.frappe.throw = lambda message, kind: (_ for _ in ()).throw(kind(message))
        self.frappe.db = SimpleNamespace(exists=Mock(return_value=True))
        self.frappe.has_permission = Mock(return_value=True)
        self.frappe.get_list = Mock(return_value=[])
        self.model = ModuleType('frappe.model')
        self.model.get_permitted_fields = Mock(return_value=['name','company','docstatus','amount'])
        utils = ModuleType('frappe.utils')
        utils.getdate = lambda value: value
        utils.nowdate = lambda: '2026-10-06'
        utils.flt = lambda value: float(value or 0)
        package=ModuleType('bunood_theme')
        package.__path__=[str(Path(__file__).parents[1]/'bunood_theme')]
        self.modules = patch.dict(sys.modules, {'frappe':self.frappe,'frappe.model':self.model,'frappe.utils':utils,'bunood_theme':package})
        self.modules.start()
        sys.modules.pop('bunood_theme.accounting_desk',None)
        path=Path(__file__).parents[1]/'bunood_theme/team_home.py'
        spec=importlib.util.spec_from_file_location('dashboard_under_test',path)
        self.dashboard=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.dashboard)

    def tearDown(self):
        self.modules.stop()

    def test_nonstring_scope_rejected_before_queries(self):
        for index in range(4):
            for bad in ({'name':'A'}, ['A'], 1, True):
                values=[None]*4
                values[index]=bad
                with self.assertRaises(ValueError):
                    self.dashboard._scope(*values)
        self.frappe.get_list.assert_not_called()

    def test_denied_doctype_never_queries_or_invents_zero(self):
        self.frappe.has_permission.return_value=False
        self.assertIsNone(self.dashboard._count('Sales Invoice',{},[]))
        self.frappe.get_list.assert_not_called()

    def test_missing_app_doctype_never_queries(self):
        self.frappe.db.exists.return_value=False
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{},['name'],[]))
        self.frappe.get_list.assert_not_called()

    def test_denied_amount_and_filter_fields_fail_closed(self):
        self.model.get_permitted_fields.return_value=['name']
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{},['name','amount'],[]))
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{'company':'A'},['name'],[]))
        self.frappe.get_list.assert_not_called()

    def test_native_error_is_unavailable_not_empty_population(self):
        self.frappe.get_list.side_effect=RuntimeError('private details not returned')
        errors=[]
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{},['name'],errors))
        self.assertEqual(errors,['Sales Invoice'])

    def test_duplicate_sales_team_join_counts_document_once(self):
        self.frappe.get_list.return_value=[{'name':'A','amount':5},{'name':'A','amount':5}]
        self.assertEqual(self.dashboard._rows('Sales Invoice',{},['name','amount'],[]),[{'name':'A','amount':5}])

    def test_silently_removed_field_cannot_become_zero(self):
        self.frappe.get_list.return_value=[{'name':'A'}]
        errors=[]
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{},['name','amount'],errors))
        self.assertEqual(errors,['Sales Invoice'])

    def test_company_switch_uses_fresh_native_query(self):
        self.dashboard._rows('Sales Invoice',{'company':'A'},['name'],[])
        self.dashboard._rows('Sales Invoice',{'company':'B'},['name'],[])
        self.assertEqual([call.kwargs['filters']['company'] for call in self.frappe.get_list.call_args_list],['A','B'])

    def test_denied_child_scope_field_does_not_query(self):
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{'sales_team.sales_person':'S'},['name'],[]))
        self.frappe.get_list.assert_not_called()

    def test_large_population_is_unavailable_not_truncated(self):
        self.frappe.get_list.return_value=[{'name':str(i)} for i in range(self.dashboard.ROW_CAP+1)]
        errors=[]
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{},['name'],errors))
        self.assertEqual(errors,['Sales Invoice'])
        self.assertEqual(self.frappe.get_list.call_args.kwargs['limit'],self.dashboard.ROW_CAP+1)

    def test_allowed_child_table_uses_native_permlevel_not_sql_column(self):
        self.frappe.get_meta=Mock(return_value=SimpleNamespace(get_field=lambda name:SimpleNamespace(permlevel=0),get_permlevel_access=lambda kind:[0]))
        self.model.get_permitted_fields.side_effect=lambda doctype,**kw: ['sales_person'] if doctype=='Sales Team' else ['name']
        self.frappe.get_list.return_value=[{'name':'A'}]
        self.assertEqual(self.dashboard._rows('Sales Invoice',{'sales_team.sales_person':'S'},['name'],[]),[{'name':'A'}])

    def test_unknown_dotted_filter_fails_before_query(self):
        self.assertIsNone(self.dashboard._rows('Sales Invoice',{'secret_child.value':'S'},['name'],[]))
        self.frappe.get_list.assert_not_called()

    def test_hidden_sort_field_fails_before_query(self):
        from bunood_theme.accounting_desk import read_native_rows
        self.assertIsNone(read_native_rows('Sales Invoice',[],fields=['name'],order_by='hidden_margin desc'))
        self.frappe.get_list.assert_not_called()

    def test_grouped_counts_and_sums_share_native_document_population(self):
        from bunood_theme.accounting_desk import read_native_rows
        self.frappe.get_list.return_value=[{'name':'A','company':'X','amount':50},{'name':'A','company':'X','amount':50},{'name':'B','company':'Y','amount':-10}]
        result=read_native_rows('Sales Invoice',[],fields=['company',{'COUNT':'name','AS':'count'},{'SUM':'amount','AS':'total'}],group_by='company')
        self.assertEqual(result,[{'company':'X','count':1,'total':50},{'company':'Y','count':1,'total':-10}])

    def test_cashier_unknown_sources_are_not_zero_or_unassigned(self):
        pos=ModuleType('bunood_theme.pos')
        pos.HELD_FIELD='held'
        pos._invoice_type=lambda:'POS Invoice'
        with patch.dict(sys.modules,{'bunood_theme.pos':pos}), patch.object(self.dashboard,'_can',return_value=False), patch.object(self.dashboard,'_rows',return_value=None):
            result=self.dashboard._cashier('A',None,date(2026,10,6),[])
        self.assertIsNone(result['held_count'])
        self.assertIsNone(result['sales_count'])
        self.assertIsNone(result['recent'])
        self.assertEqual(result['profile_state'],'unavailable')


if __name__=='__main__':
    unittest.main()
