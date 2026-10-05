import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {nativeVersionValueNodes} from '../tools/native-version-values.mjs';
test('only exact native Version value text is classified as historical data',async()=>{
 const browser=await chromium.launch({executablePath:process.env.BND_BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 try{
  const page=await browser.newPage();
  await page.route('http://fixture.test/**',route=>route.fulfill({body:'<html><body></body></html>',contentType:'text/html'}));
  await page.goto('http://fixture.test/desk/theme-settings');
  await page.evaluate(()=>{
   window.frappe={utils:{html2text:value=>new DOMParser().parseFromString(value,'text/html').body.textContent},ellipsis:value=>value.length>40?value.slice(0,40)+'...':value};
   window.cur_frm={get_docinfo:()=>({versions:[{name:'known',data:JSON.stringify({changed:[['placement','Bottom Bar End','Off'],['numeric',5,6],['html','<em>Old</em>','New'],['long','x'.repeat(45),''],['unknown',{text:'Object'},[]]]})}]})};
   document.body.innerHTML='<main class="bnd-settings"><div class="timeline-items"><div class="timeline-item"><div class="timeline-content">'+
    '<a href="/desk/version/known"><b id="exact" title="Off">Off</b><b id="old">Bottom Bar End</b><b id="number">5</b><b id="html">Old</b><b id="long">xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx...</b><b id="empty">""</b><b id="unmatched">Other</b><span id="notbold">Off</span></a>'+
    '<a href="/desk/version/unknown"><b id="unknown">Off</b></a>'+
    '<a href="/desk/version/known"><b id="owned" data-bnd-own="1">Off</b></a>'+
    '<a class="bnd-label" href="/desk/version/known"><b id="ownedancestor">Off</b></a>'+
    '<a href="https://elsewhere.test/desk/version/known"><b id="foreign">Off</b></a>'+
    '</div></div></div><b id="outside">Off</b></main>';
  });
  const handle=await page.evaluateHandle(nativeVersionValueNodes);
  try{
   assert.deepEqual(await page.evaluate(nodes=>[...nodes].map(el=>el.id),handle),['exact','old','number','html','long','empty']);
   assert.equal(await page.locator('#exact').getAttribute('title'),'Off','classifier does not alter attribute coverage or DOM');
  }finally{await handle.dispose();}
 }finally{await browser.close();}
});
