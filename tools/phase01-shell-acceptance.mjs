/** Business-data-read-only Phase 0/1 route and form-shell probe. Run with --assert after a fix. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { benchJson, openDesk, URL_BASE } from "./session.mjs";

const cases = [
	["home", "/desk/home", ".bnd-home-dashboard"],
	["apps", "/desk/desktop", ".desktop-wrapper"],
	["sales-invoice", "/desk/sales-invoice/new-sales-invoice-1", ".bnd-bill:visible"],
	["purchase-invoice", "/desk/purchase-invoice/new-purchase-invoice-1", ".bnd-bill:visible"],
	["quotation", "/desk/quotation/new-quotation-1", ".bnd-simple-actions:visible"],
	["payment-entry", "/desk/payment-entry/new-payment-entry-1", ".bnd-simple-actions:visible"],
];
const widths = process.argv.includes("--mobile-only") ? [390] :
	process.argv.includes("--desktop-only") ? [1440] :
	process.argv.includes("--all-widths") ? [1440, 820, 390] : [1440, 390];
if (process.argv.includes("--quotation-only")) cases.splice(0, cases.length, cases[4]);
if (process.argv.includes("--all-forms")) {
	for (const [name, slug] of [
		["sales-order", "sales-order"], ["purchase-order", "purchase-order"],
		["purchase-receipt", "purchase-receipt"], ["material-request", "material-request"],
		["stock-reconciliation", "stock-reconciliation"], ["journal-entry", "journal-entry"],
		["expense-claim", "expense-claim"], ["stock-entry", "stock-entry"],
		["delivery-note", "delivery-note"],
	]) cases.push([name, `/desk/${slug}/new-${slug}-1`, ".bnd-simple-actions:visible"]);
}
if (process.argv.includes("--saved")) {
	const saved = benchJson([
		"print(json.dumps({",
		"'sales-invoice': frappe.get_all('Sales Invoice', filters={'docstatus': 1, 'is_return': 0, 'is_pos': 0}, pluck='name', limit=1),",
		"'quotation': frappe.get_all('Quotation', filters={'docstatus': 1}, pluck='name', limit=1)",
		"}))",
	].join("\n") + "\n");
	if (saved["sales-invoice"]?.[0]) cases.push(["saved-sales-invoice", `/desk/sales-invoice/${saved["sales-invoice"][0]}`, ".bnd-bill:visible"]);
	if (saved.quotation?.[0]) cases.push(["saved-quotation", `/desk/quotation/${saved.quotation[0]}`, ".bnd-simple-actions:visible"]);
}
if (process.argv.includes("--saved-only")) cases.splice(0, cases.length, ...cases.filter(([name]) => name.startsWith("saved-")));
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice("--only=".length);
if (only) cases.splice(0, cases.length, ...cases.filter(([name]) => name === only));
const enforce = process.argv.includes("--assert");
const captureDir = process.argv.includes("--screenshots") ?
	(process.env.BND_PHASE01_CAPTURE_DIR || join(process.cwd(), "artifacts", "phase01-shell")) : "";
const session = await openDesk();
const { page, errors } = session;
const results = [];

await page.addInitScript(() => {
	window.__bndPhase01NativeFrames = 0;
	window.__bndPhase01SampleFrames = 0;
	window.__bndPhase01NativeSamples = [];
	const start = performance.now();
	function sample() {
		if (performance.now() - start > 15000) return;
		const route = document.body?.getAttribute("data-route") || "";
		const native = document.querySelector(".page-container:not([style*='display: none']) .form-layout");
		const replacement = document.querySelector(".page-container:not([style*='display: none']) .bnd-bill:not([hidden]), .page-container:not([style*='display: none']) .bnd-simple-composer:not([hidden])");
		if (/^Form\/(Sales Invoice|Purchase Invoice|Quotation|Sales Order|Purchase Order|Purchase Receipt|Material Request|Stock Reconciliation|Payment Entry|Journal Entry|Expense Claim|Stock Entry|Delivery Note)\//u.test(route) && native) {
			window.__bndPhase01SampleFrames++;
			const style = getComputedStyle(native);
			if (!replacement && style.display !== "none" && style.visibility !== "hidden" && native.getClientRects().length) {
				window.__bndPhase01NativeFrames++;
				window.__bndPhase01NativeSamples.push({ route, theme: document.documentElement.getAttribute("data-theme"), bunood: document.documentElement.classList.contains("bunood"), pageClass: native.closest(".page-container")?.className || "", visibility: style.visibility, animation: style.animationName, delay: style.animationDelay });
			}
		}
		requestAnimationFrame(sample);
	}
	requestAnimationFrame(sample);
});

function snapshot() {
	const visible = node => !!node && node.getClientRects().length > 0 &&
		getComputedStyle(node).display !== "none" && getComputedStyle(node).visibility !== "hidden";
	const main = document.querySelector(".main-section");
	const page = [...document.querySelectorAll(".page-container")].find(visible);
	const head = page?.querySelector(".page-head");
	const global = document.querySelector(".main-section > header .bnd-topbar");
	const bar = [...(page?.querySelectorAll(".bnd-bill-toolbar, .bnd-simple-actions, .bnd-form-actionbar") || [])].find(visible);
	const invoiceIntro = bar?.matches(".bnd-bill-toolbar") ? bar.closest(".bnd-bill-intro") : null;
	const paintedBar = invoiceIntro && getComputedStyle(invoiceIntro).display !== "contents" ? invoiceIntro : bar;
	const fullContentScrollers = [...document.querySelectorAll("*")].filter(node => {
		const style = getComputedStyle(node), rect = node.getBoundingClientRect();
		return visible(node) && ["auto", "scroll"].includes(style.overflowY) && node.scrollHeight - node.clientHeight > 3 &&
			rect.width > 30 && rect.height > innerHeight * 0.7 && rect.right > 0 && rect.left < innerWidth &&
			main && rect.left <= main.getBoundingClientRect().left + 40 && rect.right >= main.getBoundingClientRect().right - 40;
	});
	const anchor = Math.max(main?.getBoundingClientRect().top || 0,
		visible(head) ? head.getBoundingClientRect().bottom : 0,
		visible(global) ? global.getBoundingClientRect().bottom : 0);
	return {
		path: location.pathname,
		route: document.body?.getAttribute("data-route") || "",
		mainOverflow: main && getComputedStyle(main).overflowY,
		mainScrollTop: main?.scrollTop || 0,
		rootOverflowPx: document.documentElement.scrollHeight - document.documentElement.clientHeight,
		rootOverflowDiagnostics: document.documentElement.scrollHeight - document.documentElement.clientHeight > 1 ? {
			html: [document.documentElement.clientHeight, document.documentElement.scrollHeight, getComputedStyle(document.documentElement).overflowY],
			body: [document.body.clientHeight, document.body.scrollHeight, getComputedStyle(document.body).overflowY],
			main: main && [main.getBoundingClientRect().top, main.getBoundingClientRect().bottom, main.clientHeight, main.scrollHeight],
			bodyChildren: [...document.body.children].map(node => ({ tag: node.tagName, cls: node.className?.baseVal || node.className, bottom: Math.round(node.getBoundingClientRect().bottom), scrollHeight: node.scrollHeight, overflow: getComputedStyle(node).overflowY })).filter(node => node.bottom > innerHeight || node.scrollHeight > innerHeight).slice(0, 15),
			outliers: [...document.querySelectorAll("body *")].filter(node => {
				const style = getComputedStyle(node);
				return node.getBoundingClientRect().bottom > innerHeight + 1 &&
					(!node.closest(".main-section") || ["absolute", "fixed", "sticky"].includes(style.position));
			}).slice(0, 20).map(node => ({ tag: node.tagName, cls: String(node.className?.baseVal || node.className).slice(0, 120), pos: getComputedStyle(node).position, bottom: Math.round(node.getBoundingClientRect().bottom), parent: String(node.parentElement?.className?.baseVal || node.parentElement?.className).slice(0, 80) })),
		} : null,
		horizontalOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
		contentScrollers: fullContentScrollers.length,
		barCount: [...(page?.querySelectorAll(".bnd-bill-toolbar, .bnd-simple-actions, .bnd-form-actionbar") || [])].filter(visible).length,
		barOverflowPx: bar ? bar.scrollWidth - bar.clientWidth : 0,
		barGapPx: paintedBar ? Math.round(paintedBar.getBoundingClientRect().top - anchor) : null,
		barAncestry: paintedBar && Math.round(paintedBar.getBoundingClientRect().top - anchor) > 2 ?
			[bar, bar?.parentElement, bar?.parentElement?.parentElement, bar?.parentElement?.parentElement?.parentElement].filter(Boolean).map(node => ({
				cls: node.className, top: Math.round(node.getBoundingClientRect().top), bottom: Math.round(node.getBoundingClientRect().bottom),
				position: getComputedStyle(node).position, background: getComputedStyle(node).backgroundColor,
			})) : null,
		cssPaths: [...document.querySelectorAll('link[href*="bunood_theme/dist/css/"]')].map(node => node.getAttribute("href")),
		nativeFrames: window.__bndPhase01NativeFrames || 0,
		nativeSamples: window.__bndPhase01NativeSamples || [],
		sampledFrames: window.__bndPhase01SampleFrames || 0,
	};
}

try {
	if (captureDir) await mkdir(captureDir, { recursive: true });
	for (const width of widths) {
		await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
		for (const [name, path, selector] of cases) {
			const started = Date.now();
			await page.goto(`${URL_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
			await page.locator(selector).first().waitFor({ timeout: 60000 });
			const readyMs = Date.now() - started;
			const before = await page.evaluate(snapshot);
			if (captureDir) await page.screenshot({ path: join(captureDir, `${name}-${width}.png`), fullPage: false });
			await page.locator(".main-section").evaluate(node => { node.scrollTop = 600; });
			await page.waitForTimeout(150);
			const after = await page.evaluate(snapshot);
			const result = { name, width, readyMs, before, after };
			results.push(result);
			if (enforce) {
				if (name === "home") assert.equal(after.route, "Workspaces/Home", `${name}/${width}: Home resolved to another page`);
				if (name === "apps") assert.equal(after.route, "desktop", `${name}/${width}: All Apps resolved to another page`);
				assert.ok(after.rootOverflowPx <= 1, `${name}/${width}: root scrollbar`);
				assert.ok(after.horizontalOverflowPx <= 1, `${name}/${width}: horizontal overflow`);
				if (name !== "apps") assert.equal(after.contentScrollers, 1, `${name}/${width}: content scrollbars`);
				const barReachedAnchor = after.barCount && before.barGapPx != null &&
					after.mainScrollTop - before.mainScrollTop >= before.barGapPx - 2;
				if (barReachedAnchor) assert.ok(after.barGapPx <= 2, `${name}/${width}: visible gap above anchored bar (${after.barGapPx}px)`);
				if (name !== "home" && name !== "apps") {
					assert.equal(after.barCount, 1, `${name}/${width}: duplicate or missing action bar`);
					assert.ok(after.barOverflowPx <= 1, `${name}/${width}: action bar clips ${after.barOverflowPx}px of controls`);
					assert.equal(after.nativeFrames, 0, `${name}/${width}: native form flashed before workbench`);
				}
				if (name === "saved-sales-invoice") {
					await page.locator(".bnd-bill-action-group-commit .bnd-bill-action-print").waitFor({ state: "attached", timeout: 10000 });
					await page.locator(".bnd-dochead-tiles").waitFor({ state: "attached", timeout: 10000 });
					const visual = await page.evaluate(() => ({
						printColor: getComputedStyle(document.querySelector(".bnd-bill-action-group-commit .bnd-bill-action-print")).color,
						tilesDisplay: getComputedStyle(document.querySelector(".bnd-dochead-tiles")).display,
						activityVisible: !!document.querySelector(".bnd-dochead-actions button")?.getClientRects().length,
					}));
					assert.equal(visual.printColor, "rgb(255, 255, 255)", `${name}/${width}: Print is illegible on the green action bar`);
					assert.equal(visual.tilesDisplay, "none", `${name}/${width}: duplicate document summary crowds the invoice`);
					assert.ok(visual.activityVisible, `${name}/${width}: Activity was lost when the duplicate heading collapsed`);
				}
				if (width === 1440 && ["sales-invoice", "quotation"].includes(name)) {
					const switcher = name === "sales-invoice" ? ".bnd-bill-mode button" : ".bnd-simple-switch button";
					await page.locator(switcher).nth(1).click();
					const advanced = await page.evaluate(() => {
						const layout = document.querySelector(".page-container .form-layout");
						return layout && layout.getClientRects().length > 0 && getComputedStyle(layout).visibility === "visible" && getComputedStyle(layout).display !== "none";
					});
					assert.equal(advanced, true, `${name}/${width}: Advanced mode did not restore the native form`);
					await page.locator(switcher).first().click();
					assert.equal((await page.evaluate(snapshot)).barCount, 1, `${name}/${width}: Simple mode did not restore its action bar`);
				}
			}
		}
	}
	if (enforce) assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);
	console.log(JSON.stringify(process.argv.includes("--compact") ? {
		results: results.map(({ name, width, readyMs, after }) => ({
			name, width, readyMs, route: after.route, rootOverflowPx: after.rootOverflowPx,
			rootOverflowDiagnostics: after.rootOverflowDiagnostics,
			horizontalOverflowPx: after.horizontalOverflowPx, contentScrollers: after.contentScrollers,
			barCount: after.barCount, barGapPx: after.barGapPx, nativeFrames: after.nativeFrames,
			barOverflowPx: after.barOverflowPx,
			barAncestry: after.barAncestry,
			cssPaths: after.cssPaths,
		})), errors,
	} : { results, errors }, null, 2));
} finally {
	await session.close();
}
