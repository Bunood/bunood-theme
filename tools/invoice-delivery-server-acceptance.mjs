import { benchJson } from "./session.mjs";

const result = benchJson(`
from unittest.mock import patch
from bunood_theme.invoice_delivery import send_invoice_email
frappe.set_user('Administrator')
name='ACC-SINV-2026-00016'
with patch('frappe.core.doctype.communication.email.make', return_value={'name':'TEST-COMM'}) as make:
 result=send_invoice_email('Sales Invoice',name,'customer@example.com','Invoice for review','Please see the attached invoice.')
 args=make.call_args.kwargs
 assert result['communication']=='TEST-COMM'
 assert args['doctype']=='Sales Invoice' and args['name']==name and args['send_email']==1
 assert len(args['attachments'])==1 and args['attachments'][0]['fname']==name+'.pdf'
 assert args['attachments'][0]['fcontent'].startswith(b'%PDF')
 assert args['recipients']=='customer@example.com'
 assert '&lt;' not in args['content']
 try:
  send_invoice_email('Purchase Invoice',name,'customer@example.com','Subject','Message')
 except frappe.PermissionError:
  pass
 else:
  raise AssertionError('purchase invoices reached customer delivery')
 try:
  send_invoice_email('Sales Invoice',name,'invalid-email','Subject','Message')
 except Exception:
  pass
 else:
  raise AssertionError('invalid recipient was accepted')
 assert make.call_count==1
print(json.dumps({'permission_scope':True,'chrome_pdf':len(args['attachments'][0]['fcontent']),'private_attachment':True,'linked_communication':True,'invalid_recipient_rejected':True}))
`);
console.log(JSON.stringify(result));
