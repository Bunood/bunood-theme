import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.BND_URL || "http://127.0.0.1:8100";
const screenshots = "artifacts/login-pilot";
mkdirSync(screenshots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
	for (const variant of [
		{ name: "en-light", width: 1440, height: 900, colorScheme: "light", lang: "en" },
		{ name: "en-dark", width: 1440, height: 900, colorScheme: "dark", lang: "en" },
		{ name: "en-compact", width: 1024, height: 768, colorScheme: "light", lang: "en" },
		{ name: "ar-desktop", width: 1440, height: 900, colorScheme: "light", lang: "ar" },
		{ name: "ar-tablet", width: 820, height: 900, colorScheme: "light", lang: "ar" },
		{ name: "ar-mobile", width: 390, height: 844, colorScheme: "light", lang: "ar" },
	]) {
		const page = await browser.newPage({
			viewport: { width: variant.width, height: variant.height },
			colorScheme: variant.colorScheme,
		});
		await page.goto(`${base}/login?redirect-to=%2Fdesk%2Fhome&_lang=${variant.lang}`);
		await page.waitForSelector("body.bnd-auth-split .page-card .btn-login");
		const state = await page.evaluate(() => {
			const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
			return {
				dir: document.documentElement.dir,
				overflow: document.documentElement.scrollWidth > window.innerWidth,
				titleColor: getComputedStyle(document.querySelector(".page-card-head h4")).color,
				form: box(".page-card"),
				hero: box(".bnd-auth-hero"),
				workAreas: document.querySelectorAll(".bnd-auth-work-area").length,
				workVisuals: document.querySelectorAll(".bnd-auth-work-area .bnd-auth-work-visual svg").length,
				workCaptions: [...document.querySelectorAll(".bnd-auth-work-caption span")].map((node) => node.textContent.trim()),
				credentialFields: ["#login_email", "#login_password", "#forgot_email", "#login_with_email_link_email"].map((selector) => {
					const style = getComputedStyle(document.querySelector(selector));
					return { direction: style.direction, align: style.textAlign };
				}),
				heading: document.querySelector(".for-login .page-card-head h4")?.textContent?.trim(),
				button: box(".page-card .btn-login"),
				forgot: !!document.querySelector('.page-card a[href="#forgot"]'),
				emailLink: !!document.querySelector(".page-card .btn-login-option"),
			};
		});
		assert.equal(state.dir, variant.lang === "ar" ? "rtl" : "ltr", `${variant.name}: direction`);
		assert.equal(state.overflow, false, `${variant.name}: no horizontal overflow`);
		assert.equal(state.titleColor, "rgb(27, 48, 39)", `${variant.name}: legible heading in both OS modes`);
		assert.match(state.heading || "", variant.lang === "ar" ? /بنود/ : /Bunood/, `${variant.name}: purpose-built sign-in heading`);
		assert.equal(state.workAreas, 4, `${variant.name}: real work areas replace generic mockup`);
		assert.equal(state.workVisuals, 4, `${variant.name}: transaction workflow illustration is complete`);
		assert.deepEqual(state.credentialFields,
			Array.from({ length: 4 }, () => ({ direction: "ltr", align: variant.lang === "ar" ? "end" : "start" })),
			`${variant.name}: credential direction and alignment`);
		if (variant.lang === "ar") assert.ok(state.workCaptions.every((caption) => !/[A-Za-z]/.test(caption)),
			`${variant.name}: workflow captions must be Arabic`);
		assert.ok(state.button.width > 200 && state.button.bottom <= variant.height, `${variant.name}: primary action visible`);
		assert.ok(state.forgot, `${variant.name}: password recovery retained`);
		assert.ok(state.emailLink, `${variant.name}: email-link action retained`);
		if (variant.width >= 992) {
			assert.ok(state.hero.width > 400 && state.hero.height === variant.height, `${variant.name}: purpose-built work panel`);
		} else {
			assert.equal(state.hero.width, 0, `${variant.name}: form is not squeezed by a narrow brand panel`);
		}
		await page.screenshot({ path: `${screenshots}/${variant.name}.png`, fullPage: false });
		if (variant.name === "en-light" || variant.name === "ar-desktop") {
			await page.locator(".for-login #login_email").fill("investor.demo@bunood.invalid");
			await page.locator(".for-login #login_password").fill("DemoPass123");
			await page.locator(".for-login .toggle-password").click();
			assert.equal(await page.locator(".for-login #login_password").getAttribute("type"), "text",
				`${variant.name}: password reveal retained`);
			assert.equal(await page.locator(".for-login #login_email").inputValue(), "investor.demo@bunood.invalid",
				`${variant.name}: email editing retained its LTR value`);
			await page.screenshot({ path: `${screenshots}/${variant.name}-filled.png`, fullPage: false });
		}
		await page.close();
	}
	const page = await browser.newPage();
	await page.goto(`${base}/login?redirect-to=%2Fdesk%2Fhome&_lang=en`);
	await page.locator('.bnd-auth-language-choice[data-bnd-lang="ar"]').click();
	await page.waitForURL(/_lang=ar/);
	assert.equal(await page.locator("html").getAttribute("dir"), "rtl", "language control switches to server-rendered Arabic");
	assert.equal(new URL(page.url()).searchParams.get("redirect-to"), "/desk/home", "language switch preserves redirect");
	await page.close();
	const actions = await browser.newPage();
	await actions.goto(`${base}/login?_lang=en`);
	await actions.locator('.for-login a[href="#forgot"]').click();
	await actions.locator(".for-forgot").waitFor({ state: "visible", timeout: 5000 });
	await actions.goto(`${base}/login?_lang=en`);
	await actions.locator(".for-login .btn-login-option").click();
	await actions.locator(".for-login-with-email-link").waitFor({ state: "visible", timeout: 5000 });
	await actions.close();
	for (const lang of ["en", "ar"]) {
		const context = await browser.newContext();
		const guest = await context.newPage();
		await guest.goto(`${base}/login?_lang=${lang}`);
		const audit = await new AxeBuilder({ page: guest })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();
		assert.deepEqual(audit.violations.map((item) => item.id), [], `${lang}: no WCAG A/AA violations on login`);
		await context.close();
	}
	console.log("Pilot login PASS: light/dark, desktop/mobile, Arabic/English, and language switch.");
} finally {
	await browser.close();
}
