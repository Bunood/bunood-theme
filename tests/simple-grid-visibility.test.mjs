import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const assets=readFileSync(new URL('../bunood_theme/assets.py',import.meta.url),'utf8');
const filename=assets.match(/THEME_CSS = "\/assets\/bunood_theme\/(.*?)"/)[1];
const css=readFileSync(new URL('../bunood_theme/public/'+filename,import.meta.url),'utf8');
const simpleSource=readFileSync(new URL('../bunood_theme/public/js/simple_forms.js',import.meta.url),'utf8');

test('Payment native allocation buttons keep handlers, visibility and keyboard order when moved', async()=>{
 const fields=JSON.parse(simpleSource.match(/\["allocations", "Allocate invoices",[^\n]+?(\["get_outstanding_invoices"[^\]]+\])/)[1]);
 const move=simpleSource.split('\t\tmove(name, target) {')[1].split('\n\t\trestore() {')[0];
 const browser=await chromium.launch({executablePath:process.env.BND_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 try{
  const page=await browser.newPage();
  await page.setContent('<input id="amount"><section id="allocation"></section><aside id="native"><div id="get_outstanding_invoices"><button>Invoices</button></div><div id="get_outstanding_orders"><button>Orders</button></div><div id="references"><span tabindex="0">References</span><input readonly value="native locked"></div></aside>');
  await page.evaluate(({fields,move})=>{
   window.calls=[];window.originalButtons=[...document.querySelectorAll('button')];
   for(const button of originalButtons)button.addEventListener('click',()=>calls.push(button.textContent));
   const controller={frm:{fields_dict:Object.fromEntries(fields.map(name=>[name,{$wrapper:[document.getElementById(name)]}]))},locations:new Map()};
   const moveNative=new Function('name','target',move.slice(0,move.lastIndexOf('}')));
   for(const name of fields)moveNative.call(controller,name,document.querySelector('#allocation'));
  },{fields,move});
  await page.locator('#amount').focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement===originalButtons[0]),true);
  await page.keyboard.press('Enter');await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(()=>calls),['Invoices','Orders']);
  assert.equal(await page.locator('#references input').isEditable(),false);
  await page.locator('#get_outstanding_invoices').evaluate(el=>el.hidden=true);
  await page.locator('#amount').focus();await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement===originalButtons[1]),true,'native hidden control stays excluded');
 }finally{await browser.close();}
});

test('refresh mounts beside the native root even when an expanded grid precedes it', async()=>{
 const browser=await chromium.launch({executablePath:process.env.BND_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 try {
  const page=await browser.newPage();
  await page.setContent('<main><div class="std-form-layout"><header></header><nav></nav><section id="workbench"><div class="form-in-grid"><div class="form-layout"><input value="475"></div></div></section><div class="form-layout" id="native-root"></div></div></main>');
  const body=simpleSource.split('\t\tensureMounted() {')[1].split('\n\t\trefresh() {')[0];
  await page.evaluate(body=>{
   const wrapper=document.querySelector('main');
   const controller={frm:{$wrapper:{0:wrapper,find(selector){return {first(){return [wrapper.querySelector(selector)];}};}}},header:document.querySelector('header'),actions:document.querySelector('nav'),workbench:{root:document.querySelector('#workbench')}};
   const mount=new Function(body.slice(0,body.lastIndexOf('}')));
   mount.call(controller);
   document.querySelector('#native-root').replaceWith(Object.assign(document.createElement('div'),{className:'form-layout',id:'replacement-root'}));
   mount.call(controller);
  },body);
  assert.equal(await page.locator('#workbench input').inputValue(),'475');
  assert.equal(await page.locator('.std-form-layout > header + nav + #workbench + #replacement-root').count(),1);
 }finally{await browser.close();}
});
test('Simple ownership hides root native layout but leaves native expanded grid editor editable; Advanced reverses', async()=>{
 const browser=await chromium.launch({executablePath:process.env.BND_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 try {
  const page=await browser.newPage();
  await page.route('**/*',route=>route.abort());
  for(const mode of ['bnd-composed-simple-active','bnd-stock-simple-active','bnd-delivery-simple-active']) {
   await page.setContent(`<html data-theme="light"><body><main class="page-container bnd-generic-simple ${mode}">
   <div class="std-form-layout"><div class="form-layout" id="native-root"><div class="form-section"><input id="native-control"></div></div></div>
   <div class="bnd-task-workbench"><div class="frappe-control bnd-simple-visible"><div class="grid-row grid-row-open"><div class="form-in-grid"><div class="grid-form-body"><div class="form-area"><div class="form-layout" id="expanded-layout"><div class="form-tab-content"><div class="tab-pane"><div class="form-section"><input id="debit" type="text"><input id="locked" readonly value="locked"></div></div></div></div></div></div></div></div></div></div>
   </main></body></html>`);
   await page.addStyleTag({content:css});
   assert.equal(await page.locator('#native-control').isVisible(),false,mode+' root hidden');
   assert.equal(await page.locator('#debit').isVisible(),true,mode+' expanded editor visible');
   await page.locator('#debit').fill('450');
   assert.equal(await page.locator('#debit').inputValue(),'450');
   assert.equal(await page.locator('#locked').isEditable(),false,'native readonly preserved');
   await page.evaluate(()=>document.querySelector('main').className='page-container bnd-simple-native-ready');
   assert.equal(await page.locator('#native-control').isVisible(),true,'Advanced restores root');
   assert.equal(await page.locator('#debit').isVisible(),true,'Advanced preserves row editor');
  }
 }finally{await browser.close();}
});
