// Against the deployed local site. Uses existing demo invoices or unsaved
// in-memory specimens only: never saves/submits invoices or touches the ledger.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {benchJson} from './session.mjs';

const out=resolve(process.env.BND_WORDS_OUTPUT || 'artifacts/amount-words');
mkdirSync(out,{recursive:true});
const testFiles=['test_amount_words.py','test_amount_words_site.py'];
const sources=testFiles.map(file=>readFileSync(new URL('../tests/'+file,import.meta.url)).toString('base64'));
const units=benchJson(`
import base64, io, unittest
suite=unittest.TestSuite()
for source in ${JSON.stringify(sources)}:
 namespace={'__name__':'amount_words_regression'}
 exec(compile(base64.b64decode(source),'amount_words_regression','exec'),namespace)
 for name in ('ArabicAmountWordsTest','AmountWordsSiteTest'):
  if name in namespace: suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(namespace[name]))
stream=io.StringIO()
result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
print(json.dumps(dict(passed=result.wasSuccessful(),tests=result.testsRun,output=stream.getvalue())))
`);
writeFileSync(join(out,'unit-results.json'),JSON.stringify(units,null,2));
if(!units.passed) throw new Error(units.output);

const cases=[
 ['sales-ar','Sales Invoice','ACC-SINV-2026-00004','ar',null,false,'ألف وأربعمائة ريال سعودي فقط لا غير'],
 ['sales-en','Sales Invoice','ACC-SINV-2026-00004','en',null,false,null],
 ['purchase-ar','Purchase Invoice','ACC-PINV-2026-00002','ar',null,false,'سبعون ريالًا سعوديًا فقط لا غير'],
 ['halalas-ar','Sales Invoice','ACC-SINV-2026-00004','ar',1400.08,false,'ألف وأربعمائة ريال سعودي وثماني هللات فقط لا غير'],
 ['return-ar','Sales Invoice','ACC-SINV-2026-00004','ar',-1400.50,false,'سالب ألف وأربعمائة ريال سعودي وخمسون هللة فقط لا غير'],
 ['shared-totals-ar','Sales Invoice','ACC-SINV-2026-00004','ar',null,true,'ألف وأربعمائة ريال سعودي فقط لا غير'],
];
const results=[];
for(const [file,doctype,name,language,amount,shared,expected] of cases){
 const data=benchJson(`
import base64, hashlib
from bs4 import BeautifulSoup
from unittest.mock import patch
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request
from frappe.utils.print_format import print_language
from frappe.utils.jinja import get_jenv
from bunood_theme.printing.install import FORMATS
frappe.set_user('Administrator')
frappe.local.request=Request(EnvironBuilder(path='/printview',base_url='http://frontend:8080').get_environ())
doc=frappe.get_doc(${JSON.stringify(doctype)},${JSON.stringify(name)})
before=doc.as_json()
amount=${amount===null?'None':amount}
shared=${shared?'True':'False'}
if amount is not None:
 doc.name='BND-WORDS-SPECIMEN-'+${JSON.stringify(file)}
 doc.docstatus=0
 doc.is_return=int(amount<0)
 doc.disable_rounded_total=1
 item=doc.items[0].as_dict()
 doc.set('items',[])
 item.update(qty=-1 if amount<0 else 1,rate=abs(amount),amount=amount,net_rate=abs(amount),net_amount=amount,idx=1)
 doc.append('items',item)
 doc.net_total=doc.total=doc.grand_total=doc.rounded_total=amount
 doc.total_taxes_and_charges=0
 doc.set('taxes',[])
fmt=next(f['name'] for f in FORMATS if f['file']=='sales_invoice_tax_a4.html') if shared else 'Bunood '+doc.doctype+' (A4)'
selector='.bnd-p-words' if shared else '.bnd-inv-words td'
with print_language(${JSON.stringify(language)}):
 html=frappe.get_print(doc.doctype,doc.name,fmt,doc=doc,no_letterhead=0)
 soup=BeautifulSoup(html,'html.parser')
 words=soup.select_one(selector).get_text(' ',strip=True)
 expected=${expected===null?'frappe.utils.money_in_words(doc.grand_total, "SAR").replace("SAR", "Saudi riyals")':JSON.stringify(expected)}
 assert words==expected,repr((words,expected))
 original_get=frappe.db.get_single_value
 def hidden_words(dt,field,*args,**kwargs):
  return 'Hide' if (dt,field)==('Theme Settings','print_words') else original_get(dt,field,*args,**kwargs)
 with patch.object(frappe.db,'get_single_value',new=hidden_words):
  # Safe Jinja globals capture db methods per request; recreate only this
  # process's environments so the read-only setting stub reaches the template.
  frappe.local.jenv_restricted=None
  frappe.local.jenv_unrestricted=None
  get_jenv().cache.clear()  # imported macros also retain their global namespace
  hidden=frappe.get_print(doc.doctype,doc.name,fmt,doc=doc,no_letterhead=0)
  assert BeautifulSoup(hidden,'html.parser').select_one(selector) is None, 'Hide setting did not hide words'
 frappe.local.jenv_restricted=None
 frappe.local.jenv_unrestricted=None
 get_jenv().cache.clear()
 pdf=frappe.get_print(doc.doctype,doc.name,fmt,doc=doc,no_letterhead=0,as_pdf=True,pdf_generator='wkhtmltopdf')
assert frappe.get_doc(${JSON.stringify(doctype)},${JSON.stringify(name)}).as_json()==before, 'Original invoice changed'
frappe.db.rollback()
print(json.dumps(dict(words=words,format=fmt,original_document_unchanged=True,pdf_sha256=hashlib.sha256(pdf).hexdigest(),html=html,pdf=base64.b64encode(pdf).decode())))
`);
 writeFileSync(join(out,file+'.html'),data.html);
 writeFileSync(join(out,file+'.pdf'),Buffer.from(data.pdf,'base64'));
 delete data.html;delete data.pdf;
 results.push({file,...data});
 console.log(file+': wording/hidden-setting/document-immutability passed');
}
writeFileSync(join(out,'results.json'),JSON.stringify({units:units.tests,cases:results},null,2));
