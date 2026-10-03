import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { RunOwnedUserFixtures, makeV1RoleFixtureUsers } from "./run-owned-users.mjs";
import { benchJson, benchPy, openDesk, URL_BASE } from "./session.mjs";

const runId = randomUUID().replaceAll("-", "").slice(0, 20);
const allUsers = makeV1RoleFixtureUsers(runId);
const users = Object.freeze({ runId, warehouse: allUsers.warehouse, owner: allUsers.owner });
const fixtures = new RunOwnedUserFixtures(benchPy, users);
const shortId = runId.slice(0, 10).toUpperCase();
const company = "Bunood Development";
const companyAbbr = "BDEV";
const parentWarehouse = `Stores - ${companyAbbr}`;
const warehousePrefix = `BND QA ${shortId}`;
const allowedWarehouseName = `${warehousePrefix} Allowed`;
const forbiddenWarehouseName = `${warehousePrefix} Forbidden`;
const itemCode = `BND-STOCK-QA-${shortId}`;
const itemName = `Bunood stock acceptance ${runId.slice(0, 8)}`;
const marker = `bnd-v1-stock-${runId}`;
const quantity = 5;
const valuationRate = 10;
const languages = [["en", "ltr"], ["ar", "rtl"]];
const viewports = [[1440, 900], [1024, 900], [700, 900], [430, 900]];
const themes = ["light", "dark"];

let allowedWarehouse = "";
let forbiddenWarehouse = "";
let stockEntry = "";

function setLanguage(user, language) {
	benchPy(
		`frappe.db.set_value("User", ${JSON.stringify(user)}, "language", ${JSON.stringify(language)})\n` +
		`frappe.db.commit()\nfrappe.cache.hdel("bootinfo", ${JSON.stringify(user)})\n` +
		`frappe.clear_cache(user=${JSON.stringify(user)})\nprint("ok")\n`
	);
}

function createNativeFixtures() {
	return benchJson(
		`company=${JSON.stringify(company)}\nparent=${JSON.stringify(parentWarehouse)}\n` +
		`prefix=${JSON.stringify(warehousePrefix)}\ncode=${JSON.stringify(itemCode)}\nmarker=${JSON.stringify(marker)}\n` +
		`if not frappe.db.exists("Company", company) or not frappe.db.exists("Warehouse", parent):\n` +
		`    raise RuntimeError("Bunood stock fixture prerequisites are missing")\n` +
		`if frappe.db.exists("Item", code) or frappe.db.exists("Warehouse", {"warehouse_name": ["like", prefix + "%"], "company": company}):\n` +
		`    raise RuntimeError("Refusing stock fixture collision: " + prefix)\n` +
		`created=[]\n` +
		`for warehouse_name in (${JSON.stringify(allowedWarehouseName)}, ${JSON.stringify(forbiddenWarehouseName)}):\n` +
		`    doc=frappe.get_doc({"doctype":"Warehouse","warehouse_name":warehouse_name,"parent_warehouse":parent,"company":company,"is_group":0})\n` +
		`    doc.insert(ignore_permissions=True)\n    created.append(doc.name)\n` +
		`group=frappe.db.get_value("Item Group", {"is_group": 0}, "name")\n` +
		`uom="Nos" if frappe.db.exists("UOM", "Nos") else frappe.db.get_value("UOM", {}, "name")\n` +
		`if not group or not uom:\n    raise RuntimeError("Item fixture prerequisites are missing")\n` +
		`item=frappe.get_doc({"doctype":"Item","item_code":code,"item_name":${JSON.stringify(itemName)},"item_group":group,"stock_uom":uom,"is_stock_item":1,"is_sales_item":1,"is_purchase_item":1,"disabled":0,"valuation_rate":${valuationRate},"standard_rate":${valuationRate},"description":marker})\n` +
		`item.insert(ignore_permissions=True)\nfrappe.db.commit()\n` +
		`print(json.dumps({"allowed":created[0],"forbidden":created[1],"item":item.name}))\n`
	);
}

function assignWarehouseScope() {
	return benchJson(
		`user=${JSON.stringify(users.warehouse.email)}\ncompany=${JSON.stringify(company)}\nallowed=${JSON.stringify(allowedWarehouse)}\n` +
		`names=[]\n` +
		`for allow, value in (("Company", company), ("Warehouse", allowed)):\n` +
		`    doc=frappe.get_doc({"doctype":"User Permission","user":user,"allow":allow,"for_value":value,"apply_to_all_doctypes":1})\n` +
		`    doc.insert(ignore_permissions=True)\n    names.append(doc.name)\n` +
		`frappe.defaults.set_user_default("Company", company, user)\n` +
		`frappe.defaults.set_user_default("Warehouse", allowed, user)\n` +
		`frappe.db.commit()\nfrappe.clear_cache(user=user)\nprint(json.dumps(names))\n`
	);
}

function permissionEvidence(entry = null) {
	return benchJson(
		`warehouse_user=${JSON.stringify(users.warehouse.email)}\nowner=${JSON.stringify(users.owner.email)}\n` +
		`allowed=${JSON.stringify(allowedWarehouse)}\nforbidden=${JSON.stringify(forbiddenWarehouse)}\nentry=${entry ? JSON.stringify(entry) : "None"}\n` +
		`def perms(user, doctype, name=None):\n` +
		`    return {ptype: bool(frappe.has_permission(doctype, ptype, name, user=user)) for ptype in ("read","write","create","submit","cancel","delete")}\n` +
		`print(json.dumps({"warehouse_doctype":perms(warehouse_user,"Stock Entry"),"warehouse_entry":perms(warehouse_user,"Stock Entry",entry) if entry else None,"owner":perms(owner,"Stock Entry",entry) if entry else perms(owner,"Stock Entry"),"stock_settings":perms(warehouse_user,"Stock Settings"),"allowed":bool(frappe.has_permission("Warehouse","read",allowed,user=warehouse_user)),"forbidden":bool(frappe.has_permission("Warehouse","read",forbidden,user=warehouse_user))}))\n`
	);
}

function reconciliationEvidence() {
	return benchJson(
		`name=${JSON.stringify(stockEntry)}\nitem=${JSON.stringify(itemCode)}\nwarehouse=${JSON.stringify(allowedWarehouse)}\n` +
		`docstatus=frappe.db.get_value("Stock Entry",name,"docstatus")\n` +
		`sle=frappe.get_all("Stock Ledger Entry",filters={"voucher_type":"Stock Entry","voucher_no":name,"item_code":item,"warehouse":warehouse},fields=["name","actual_qty","valuation_rate","stock_value_difference"],order_by="creation asc")\n` +
		`gl=frappe.get_all("GL Entry",filters={"voucher_type":"Stock Entry","voucher_no":name},fields=["name","debit","credit","is_cancelled"],order_by="creation asc")\n` +
		`bin_qty=frappe.db.get_value("Bin",{"item_code":item,"warehouse":warehouse},"actual_qty") or 0\n` +
		`print(json.dumps({"docstatus":docstatus,"bin_qty":float(bin_qty),"sle":sle,"gl":gl},default=str))\n`
	);
}

function cleanupNativeFixtures() {
	return benchPy(
		`marker=${JSON.stringify(marker)}\ncode=${JSON.stringify(itemCode)}\ncompany=${JSON.stringify(company)}\nparent=${JSON.stringify(parentWarehouse)}\n` +
		`warehouses=${JSON.stringify([allowedWarehouse, forbiddenWarehouse].filter(Boolean))}\n` +
		`entries=frappe.get_all("Stock Entry",filters={"remarks":["like",marker + "%"]},pluck="name")\n` +
		`for name in entries:\n` +
		`    doc=frappe.get_doc("Stock Entry",name)\n` +
		`    if not str(doc.remarks or "").startswith(marker) or doc.company != company:\n` +
		`        raise RuntimeError("Refusing to delete an unowned Stock Entry: " + name)\n` +
		`    if doc.docstatus == 1:\n        doc.cancel()\n` +
		`    frappe.delete_doc("Stock Entry",name,force=True,ignore_permissions=True)\n` +
		`for voucher in entries:\n` +
		`    ledger=frappe.get_all("Stock Ledger Entry",filters={"voucher_type":"Stock Entry","voucher_no":voucher},fields=["name","item_code","warehouse"])\n` +
		`    if any(row.item_code != code or row.warehouse not in warehouses for row in ledger):\n` +
		`        raise RuntimeError("Refusing to purge ledger rows outside the owned fixture: " + voucher)\n` +
		`    frappe.db.delete("Stock Ledger Entry",{"voucher_type":"Stock Entry","voucher_no":voucher})\n` +
		`    frappe.db.delete("GL Entry",{"voucher_type":"Stock Entry","voucher_no":voucher})\n` +
		`for name in frappe.get_all("User Permission",filters={"user":${JSON.stringify(users.warehouse.email)},"allow":["in",["Company","Warehouse"]]},pluck="name"):\n` +
		`    frappe.delete_doc("User Permission",name,force=True,ignore_permissions=True)\n` +
		`for name in frappe.get_all("Bin",filters={"item_code":code,"warehouse":["in",warehouses]},pluck="name") if warehouses else []:\n` +
		`    actual=float(frappe.db.get_value("Bin",name,"actual_qty") or 0)\n` +
		`    if actual:\n        raise RuntimeError("Refusing to delete a non-zero owned Bin: " + name)\n` +
		`    frappe.delete_doc("Bin",name,force=True,ignore_permissions=True)\n` +
		`if frappe.db.exists("Item",code):\n` +
		`    item=frappe.get_doc("Item",code)\n` +
		`    if item.item_name != ${JSON.stringify(itemName)} or item.description != marker:\n` +
		`        raise RuntimeError("Refusing to delete an unowned Item")\n` +
		`    frappe.delete_doc("Item",code,force=True,ignore_permissions=True)\n` +
		`for name in warehouses:\n` +
		`    if not frappe.db.exists("Warehouse",name):\n        continue\n` +
		`    doc=frappe.get_doc("Warehouse",name)\n` +
		`    if doc.company != company or doc.parent_warehouse != parent or not doc.warehouse_name.startswith(${JSON.stringify(warehousePrefix)}):\n` +
		`        raise RuntimeError("Refusing to delete an unowned Warehouse: " + name)\n` +
		`    frappe.delete_doc("Warehouse",name,force=True,ignore_permissions=True)\n` +
		`frappe.db.commit()\nfrappe.clear_cache()\nprint("clean")\n`
	);
}

async function openDeskReady(page, route = "/desk/home") {
	await page.goto(`${URL_BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(() => window.frappe?.call && window.frappe?.boot, null, { timeout: 60000 });
}

function collectHttpErrors(page) {
	const responses = [];
	page.on("response", response => {
		if (response.status() < 400) return;
		const request = response.request();
		responses.push({ status: response.status(), method: request.method(), url: response.url(), postData: request.postData() || "" });
	});
	return responses;
}

async function openNewStockEntry(page) {
	await openDeskReady(page);
	await page.evaluate(() => frappe.new_doc("Stock Entry"));
	await page.waitForFunction(() => window.cur_frm?.doctype === "Stock Entry" && window.cur_frm?.doc?.__islocal, null, { timeout: 60000 });
	await page.locator(".bnd-stock-simple:visible").waitFor({ timeout: 60000 });
}

async function openStockEntry(page) {
	await page.goto(`${URL_BASE}/desk/stock-entry/${encodeURIComponent(stockEntry)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForFunction(name => window.cur_frm?.doctype === "Stock Entry" && window.cur_frm?.doc?.name === name, stockEntry, { timeout: 60000 });
	await page.locator(".bnd-stock-simple:visible").waitFor({ timeout: 60000 });
}

async function inspectStockEntry(page, expectedDirection, width, theme, expectedStatus) {
	await page.setViewportSize({ width, height: 900 });
	await page.evaluate(value => {
		frappe.ui.set_theme(value);
		document.documentElement.setAttribute("data-theme-mode", value);
	}, theme);
	await page.waitForFunction(value => document.documentElement.getAttribute("data-theme") === value, theme);
	await page.waitForTimeout(100);
	const result = await page.evaluate(({ expectedDirection, width, theme, expectedStatus, allowed, code, qty }) => {
		const frm = window.cur_frm;
		const root = frm.$wrapper[0].querySelector(".bnd-stock-simple:not([hidden])");
		const visible = node => !!node && node.getClientRects().length > 0;
		const fieldVisible = fieldname => visible(root.querySelector(`[data-fieldname="${fieldname}"]`));
		const before = frm.doc.name;
		frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]')?.click();
		const advanced = visible(frm.$wrapper[0].querySelector(".form-layout"));
		frm.$wrapper[0].querySelector('.bnd-simple-switch button[aria-pressed="false"]')?.click();
		return {
			name: frm.doc.name,
			isLocal: !!frm.doc.__islocal,
			docstatus: Number(frm.doc.docstatus || 0),
			state: frm.$wrapper[0].querySelector(".bnd-document-state")?.textContent?.trim() || "",
			direction: document.documentElement.dir || getComputedStyle(document.body).direction,
			theme: document.documentElement.getAttribute("data-theme"),
			steps: root.querySelectorAll(".bnd-stock-steps > li").length,
			movement: visible(root.querySelector(".bnd-stock-card-movement")),
			route: visible(root.querySelector(".bnd-stock-card-route")),
			items: visible(root.querySelector(".bnd-stock-card-items")),
			stockType: fieldVisible("stock_entry_type"),
			itemTable: fieldVisible("items"),
			toWarehouse: frm.doc.to_warehouse || "",
			rowItem: frm.doc.items?.[0]?.item_code || "",
			rowQty: Number(frm.doc.items?.[0]?.qty || 0),
			advanced,
			sameDocument: frm.doc.name === before,
			aria: root.getAttribute("aria-label") || "",
			overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - width,
			undefinedText: /\bundefined\b/i.test(root.textContent || ""),
			expected: { expectedDirection, theme, expectedStatus, allowed, code, qty },
		};
	}, { expectedDirection, width, theme, expectedStatus, allowed: allowedWarehouse, code: itemCode, qty: quantity });
	assert.equal(result.direction, expectedDirection);
	assert.equal(result.theme, theme);
	assert.equal(result.docstatus, expectedStatus);
	assert.equal(result.steps, 3);
	assert.equal(result.movement, true);
	assert.equal(result.route, true);
	assert.equal(result.items, true);
	assert.equal(result.stockType, true);
	assert.equal(result.itemTable, true);
	assert.equal(result.advanced, true);
	assert.equal(result.sameDocument, true);
	assert.ok(result.aria);
	assert.ok(result.state);
	assert.ok(result.overflow <= 1, `${width}px Stock Entry form overflows by ${result.overflow}px`);
	assert.equal(result.undefinedText, false);
	if (!result.isLocal) {
		assert.equal(result.name, stockEntry);
		assert.equal(result.toWarehouse, allowedWarehouse);
		assert.equal(result.rowItem, itemCode);
		assert.equal(result.rowQty, quantity);
	}
}

async function searchWarehouseScope(page) {
	const results = await page.evaluate(async prefix => {
		const response = await frappe.call({
			method: "frappe.desk.search.search_link",
			args: { doctype: "Warehouse", txt: prefix, reference_doctype: "Stock Entry", page_length: 20 },
		});
		return response.message || [];
	}, warehousePrefix);
	const values = results.map(row => row.value || row.name);
	assert.ok(values.includes(allowedWarehouse), "native Warehouse search did not return the allowed warehouse");
	assert.ok(!values.includes(forbiddenWarehouse), "native Warehouse search leaked the forbidden warehouse");
}

async function insertStockEntry(page, target, remarks = marker) {
	return page.evaluate(async ({ company, target, itemCode, quantity, valuationRate, remarks }) => {
		const response = await frappe.call({
			method: "frappe.client.insert",
			args: { doc: {
				doctype: "Stock Entry",
				stock_entry_type: "Material Receipt",
				purpose: "Material Receipt",
				company,
				to_warehouse: target,
				remarks,
				items: [{ doctype: "Stock Entry Detail", item_code: itemCode, qty: quantity, t_warehouse: target, basic_rate: valuationRate }],
			} },
		});
		return response.message;
	}, { company, target, itemCode, quantity, valuationRate, remarks });
}

async function proveForbiddenWarehouseDenied(page) {
	let denied = false;
	try {
		await insertStockEntry(page, forbiddenWarehouse, `${marker}-forbidden`);
	} catch (_error) { denied = true; }
	assert.equal(denied, true, "Stock User unexpectedly created an entry in the forbidden warehouse");
}

async function submitStockEntry(page) {
	return page.evaluate(async name => {
		const current = await frappe.call({ method: "frappe.client.get", args: { doctype: "Stock Entry", name } });
		const response = await frappe.call({ method: "frappe.client.submit", args: { doc: current.message } });
		return response.message;
	}, stockEntry);
}

async function cancelStockEntry(page) {
	return page.evaluate(async name => {
		const response = await frappe.call({ method: "frappe.client.cancel", args: { doctype: "Stock Entry", name } });
		return response.message;
	}, stockEntry);
}

async function proveOwnerDenied() {
	setLanguage(users.owner.email, "en");
	const session = await openDesk({ width: 1024, height: 900, user: users.owner.email });
	try {
		await openDeskReady(session.page);
		const denied = await session.page.evaluate(async name => {
			try {
				await frappe.call({ method: "frappe.client.get", args: { doctype: "Stock Entry", name } });
				return false;
			} catch (_error) { return true; }
		}, stockEntry);
		assert.equal(denied, true, "marker-only Owner unexpectedly read Stock Entry");
	} finally { await session.close(); }
}

try {
	fixtures.preflight();
	fixtures.create(users.warehouse);
	fixtures.create(users.owner);
	const native = createNativeFixtures();
	allowedWarehouse = native.allowed;
	forbiddenWarehouse = native.forbidden;
	assert.equal(native.item, itemCode);
	assignWarehouseScope();

	const permissions = permissionEvidence();
	assert.equal(permissions.warehouse_doctype.create, true);
	assert.equal(permissions.warehouse_doctype.submit, true);
	assert.equal(permissions.warehouse_doctype.cancel, true);
	assert.equal(permissions.stock_settings.read, false);
	assert.equal(permissions.stock_settings.write, false);
	assert.equal(permissions.stock_settings.create, false);
	assert.equal(permissions.stock_settings.delete, false);
	assert.equal(permissions.allowed, true);
	assert.equal(permissions.forbidden, false);
	assert.deepEqual(permissions.owner, { read: false, write: false, create: false, submit: false, cancel: false, delete: false });

	setLanguage(users.warehouse.email, "en");
	const createSession = await openDesk({ width: 1024, height: 900, user: users.warehouse.email });
	try {
		const forbiddenResponses = collectHttpErrors(createSession.page);
		await openNewStockEntry(createSession.page);
		await inspectStockEntry(createSession.page, "ltr", 1024, "light", 0);
		await searchWarehouseScope(createSession.page);
		await proveForbiddenWarehouseDenied(createSession.page);
		assert.ok(forbiddenResponses.length, "forbidden insert did not produce an HTTP denial");
		const created = await insertStockEntry(createSession.page, allowedWarehouse);
		stockEntry = created.name;
		assert.equal(created.docstatus, 0);
		assert.equal(created.company, company);
		assert.equal(created.to_warehouse, allowedWarehouse);
		assert.equal(created.items[0].item_code, itemCode);
		assert.equal(Number(created.items[0].qty), quantity);
	} finally { await createSession.close(); }

	const draftEvidence = reconciliationEvidence();
	assert.equal(draftEvidence.docstatus, 0);
	assert.equal(draftEvidence.bin_qty, 0);
	assert.deepEqual(draftEvidence.sle, []);
	assert.deepEqual(draftEvidence.gl, []);
	const scopedPermissions = permissionEvidence(stockEntry);
	assert.equal(scopedPermissions.warehouse_entry.read, true);
	assert.equal(scopedPermissions.warehouse_entry.write, true);
	assert.equal(scopedPermissions.owner.read, false);

	for (const [language, direction] of languages) {
		setLanguage(users.warehouse.email, language);
		const session = await openDesk({ width: 1440, height: 900, user: users.warehouse.email });
		try {
			const forbiddenResponses = collectHttpErrors(session.page);
			await openStockEntry(session.page);
			const boot = await session.page.evaluate(() => ({ language: frappe.boot?.lang, direction: document.documentElement.dir }));
			assert.ok(String(boot.language).toLowerCase().startsWith(language));
			assert.equal(boot.direction, direction);
			for (const [width] of viewports) for (const theme of themes) {
				await inspectStockEntry(session.page, direction, width, theme, 0);
				console.log(`PASS ${language}/${theme}/${width}/Stock Entry/draft`);
			}
			assert.deepEqual({ errors: session.errors, forbiddenResponses }, { errors: [], forbiddenResponses: [] });
		} finally { await session.close(); }
	}

	setLanguage(users.warehouse.email, "en");
	const lifecycleSession = await openDesk({ width: 1024, height: 900, user: users.warehouse.email });
	try {
		await openStockEntry(lifecycleSession.page);
		const submitted = await submitStockEntry(lifecycleSession.page);
		assert.equal(submitted.docstatus, 1);
		await openStockEntry(lifecycleSession.page);
		await inspectStockEntry(lifecycleSession.page, "ltr", 1024, "light", 1);
		const posted = reconciliationEvidence();
		assert.equal(posted.docstatus, 1);
		assert.equal(posted.bin_qty, quantity);
		assert.equal(posted.sle.reduce((sum, row) => sum + Number(row.actual_qty || 0), 0), quantity);
		assert.ok(posted.sle.some(row => Number(row.actual_qty) === quantity));
		assert.ok(posted.gl.length >= 2, "perpetual inventory did not create balanced native GL evidence");
		assert.equal(
			posted.gl.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0),
			0,
			"Stock Entry GL evidence is not balanced"
		);

		const cancelled = await cancelStockEntry(lifecycleSession.page);
		assert.equal(cancelled.docstatus, 2);
		await openStockEntry(lifecycleSession.page);
		await inspectStockEntry(lifecycleSession.page, "ltr", 1024, "dark", 2);
		const reversed = reconciliationEvidence();
		assert.equal(reversed.docstatus, 2);
		assert.equal(reversed.bin_qty, 0);
		assert.equal(reversed.sle.reduce((sum, row) => sum + Number(row.actual_qty || 0), 0), 0);
		assert.equal(
			reversed.gl.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0),
			0,
			"cancelled Stock Entry GL evidence is not balanced"
		);
		assert.deepEqual(lifecycleSession.errors, []);
	} finally { await lifecycleSession.close(); }

	await proveOwnerDenied();
	console.log(`PASS Stock Entry live acceptance ${stockEntry}`);
} finally {
	cleanupNativeFixtures();
	fixtures.cleanup();
}
