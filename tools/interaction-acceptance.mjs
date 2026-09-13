/**
 * Focused live acceptance for production interaction primitives.
 *
 * Exercises a real Customer Quick Entry dialog, the shared Invoice Tools
 * disclosure, a native destructive confirmation and a late-rendered server
 * feedback message. It does not create or submit business records.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { openDesk, URL_BASE } from "./session.mjs";

const require = createRequire(import.meta.url);
const AxeBuilder = require("@axe-core/playwright").default;
const EXPECTED_ASSET = readFileSync(new URL("../bunood_theme/assets.py", import.meta.url), "utf8")
	.match(/THEME_JS = "([^"]+)"/)?.[1];

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

async function waitForDesk(page) {
	await page.waitForFunction(() => window.frappe?.boot, null, { timeout: 30000 });
	assert(EXPECTED_ASSET, "assets.py does not declare THEME_JS");
	await page.waitForFunction(expected => [...document.scripts].some(node => node.src.endsWith(expected)), EXPECTED_ASSET, { timeout: 30000 });
}

async function dialogState(page) {
	return page.evaluate(() => {
		const modal = [...document.querySelectorAll(".modal.show")].at(-1);
		const focusables = modal ? [...modal.querySelectorAll(
			'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]'
		)].filter(node => !node.disabled && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length) : [];
		return {
			present: !!modal,
			role: modal?.getAttribute("role"),
			modal: modal?.getAttribute("aria-modal"),
			labelledby: modal?.getAttribute("aria-labelledby"),
			titleId: modal?.querySelector(".modal-title")?.id || "",
			focusInside: !!modal?.contains(document.activeElement),
			focusableCount: focusables.length,
		};
	});
}

async function assertFocusLoop(page, label) {
	const count = await page.evaluate(() => {
		const modal = [...document.querySelectorAll(".modal.show")].at(-1);
		const nodes = [...modal.querySelectorAll(
			'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]'
		)].filter(node => !node.disabled && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length);
		nodes.at(-1)?.focus();
		return nodes.length;
	});
	assert(count > 0, label + " needs at least one keyboard target");
	await page.keyboard.press("Tab");
	assert(await page.evaluate(() => {
		const modal = [...document.querySelectorAll(".modal.show")].at(-1);
		const nodes = [...modal.querySelectorAll('a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]')]
			.filter(node => !node.disabled && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length);
		return document.activeElement === nodes[0];
	}), label + " Tab escaped past the final control");
	await page.keyboard.press("Shift+Tab");
	assert(await page.evaluate(() => {
		const modal = [...document.querySelectorAll(".modal.show")].at(-1);
		const nodes = [...modal.querySelectorAll('a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]')]
			.filter(node => !node.disabled && node.tabIndex >= 0 && node.getAttribute("aria-hidden") !== "true" && node.getClientRects().length);
		return document.activeElement === nodes.at(-1);
	}), label + " Shift+Tab escaped before the first control");
}

async function assertAxe(page, label, selector = ".modal.show") {
	const result = await new AxeBuilder({ page })
		.include(selector)
		.withTags(["wcag2a", "wcag2aa"])
		.analyze();
	const blocking = result.violations.filter(item => item.impact === "serious" || item.impact === "critical");
	assert(!blocking.length, label + " serious/critical Axe findings: " + JSON.stringify(blocking.map(item => ({
		id: item.id,
		impact: item.impact,
		nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })),
	}))));
	return result.violations.map(item => item.id);
}

const evidence = {};
const { page, close, errors } = await openDesk();
try {
	await page.goto(URL_BASE + "/desk/home", { waitUntil: "domcontentloaded", timeout: 60000 });
	await waitForDesk(page);

	await page.evaluate(async () => frappe.new_doc("Sales Invoice"));
	await page.waitForFunction(() => cur_frm?.doctype === "Sales Invoice" && cur_frm.doc?.__islocal && document.querySelector(".bnd-bill:not([hidden])"), null, { timeout: 30000 });

	const partyOpener = page.locator(".bnd-bill-party .bnd-bill-button").filter({ hasText: /New customer/i });
	await partyOpener.focus();
	await partyOpener.click();
	await page.locator(".modal.show").waitFor({ state: "visible", timeout: 10000 });
	const quickEntry = await dialogState(page);
	assert(quickEntry.role === "dialog" && quickEntry.modal === "true", "Quick Entry is missing modal semantics");
	assert(quickEntry.labelledby && quickEntry.labelledby === quickEntry.titleId, "Quick Entry is not labelled by its visible title: " + JSON.stringify(quickEntry));
	assert(quickEntry.focusInside, "Quick Entry did not receive focus");
	await assertFocusLoop(page, "Quick Entry");
	await page.evaluate(() => document.querySelector(".bnd-bill-tools > summary")?.focus());
	await page.waitForFunction(() => document.querySelector(".modal.show")?.contains(document.activeElement));
	const quickAxe = await assertAxe(page, "Quick Entry");
	await page.keyboard.press("Escape");
	await page.locator(".modal.show").waitFor({ state: "hidden", timeout: 10000 });
	assert(await page.evaluate(() => document.activeElement === document.querySelector(".bnd-bill-party .bnd-bill-button")), "Quick Entry did not restore focus to its opener");
	evidence.quickEntry = { ...quickEntry, axe: quickAxe };

	const toolsTrigger = page.locator(".bnd-bill-tools > summary");
	await toolsTrigger.focus();
	await page.keyboard.press("Enter");
	await page.waitForFunction(() => {
		const details = document.querySelector(".bnd-bill-tools");
		return details?.open && details.querySelector(":scope > summary")?.getAttribute("aria-expanded") === "true";
	});
	assert(await toolsTrigger.getAttribute("aria-expanded") === "true", "Invoice Tools did not expose expanded state");
	const toolButtons = page.locator(".bnd-bill-tools-body button");
	assert(await toolButtons.count() >= 5, "Invoice Tools is missing expected actions");
	assert(await page.locator(".bnd-bill-tools-body .bnd-bill-action-icon svg").count() >= 5, "Invoice Tools actions are missing semantic icons");
	await toolButtons.first().focus();
	await page.keyboard.press("Escape");
	await page.waitForFunction(() => {
		const details = document.querySelector(".bnd-bill-tools");
		return details && !details.open && details.querySelector(":scope > summary")?.getAttribute("aria-expanded") === "false";
	});
	assert(await toolsTrigger.getAttribute("aria-expanded") === "false", "Invoice Tools did not close on Escape");
	assert(await toolsTrigger.evaluate(node => document.activeElement === node), "Invoice Tools did not restore trigger focus");
	evidence.invoiceTools = { actions: await toolButtons.count(), icons: await page.locator(".bnd-bill-tools-body .bnd-bill-action-icon svg").count() };

	await toolsTrigger.focus();
	await page.evaluate(() => frappe.confirm("Delete this test draft?", () => {}));
	await page.locator(".modal.show").waitFor({ state: "visible", timeout: 10000 });
	const confirmation = await dialogState(page);
	assert(confirmation.role === "dialog" && confirmation.modal === "true", "confirmation is missing modal semantics");
	await assertFocusLoop(page, "confirmation");
	const confirmationAxe = await assertAxe(page, "confirmation");
	await page.keyboard.press("Escape");
	await page.locator(".modal.show").waitFor({ state: "hidden", timeout: 10000 });
	assert(await toolsTrigger.evaluate(node => document.activeElement === node), "confirmation did not restore opener focus");
	evidence.confirmation = { ...confirmation, axe: confirmationAxe };

	await toolsTrigger.focus();
	await page.evaluate(() => {
		frappe.msgprint({ title: "Server error", message: '<div class="bnd-server-error-probe">Request failed.</div>', indicator: "red" });
	});
	await page.locator(".modal.show").waitFor({ state: "visible", timeout: 10000 });
	await page.evaluate(() => {
		const body = document.querySelector(".modal.show .modal-body");
		const alert = document.createElement("div");
		alert.className = "alert alert-danger";
		alert.textContent = "The server could not complete this request.";
		body.append(alert);
	});
	await page.locator(".modal.show .alert").waitFor({ state: "visible", timeout: 10000 });
	const feedback = await page.locator(".modal.show .alert").evaluate(node => ({ role: node.getAttribute("role"), live: node.getAttribute("aria-live") }));
	assert(feedback.role === "alert" && feedback.live === "assertive", "late server feedback is not persistently announced");
	await assertFocusLoop(page, "server error");
	const errorAxe = await assertAxe(page, "server error");
	await page.keyboard.press("Escape");
	await page.locator(".modal.show").waitFor({ state: "hidden", timeout: 10000 });
	assert(await toolsTrigger.evaluate(node => document.activeElement === node), "server-error dialog did not restore opener focus");
	evidence.serverError = { feedback, axe: errorAxe };

	await page.evaluate(() => { cur_frm.doc.__unsaved = 0; });
	await page.goto(URL_BASE + "/desk/sales-invoice", { waitUntil: "domcontentloaded", timeout: 60000 });
	await waitForDesk(page);
	await page.waitForFunction(() => window.cur_list && document.querySelector(".page-form .filter-selector .filter-button"), null, { timeout: 30000 });
	const filterTrigger = page.locator(".page-form .filter-selector .filter-button");
	await filterTrigger.focus();
	await page.keyboard.press("Enter");
	await page.locator(".filter-popover").waitFor({ state: "visible", timeout: 10000 });
	const filterState = await page.evaluate(() => {
		const popover = [...document.querySelectorAll(".filter-popover")].find(node => node.getClientRects().length);
		const trigger = document.querySelector(".page-form .filter-selector .filter-button");
		return {
			role: popover?.getAttribute("role"),
			label: popover?.getAttribute("aria-label"),
			id: popover?.id,
			expanded: trigger?.getAttribute("aria-expanded"),
			controls: trigger?.getAttribute("aria-controls"),
			focusInside: !!popover?.contains(document.activeElement),
		};
	});
	assert(filterState.role === "dialog" && filterState.label, "filter popover is not a labelled dialog");
	assert(filterState.expanded === "true" && filterState.controls === filterState.id, "filter trigger does not expose its open popover");
	assert(filterState.focusInside, "keyboard-opened filter popover did not receive focus");
	const filterAxe = await assertAxe(page, "filters", ".filter-popover");
	await page.keyboard.press("Escape");
	await page.locator(".filter-popover").waitFor({ state: "hidden", timeout: 10000 });
	await page.waitForFunction(() => document.querySelector(".page-form .filter-selector .filter-button")?.getAttribute("aria-expanded") === "false");
	assert(await filterTrigger.evaluate(node => document.activeElement === node), "filter popover did not restore trigger focus");
	evidence.filters = { ...filterState, axe: filterAxe };

	assert(errors.length === 0, "browser errors: " + errors.join(" | "));
	console.log(JSON.stringify({ asset: EXPECTED_ASSET, errors, evidence }, null, 2));
} finally {
	await page.evaluate(() => { if (window.cur_frm?.doc?.__islocal) cur_frm.doc.__unsaved = 0; }).catch(() => {});
	await close();
}
