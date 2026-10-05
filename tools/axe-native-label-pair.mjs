import assert from "node:assert/strict";
import { boundedAudit } from "./bounded-audit.mjs";

// Only native Item list/gallery row-checkbox LABEL defects use this paired
// comparison. Record growth is not a Theme regression; every other node/rule
// continues through the unchanged historical baseline.
export function assertNativeLabelPair(themed, stock) {
  assert.equal(stock.themePresent, false, "Stock control unexpectedly loaded Theme runtime");
  assert.ok(stock.blockedAssets > 0, "Stock control did not block Theme assets");
  const ids = (nodes, name, allowEmpty = false) => {
    assert.ok(Array.isArray(nodes) && (allowEmpty || nodes.length), `${name}: missing rows`);
    for (const n of nodes) {
      assert.equal(n.native, true, `${name}: non-native or unknown label target`);
      assert.equal(n.themeOwned, false, `${name}: Theme-owned control`);
      assert.ok(typeof n.identity === "string" && n.identity.trim(), `${name}: missing identity`);
    }
    const values = nodes.map(n => n.identity);
    assert.equal(new Set(values).size, values.length, `${name}: duplicate identities`);
    return values.sort();
  };
  const tr = ids(themed.rows, "Themed inventory"), sr = ids(stock.rows, "Stock inventory");
  if (themed.species === 'gallery' || stock.species === 'gallery') {
    assert.equal(themed.species, 'gallery'); assert.equal(stock.species, 'gallery');
    for (const [snapshot, rows] of [[themed,tr],[stock,sr]]) {
      assert.ok(Array.isArray(snapshot.metadata) && snapshot.metadata.length, 'Missing native gallery metadata');
      assert.ok(snapshot.metadata.every(id => typeof id === 'string' && id.trim()), 'Invalid native gallery metadata');
      assert.equal(new Set(snapshot.metadata).size, snapshot.metadata.length, 'Duplicate native gallery metadata');
      assert.deepEqual([...snapshot.metadata].sort(), rows, 'Gallery DOM differs from cur_list data');
    }
  }
  assert.deepEqual(tr, sr, "Paired scans must contain exactly the same Item rows");
  const tf = ids(themed.failures, "Themed failures", true), sf = ids(stock.failures, "Stock failures", true);
  assert.ok(tf.every(id => tr.includes(id)) && sf.every(id => sr.includes(id)), "Failure outside inventory");
  assert.deepEqual(tf, sf, "Theme changed native checkbox label failures");
}

export function captureGalleryLabels(targets) {
  if (window.cur_list?.doctype !== 'Item' || cur_list.view_name !== 'Image' || JSON.stringify(frappe.get_route()) !== JSON.stringify(['List','Item','Image'])) throw Error('Wrong native gallery route');
  const metadata=cur_list.data?.map(row=>row.name);
  const shape=el=>{
    const tile=el.closest('.image-view-item'), encoded=el.getAttribute('data-name');
    let identity=null;if(typeof encoded==="string" && encoded.trim())try{identity=decodeURIComponent(encoded);}catch{}
    let themeOwned=false;
    for(let n=el;n;n=n.parentElement){
      if([...n.attributes].some(a=>a.name.startsWith('data-bnd-'))||[...n.classList].some(c=>c.startsWith('bnd-')))themeOwned=true;
      if(n===tile)break;
    }
    const title=tile?.querySelectorAll('.image-title a'), body=tile?.querySelectorAll('.image-field');
    const native=!!tile && typeof encoded==='string' && !!encoded.trim() && identity!==null && el.matches('input.list-row-checkbox[type="checkbox"]') && el.parentElement?.parentElement?.matches('.image-view-header') && el.parentElement.parentElement.parentElement===tile && tile.querySelectorAll('input.list-row-checkbox').length===1 && title.length===1 && title[0].getAttribute('data-doctype')==='Item' && title[0].getAttribute('data-name')===identity && title[0].getAttribute('href')==='/desk/item/'+encodeURIComponent(identity) && body.length===1 && typeof body[0].getAttribute('data-name')==='string' && !!body[0].getAttribute('data-name').trim() && body[0].getAttribute('data-name')===encoded;
    return {native,themeOwned,identity};
  };
  const rows=[...document.querySelectorAll('.image-view-container .image-view-item input.list-row-checkbox')].map(shape);
  const failures=targets.map(selector=>{const els=document.querySelectorAll(selector);if(els.length!==1)throw Error('Ambiguous gallery target');return shape(els[0]);});
  return {species:'gallery',metadata,rows,failures,themePresent:!!window.bunood_theme};
}

async function snapshot(page, result, gallery = false) {
  if(gallery){
    const targets=result.violations.filter(v=>v.id==='label').flatMap(v=>v.nodes).map(node=>{
      assert.ok(node.target.length===1&&typeof node.target[0]==='string','Unknown/frame gallery label target');return node.target[0];
    });
    return page.evaluate(captureGalleryLabels,targets);
  }
  const shape = el => ({
    native: el.matches('input.list-row-checkbox[type="checkbox"]') && !!el.closest('.list-row-container'),
    themeOwned: !!el.closest('[class*="bnd-"]'),
    identity: el.getAttribute('data-name') || el.closest('[data-name]')?.getAttribute('data-name') || null,
  });
  const rows = await page.locator('.list-row-container input.list-row-checkbox[type="checkbox"]').evaluateAll(
    els => els.map(el => ({
      native: el.matches('input.list-row-checkbox[type="checkbox"]') && !!el.closest('.list-row-container'),
      themeOwned: !!el.closest('[class*="bnd-"]'),
      identity: el.getAttribute('data-name') || el.closest('[data-name]')?.getAttribute('data-name') || null,
    }))
  );
  const failures = [];
  for (const node of result.violations.filter(v => v.id === 'label').flatMap(v => v.nodes)) {
    assert.ok(node.target.length === 1 && typeof node.target[0] === 'string', 'Unknown/frame label target');
    const target = page.locator(node.target[0]);
    assert.equal(await target.count(), 1, 'Label target must resolve exactly once');
    failures.push(await target.evaluate(shape));
  }
  return { rows, failures, themePresent: await page.evaluate(() => !!window.bunood_theme) };
}

// Even an immediate close rejection leaves isolation uncertain. Stop the
// browser with the same bounded fatal cleanup used for an audit timeout.
export async function closeStockContext(context, browser, originalError, timeoutMs = 10000, cleanupMs = 10000) {
  try {
    await boundedAudit(async () => {
      try { await context.close(); }
      catch (error) { error.fatalSuite = true; throw error; }
    }, () => browser.close(), timeoutMs, cleanupMs);
  } catch (error) {
    const fatal = originalError || error;
    fatal.fatalSuite = true;
    if (originalError) fatal.cleanupError = error;
    throw fatal;
  }
}

export async function verifyItemLabelsAgainstStock({ browser, page, result, AxeBuilder }) {
  const url = new URL(page.url());
  const gallery=['/desk/item/view/image','/app/item/view/image'].includes(url.pathname);
  assert.ok(url.pathname==='/desk/item'||gallery, 'Paired exception only supports native Item list/gallery');
  return boundedAudit(async () => {
    // A separate context shares only authenticated cookies, not local storage,
    // page mutations or asset cache. No server preferences/records are changed.
    const context = await browser.newContext({ viewport: page.viewportSize(), serviceWorkers: 'block' });
    let failure;
    try {
      await context.addCookies(await page.context().cookies(url.origin));
      let blockedAssets = 0;
      await context.route('**/assets/bunood_theme/**', route => { blockedAssets++; return route.abort(); });
      const stockPage = await context.newPage();
      await stockPage.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.equal(new URL(stockPage.url()).pathname, url.pathname, 'Stock control lost authenticated route');
      await stockPage.locator(gallery?'.image-view-item .image-view-header input.list-row-checkbox':'.list-row-container input.list-row-checkbox').first().waitFor({ state: 'attached', timeout: 30000 });
      const stockResult = await new AxeBuilder({ page: stockPage }).withRules(['label']).analyze();
      const themed = await snapshot(page, result, gallery);
      const stock = { ...await snapshot(stockPage, stockResult, gallery), blockedAssets };
      assertNativeLabelPair(themed, stock);
    } catch (error) { failure = error; throw error; }
    finally {
      await closeStockContext(context, browser, failure);
    }
  }, () => browser.close());
}
