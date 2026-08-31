// Generates real wkhtmltopdf output plus unsaved pagination/tax/return specimens.
// Uses the local demo invoices by default; never saves or submits a document.
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {benchJson} from './session.mjs';
const out=resolve(process.env.BND_PDF_OUTPUT || 'artifacts/invoice-pdfs');
mkdirSync(out,{recursive:true});
// Keep these renders in ONE process. Fresh per-PDF processes cannot expose
// stale language snapshots after English -> Arabic -> English switches.
const languagePreview=benchJson(`
from frappe.utils.print_format import print_language
from frappe.www.printview import get_html_and_style
from bs4 import BeautifulSoup
frappe.set_user('Administrator')
results=[]
for dt,name in [('Purchase Invoice','ACC-PINV-2026-00002'),('Sales Invoice','ACC-SINV-2026-00002')]:
 doc=frappe.get_doc(dt,name)
 before=doc.as_json()
 for lang in ['en','ar','en','ar']:
  with print_language(lang):
   rendered=get_html_and_style(doc=before,print_format='Bunood '+dt+' (A4)',no_letterhead=0,letterhead='Bunood')['html']
   root=BeautifulSoup(rendered,'html.parser').select_one('.bnd-invoice')
   assert root['lang']==lang and root['dir']==('rtl' if lang=='ar' else 'ltr'),(dt,lang)
   assert ('VAT number' in root.select_one('.letter-head').text)==(lang=='en'),(dt,lang,'header')
   assert ('Phone' in root.select_one('.letter-head-footer').text)==(lang=='en'),(dt,lang,'footer')
   results.append(dict(doctype=dt,language=lang,direction=root['dir']))
 assert frappe.get_doc(dt,name).as_json()==before
print(json.dumps(results))
`);
writeFileSync(join(out,'preview-language-switches.json'),JSON.stringify(languagePreview,null,2));
console.log('Native preview: '+languagePreview.length+' repeated language switches passed');
const cases=[];
for (const language of ['en','ar']) {
 for (const [dt,id,format,file] of [
  ['Purchase Invoice','ACC-PINV-2026-00002','Bunood Purchase Invoice (A4)','purchase'],
  ['Sales Invoice','ACC-SINV-2026-00002','Bunood Sales Invoice (A4)','sales'],
  ['Sales Invoice','ACC-SINV-2026-00002','Bunood Sales Invoice (A4)','specimen-long'],
  ['Sales Invoice','ACC-SINV-2026-00002','Bunood Sales Invoice (A4)','specimen-discount-tax'],
  ['Purchase Invoice','ACC-PINV-2026-00002','Bunood Purchase Invoice (A4)','specimen-return'],
 ]) cases.push([dt,id,format,file+'-'+language,language]);
}
for(const [dt,name,format,file,language] of cases) {
 const data=benchJson(`
import base64, hashlib
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request
from frappe.utils.print_format import print_language
frappe.set_user('Administrator')
frappe.local.request=Request(EnvironBuilder(path='/printview',base_url=${JSON.stringify(process.env.BND_PDF_ASSET_URL || 'http://frontend:8080')}).get_environ())
doc=frappe.get_doc(${JSON.stringify(dt)},${JSON.stringify(name)})
before=doc.as_json()
original_name=doc.name
case=${JSON.stringify(file)}
if case.startswith('specimen-'):
 # In-memory copies only. Never insert/save fixtures into the user's ledger.
 doc.name='BND-PRINT-TEST-'+case
 doc.docstatus=0
 if case.startswith('specimen-long-'):
  item=doc.items[0].as_dict()
  doc.set('items',[])
  for i in range(1,45):
   values=dict(item,idx=i,item_name='TEST-LINE-%02d خدمة صيانة / Maintenance service'%i,item_code='LONG-CODE-'+('X'*100) if i==3 else 'TEST-%02d'%i,qty=1,rate=70,amount=70)
   values['description']=('Arabic and English وصف الخدمة ' * 25) if i==3 else ''
   doc.append('items',values)
  doc.net_total=doc.total=doc.grand_total=doc.rounded_total=3080
  doc.in_words='SAR Three Thousand Eighty Only'
 elif case.startswith('specimen-discount-tax-'):
  doc.items[0].qty=2
  doc.items[0].rate=100
  doc.items[0].amount=200
  doc.items[0].net_rate=90
  doc.items[0].net_amount=180
  doc.total=200
  doc.net_total=180
  doc.discount_amount=20
  doc.additional_discount_percentage=10
  doc.apply_discount_on='Net Total'
  doc.total_taxes_and_charges=27
  doc.grand_total=doc.rounded_total=207
  doc.set('taxes',[])
  doc.append('taxes',dict(charge_type='On Net Total',description='VAT 15% / ضريبة القيمة المضافة',rate=15,tax_amount=27,tax_amount_after_discount_amount=27))
  doc.in_words='SAR Two Hundred Seven Only'
 elif case.startswith('specimen-return-'):
  doc.is_return=1
  doc.return_against=original_name
  doc.items[0].qty=-1
  doc.items[0].amount=-70
  doc.net_total=doc.total=doc.grand_total=doc.rounded_total=-70
  doc.in_words='SAR Negative Seventy Only'
with print_language(${JSON.stringify(language)}):
 html=frappe.get_print(doc.doctype,doc.name,${JSON.stringify(format)},doc=doc,no_letterhead=0)
 pdf=frappe.get_print(doc.doctype,doc.name,${JSON.stringify(format)},doc=doc,no_letterhead=0,as_pdf=True,pdf_generator='wkhtmltopdf')
assert frappe.get_doc(doc.doctype,original_name).as_json()==before
print(json.dumps(dict(html=html,pdf=base64.b64encode(pdf).decode())))
`);
 writeFileSync(join(out,file+'.html'),data.html);
 writeFileSync(join(out,file+'.pdf'),Buffer.from(data.pdf,'base64'));
 console.log(file+': '+Buffer.from(data.pdf,'base64').length+' bytes; invoice unchanged');
}
