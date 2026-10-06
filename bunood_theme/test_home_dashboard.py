"""Native Home acceptance: real permissions and exact drill-down populations."""
import uuid
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from bunood_theme import team_home
from bunood_theme.home_metrics import base_outstanding
from frappe.utils import add_days, nowdate


class TestHomeDashboard(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self.previous_user=frappe.session.user
        frappe.set_user('Administrator')
        self.savepoint='home_dashboard_'+uuid.uuid4().hex
        self.fixture_suffixes=[]
        self.fixture_users=[]
        frappe.db.savepoint(self.savepoint)

    def tearDown(self):
        frappe.set_user('Administrator')
        frappe.db.rollback(save_point=self.savepoint)
        for suffix in self.fixture_suffixes:
            for doctype in ('Company','Sales Invoice','Purchase Invoice','Sales Order','Sales Person','Sales Team'):
                self.assertFalse(frappe.db.exists(doctype, {'name':['like','%'+suffix]}), 'Query fixture rollback failed')
        for user in self.fixture_users:
            frappe.clear_cache(user=user)
            self.assertFalse(frappe.db.exists('User',user),'Owned user rollback failed')
        frappe.set_user(self.previous_user)
        super().tearDown()

    def _company(self):
        rows=frappe.get_list('Company',fields=['name'],limit=1)
        self.assertTrue(rows,'Native acceptance requires a Company')
        return rows[0].name

    def _user(self,role):
        email='dashboard-'+uuid.uuid4().hex+'@example.invalid'
        user=frappe.get_doc({'doctype':'User','email':email,'first_name':'Dashboard acceptance','send_welcome_email':0,'roles':[{'role':role}]}).insert(ignore_permissions=True)
        self.assertEqual(user.user_type,'System User')
        self.fixture_users.append(email)
        return email

    def test_guest_and_nonstring_scope_rejected(self):
        for key in ('company','period','sales_person','view'):
            with self.assertRaises(frappe.ValidationError):
                team_home.get_home_dashboard(**{key:['unexpected']})
        frappe.set_user('Guest')
        with self.assertRaises(frappe.PermissionError):
            team_home.get_home_dashboard()

    def test_restricted_desk_user_has_no_financial_evidence(self):
        company=self._company()
        email=self._user('Website Manager')
        frappe.set_user(email)
        result=team_home.get_home_dashboard()
        self.assertEqual(result['scope']['companies'],[])
        self.assertEqual(result['kpis'],[])
        self.assertIsNone(result['metrics']['receivables'])
        stock=team_home._stock_attention(company,[])
        self.assertFalse(stock['available'])
        self.assertIsNone(stock['count'])
        zatca=team_home._zatca_attention(company,{},[])
        self.assertFalse(zatca['available'])
        self.assertIsNone(zatca['count'])
        with self.assertRaises(frappe.PermissionError):
            team_home.get_home_dashboard(company=company)

    def test_sales_period_change_does_not_queue_denied_optional_status_dialog(self):
        company = self._company()
        user = self._user('Sales User')
        frappe.set_user(user)
        self.assertTrue(frappe.has_permission('Company', 'read', doc=company))
        self.assertFalse(frappe.has_permission('Sales Invoice', 'read'))
        messages = list(frappe.local.message_log or [])
        result = team_home.get_home_dashboard(company=company, period='last_7_days', view='sales')
        self.assertEqual(result['scope']['period'], 'last_7_days')
        self.assertEqual(result['scope']['view'], 'sales')
        self.assertEqual(list(frappe.local.message_log or []), messages)

    def test_company_user_permission_blocks_other_company(self):
        companies=frappe.get_list('Company',pluck='name',limit=2)
        self.assertGreaterEqual(len(companies),2,'Acceptance requires two isolated companies')
        email=self._user('Accounts User')
        frappe.get_doc({'doctype':'User Permission','user':email,'allow':'Company','for_value':companies[0],'apply_to_all_doctypes':1}).insert(ignore_permissions=True)
        frappe.clear_cache(user=email)
        frappe.set_user(email)
        result=team_home.get_home_dashboard(company=companies[0])
        self.assertNotIn(companies[1],result['scope']['companies'])
        with self.assertRaises(frappe.PermissionError):
            team_home.get_home_dashboard(company=companies[1])

    def test_kpis_match_exact_native_drilldown_population(self):
        result=team_home.get_home_dashboard(company=self._company(),period='all_time',view='overview')
        for card in result['kpis']:
            self.assertTrue(card['available'],card)
            fields=['name','base_grand_total'] if card['key']!='outstanding_value' else ['name','outstanding_amount','party_account_currency','conversion_rate','currency']
            rows=frappe.get_list(card['doctype'],filters=card['filters'],fields=fields,limit=0)
            rows=list({r.name:r for r in rows}.values())
            expected=len(rows) if card['key']=='order_count' else sum(base_outstanding(r,result['currency']) for r in rows) if card['key']=='outstanding_value' else sum(float(r.base_grand_total or 0) for r in rows)
            if card['key']=='average_order_value':
                expected=expected/len(rows) if rows else 0
            self.assertAlmostEqual(card['value'],expected)
        self.assertEqual(sum(result['invoice_status'].values()),result['sales_count'])

    def test_all_company_cards_keep_currency_separate(self):
        result=team_home.get_home_dashboard(company='__all__',period='today')
        self.assertEqual(result['currency'],'')
        self.assertNotIn('metrics',result)
        self.assertTrue(result['company_overview'])
        for row in result['company_overview']:
            self.assertEqual(row['currency'],frappe.get_doc('Company',row['company']).default_currency)

    def test_failed_native_source_is_unavailable(self):
        company=self._company()
        original=frappe.get_list
        def fail_sales(doctype,*args,**kwargs):
            if doctype=='Sales Invoice':
                raise RuntimeError('unavailable native source')
            return original(doctype,*args,**kwargs)
        with patch.object(frappe,'get_list',side_effect=fail_sales):
            result=team_home.get_home_dashboard(company=company)
        self.assertIsNone(result['metrics']['sales_month'])
        self.assertIsNone(result['metrics']['receivables'])
        self.assertIn('Sales Invoice',result['query_errors'])
        self.assertIsNone(result['collections']['overdue']['count'])

    def test_native_query_population_returns_forex_future_and_cancellation(self):
        """Transaction-local query fixtures, not simulated accounting postings.

        db_insert deliberately isolates native read/filter semantics without
        creating ledger entries or claiming submit validation coverage.
        """
        suffix=uuid.uuid4().hex
        self.fixture_suffixes.append(suffix)
        company='Dashboard query '+suffix
        frappe.get_doc({'doctype':'Company','name':company,'company_name':company,'abbr':suffix[:5],'default_currency':'SAR'}).db_insert()
        today=nowdate()
        def invoice(dt,label,total,outstanding,offset=0,docstatus=1,currency='SAR',party='SAR',rate=1):
            doc={'doctype':dt,'name':'HOME-'+label+'-'+suffix,'company':company,'posting_date':add_days(today,offset),'due_date':add_days(today,-1),
                 'docstatus':docstatus,'base_grand_total':total,'grand_total':total/rate,'outstanding_amount':outstanding,
                 'currency':currency,'party_account_currency':party,'conversion_rate':rate,'is_return':int(total<0),
                 'customer':'Query customer','customer_name':'Query customer','supplier':'Query supplier','supplier_name':'Query supplier'}
            frappe.get_doc(doc).db_insert()
        invoice('Sales Invoice','local',100,100)
        invoice('Sales Invoice','return',-20,-20)
        invoice('Sales Invoice','foreign',375,100,currency='USD',party='USD',rate=3.75)
        invoice('Sales Invoice','company-account',37.5,37.5,currency='USD',party='SAR',rate=3.75)
        invoice('Sales Invoice','future',999,999,offset=1)
        invoice('Sales Invoice','cancelled',999,999,docstatus=2)
        invoice('Purchase Invoice','purchase',80,80)
        invoice('Purchase Invoice','debit-note',-30,-30)
        invoice('Purchase Invoice','future-purchase',999,999,offset=1)
        for index,total in enumerate((100,300)):
            frappe.get_doc({'doctype':'Sales Order','name':f'HOME-ORDER-{index}-{suffix}','company':company,'transaction_date':today,'docstatus':1,'base_grand_total':total}).db_insert()
        result=team_home.get_home_dashboard(company=company,period='all_time',view='overview')
        self.assertEqual([card['value'] for card in result['kpis']],[2,400,492.5,492.5,200])
        self.assertEqual(result['metrics']['payables'],50)
        self.assertEqual(sum(row['value'] for row in result['trend']),492.5)
        self.assertEqual(result['sales_count'],4)
        for state,filters in result['invoice_status_filters'].items():
            names=frappe.get_list('Sales Invoice',filters=filters,pluck='name',limit=0)
            self.assertEqual(len(names),result['invoice_status'][state])
            self.assertFalse(any('future' in name or 'cancelled' in name for name in names))

    def test_accountant_denied_field_is_unavailable_in_canonical_reader(self):
        from frappe.model import get_permitted_fields
        company=self._company()
        def permitted(doctype,*args,**kwargs):
            fields=get_permitted_fields(doctype,*args,**kwargs)
            return [field for field in fields if field!='total_debit'] if doctype=='Journal Entry' else fields
        with patch('frappe.model.get_permitted_fields',side_effect=permitted):
            result=team_home.get_home_dashboard(company=company,view='accountant')
        group=next(group for group in result['accountant_desk']['groups'] if group['doctype']=='Journal Entry')
        self.assertIsNone(group['count'])
        self.assertEqual(group['rows'],[])
        self.assertTrue(result['accountant_desk']['checks_incomplete'])

    def test_sales_person_scope_preserves_native_user_permissions(self):
        suffix=uuid.uuid4().hex
        self.fixture_suffixes.append(suffix)
        company='Dashboard sales '+suffix
        frappe.get_doc({'doctype':'Company','name':company,'company_name':company,'abbr':suffix[:5],'default_currency':'SAR'}).db_insert()
        people=[]
        for index in (1,2):
            person=f'HOME-PERSON-{index}-{suffix}'
            people.append(person)
            frappe.get_doc({'doctype':'Sales Person','name':person,'sales_person_name':person,'enabled':1,'is_group':0}).db_insert()
            invoice=f'HOME-SALES-{index}-{suffix}'
            frappe.get_doc({'doctype':'Sales Invoice','name':invoice,'company':company,'docstatus':1,'posting_date':nowdate(),'due_date':nowdate(),'base_grand_total':100*index,'grand_total':100*index,'outstanding_amount':100*index,'currency':'SAR','party_account_currency':'SAR','conversion_rate':1}).db_insert()
            frappe.get_doc({'doctype':'Sales Team','name':f'HOME-TEAM-{index}-{suffix}','parent':invoice,'parenttype':'Sales Invoice','parentfield':'sales_team','sales_person':person,'allocated_percentage':100}).db_insert()
        user=self._user('Sales User')
        # Native Sales User does not grant invoice read; this fixture exercises
        # linked salesperson restrictions after legitimate accounting access.
        frappe.get_doc('User',user).add_roles('Accounts User')
        for doctype,value in (('Company',company),('Sales Person',people[0])):
            frappe.get_doc({'doctype':'User Permission','user':user,'allow':doctype,'for_value':value,'apply_to_all_doctypes':1}).insert(ignore_permissions=True)
        frappe.clear_cache(user=user)
        frappe.set_user(user)
        self.assertTrue(frappe.has_permission('Sales Invoice','read'))
        result=team_home.get_home_dashboard(company=company,period='today',sales_person=people[0],view='sales')
        self.assertEqual(result['metrics']['sales_month'],100)
        self.assertNotIn(people[1],result['scope']['sales_people'])
        self.assertTrue(all(row['name']==f'HOME-SALES-1-{suffix}' for row in result['recent'] if row['doctype']=='Sales Invoice'))
        with self.assertRaises(frappe.PermissionError):
            team_home.get_home_dashboard(company=company,sales_person=people[1])

    def test_personal_scope_save_isolated_reload_and_denial_writes_nothing(self):
        companies=frappe.get_list('Company',pluck='name',limit=2)
        self.assertGreaterEqual(len(companies),2)
        users=[self._user('Accounts User'),self._user('Accounts User')]
        keys=['bnd_home_company','bnd_home_period','bnd_home_sales_person','bnd_home_view']
        untouched=frappe.get_all('DefaultValue',filters={'defkey':['in',keys],'parent':['not in',users]},fields=['name','parent','defkey','defvalue'],order_by='name')
        for user,period in zip(users,('today','last_7_days')):
            frappe.set_user(user)
            result=team_home.save_home_preferences(companies[0],period,'','overview')
            self.assertEqual(result['scope']['period'],period)
        frappe.set_user(users[0])
        frappe.clear_cache(user=users[0])
        self.assertEqual(team_home.get_home_dashboard()['scope']['period'],'today')
        before=frappe.get_all('DefaultValue',filters={'parent':users[0],'defkey':['in',keys]},fields=['name','defkey','defvalue'],order_by='name')
        for bad in ('__not_an_authorized_company__',{'name':companies[0]}):
            with self.assertRaises((frappe.PermissionError,frappe.ValidationError)):
                team_home.save_home_preferences(bad,'today','','overview')
        after=frappe.get_all('DefaultValue',filters={'parent':users[0],'defkey':['in',keys]},fields=['name','defkey','defvalue'],order_by='name')
        self.assertEqual(before,after)
        frappe.set_user('Administrator')
        self.assertEqual(untouched,frappe.get_all('DefaultValue',filters={'defkey':['in',keys],'parent':['not in',users]},fields=['name','parent','defkey','defvalue'],order_by='name'))
        frappe.get_doc({'doctype':'User Permission','user':users[0],'allow':'Company','for_value':companies[1],'apply_to_all_doctypes':1}).insert(ignore_permissions=True)
        frappe.clear_cache(user=users[0])
        frappe.set_user(users[0])
        self.assertNotEqual(team_home.get_home_dashboard()['scope']['company'],companies[0])

    def test_readiness_is_observations_without_mutation_or_launch_claim(self):
        result=team_home.get_home_dashboard(company=self._company())
        self.assertEqual(len(result['start_readiness']['steps']),5)
        self.assertEqual(len(result['launch_readiness']['checks']),12)
        self.assertFalse(result['launch_readiness']['launch_ready'])
        self.assertNotIn('work_plan',result['launch_readiness'])
        for key in ('operations','integrations'):
            check=next(row for row in result['launch_readiness']['checks'] if row['key']==key)
            self.assertEqual(check['state'],'not-assessed')
            self.assertNotIn('route',check)
