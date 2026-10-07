/**
 * Focused rendered gate for the six Bunood system states and Apps icons.
 *
 * This intentionally does not run the release smoke suite. It mounts the real
 * shipped component inside an authenticated Desk, exercises its keyboard
 * actions across language direction, color mode and three production widths,
 * then verifies every visible Apps tile owns a resolved sprite icon.
 */

import { createRequire } from "node:module";
import { openDesk, URL_BASE } from "./session.mjs";

const require = createRequire(import.meta.url);
const AxeBuilder = require("@axe-core/playwright").default;

const VARIANTS = [
	"loading",
	"configured-empty",
	"setup-incomplete",
	"permission-denied",
	"recoverable-error",
	"offline-delayed-integration",
];
const LANGUAGES = [
	{ lang: "en", dir: "ltr" },
	{ lang: "ar", dir: "rtl" },
];
const MODES = ["light", "dark"];
const WIDTHS = [1440, 1024, 430];

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function axeBlocking(page, selector) {
	const result = await new AxeBuilder({ page })
		.include(selector)
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	return result.violations.filter(item => item.impact === "serious" || item.impact === "critical");
}

async function waitForTheme(page) {
	await page.waitForFunction(() => window.frappe?.boot && window.bunood_theme?.system_state?.create, null, { timeout: 30000 });
}

async function mountGallery(page, locale) {
	await page.evaluate(({ variants, locale }) => {
		const html = document.documentElement;
		html.lang = locale.lang;
		html.dir = locale.dir;
		document.querySelector("[data-bnd-state-acceptance]")?.remove();
		const gallery = document.createElement("main");
		gallery.dataset.bndStateAcceptance = "";
		gallery.style.cssText = "display:grid;gap:16px;padding:24px;max-width:1180px;margin-inline:auto";
		const ar = locale.lang === "ar";
		const copy = {
			loading: [ar ? "جارٍ التحميل" : "Loading", ar ? "يرجى الانتظار." : "Please wait."],
			"configured-empty": [ar ? "لا توجد سجلات" : "No records yet", ar ? "ابدأ بإضافة أول سجل." : "Create the first record to get started."],
			"setup-incomplete": [ar ? "يلزم إكمال الإعداد" : "Setup required", ar ? "أكمل إعدادات الشركة للمتابعة." : "Complete company settings to continue."],
			"permission-denied": [ar ? "يلزم الحصول على صلاحية" : "Access required", ar ? "اطلب الصلاحية من مدير النظام." : "Ask a system manager for access."],
			"recoverable-error": [ar ? "تعذّر تحميل البيانات" : "Could not load data", ar ? "تحقق من الاتصال ثم حاول مرة أخرى." : "Check your connection and try again."],
			"offline-delayed-integration": [ar ? "التحديثات متأخرة" : "Updates are delayed", ar ? "يمكنك متابعة العمل وستتم المزامنة تلقائياً." : "You can keep working; synchronization will resume automatically."],
		};
		for (const kind of variants) {
			let mounted = null;
			const action = kind === "loading" ? null : {
				label: ar ? "متابعة" : "Continue",
				icon: kind === "configured-empty" ? "icon-plus" : "icon-refresh-cw",
				run: () => { mounted.dataset.bndActionRan = "true"; },
			};
			mounted = window.bunood_theme.system_state.create({
				kind, title: copy[kind][0], message: copy[kind][1], heading: true, action,
			});
			gallery.appendChild(mounted);
		}
		(document.querySelector(".layout-main-section") || document.body).appendChild(gallery);
	}, { variants: VARIANTS, locale });
}

const evidence = { states: [], apps: [] };
const { page, close, errors } = await openDesk({ width: 1440, height: 900 });
try {
	await page.goto(URL_BASE + "/desk/home", { waitUntil: "domcontentloaded", timeout: 60000 });
	await waitForTheme(page);

	for (const locale of LANGUAGES) {
		for (const mode of MODES) {
			for (const width of WIDTHS) {
				await page.setViewportSize({ width, height: 900 });
				await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), mode);
				await mountGallery(page, locale);
				const snapshot = await page.evaluate(variants => {
					const gallery = document.querySelector("[data-bnd-state-acceptance]");
					const rows = [...gallery.querySelectorAll(":scope > [data-bnd-state]")].map(node => {
						const use = node.querySelector(".bnd-system-state__icon use");
						const action = node.querySelectorAll(":scope > .bnd-system-state__action");
						const box = node.getBoundingClientRect();
						return {
							kind: node.dataset.bndState,
							role: node.getAttribute("role"),
							live: node.getAttribute("aria-live"),
							busy: node.getAttribute("aria-busy"),
							title: node.querySelector(".bnd-system-state__title")?.textContent.trim(),
							message: node.querySelector(".bnd-system-state__message")?.textContent.trim(),
							actions: action.length,
							href: use?.getAttribute("href") || "",
							resolved: !!(use && document.querySelector(use.getAttribute("href"))),
							withinViewport: box.left >= -1 && box.right <= innerWidth + 1,
						};
					});
					return {
						rows,
						direction: getComputedStyle(gallery).direction,
						overflow: gallery.scrollWidth > gallery.clientWidth + 1,
						order: rows.map(row => row.kind),
						expected: variants,
					};
				}, VARIANTS);
				assert(snapshot.rows.length === 6, `${locale.lang}/${mode}/${width}: state count ${snapshot.rows.length}`);
				assert(JSON.stringify(snapshot.order) === JSON.stringify(VARIANTS), `${locale.lang}/${mode}/${width}: state order changed`);
				assert(snapshot.direction === locale.dir, `${locale.lang}/${mode}/${width}: direction ${snapshot.direction}`);
				assert(!snapshot.overflow, `${locale.lang}/${mode}/${width}: gallery overflow`);
				for (const row of snapshot.rows) {
					assert(row.title && row.message, `${locale.lang}/${mode}/${width}/${row.kind}: missing copy`);
					assert(row.resolved, `${locale.lang}/${mode}/${width}/${row.kind}: unresolved icon ${row.href}`);
					assert(row.withinViewport, `${locale.lang}/${mode}/${width}/${row.kind}: outside viewport`);
					assert(row.actions === (row.kind === "loading" ? 0 : 1), `${locale.lang}/${mode}/${width}/${row.kind}: action count ${row.actions}`);
					assert(row.busy === (row.kind === "loading" ? "true" : null), `${locale.lang}/${mode}/${width}/${row.kind}: busy semantics`);
					assert(row.role === (["permission-denied", "recoverable-error"].includes(row.kind) ? "alert" : "status"), `${locale.lang}/${mode}/${width}/${row.kind}: role ${row.role}`);
				}

				for (const kind of VARIANTS.filter(value => value !== "loading")) {
					const action = page.locator(`[data-bnd-state="${kind}"] > .bnd-system-state__action`);
					await action.focus();
					await page.keyboard.press("Enter");
					await page.waitForFunction(value => document.querySelector(`[data-bnd-state="${value}"]`)?.dataset.bndActionRan === "true", kind);
				}
				const blocking = await axeBlocking(page, "[data-bnd-state-acceptance]");
				assert(!blocking.length, `${locale.lang}/${mode}/${width}: Axe ${JSON.stringify(blocking.map(v => v.id))}`);
				evidence.states.push({ lang: locale.lang, mode, width, states: 6, blockingAxe: 0 });
			}
		}
	}

	await page.goto(URL_BASE + "/desk/desktop", { waitUntil: "domcontentloaded", timeout: 60000 });
	await waitForTheme(page);
	await page.waitForSelector(".desktop-icon > .icon-container > .bnd-deskicon", { timeout: 30000 });
	for (const locale of LANGUAGES) {
		for (const width of [1440, 430]) {
			await page.setViewportSize({ width, height: 900 });
			await page.evaluate(locale => {
				document.documentElement.lang = locale.lang;
				document.documentElement.dir = locale.dir;
			}, locale);
			const apps = await page.evaluate(() => [...document.querySelectorAll(".desktop-icon")]
				.filter(tile => tile.getClientRects().length)
				.map(tile => {
					const icon = tile.querySelector(":scope > .icon-container > .bnd-deskicon");
					const use = icon?.querySelector("use");
					return {
						label: tile.querySelector(".icon-title")?.textContent.trim() || tile.dataset.id,
						icon: !!icon,
						href: use?.getAttribute("href") || "",
						resolved: !!(use && document.querySelector(use.getAttribute("href"))),
						letterFallback: !!tile.querySelector(".bnd-sb-letter"),
					};
				}));
			assert(apps.length >= 10, `${locale.lang}/${width}: expected application grid, got ${apps.length}`);
			const bad = apps.filter(app => !app.icon || !app.resolved || app.letterFallback);
			assert(!bad.length, `${locale.lang}/${width}: missing/letter app icons ${JSON.stringify(bad)}`);
			evidence.apps.push({ lang: locale.lang, width, applications: apps.length, missing: 0, letters: 0 });
		}
	}

	assert(!errors.length, "browser errors: " + JSON.stringify(errors));
	console.log(JSON.stringify(evidence, null, 2));
} finally {
	await close();
}
