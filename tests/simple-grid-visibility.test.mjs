import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const assets=readFileSync(new URL('../bunood_theme/assets.py',import.meta.url),'utf8');
const filename=assets.match(/THEME_CSS = "\/assets\/bunood_theme\/(.*?)"/)[1];
const css=readFileSync(new URL('../bunood_theme/public/'+filename,import.meta.url),'utf8');
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
