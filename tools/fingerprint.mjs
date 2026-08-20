/**
 * Structural fingerprint of every picker: the sequence of tag.class plus text
 * length and svg count. Catches what a height diff cannot — a dropped
 * thumbnail, a lost class, an element that changed nesting — which is exactly
 * how hand-porting markup fails.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Derived from this file's own location, not a hardcoded machine path, so the
// documented regeneration command runs anywhere (item 27, §4.9).
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"));
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
const shipped = JSON.parse(py(`from bunood_theme.setup import SHIPPED
print(json.dumps(SHIPPED))
`).trim().split(/\r?\n/).pop());
// E1 VOCABULARY. This said "Top Bar", which the fields no longer accept — and a
// pinned state the site cannot hold is not a baseline, it is a guess. The
// comment below is emphatic that a capture must show the pinned state; an
// illegal value is the one way to violate that without the check noticing.
const SHAPE_STATE = { ...shipped, desk_layout: "Top Bar", inbox_placement: "Top Bar End", user_placement: "Top Bar End" };
set(SHAPE_STATE);
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:1000}});
await ctx.addCookies([{name:"sid",value:sid,domain:"localhost",path:"/"}]); const page=await ctx.newPage();
// REFUSE TO CAPTURE A PAGE THAT IS NOT SHOWING THE PINNED STATE.
//
// Setting a value and navigating is not enough: the form reads its own
// document, and a capture taken before the write has propagated bakes a
// baseline that is quietly wrong — and a wrong baseline then fails CORRECT
// code, forever, which is worse than having no baseline at all. That is not
// hypothetical: the fixture committed on 2026-08-05 recorded the search
// picker with no slot selected, when the pinned state selects "Top Bar
// Center", and the drift check then reported a regression that did not exist.
//
// Reload rather than sleep longer, because the failure is a stale document
// and not a slow one.
// ?shell=0 ON PURPOSE. The shell is the default now, and it shows ONE component
// at a time — so six of the seven pickers would be in hidden panes and measure as
// nothing. The fixture records the shape of every picker, which only the stacked
// form renders all at once. This is not a fallback; it is the right surface for
// this measurement.
async function settleOnPinnedState() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${URL_BASE}/desk/theme-settings?shell=0`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".bnd-dgm-slot", { timeout: 30000 });
    await page.waitForTimeout(3500);
    const shown = await page.evaluate(() => {
      const sel = document.querySelector('[data-fieldname="search_picker"] .bnd-dgm-slot.bnd-dgm-on');
      return sel ? sel.getAttribute("data-value") : null;
    });
    if (shown === SHAPE_STATE.search_placement) return;
    console.log(`  attempt ${attempt}: form shows search "${shown}", pinned "${SHAPE_STATE.search_placement}" — reloading`);
  }
  throw new Error(
    `fingerprint: the form never settled on the pinned state. Refusing to write a ` +
      `fixture that does not match what it claims to record.`
  );
}
await settleOnPinnedState();
const fp = await page.evaluate(()=>{
  const out={};
  for (const f of ["layout_picker","sidebar_picker","crumbs_picker","palette_picker","inbox_picker","user_picker","links_picker","search_picker","status_picker",
	"list_picker","form_picker","workspace_picker","chart_picker","report_picker","views_picker","overlay_picker","empty_picker","skeleton_picker","icons_picker","placement_board"]) {
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
