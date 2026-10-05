import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertAttachmentPair,captureItemAttachmentSnapshot} from '../tools/axe-native-item-attachments.mjs';
import {chromium} from 'playwright';
const fixture=()=>({record:'BND-TEST-001',data:{image:'/files/a.png',files:[{name:'file1',url:'/files/a.png'}]},inventory:['image-alt:/files/a.png','link-name:file1','nested-interactive:file1'].map(identity=>({identity,valid:true})),failures:['image-alt:/files/a.png','link-name:file1','nested-interactive:file1'].map(identity=>({identity,valid:true})),allFailures:['image-alt:.sidebar-image','link-name:.attachment-icon','nested-interactive:.data-pill'],outsideFailures:[],themePresent:false,blockedAssets:6});
test('exact same native attachment/image data and failures qualify',()=>assert.doesNotThrow(()=>assertAttachmentPair(fixture(),fixture())));
test('stock-only unrelated header-logo improvement is permitted',()=>{
 const theme=fixture(),stock=fixture();
 theme.outsideFailures=[];stock.outsideFailures=['image-alt:.header-logo > img'];
 stock.allFailures.push(...stock.outsideFailures);
 assert.doesNotThrow(()=>assertAttachmentPair(theme,stock));
});
test('shared outside failures remain separate from qualified subtraction',()=>{
 const theme=fixture(),stock=fixture();
 for(const snapshot of [theme,stock]){
  snapshot.outsideFailures=['link-name:a[href$="desk"]'];
  snapshot.allFailures.push(...snapshot.outsideFailures);
 }
 assert.doesNotThrow(()=>assertAttachmentPair(theme,stock));
 assert.equal(theme.failures.filter(f=>f.identity.startsWith('link-name:')).length,1);
 assert.equal(theme.allFailures.filter(f=>f.startsWith('link-name:')).length,2);
});
test('new Theme outside target is rejected despite same-rule count offset',()=>{
 const theme=fixture(),stock=fixture();
 theme.outsideFailures=['image-alt:.new-theme-image'];stock.outsideFailures=['image-alt:.header-logo > img'];
 theme.allFailures.push(...theme.outsideFailures);stock.allFailures.push(...stock.outsideFailures);
 assert.equal(theme.allFailures.length,stock.allFailures.length);
 assert.throws(()=>assertAttachmentPair(theme,stock),/Theme introduced an outside failure/);
});
for(const [label,values] of [['duplicate',['link-name:a','link-name:a']],['unknown rule',['other:a']],['empty selector',['link-name:']],['frame array',[['link-name:a']]],['empty value',['']],['missing',undefined]]){
 test('rejects '+label+' outside target set',()=>{
  const theme=fixture(),stock=fixture();stock.outsideFailures=values;
  assert.throws(()=>assertAttachmentPair(theme,stock));
 });
}
for(const [name,mutate] of [
 ['Theme runtime',s=>s.themePresent=true],['no blocked assets',s=>s.blockedAssets=0],
 ['wrong record',s=>s.record='other'],['missing metadata',s=>s.data={}],
 ['different File',s=>s.data.files[0].name='other'],['different image',s=>s.data.image='/files/b.png'],
 ['duplicate inventory',s=>s.inventory.push(s.inventory[0])],['missing inventory',s=>s.inventory.pop()],
 ['unknown ownership',s=>s.inventory[0].valid=false],['Theme-owned failure',s=>s.failures[0].valid=false],
 ['unknown failure identity',s=>s.failures[0].identity='image-alt:other'],['removed failure',s=>s.failures.pop()],
 ['new nonattachment failure',s=>s.allFailures.push('image-alt:.new-theme-image')],
 ['duplicate failure',s=>s.failures.push(s.failures[0])],
 ['empty failure inventory',s=>s.failures=[]],
])test('rejects '+name,()=>{const stock=fixture();mutate(stock);assert.throws(()=>assertAttachmentPair(fixture(),stock));});

test('actual DOM classifier rejects Theme ownership at sidebar boundary and descendants',async()=>{
 const browser=await chromium.launch({...(process.env.BND_BROWSER_EXECUTABLE ? {executablePath:process.env.BND_BROWSER_EXECUTABLE} : {})});
 try{
  const page=await browser.newPage();
  await page.setContent('<div class="form-sidebar"><img class="sidebar-image" src="/files/a.png"><div class="attachment-row"><button class="data-pill"><a class="attachment-icon" href="/desk/file/file1"></a><a class="attachment-file-label" href="/files/a.png">A</a></button></div></div>');
  await page.evaluate(()=>{window.cur_frm={doctype:'Item',doc:{name:'BND-TEST-001',image:'/files/a.png'},get_docinfo:()=>({attachments:[{name:'file1',file_url:'/files/a.png',file_name:'a.png',is_private:0}]})};});
  const result={violations:[['image-alt','.sidebar-image'],['link-name','.attachment-icon'],['nested-interactive','.data-pill']].map(([id,selector])=>({id,nodes:[{target:[selector]}]}))};
  const clean=await captureItemAttachmentSnapshot(page,result);
  assert.equal(clean.failures.length,3);
  assert.ok(clean.failures.every(f=>f.valid)&&clean.inventory.every(f=>f.valid));
  for(const [selector,attr,value] of [['.form-sidebar','data-bnd-own','pane'],['.form-sidebar','class','form-sidebar bnd-pane'],['.attachment-row','data-bnd-part','attachment'],['.data-pill','class','data-pill bnd-action']]){
   const original=await page.locator(selector).getAttribute(attr);
   await page.locator(selector).evaluate((el,{attr,value})=>el.setAttribute(attr,value),{attr,value});
   const marked=await captureItemAttachmentSnapshot(page,result);
   assert.ok(marked.failures.some(f=>!f.valid),selector+' '+attr+' must be rejected');
   assert.throws(()=>assertAttachmentPair(marked,{...clean,blockedAssets:1}),/ownership/);
   await page.locator(selector).evaluate((el,{attr,original})=>original===null?el.removeAttribute(attr):el.setAttribute(attr,original),{attr,original});
  }
 }finally{await browser.close();}
});
