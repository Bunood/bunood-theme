/** Read-only live gate for the three optional finance workbenches. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { benchJson, goto, openDesk } from "./session.mjs";

const company = process.env.BND_FINANCE_COMPANY || "Bunood Development";
const checks = [
	["bnd-finance-close", ".bnd-close", "bunood_theme.finance_close", "get_finance_close_cockpit"],
	["bnd-journal-workbench", ".bnd-journal", "bunood_theme.journal_workbench", "get_journal_workbench"],
	["bnd-banking", ".bnd-banking", "bunood_theme.banking", "get_bank_reconciliation_workbench"],
];

const results = benchJson(
	`company = ${JSON.stringify(company)}\n` +
	"from importlib import import_module\n" +
	`checks = ${JSON.stringify(checks)}\n` +
	"result = []\n" +
	"for route, selector, module, method in checks:\n" +
	"    fn = getattr(import_module(module), method)\n" +
	"    frappe.set_user('Administrator')\n" +
	"    value = fn(company)\n" +
	"    assert isinstance(value, dict), route + ' did not return a mapping'\n" +
	"    frappe.set_user('Guest')\n" +
	"    try:\n" +
	"        fn(company)\n" +
	"    except (frappe.PermissionError, frappe.DoesNotExistError):\n" +
	"        denied = True\n" +
	"    else:\n" +
	"        denied = False\n" +
	"    result.append({'route': route, 'keys': sorted(value), 'guest_denied': denied})\n" +
	"frappe.set_user('Administrator')\n" +
	"print(json.dumps(result, default=str))\n"
);
for (const row of results) assert.equal(row.guest_denied, true, `${row.route} exposed company data to Guest`);

const output = join("artifacts", "finance-capability");
mkdirSync(output, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
try {
	for (const [route, selector] of checks) {
		await goto(session.page, `/desk/${route}`, selector, { settle: 500 });
		assert.equal(await session.page.locator(`${selector}-load-error`).count(), 0, `${route} failed to load its asset`);
		const overflow = await session.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		assert.ok(overflow <= 1, `${route} has ${overflow}px horizontal overflow`);
		await session.page.screenshot({ path: join(output, `${route}.png`), fullPage: false });
	}
} finally {
	await session.close();
}
console.log(`PASS finance routes, native evidence and Guest denial: ${JSON.stringify(results)}`);
