import assert from 'node:assert/strict';
import {boundedAudit} from './bounded-audit.mjs';
import {closeStockContext} from './axe-native-label-pair.mjs';
import {AXE_TAGS,AXE_EXCLUDE} from './axe-routes.mjs';
export const ATTACHMENT_RULES=['image-alt','link-name','nested-interactive'];
const ROUTE='/desk/item/BND-TEST-001';
export function assertAttachmentPair(theme,stock){
 assert.equal(stock.themePresent,false,'Stock loaded Theme');
 assert.ok(stock.blockedAssets>0,'No Theme assets blocked');
 const keys=(rows,label)=>{
  assert.ok(Array.isArray(rows)&&rows.length,label+' missing');
  const values=rows.map(row=>{assert.equal(row.valid,true,label+' unknown/native ownership');assert.ok(row.identity,label+' identity missing');return row.identity;});
  assert.equal(new Set(values).size,values.length,label+' duplicate');return values.sort();
 };
 assert.equal(theme.record,'BND-TEST-001');assert.equal(stock.record,theme.record);
 assert.deepEqual(theme.data,stock.data,'Attachment data/image changed between scans');
 assert.deepEqual(keys(theme.inventory,'Theme inventory'),keys(stock.inventory,'Stock inventory'));
 assert.deepEqual(keys(theme.failures,'Theme failures'),keys(stock.failures,'Stock failures'),'Native attachment failures changed');
 const outside=snapshot=>{
  const checked=(values,label)=>{
   assert.ok(Array.isArray(values),label+' missing');
   for(const value of values)assert.ok(typeof value==='string'&&/^(image-alt|link-name|nested-interactive):\S[^\0]*$/.test(value),label+' invalid target');
   assert.equal(new Set(values).size,values.length,label+' duplicate target');
   return new Set(values);
  };
  const all=checked(snapshot.allFailures,'All failures'),other=checked(snapshot.outsideFailures,'Outside failures');
  assert.ok([...other].every(target=>all.has(target)),'Outside target absent from scan');
  assert.equal(all.size,other.size+snapshot.failures.length,'Incomplete failure classification');
  return other;
 };
 const themeOutside=outside(theme),stockOutside=outside(stock);
 // Stock-only improvements are allowed. A new Theme target cannot be hidden
 // by another target disappearing, even when their per-rule counts are equal.
 assert.ok([...themeOutside].every(target=>stockOutside.has(target)),'Theme introduced an outside failure');
 assert.ok(theme.failures.every(f=>theme.inventory.some(i=>i.identity===f.identity)),'Failure outside inventory');
 assert.ok(stock.failures.every(f=>stock.inventory.some(i=>i.identity===f.identity)),'Stock failure outside inventory');
}
export async function captureItemAttachmentSnapshot(page,result){
 const targets=[];
 for(const v of result.violations.filter(v=>ATTACHMENT_RULES.includes(v.id)))for(const node of v.nodes){
  assert.ok(node.target.length===1&&typeof node.target[0]==='string','Unknown/frame attachment target');
  assert.equal(await page.locator(node.target[0]).count(),1,'Ambiguous attachment target');
  targets.push({rule:v.id,selector:node.target[0]});
 }
 return page.evaluate(targets=>{
  const frm=window.cur_frm;
  if(frm?.doctype!=='Item'||frm.doc?.name!=='BND-TEST-001')throw Error('Wrong Item');
  const raw=frm.get_docinfo()?.attachments;
  if(!Array.isArray(raw))throw Error('Missing attachment metadata');
  const data={image:frm.doc.image||'',files:raw.map(f=>({name:f.name,url:f.file_url,file_name:f.file_name,is_private:f.is_private})).sort((a,b)=>a.name.localeCompare(b.name))};
  if(data.files.some(f=>!f.name||!f.url)||new Set(data.files.map(f=>f.name)).size!==data.files.length)throw Error('Invalid attachment inventory');
  const owned=el=>{for(let n=el;n;n=n.parentElement){if([...n.attributes].some(a=>a.name.startsWith('data-bnd-'))||[...n.classList].some(c=>c.startsWith('bnd-')))return true;if(n.matches('.form-sidebar'))break;}return false;};
  const describe=(el,rule)=>{
   const image=el.matches('img.sidebar-image');
   const row=el.closest('.attachment-row');
   if(!image&&!row)return null;
   let valid=!!el.closest('.form-sidebar')&&!owned(el),identity;
   if(image){
    valid&&=rule==='image-alt'&&el.getAttribute('src')===data.image&&data.files.filter(f=>f.url===data.image).length===1;
    identity='image-alt:'+data.image;
   }else{
    const icons=row.querySelectorAll('a.attachment-icon'),labels=row.querySelectorAll('a.attachment-file-label');
    const file=icons.length===1?data.files.find(f=>icons[0].getAttribute('href')==='/desk/file/'+f.name):null;
    valid&&=!!file&&labels.length===1&&labels[0].getAttribute('href')===file.url;
    valid&&=rule==='link-name'?el===icons[0]:rule==='nested-interactive'&&el.matches('button.data-pill')&&el.contains(icons[0])&&el.contains(labels[0]);
    identity=rule+':'+(file?.name||'unknown');
   }
   return {identity,valid};
  };
  const inventory=[];
  for(const [selector,rule] of [['.form-sidebar img.sidebar-image','image-alt'],['.form-sidebar .attachment-row a.attachment-icon','link-name'],['.form-sidebar .attachment-row button.data-pill','nested-interactive']])for(const el of document.querySelectorAll(selector))inventory.push(describe(el,rule));
  const classified=targets.map(t=>({key:t.rule+':'+t.selector,candidate:describe(document.querySelector(t.selector),t.rule)}));
  const failures=classified.map(t=>t.candidate).filter(Boolean);
  return {record:frm.doc.name,data,inventory,failures,allFailures:classified.map(t=>t.key),outsideFailures:classified.filter(t=>!t.candidate).map(t=>t.key),themePresent:!!window.bunood_theme};
 },targets);
}
export async function verifyItemAttachmentsAgainstStock({browser,page,result,AxeBuilder}){
 const url=new URL(page.url());assert.equal(url.pathname,ROUTE);
 return boundedAudit(async()=>{
  const context=await browser.newContext({viewport:page.viewportSize(),serviceWorkers:'block'});let failure;
  try{
   await context.addCookies(await page.context().cookies(url.origin));let blockedAssets=0;
   await context.route('**/assets/bunood_theme/**',route=>{blockedAssets++;return route.abort();});
   const stockPage=await context.newPage();await stockPage.goto(url.href,{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(new URL(stockPage.url()).pathname,ROUTE);
   await stockPage.waitForFunction(()=>window.cur_frm?.doc?.name==='BND-TEST-001'&&!!cur_frm.get_docinfo()?.attachments);
   await stockPage.locator('.form-sidebar .attachment-row').first().waitFor({state:'attached'});
   const stockResult=await new AxeBuilder({page:stockPage}).withTags(AXE_TAGS).exclude(AXE_EXCLUDE).withRules(ATTACHMENT_RULES).analyze();
   const theme=await captureItemAttachmentSnapshot(page,result),stock={...await captureItemAttachmentSnapshot(stockPage,stockResult),blockedAssets};
   assertAttachmentPair(theme,stock);
   return Object.fromEntries(ATTACHMENT_RULES.map(rule=>[rule,theme.failures.filter(f=>f.identity.startsWith(rule+':')).length]));
  }catch(error){failure=error;throw error;}
  finally{await closeStockContext(context,browser,failure);}
 },()=>browser.close());
}
