import { openDesk } from "./session.mjs";

const CASES = [
	["Customer", "customer_name", "tax_id"], ["Supplier", "supplier_name", "tax_id"],
	["Company", "company_name", "tax_id"], ["Item", "item_code"],
	["Property", "property_name"], ["Real Estate Unit", "unit_name"], ["Lease", "company"],
];
const fail = message => { throw new Error(message); };
const { page, errors, close } = await openDesk({ width: 1440, height: 900 });
try {
	await page.goto(`${process.env.BND_URL || "http://localhost:8080"}/desk/customer`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => window.frappe?.model && window.frappe?.set_route, null, { timeout: 60000 });
	for (const [doctype, first, tax] of CASES) {
		console.log(`TEST ${doctype}`);
		await page.evaluate(async dt => {
			if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0;
			await frappe.model.with_doctype(dt);
			const doc = frappe.model.get_new_doc(dt);
			frappe.set_route("Form", dt, doc.name);
		}, doctype);
		await page.waitForFunction(dt => window.cur_frm?.doctype === dt, doctype, { timeout: 60000 });
		await page.locator(".bnd-simple-composer:visible").waitFor({ timeout: 60000 });
		const result = await page.evaluate(({ doctype, first, tax }) => {
			const frm = window.cur_frm;
			const shell = frm.$wrapper[0];
			const root = shell.querySelector(".bnd-simple-composer:not([hidden])");
			const visible = node => !!node && node.getClientRects().length > 0;
			const wrappers = Object.fromEntries(Object.entries(frm.fields_dict)
				.map(([name, field]) => [name, field?.$wrapper?.[0]]).filter(([, node]) => node));
			const before = JSON.stringify(frm.doc);
			const rendered = [...root.querySelectorAll(".bnd-simple-group-fields > [data-fieldname]")]
				.filter(visible).map(node => node.dataset.fieldname);
			const expected = window.bunood_theme.simple_forms.profiles[doctype]
				.filter(name => wrappers[name] && visible(wrappers[name]));
			const focusNode = root.querySelector("input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
			const colorProbe = document.createElement("span"); colorProbe.style.color = "var(--bnd-critical)"; root.append(colorProbe);
			const critical = getComputedStyle(colorProbe).color; colorProbe.remove();
			focusNode?.setAttribute("aria-invalid", "true");
			const invalidStyle = focusNode && getComputedStyle(focusNode);
			const invalidBorder = invalidStyle?.borderColor, invalidShadow = invalidStyle?.boxShadow;
			const invalid = !focusNode || invalidBorder === critical || invalidShadow !== "none";
			focusNode?.removeAttribute("aria-invalid");
			if (focusNode) focusNode.disabled = true;
			const disabled = !focusNode || getComputedStyle(focusNode).cursor === "not-allowed" && getComputedStyle(focusNode).opacity === "1";
			if (focusNode) focusNode.disabled = false;
			focusNode?.setAttribute("aria-busy", "true");
			const busy = !focusNode || getComputedStyle(focusNode).cursor === "progress";
			focusNode?.removeAttribute("aria-busy");
			focusNode?.focus();
			const focusRing = !focusNode || getComputedStyle(focusNode).outlineStyle === "solid";
			shell.querySelector('.bnd-simple-switch button[aria-pressed="false"]').click();
			const layout = shell.querySelector(".form-layout");
			const advanced = visible(layout);
			const restored = expected.every(name => layout?.contains(wrappers[name]));
			shell.querySelector('.bnd-simple-switch button[aria-pressed="false"]').click();
			return {
				first: rendered[0], expected: expected.join("|"), rendered: rendered.slice(0, expected.length).join("|"),
				tax: !tax || visible(wrappers[tax]), collapsed: [...root.querySelectorAll("details")].every(node => !node.open),
				advanced, restored, sameNodes: Object.entries(wrappers).every(([name, node]) => frm.fields_dict[name].$wrapper[0] === node),
				doc: JSON.stringify(frm.doc) === before, focus: !focusNode || document.activeElement === focusNode,
				invalid, disabled, busy, focusRing, invalidInfo: `${invalidBorder}/${critical}/${invalidShadow}/${focusNode?.className}`,
			};
		}, { doctype, first, tax });
		if (result.first !== first) fail(`${doctype}: first field ${result.first}, expected ${first}`);
		if (result.rendered !== result.expected) fail(`${doctype}: rendered profile order differs`);
		for (const key of ["tax", "collapsed", "advanced", "restored", "sameNodes", "doc", "focus", "invalid", "disabled", "busy", "focusRing"])
			if (!result[key]) fail(`${doctype}: ${key} contract failed (${result.invalidInfo})`);
		console.log(`PASS ${doctype}: ordered, reversible, native controls preserved`);
	}
	if (errors.length) fail(`browser errors: ${errors.join(" | ")}`);
} finally {
	await page.evaluate(() => { if (window.cur_frm?.doc) window.cur_frm.doc.__unsaved = 0; }).catch(() => {});
	await close();
}
