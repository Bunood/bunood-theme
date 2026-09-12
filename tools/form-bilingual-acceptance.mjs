import { benchJson, benchPy, openDesk, URL_BASE } from "./session.mjs";

const USER = "Administrator";
const CASES = [
	["Customer", "customer_name", "tax_id"],
	["Supplier", "supplier_name", "tax_id"],
	["Company", "company_name", "tax_id"],
	["Lease", "company", null],
];
const LANGUAGES = [
	["en", "ltr"],
	["ar", "rtl"],
];
const VIEWPORTS = [
	[1440, 900],
	[430, 900],
];
const THEMES = ["light", "dark"];
const fail = message => { throw new Error(message); };

const original = benchJson(
	`print(json.dumps({
	  "language": frappe.db.get_value("User", ${JSON.stringify(USER)}, "language") or "",
	  "desk_theme": frappe.db.get_value("User", ${JSON.stringify(USER)}, "desk_theme") or "Light",
	}))\n`
);

function setUser(language, deskTheme = original.desk_theme) {
	benchPy(
		`values = json.loads(${JSON.stringify(JSON.stringify({ language, desk_theme: deskTheme }))})\n` +
		`frappe.db.set_value("User", ${JSON.stringify(USER)}, values)\n` +
		`frappe.db.commit()\n` +
		`frappe.cache.hdel("bootinfo", ${JSON.stringify(USER)})\n` +
		`frappe.clear_cache(user=${JSON.stringify(USER)})\n` +
		`print("ok")\n`
	);
}

try {
	for (const [language, direction] of LANGUAGES) {
		setUser(language);
		const { page, errors, close } = await openDesk({ width: 1440, height: 900, user: USER });
		try {
			await page.goto(`${URL_BASE}/desk/customer`, { waitUntil: "domcontentloaded" });
			await page.waitForFunction(() => window.frappe?.model && window.frappe?.set_route, null, { timeout: 60000 });
			const boot = await page.evaluate(() => ({
				language: frappe.boot?.lang || document.documentElement.lang || "",
				direction: document.documentElement.dir || getComputedStyle(document.body).direction,
			}));
			if (!String(boot.language).toLowerCase().startsWith(language))
				fail(`${language}: boot language is ${boot.language}`);
			if (boot.direction !== direction) fail(`${language}: direction is ${boot.direction}, expected ${direction}`);

			for (const [width, height] of VIEWPORTS) {
				await page.setViewportSize({ width, height });
				for (const theme of THEMES) {
					await page.evaluate(value => {
						frappe.ui.set_theme(value);
						document.documentElement.setAttribute("data-theme-mode", value);
					}, theme);
					await page.waitForFunction(value => document.documentElement.getAttribute("data-theme") === value, theme);

					for (const [doctype, first, tax] of CASES) {
						await page.evaluate(async dt => {
							if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0;
							await frappe.model.with_doctype(dt);
							const doc = frappe.model.get_new_doc(dt);
							frappe.set_route("Form", dt, doc.name);
						}, doctype);
						await page.waitForFunction(dt => window.cur_frm?.doctype === dt, doctype, { timeout: 60000 });
						await page.locator(".bnd-simple-composer:visible").waitFor({ timeout: 60000 });

						const result = await page.evaluate(({ doctype, first, tax, direction, theme, width }) => {
							const frm = window.cur_frm;
							const root = frm.$wrapper[0].querySelector(".bnd-simple-composer:not([hidden])");
							const visible = node => !!node && node.getClientRects().length > 0;
							const controls = [...root.querySelectorAll("input:not([type=hidden]), textarea, select")].filter(visible);
							const wrappers = Object.fromEntries(Object.entries(frm.fields_dict)
								.map(([name, field]) => [name, field?.$wrapper?.[0]]).filter(([, node]) => node));
							const rendered = [...root.querySelectorAll(".bnd-simple-group-fields > [data-fieldname]")]
								.filter(visible).map(node => node.dataset.fieldname);
							const expected = window.bunood_theme.simple_forms.profiles[doctype]
								.filter(name => wrappers[name] && visible(wrappers[name]));
							const sample = controls[0];
							const before = JSON.stringify(frm.doc);
							const colorProbe = document.createElement("span");
							colorProbe.style.color = "var(--bnd-critical)";
							root.append(colorProbe);
							const critical = getComputedStyle(colorProbe).color;
							colorProbe.remove();
							sample?.setAttribute("aria-invalid", "true");
							const invalidStyle = sample && getComputedStyle(sample);
							const invalid = !sample || invalidStyle.borderColor === critical || invalidStyle.boxShadow !== "none";
							sample?.removeAttribute("aria-invalid");
							sample?.focus();
							const focused = !sample || document.activeElement === sample && getComputedStyle(sample).outlineStyle === "solid";
							const heights = controls.slice(0, 6).map(node => Math.round(node.getBoundingClientRect().height));
							const heightSpread = heights.length ? Math.max(...heights) - Math.min(...heights) : 0;
							const taxVisible = !tax || visible(wrappers[tax]);
							const switcher = frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]');
							switcher?.click();
							const advanced = visible(frm.$wrapper[0].querySelector(".form-layout"));
							frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]')?.click();
							return {
								first: rendered[0],
								order: rendered.slice(0, expected.length).join("|") === expected.join("|"),
								taxVisible,
								direction: document.documentElement.dir || getComputedStyle(document.body).direction,
								theme: document.documentElement.getAttribute("data-theme"),
								invalid,
								focused,
								advanced,
								docStable: JSON.stringify(frm.doc) === before,
								heightSpread,
								overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width,
								undefinedText: /\bundefined\b/i.test(root.textContent || ""),
							};
						}, { doctype, first, tax, direction, theme, width });

						if (result.first !== first) fail(`${language}/${theme}/${width}/${doctype}: first field ${result.first}`);
						for (const key of ["order", "taxVisible", "invalid", "focused", "advanced", "docStable"])
							if (!result[key]) fail(`${language}/${theme}/${width}/${doctype}: ${key} failed`);
						if (result.direction !== direction) fail(`${language}/${theme}/${width}/${doctype}: wrong direction`);
						if (result.theme !== theme) fail(`${language}/${theme}/${width}/${doctype}: wrong theme`);
						if (result.overflow > 1) fail(`${language}/${theme}/${width}/${doctype}: ${result.overflow}px page overflow`);
						if (width >= 768 && result.heightSpread > 2)
							fail(`${language}/${theme}/${width}/${doctype}: control height spread ${result.heightSpread}px`);
						if (result.undefinedText) fail(`${language}/${theme}/${width}/${doctype}: undefined text rendered`);
						console.log(`PASS ${language}/${theme}/${width}/${doctype}`);
					}
				}
			}
			if (errors.length) fail(`${language}: browser errors: ${errors.join(" | ")}`);
		} finally {
			await page.evaluate(() => { if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0; }).catch(() => {});
			await close();
		}
	}
} finally {
	setUser(original.language, original.desk_theme);
}
