const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const source=fs.readFileSync('bunood_theme/public/js/bunood.js','utf8');
 const block=source.match(/\/\/ Native form ownership bridge\.[\s\S]*?\/\/ End native form ownership bridge\./)?.[0];
 assert.ok(block,'native form ownership bridge must be exported');
 const attrs={};let connected=true,active=true,visible=true,route=['Form','Lease','new-lease-test'];
 const node={getClientRects:()=>visible?[{}]:[]};
 const wrapper={get isConnected(){return connected},matches:()=>active,querySelector:()=>node};
 const callbacks=[],frames=[];const bunood={};const window={cur_frm:{doctype:'Lease',doc:{name:'new-lease-test'},$wrapper:[wrapper]}};
 const document={documentElement:{getAttribute:key=>attrs[key],setAttribute:(key,value)=>attrs[key]=value,removeAttribute:key=>delete attrs[key]}};
 vm.runInNewContext(source.match(/function bnd_own\(token\) \{[\s\S]*?\n\t\}/)[0]+source.match(/function bnd_disown\(token\) \{[\s\S]*?\n\t\}/)[0]+block,{bunood,window,document,requestAnimationFrame:fn=>frames.push(fn),frappe:{get_route:()=>route,router:{on:(event,fn)=>{if(event==='change')callbacks.push(fn);}}}});
 return {bunood,attrs,frame:()=>frames.splice(0).forEach(fn=>fn()),change:()=>callbacks.forEach(fn=>fn()),set:values=>{if('connected'in values)connected=values.connected;if('active'in values)active=values.active;if('visible'in values)visible=values.visible;if('route'in values)route=values.route;}};
}
test('a cached visible Simple form reclaims after native render-before-change routing',()=>{
 const s=setup();s.attrs['data-bnd-own']='bell';s.bunood.claim_native('salesbill');
 s.change();s.frame();assert.ok(s.attrs['data-bnd-own'].split(' ').includes('salesbill'));
 s.set({route:['Form','ToDo','TODO-001']});s.change();s.frame();assert.equal(s.attrs['data-bnd-own'],'bell');
 s.set({route:['Form','Lease','new-lease-test'],active:false});s.change();s.frame();assert.equal(s.attrs['data-bnd-own'],'bell');
});
test('leaving a Simple form releases its global ownership and returning can reclaim',()=>{
 const s=setup();s.attrs['data-bnd-own']='bell';s.bunood.claim_native('salesbill');s.bunood.claim_native('simpleform');
 s.set({route:['Form','ToDo','TODO-001']});s.change();assert.equal(s.attrs['data-bnd-own'],'bell');
 s.set({route:['Form','Lease','new-lease-test']});s.bunood.claim_native('simpleform');assert.equal(s.attrs['data-bnd-own'],'bell simpleform');
 s.bunood.release_native('simpleform');assert.equal(s.attrs['data-bnd-own'],'bell');
});
test('only an active mounted current native Form can claim its owned replacement',()=>{
 const s=setup();s.bunood.claim_native('simpleform');assert.equal(s.attrs['data-bnd-own'],'simpleform');
 s.bunood.release_native('simpleform');assert.equal(s.attrs['data-bnd-own'],undefined);
 for(const invalid of [{connected:false},{active:false},{visible:false},{route:['List','Lease']},{route:['Form','Item','new-lease-test']},{route:['Form','Lease','different-lease']}]){
  const p=setup();p.set(invalid);p.bunood.claim_native('simpleform');assert.equal(p.attrs['data-bnd-own'],undefined);
 }
});
test('form exports cannot claim or release unrelated native affordances',()=>{
 const s=setup();s.attrs['data-bnd-own']='bell';for(const token of ['drawer','__proto__','constructor','bell',['simpleform'],{toString:()=> 'salesbill'}]){s.bunood.claim_native(token);assert.equal(s.attrs['data-bnd-own'],'bell');s.bunood.release_native(token);}assert.equal(s.attrs['data-bnd-own'],'bell');
 s.bunood.claim_native('salesbill');assert.equal(s.attrs['data-bnd-own'],'bell salesbill');s.bunood.release_native('salesbill');assert.equal(s.attrs['data-bnd-own'],'bell');
});
