/** Read-only live UI gate for the Statement of Account selection step. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { goto, openDesk } from "./session.mjs";

mkdirSync("artifacts/report-studio", { recursive: true });
const { page, errors, close } = await openDesk({ width: 1440, height: 900 });
try {
	await goto(page, "/desk/bnd-report-studio/account-statement", ".bnd-studio__picker", { settle: 400 });
	await page.waitForFunction(() => document.querySelectorAll(".bnd-studio__picker-item").length > 0 ||
		document.querySelector(".bnd-studio__picker-retry"), { timeout: 20000 });
	assert.equal(await page.locator(".bnd-studio__picker-retry").count(), 0, "party list failed to load");
	const initial = await page.evaluate(() => ({
		searchHeight: document.querySelector(".bnd-studio__picker .bnd-studio__search").getBoundingClientRect().height,
		pressed: [...document.querySelectorAll(".bnd-studio__picker > .bnd-studio__chips .bnd-studio__chip")]
			.filter((button) => button.getAttribute("aria-pressed") === "true").length,
		items: document.querySelectorAll(".bnd-studio__picker-item").length,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert.ok(initial.searchHeight >= 40 && initial.searchHeight <= 50, `search expanded to ${initial.searchHeight}px`);
	assert.equal(initial.pressed, 1, "party type must have one announced selection");
	assert.ok(initial.items > 0, "initial party choices missing");
	assert.ok(initial.overflow <= 1, `desktop horizontal overflow ${initial.overflow}px`);
	const companySelect = page.locator(".bnd-studio__picker select.bnd-studio__company");
	if (await companySelect.count()) {
		const options = await companySelect.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
		if (options.length > 1) {
			const original = await companySelect.inputValue();
			const other = options.find((value) => value !== original);
			await companySelect.selectOption(other);
			await page.waitForFunction((value) => document.querySelector(".bnd-studio__picker select.bnd-studio__company")?.value === value, other);
			await page.locator(".bnd-studio__picker select.bnd-studio__company").selectOption(original);
			await page.waitForFunction((value) => document.querySelector(".bnd-studio__picker select.bnd-studio__company")?.value === value, original);
			await page.waitForFunction(() => document.querySelectorAll(".bnd-studio__picker-item").length > 0);
		}
	}
	await page.screenshot({ path: "artifacts/report-studio/statement-picker-desktop.png", fullPage: false });
	const namedParty = await page.evaluate(() => {
		const item = [...document.querySelectorAll(".bnd-studio__picker-item")]
			.find((button) => button.querySelector(".bnd-studio__picker-sub"));
		if (!item) return null;
		return {
			label: item.firstElementChild?.textContent?.trim(),
			id: item.querySelector(".bnd-studio__picker-sub")?.textContent?.trim(),
		};
	});
	if (namedParty?.label && namedParty.label !== namedParty.id) {
		await page.locator(".bnd-studio__picker .bnd-studio__search").fill(namedParty.label);
		await page.waitForTimeout(220);
		await page.waitForFunction(() => !document.querySelector(".bnd-studio__picker-list")?.textContent?.includes("Loading matches"));
		assert.ok(await page.locator(".bnd-studio__picker-item").count() > 0,
			"search by display name returned no results");
		await page.locator(".bnd-studio__picker .bnd-studio__search").fill("");
	}

	const audit = await new AxeBuilder({ page }).include(".bnd-studio__picker")
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
	assert.deepEqual(audit.violations.map((entry) => entry.id), [], "picker accessibility violations");

	await page.locator(".bnd-studio__picker > .bnd-studio__chips .bnd-studio__chip").nth(1).click();
	await page.waitForFunction(() => !document.querySelector(".bnd-studio__picker-list")?.textContent?.includes("Loading matches"));
	assert.equal(await page.locator(".bnd-studio__picker-retry").count(), 0, "supplier list failed to load");
	await page.locator(".bnd-studio__picker .bnd-studio__search").fill("zzzz-no-matching-party-zzzz");
	await page.waitForTimeout(350);
	await page.waitForFunction(() => !document.querySelector(".bnd-studio__picker-list")?.textContent?.includes("Loading matches"));
	assert.equal(await page.locator(".bnd-studio__picker-retry").count(), 0, "name/ID query failed");
	assert.equal(await page.locator(".bnd-studio__picker-item").count(), 0, "nonmatching search returned rows");

	assert.deepEqual(errors, [], `browser errors: ${errors.join("; ")}`);
	console.log(`PASS statement picker desktop/search/accessibility ${JSON.stringify(initial)}`);
} finally {
	await close();
}

const mobileSession = await openDesk({ width: 390, height: 844 });
try {
	await goto(mobileSession.page, "/desk/bnd-report-studio/account-statement", ".bnd-studio__picker", { settle: 400 });
	const mobile = await mobileSession.page.evaluate(() => ({
		searchHeight: document.querySelector(".bnd-studio__picker .bnd-studio__search").getBoundingClientRect().height,
		searchTop: document.querySelector(".bnd-studio__picker .bnd-studio__search").getBoundingClientRect().top,
		overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	}));
	assert.ok(mobile.searchHeight <= 50 && mobile.searchTop < 550 && mobile.overflow <= 1,
		`mobile picker overflow/height/position: ${JSON.stringify(mobile)}`);
	await mobileSession.page.screenshot({ path: "artifacts/report-studio/statement-picker-mobile.png", fullPage: false });
	assert.deepEqual(mobileSession.errors, [], `mobile browser errors: ${mobileSession.errors.join("; ")}`);
	console.log(`PASS statement picker mobile ${JSON.stringify(mobile)}`);
} finally {
	await mobileSession.close();
}
