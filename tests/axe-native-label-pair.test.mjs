import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeLabelPair, closeStockContext } from '../tools/axe-native-label-pair.mjs';
const node = identity => ({identity,native:true,themeOwned:false});
const sample = () => ({rows:['a','b'].map(node), failures:['a','b'].map(node),themePresent:false,blockedAssets:2});
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
