import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RunOwnedUserFixtures, makeV1RoleFixtureUsers } from "./run-owned-users.mjs";
import { benchJson, benchPy, openDesk, URL_BASE } from "./session.mjs";

const runId = randomUUID().replaceAll("-", "").slice(0, 20);
const allUsers = makeV1RoleFixtureUsers(runId);
const users = Object.freeze({ runId, warehouse: allUsers.warehouse, owner: allUsers.owner });
const fixtures = new RunOwnedUserFixtures(benchPy, users);
const itemCode = `BND-QA-${runId.slice(0, 12).toUpperCase()}`;
const itemName = `Bunood acceptance product ${runId.slice(0, 8)}`;
const marker = `bnd-v1-item-${runId}`;
const image = "/assets/bunood_theme/images/bunood-mark.svg";
const languages = [["en", "ltr"], ["ar", "rtl"]];
const viewports = [[1440, 900], [1024, 900], [700, 900], [430, 900]];
const themes = ["light", "dark"];

function setLanguage(user, language) {
	benchPy(
		`frappe.db.set_value("User", ${JSON.stringify(user)}, "language", ${JSON.stringify(language)})\n` +
		`frappe.db.commit()\nfrappe.cache.hdel("bootinfo", ${JSON.stringify(user)})\n` +
		`frappe.clear_cache(user=${JSON.stringify(user)})\nprint("ok")\n`
	);
}

function createItem() {
	return benchJson(
		`code=${JSON.stringify(itemCode)}\nname=${JSON.stringify(itemName)}\nmarker=${JSON.stringify(marker)}\n` +
		`if frappe.db.exists("Item", code):\n    raise RuntimeError("Refusing item fixture collision: " + code)\n` +
		`group=frappe.db.get_value("Item Group", {"is_group": 0}, "name")\n` +
		`uom="Nos" if frappe.db.exists("UOM", "Nos") else frappe.db.get_value("UOM", {}, "name")\n` +
		`if not group or not uom:\n    raise RuntimeError("Item fixture prerequisites are missing")\n` +
		`doc=frappe.get_doc({"doctype":"Item","item_code":code,"item_name":name,"item_group":group,"stock_uom":uom,"is_stock_item":1,"is_sales_item":1,"is_purchase_item":1,"disabled":0,"image":${JSON.stringify(image)},"description":marker})\n` +
		`doc.insert(ignore_permissions=True)\nfrappe.db.commit()\n` +
		`print(json.dumps({"name":doc.name,"item_name":doc.item_name,"item_group":doc.item_group,"stock_uom":doc.stock_uom,"image":doc.image}))\n`
	);
}

function setDisabled(value) {
	benchPy(
		`doc=frappe.get_doc("Item", ${JSON.stringify(itemCode)})\n` +
		`if doc.description != ${JSON.stringify(marker)}:\n    raise RuntimeError("Refusing to mutate an unowned Item")\n` +
		`doc.disabled=${value ? 1 : 0}\ndoc.save(ignore_permissions=True)\nfrappe.db.commit()\nprint("ok")\n`
	);
}

function permissionEvidence() {
	return benchJson(
		`code=${JSON.stringify(itemCode)}\nwarehouse=${JSON.stringify(users.warehouse.email)}\nowner=${JSON.stringify(users.owner.email)}\n` +
		`def evidence(user):\n` +
		`    return {ptype: bool(frappe.has_permission("Item", ptype, code, user=user)) for ptype in ("read", "write", "create", "delete")}\n` +
		`print(json.dumps({"warehouse":evidence(warehouse),"owner":evidence(owner)}))\n`
	);
}

function cleanupItem() {
	return benchPy(
		`code=${JSON.stringify(itemCode)}\nmarker=${JSON.stringify(marker)}\n` +
		`if frappe.db.exists("Item", code):\n` +
		`    doc=frappe.get_doc("Item", code)\n` +
		`    if doc.item_name != ${JSON.stringify(itemName)} or doc.description != marker:\n` +
		`        raise RuntimeError("Refusing to delete an unowned Item")\n` +
		`    frappe.delete_doc("Item", code, force=True, ignore_permissions=True)\n` +
		`    frappe.db.commit()\n` +
		`print("clean")\n`
	);
}

async function openItem(page) {
	await page.goto(`${URL_BASE}/desk/item/${encodeURIComponent(itemCode)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(code => window.cur_frm?.doctype === "Item" && window.cur_frm?.doc?.name === code, itemCode, { timeout: 60000 });
	await page.locator(".bnd-simple-composer:visible").waitFor({ timeout: 60000 });
}

async function inspectItem(page, expectedDirection, width, theme, disabled = 0) {
	await page.setViewportSize({ width, height: 900 });
	await page.evaluate(value => {
		frappe.ui.set_theme(value);
		document.documentElement.setAttribute("data-theme-mode", value);
	}, theme);
	await page.waitForFunction(value => document.documentElement.getAttribute("data-theme") === value, theme);
	await page.waitForTimeout(100);
	const result = await page.evaluate(({ code, name, image, expectedDirection, width, theme, disabled }) => {
		const frm = window.cur_frm;
		const root = frm.$wrapper[0].querySelector('.bnd-simple-composer[data-doctype="Item"]:not([hidden])');
		const visible = node => !!node && node.getClientRects().length > 0;
		const fields = [...root.querySelectorAll(".bnd-simple-group-fields > [data-fieldname]")].filter(visible);
		const names = fields.map(node => node.dataset.fieldname);
		const nameField = fields.find(node => node.dataset.fieldname === "item_name");
		const codeField = fields.find(node => node.dataset.fieldname === "item_code");
		const disabledField = fields.find(node => node.dataset.fieldname === "disabled");
		const before = frm.doc.name;
		frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]')?.click();
		const advanced = visible(frm.$wrapper[0].querySelector(".form-layout"));
		frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]')?.click();
		const saveVisible = [...frm.$wrapper[0].querySelectorAll(".bnd-simple-primary-actions button")].some(visible);
		return {
			code: frm.doc.name,
			name: frm.doc.item_name,
			image: frm.doc.image,
			disabled: Number(frm.doc.disabled || 0),
			first: names[0],
			nameIndex: names.indexOf("item_name"),
			codeIndex: names.indexOf("item_code"),
			groupVisible: names.includes("item_group"),
			uomVisible: names.includes("stock_uom"),
			stockVisible: names.includes("is_stock_item"),
			disabledVisible: !!disabledField,
			nameProminent: width < 768 || nameField.getBoundingClientRect().width > codeField.getBoundingClientRect().width * 1.5,
			direction: document.documentElement.dir || getComputedStyle(document.body).direction,
			theme: document.documentElement.getAttribute("data-theme"),
			advanced,
			sameDocument: frm.doc.name === before,
			saveVisible,
			canWrite: !!frm.perm?.[0]?.write,
			overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width,
			undefinedText: /\bundefined\b/i.test(root.textContent || ""),
			expected: { code, name, image, expectedDirection, theme, disabled },
		};
	}, { code: itemCode, name: itemName, image, expectedDirection, width, theme, disabled });
	assert.equal(result.code, itemCode);
	assert.equal(result.name, itemName);
	assert.equal(result.image, image);
	assert.equal(result.disabled, disabled);
	assert.equal(result.first, "item_name");
	assert.ok(result.nameIndex > -1 && result.nameIndex < result.codeIndex, "Item Name must precede Item Code");
	assert.equal(result.groupVisible, true);
	assert.equal(result.uomVisible, true);
	assert.equal(result.stockVisible, true);
	assert.equal(result.disabledVisible, true);
	assert.equal(result.nameProminent, true);
	assert.equal(result.direction, expectedDirection);
	assert.equal(result.theme, theme);
	assert.equal(result.advanced, true);
	assert.equal(result.sameDocument, true);
	assert.equal(result.saveVisible, false);
	assert.equal(result.canWrite, false);
	assert.ok(result.overflow <= 1, `${width}px Item form overflows by ${result.overflow}px`);
	assert.equal(result.undefinedText, false);
}

async function searchByName(page) {
	const results = await page.evaluate(async ({ name }) => {
		const response = await frappe.call({
			method: "frappe.desk.search.search_link",
			args: { doctype: "Item", txt: name, page_length: 20 },
		});
		return response.message || [];
	}, { name: itemName });
	const match = results.find(row => (row.value || row.name) === itemCode);
	assert.ok(match, "native Item search did not find the run-owned item by its human name");
	assert.match(String(match.description || match.label || ""), new RegExp(itemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

async function proveWriteDenied(page) {
	const denied = await page.evaluate(async ({ code, name }) => {
		try {
			await frappe.call({ method: "frappe.client.set_value", args: { doctype: "Item", name: code, fieldname: "item_name", value: name } });
			return false;
		} catch (_error) { return true; }
	}, { code: itemCode, name: itemName });
	assert.equal(denied, true, "Stock User unexpectedly wrote Item master data");
}

async function proveOwnerDenied() {
	setLanguage(users.owner.email, "en");
	const session = await openDesk({ width: 1024, height: 900, user: users.owner.email });
	try {
		await session.page.goto(`${URL_BASE}/desk/home`, { waitUntil: "domcontentloaded", timeout: 60000 });
		await session.page.waitForFunction(() => window.frappe?.call, null, { timeout: 60000 });
		const denied = await session.page.evaluate(async code => {
			try {
				await frappe.call({ method: "frappe.client.get", args: { doctype: "Item", name: code } });
				return false;
			} catch (_error) { return true; }
		}, itemCode);
		assert.equal(denied, true, "marker-only Owner unexpectedly read Item master data");
	} finally { await session.close(); }
}

let itemCreated = false;
try {
	fixtures.preflight();
	fixtures.create(users.warehouse);
	fixtures.create(users.owner);
	const created = createItem();
	itemCreated = true;
	assert.deepEqual(created, { name: itemCode, item_name: itemName, item_group: created.item_group, stock_uom: created.stock_uom, image });
	const permissions = permissionEvidence();
	assert.deepEqual(permissions.warehouse, { read: true, write: false, create: false, delete: false });
	assert.deepEqual(permissions.owner, { read: false, write: false, create: false, delete: false });

	for (const [language, direction] of languages) {
		setLanguage(users.warehouse.email, language);
		const session = await openDesk({ width: 1440, height: 900, user: users.warehouse.email });
		try {
			await openItem(session.page);
			const boot = await session.page.evaluate(() => ({ language: frappe.boot?.lang, direction: document.documentElement.dir }));
			assert.ok(String(boot.language).toLowerCase().startsWith(language));
			assert.equal(boot.direction, direction);
			for (const [width] of viewports) for (const theme of themes) {
				await inspectItem(session.page, direction, width, theme);
				console.log(`PASS ${language}/${theme}/${width}/Item/read`);
			}
			await searchByName(session.page);
			assert.deepEqual(session.errors, []);
			await proveWriteDenied(session.page);
			assert.deepEqual(session.errors.filter(error => !/403 \(FORBIDDEN\)/i.test(error)), []);
		} finally { await session.close(); }
	}

	setDisabled(true);
	setLanguage(users.warehouse.email, "en");
	const disabledSession = await openDesk({ width: 1024, height: 900, user: users.warehouse.email });
	try {
		await openItem(disabledSession.page);
		await inspectItem(disabledSession.page, "ltr", 1024, "light", 1);
		console.log("PASS en/light/1024/Item/disabled");
	} finally { await disabledSession.close(); }
	await proveOwnerDenied();
	console.log(`PASS Item live acceptance ${itemCode}`);
} finally {
	if (itemCreated || benchJson(`print(json.dumps(bool(frappe.db.exists("Item", ${JSON.stringify(itemCode)}))))\n`)) cleanupItem();
	fixtures.cleanup();
}
