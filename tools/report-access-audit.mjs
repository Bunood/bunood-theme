/** Read-only, anonymized accountant-role audit on the isolated pilot. */
import { benchJson } from "./session.mjs";

const result = benchJson(`
from frappe.desk.query_report import run
frappe.set_user('Administrator')
roles = ['Accounts User', 'Accounts Manager', 'Sales User']
reports = ['General Ledger', 'Accounts Receivable', 'Accounts Payable', 'Trial Balance', 'VAT Summary']
out = []
for role in roles:
    users = frappe.get_all('Has Role', filters={'role': role, 'parenttype': 'User'}, pluck='parent')
    active = [name for name in users if name != 'Administrator' and frappe.db.get_value('User', name, 'enabled')]
    entry = {'role': role, 'active_user_count': len(active), 'tested': False}
    if active:
        frappe.set_user(active[0])
        companies = frappe.get_list('Company', pluck='name', limit=0)
        visible = frappe.get_list('Report', filters={'name': ['in', reports]}, pluck='name', limit=0)
        assigned = frappe.get_roles(active[0])
        entry.update({'tested': True, 'company_count': len(companies), 'listed_reports': sorted(visible),
                      'sample_role_count': len(assigned), 'sample_is_multi_role': len(assigned) > 2, 'run': {}})
        for report in reports:
            if not companies:
                entry['run'][report] = 'no permitted company'
                continue
            try:
                filters = {'company': companies[0], 'from_date': '2026-09-01', 'to_date': '2026-09-27'}
                if report in ('Accounts Receivable', 'Accounts Payable'):
                    filters = {'company': companies[0], 'report_date': '2026-09-27',
                               'ageing_based_on': 'Due Date', 'range': '30, 60, 90, 120'}
                elif report == 'Trial Balance':
                    filters = {'company': companies[0], 'from_date': '2026-09-01', 'to_date': '2026-09-27',
                               'fiscal_year': '2026', 'with_period_closing_entry_for_opening': 1,
                               'with_period_closing_entry_for_current_period': 1}
                run(report, filters=filters, ignore_prepared_report=True)
                entry['run'][report] = 'ok'
            except Exception as error:
                entry['run'][report] = {'type': type(error).__name__, 'reason': str(error)[:180]}
        frappe.set_user('Administrator')
    out.append(entry)
print(json.dumps(out, default=str))
`);
console.log(JSON.stringify(result, null, 2));
