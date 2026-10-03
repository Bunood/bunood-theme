const {readFileSync} = require('node:fs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = readFileSync('bunood_theme/public/js/bunood.js', 'utf8');
function fixture(lang) {
 const translations = {Cash:'نقد', 'Employee Advances':'سلف الموظفين', 'Earnest Money':'تأمينات مقدمة'};
 const sandbox = {bunood:{}, window:{}, frappe:{boot:{lang},ui:{form:{}}}, __:s=>lang==='ar'?(translations[s]||s):s};
 sandbox.window.frappe = sandbox.frappe;
 class Link { get_options(){return this.options;} get_translated(value){return `native:${value}`;} }
 sandbox.frappe.ui.form.ControlLink=Link;
 vm.createContext(sandbox);
 vm.runInContext(source.slice(source.indexOf('\tconst MODE_OF_PAYMENT_LABELS'), source.indexOf('\tfunction localized_doc_field_value')),sandbox);
 return sandbox;
}
test('Arabic account labels preserve both native account-number/company orders',()=>{
 const s=fixture('ar');
 for(const [name,label] of Object.entries({Cash:'نقد',Debtors:'المدينون','Stock In Hand':'المخزون في المستودعات','Employee Advances':'سلف الموظفين','Earnest Money':'تأمينات مقدمة'}))
  for(const [id,expected] of [[`${name} - BDEV - 1110`,`${label} - BDEV - 1110`],[`1110 - ${name} - BDEV`,`1110 - ${label} - BDEV`],[`${name} - 1110 - BDEV`,`${label} - 1110 - BDEV`]])
   assert.equal(s.bunood.localized_business_value('Account',id),expected);
 assert.equal(s.bunood.localized_business_value('Account','Custom Cafe - BDEV - 1110'),'Custom Cafe - BDEV - 1110');
});
test('English preserves native account presentation',()=>{
 const s=fixture('en');
 assert.equal(s.bunood.localized_business_value('Account','Debtors'),'Debtors');
 assert.equal(s.bunood.localized_business_value('Account','Debtors - BDEV - 1310'),'Debtors - BDEV - 1310');
});
test('native Link translation hook is scoped, idempotent and leaves unrelated links alone',()=>{
 const s=fixture('ar');
 vm.runInContext('install_account_link_localizer(); install_account_link_localizer();',s);
 const control=new s.frappe.ui.form.ControlLink();
 control.options='Account';
 assert.equal(control.get_translated('Debtors - BDEV - 1310'),'المدينون - BDEV - 1310');
 control.options='Customer';
 assert.equal(control.get_translated('Debtors'),'native:Debtors');
 s.frappe.boot.lang='en';control.options='Account';
 assert.equal(control.get_translated('Debtors'),'native:Debtors');
});
