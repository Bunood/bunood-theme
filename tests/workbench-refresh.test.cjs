const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
  const timers = new Map(), handlers = {}; let id = 0, refreshed = 0, release;
  const ajax = new Promise(resolve => { release = resolve; });
  const c = { window: {bunood_theme:{}}, document:{}, __:s=>s,
    $:()=>({on(){}}), setTimeout:f=>{timers.set(++id,f);return id;}, clearTimeout:n=>timers.delete(n),
    frappe:{after_ajax:()=>ajax, ui:{form:{on:(dt,h)=>handlers[dt]=h}}} };
  vm.runInNewContext(fs.readFileSync('bunood_theme/public/js/simple_forms.js','utf8').replace(
    'api.simple_forms = { mount,', 'api.simple_forms = { controllers, scheduleWorkbenchRefresh, mount,'),c);
  const api=c.window.bunood_theme.simple_forms, frm={doc:{name:'STOCK-TEST'}};
  c.window.cur_frm=frm;
  api.controllers.set(frm,{workbench:{},refresh(){refreshed++;}});
  return {c,api,frm,handlers,timers,release,refreshed:()=>refreshed,
    run(){const jobs=[...timers.values()];timers.clear();jobs.forEach(f=>f());}};
}
test('stock and delivery native handlers schedule presentation without returning an AJAX wait', async()=>{
  const f=fixture();
  assert.equal(f.handlers['Stock Entry'].purpose(f.frm),undefined);
  f.run(); assert.equal(f.refreshed(),0);
  f.release(); await Promise.resolve(); assert.equal(f.refreshed(),1);
  assert.equal(f.handlers['Stock Entry Detail'].qty,f.api.scheduleWorkbenchRefresh);
  assert.equal(f.handlers['Delivery Note Item'].items_remove,f.api.scheduleWorkbenchRefresh);
});
test('a burst of native changes coalesces and supersedes a timer already awaiting AJAX', async()=>{
  const f=fixture();
  f.api.scheduleWorkbenchRefresh(f.frm); f.run();
  f.api.scheduleWorkbenchRefresh(f.frm); f.api.scheduleWorkbenchRefresh(f.frm);
  assert.equal(f.timers.size,1); f.run(); f.release(); await Promise.resolve();
  assert.equal(f.refreshed(),1);
});
test('navigation and replacement documents reject late presentation refresh',async()=>{
  for(const change of [f=>{f.c.window.cur_frm={};},f=>{f.frm.doc={name:'REPLACEMENT'};}]) {
    const f=fixture(); f.api.scheduleWorkbenchRefresh(f.frm); f.run(); change(f);
    f.release(); await Promise.resolve(); assert.equal(f.refreshed(),0);
  }
});
test('ordinary generic forms and unmounted controllers never schedule work',()=>{
  const f=fixture(); f.api.controllers.set(f.frm,{refresh(){throw Error('unexpected');}});
  f.api.scheduleWorkbenchRefresh(f.frm); f.api.scheduleWorkbenchRefresh({doc:{}});
  assert.equal(f.timers.size,0);
});
