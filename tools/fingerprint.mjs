/**
 * Structural fingerprint of every picker: the sequence of tag.class plus text
 * length and svg count. Catches what a height diff cannot — a dropped
 * thumbnail, a lost class, an element that changed nesting — which is exactly
 * how hand-porting markup fails.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/saltedfish/Desktop/bunood-theme/package.json");
const { chromium } = require("playwright");
const SITE="demo.bunood.test", BACKEND="bunood-backend-1", URL_BASE="http://localhost:8080";
const py=(c)=>execFileSync("docker",["exec","-i",BACKEND,"bash","-lc","cd /home/frappe/frappe-bench/sites && ../env/bin/python -"],
 {input:`import frappe, json\nfrappe.init(site=${JSON.stringify(SITE)}, sites_path=".")\nfrappe.connect()\n`+c,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const sid=py(`from frappe.auth import CookieManager, LoginManager\nfrappe.local.cookie_manager=CookieManager()\nfrappe.local.form_dict=frappe._dict()\nfrappe.local.request=frappe._dict(path="/",method="GET",remote_addr="127.0.0.1",cookies=frappe._dict(),headers=frappe._dict(),environ=frappe._dict())\nfrappe.local.request_ip="127.0.0.1"\nlm=LoginManager()\nlm.login_as("Administrator")\nfrappe.db.commit()\nprint("SID="+frappe.session.sid)\n`).match(/SID=([a-f0-9]+)/)[1];
// The state the fixture is captured in — read from the app's OWN shipped
// defaults, not restated here. That matters for the sidebar picker in
// particular: its label is DERIVED by comparing all 22 sidebar_* values
// against the preset dicts, so pinning `sidebar_preset: "Bunood Night"`
// pins a label the picker then recomputes as "Custom" from whatever values
// the run left behind. One node and 22 characters of difference, on every
// run, in a picker nobody touched.
const set=(v)=>py(`vals=json.loads(${JSON.stringify(JSON.stringify(v))})
for f,x in vals.items():
    frappe.db.set_single_value("Theme Settings",f,x)
frappe.clear_cache()
frappe.db.commit()
print("ok")
`);
const shipped = JSON.parse(py(`from bunood_theme.setup import DEFAULTS, CHECK_DEFAULTS
print(json.dumps({**DEFAULTS, **CHECK_DEFAULTS}))
`).trim().split(/\r?\n/).pop());
const SHAPE_STATE = { ...shipped, desk_layout: "Top Bar", inbox_placement: "Top Bar", user_placement: "Top Bar" };
set(SHAPE_STATE);
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:1000}});
await ctx.addCookies([{name:"sid",value:sid,domain:"localhost",path:"/"}]); const page=await ctx.newPage();
await page.goto(`${URL_BASE}/desk/theme-settings`,{waitUntil:"domcontentloaded",timeout:45000});
await page.waitForSelector(".bnd-srp-slot",{timeout:30000}); await page.waitForTimeout(3500);
const fp = await page.evaluate(()=>{
  const out={};
  for (const f of ["layout_picker","sidebar_picker","crumbs_picker","palette_picker","inbox_picker","search_picker","status_picker"]) {
    const root=document.querySelector(`[data-fieldname="${f}"]`);
    if(!root){out[f]=null;continue;}
    const nodes=[];
    const walk=(el)=>{
      for (const c of el.children) {
        nodes.push(c.tagName.toLowerCase()+"."+(c.getAttribute("class")||"").trim().split(/\s+/).sort().join("."));
        walk(c);
      }
    };
    walk(root);
    out[f]={ n: nodes.length, svgs: root.querySelectorAll("svg").length,
             text: root.textContent.replace(/\s+/g," ").trim().length, seq: nodes };
  }
  return out;
});
// The fixture records the STATE it was captured in, so the check can pin
// the identical configuration instead of keeping its own copy. One fact,
// one file — the duplication this codebase keeps being bitten by.
writeFileSync(process.argv[2], JSON.stringify({ state: SHAPE_STATE, pickers: fp }, null, 1) + "\n");
for (const [k,v] of Object.entries(fp)) console.log(k.padEnd(16), v?`nodes=${v.n} svg=${v.svgs} text=${v.text}`:"ABSENT");
await b.close();
