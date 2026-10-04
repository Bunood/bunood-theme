import {test} from "node:test";
import assert from "node:assert/strict";
import {boundedAudit} from "../tools/bounded-audit.mjs";
test("audit preserves findings", async()=>{
 const findings={violations:[{id:"contrast"}]};
 assert.equal(await boundedAudit(()=>findings,()=>assert.fail("must not close")),findings);
});
test("ordinary audit failure remains visible",async()=>{
 await assert.rejects(boundedAudit(()=>Promise.reject(Error("broken scan")),()=>assert.fail("not timeout")),/broken scan/);
});
test("deadline closes browser and joins canceled evaluation before fatal failure",async()=>{
 let rejectScan; let joined=false; let stopped=false;
 const scan=new Promise((_,reject)=>{rejectScan=reject;}).finally(()=>{joined=true;});
 await assert.rejects(boundedAudit(()=>scan,async()=>{stopped=true;rejectScan(Error("browser closed"));},10),error=>{
  assert.equal(stopped,true); assert.equal(joined,true); assert.equal(error.fatalSuite,true); return true;
 });
});
