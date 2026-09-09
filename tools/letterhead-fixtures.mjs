// Real PDF edge cases using in-memory Company copies, never saved records.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {benchJson} from './session.mjs';
const out=resolve(process.env.BND_PDF_OUTPUT || 'artifacts/letterhead-fixtures');
mkdirSync(out,{recursive:true});
for(const language of ['en','ar']) for(const fixture of ['long-name','no-registration','logo','logo-square','logo-wide']) {
 const data=benchJson(`
import base64, struct, zlib
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request
from frappe.utils.print_format import print_language
from bs4 import BeautifulSoup
frappe.set_user('Administrator')
frappe.local.request=Request(EnvironBuilder(path='/printview',base_url='http://frontend:8080').get_environ())
doc=frappe.get_doc('Purchase Invoice','ACC-PINV-2026-00002')
company=frappe.get_doc('Company',doc.company)
invoice_before=doc.as_json()
company_before=company.as_json()
fixture=${JSON.stringify(fixture)}
language=${JSON.stringify(language)}
if fixture=='long-name':
 company.company_name='Bunood International Trading, Contracting and Industrial Maintenance Services Company'
 company.company_name_in_arabic='شركة بنود الدولية للتجارة والمقاولات وخدمات الصيانة الصناعية'
elif fixture=='no-registration':
 company.tax_id=''
 company.bnd_commercial_registration=''
 company.registration_details=''
elif fixture.startswith('logo'):
 # A deliberately wide raster fixture exercises sizing without fetching
 # external assets or uploading an image into the user's site.
 def chunk(kind,data):
  return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
 width,height={'logo':(240,60),'logo-square':(60,60),'logo-wide':(600,60)}[fixture]
 raw=(b'\\x00'+bytes([70,120,78])*width)*height
 png=b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('!2I5B',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
 company.company_logo='data:image/png;base64,'+base64.b64encode(png).decode()
original_get_doc=frappe.get_doc
def fixture_get_doc(*args,**kwargs):
 if len(args)>=2 and args[0]=='Company' and args[1]==doc.company:
  return company
 return original_get_doc(*args,**kwargs)
try:
 frappe.get_doc=fixture_get_doc
 with print_language(language):
  html=frappe.get_print(doc.doctype,doc.name,'Bunood Purchase Invoice (A4)',doc=doc,no_letterhead=0)
  pdf=frappe.get_print(doc.doctype,doc.name,'Bunood Purchase Invoice (A4)',doc=doc,no_letterhead=0,as_pdf=True,pdf_generator='wkhtmltopdf')
finally:
 frappe.get_doc=original_get_doc
assert frappe.get_doc('Company',doc.company).as_json()==company_before
assert frappe.get_doc(doc.doctype,doc.name).as_json()==invoice_before
header=BeautifulSoup(html,'html.parser').select_one('.bnd-lh-minimal')
assert header and header.get('dir')==('rtl' if language=='ar' else 'ltr')
assert 'None' not in header.text
if fixture=='no-registration':
 assert not header.select('.bnd-lh-registration') and not header.select('img')
elif fixture.startswith('logo'):
 assert len(header.select('img'))==1
elif fixture=='long-name':
 assert header.select_one('.bnd-lh-name').get_text(strip=True)==(company.company_name_in_arabic if language=='ar' else company.company_name)
print(json.dumps({'html':html,'pdf':base64.b64encode(pdf).decode()}))
`);
 writeFileSync(join(out,fixture+'-'+language+'.html'),data.html);
 writeFileSync(join(out,fixture+'-'+language+'.pdf'),Buffer.from(data.pdf,'base64'));
 console.log(fixture+'-'+language+': PDF generated; company and invoice unchanged');
}
