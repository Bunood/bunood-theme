/** Audit the exact inert print specimen outside its script-forbidden iframe.
 * The iframe sandbox stays untouched. CSP keeps document scripts disabled on
 * this intercepted page; Playwright injects only the audit through its driver.
 */
export async function scanPrintPreview(AxeBuilder, page, tags, disabledRules = []) {
  const frame = page.locator(".bnd-prp-frame");
  if (!await frame.count()) return null;
  const html = await frame.first().getAttribute("srcdoc");
  if (!html?.trim()) throw new Error("Print specimen is empty; accessibility coverage cannot run");
  const preview = await page.context().newPage();
  try {
    const url = new URL("/__bunood_axe_print_specimen", page.url()).href;
    await preview.route(url, route => route.fulfill({
      contentType: "text/html", body: html,
      headers: {"Content-Security-Policy": "script-src 'none'; object-src 'none'"},
    }));
    await preview.goto(url, {waitUntil: "load"});
    let builder = new AxeBuilder({page: preview}).withTags(tags);
    if (disabledRules.length) builder = builder.disableRules(disabledRules);
    return await builder.analyze();
  } finally { await preview.close(); }
}
