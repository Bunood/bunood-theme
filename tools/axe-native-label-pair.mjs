import assert from "node:assert/strict";
import { boundedAudit } from "./bounded-audit.mjs";

// Only /desk/item's native row-checkbox LABEL defects may use this paired
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
  assert.deepEqual(tr, sr, "Paired scans must contain exactly the same Item rows");
  const tf = ids(themed.failures, "Themed failures", true), sf = ids(stock.failures, "Stock failures", true);
  assert.ok(tf.every(id => tr.includes(id)) && sf.every(id => sr.includes(id)), "Failure outside inventory");
  assert.deepEqual(tf, sf, "Theme changed native checkbox label failures");
}

async function snapshot(page, result) {
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

export async function verifyItemLabelsAgainstStock({ browser, page, result, AxeBuilder }) {
  const url = new URL(page.url());
  assert.equal(url.pathname, '/desk/item', 'Paired exception only supports Item list');
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
      assert.equal(new URL(stockPage.url()).pathname, '/desk/item', 'Stock control lost authenticated route');
      await stockPage.locator('.list-row-container input.list-row-checkbox').first().waitFor({ state: 'attached', timeout: 30000 });
      const stockResult = await new AxeBuilder({ page: stockPage }).withRules(['label']).analyze();
      const themed = await snapshot(page, result);
      const stock = { ...await snapshot(stockPage, stockResult), blockedAssets };
      assertNativeLabelPair(themed, stock);
    } catch (error) { failure = error; throw error; }
    finally {
      try { await boundedAudit(() => context.close(), () => browser.close(), 10000); }
      catch (error) {
        if (failure) { failure.fatalSuite = true; failure.cleanupError = error; throw failure; }
        throw error;
      }
    }
  }, () => browser.close());
}
