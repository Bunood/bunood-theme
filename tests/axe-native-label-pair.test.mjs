import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeLabelPair, closeStockContext, captureGalleryLabels } from '../tools/axe-native-label-pair.mjs';
import {chromium} from 'playwright';
const node = identity => ({identity,native:true,themeOwned:false});
const sample = () => ({rows:['a','b'].map(node), failures:['a','b'].map(node),themePresent:false,blockedAssets:2});
const gallery=()=>({...sample(),species:'gallery',metadata:['a','b']});
test('gallery metadata matches exact native row inventory',()=>assertNativeLabelPair(gallery(),gallery()));
for(const [label,change] of [['wrong metadata',s=>s.metadata[0]='other'],['duplicate metadata',s=>s.metadata[1]='a'],['missing metadata',s=>delete s.metadata],['mixed species',s=>delete s.species]])test(label+' gallery rejected',()=>{const s=gallery();change(s);assert.throws(()=>assertNativeLabelPair(s,gallery()));});

test('gallery DOM binds checkbox, title and image identity and checks root ownership',async()=>{
 const browser=await chromium.launch(process.env.BND_BROWSER_EXECUTABLE?{executablePath:process.env.BND_BROWSER_EXECUTABLE}:{});
 try{
  const page=await browser.newPage();
  const html='<div class="image-view-container"><div class="image-view-item ellipsis"><div class="image-view-header"><div><input type="checkbox" class="list-row-checkbox" data-name="A%20B"></div></div><div class="image-field" data-name="A%20B"></div><div class="image-title"><a data-doctype="Item" data-name="A B" href="/desk/item/A%20B">A B</a></div></div></div>';
  const reset=async()=>{await page.setContent(html);await page.evaluate(()=>{window.cur_list={doctype:'Item',view_name:'Image',data:[{name:'A B'}]};window.frappe={get_route:()=>['List','Item','Image']};});};
  await reset();
  const clean=await page.evaluate(captureGalleryLabels,['input']);
  assertNativeLabelPair(clean,{...clean,blockedAssets:1});
  for(const [selector,attr,value] of [['.image-view-item','data-bnd-own','x'],['.image-view-item','class','image-view-item bnd-tile'],['input','class','list-row-checkbox bnd-control'],['.image-title a','data-name','wrong'],['.image-field','data-name','wrong'],['input','type','text']]){
   await reset();await page.locator(selector).evaluate((el,{attr,value})=>el.setAttribute(attr,value),{attr,value});
   const changed=await page.evaluate(captureGalleryLabels,['input']);
   assert.throws(()=>assertNativeLabelPair(changed,{...clean,blockedAssets:1}),selector+' '+attr);
  }
  await reset();await page.locator('input').evaluate(el=>el.parentElement.append(el.cloneNode()));
  await assert.rejects(page.evaluate(captureGalleryLabels,['input']),/Ambiguous/);
  await reset();await page.evaluate(()=>cur_list.view_name='List');
  await assert.rejects(page.evaluate(captureGalleryLabels,['input']),/Wrong native gallery route/);
  await reset();await page.evaluate(()=>{
   document.querySelector('input').removeAttribute('data-name');
   document.querySelector('.image-field').removeAttribute('data-name');
   const title=document.querySelector('.image-title a');title.setAttribute('data-name','null');title.setAttribute('href','/desk/item/null');
   cur_list.data=[{name:'null'}];
  });
  const missingNames=await page.evaluate(captureGalleryLabels,['input']);
  assert.equal(missingNames.rows[0].native,false,'missing attributes cannot impersonate Item null');
 }finally{await browser.close();}
});
test('identical native failures accept independent row order',()=>{const a=sample(),b=sample();b.rows.reverse();assertNativeLabelPair(a,b);});
for(const [name,change] of [
 ['Theme introduces failure',(a,b)=>b.failures.pop()],
 ['Theme removes native failure',a=>a.failures.pop()],
 ['different row identities',a=>a.rows[0].identity='other'],
 ['new label control',a=>a.failures.push({...node('new'),native:false})],
 ['Theme-owned control',a=>a.failures[0].themeOwned=true],
 ['missing identity',a=>a.rows[0].identity=''],
 ['duplicate identity',a=>a.rows[1].identity='a'],
 ['no blocked assets',(a,b)=>b.blockedAssets=0],
 ['Theme still enabled',(a,b)=>b.themePresent=true],
 ['unknown target',a=>a.failures[0].native=false],
 ['empty inventory',a=>a.rows=[]],
 ['failure outside inventory',(a,b)=>{a.failures=[node('outside')];b.failures=[node('outside')];}],
]) test(name+' fails closed',()=>{const a=sample(),b=sample();change(a,b);assert.throws(()=>assertNativeLabelPair(a,b));});

test('immediate context close rejection is fatal and stops browser', async () => {
 let stopped=0;
 const failure=new Error('close rejected');
 await assert.rejects(closeStockContext({close:async()=>{throw failure;}},{close:async()=>{stopped++;}},null,50,50), error=>error===failure && error.fatalSuite===true);
 assert.equal(stopped,1);
});
test('close rejection preserves original scan error even if browser close rejects', async () => {
 const original=new Error('scan failed');
 await assert.rejects(closeStockContext({close:async()=>{throw new Error('close rejected');}},{close:async()=>{throw new Error('browser rejected');}},original,50,50),error=>error===original && error.fatalSuite===true && error.cleanupError.message==='close rejected');
});
test('never settling browser cleanup is bounded after context close rejection', async () => {
 await assert.rejects(closeStockContext({close:async()=>{throw new Error('close rejected');}},{close:()=>new Promise(()=>{})},null,50,10),error=>error.fatalSuite===true);
});
