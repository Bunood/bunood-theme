// Generate the launch document family through Frappe's production PDF engine.
// Existing submitted records are read only; their JSON is checked after render.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {benchJson} from './session.mjs';

const output = resolve(process.env.BND_PDF_OUTPUT || 'artifacts/commercial-document-pdfs');
mkdirSync(output, {recursive: true});

const cases = [
	['Quotation', 'SAL-QTN-2026-00002', 'بنود - عرض سعر (A4)', 'quotation-a4'],
	['Payment Entry', 'ACC-PAY-2026-00001', 'بنود - سند قبض-صرف', 'payment-receipt-a4'],
	['Sales Invoice', 'ACC-SINV-2026-00003', 'بنود - فاتورة ضريبية (A4)', 'tax-invoice-a4'],
	['Sales Invoice', 'ACC-SINV-2026-00006', 'بنود - فاتورة ضريبية مبسطة (A4)', 'simplified-invoice-a4'],
	['Sales Invoice', 'ACC-SINV-2026-00003', 'بنود - فاتورة ضريبية (حراري 80مم)', 'tax-invoice-thermal'],
	['Sales Invoice', 'ACC-SINV-2026-00006', 'بنود - فاتورة مبسطة (حراري 80مم)', 'simplified-invoice-thermal'],
];

for (const language of ['en', 'ar']) {
	for (const [doctype, name, format, slug] of cases) {
		const rendered = benchJson(`
import base64
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request
from frappe.utils.print_format import print_language
frappe.set_user('Administrator')
frappe.local.request=Request(EnvironBuilder(path='/printview',base_url=${JSON.stringify(process.env.BND_PDF_ASSET_URL || 'http://frontend:8080')}).get_environ())
doctype=${JSON.stringify(doctype)}
name=${JSON.stringify(name)}
format_name=${JSON.stringify(format)}
doc=frappe.get_doc(doctype,name)
before=doc.as_json()
with print_language(${JSON.stringify(language)}):
 html=frappe.get_print(doctype,name,format_name,doc=doc,no_letterhead=0)
 pdf=frappe.get_print(doctype,name,format_name,doc=doc,no_letterhead=0,as_pdf=True,pdf_generator='chrome')
assert frappe.get_doc(doctype,name).as_json()==before
print(json.dumps(dict(html=html,pdf=base64.b64encode(pdf).decode(),doctype=doctype,name=name,format=format_name)))
`);
		const basename = `${slug}-${language}`;
		writeFileSync(join(output, `${basename}.html`), rendered.html);
		writeFileSync(join(output, `${basename}.pdf`), Buffer.from(rendered.pdf, 'base64'));
		console.log(`${basename}: ${Buffer.from(rendered.pdf, 'base64').length} bytes; source record unchanged`);
	}
}

