/** Enter native form mode through the same Advanced control a user operates.
 * Shared by baseline capture and enforcement so they audit identical DOM.
 * This changes only the current browser document, never site preferences.
 */
export async function ensureAdvancedForm(page) {
 await page.waitForSelector('.form-layout', { state: 'attached', timeout: 30000 });
 await page.waitForFunction(() => !!window.cur_frm?.$wrapper?.[0]?.querySelector('.bnd-simple-switch button:nth-child(2)'), undefined, { timeout: 30000 });
 await page.evaluate(() => {
  const advanced = window.cur_frm.$wrapper[0].querySelector('.bnd-simple-switch button:nth-child(2)');
  if (advanced.getAttribute('aria-pressed') !== 'true') advanced.click();
 });
 await page.waitForFunction(() => window.cur_frm?.$wrapper?.[0]?.querySelector('.bnd-simple-switch button:nth-child(2)')?.getAttribute('aria-pressed') === 'true', undefined, { timeout: 30000 });
}
