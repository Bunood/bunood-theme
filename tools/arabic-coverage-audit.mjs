/** Read-only installed-app Arabic coverage snapshot for the isolated pilot. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { benchJson } from "./session.mjs";

const apps = benchJson('print(json.dumps(frappe.get_installed_apps()))');
const snapshot = { site: process.env.BND_SITE || "demo.bunood.test", apps: {} };
for (const app of apps) {
	const code = [
		"from frappe.translate import get_all_translations, get_messages_for_app",
		't=get_all_translations("ar")',
		`messages={m[1] for m in get_messages_for_app(${JSON.stringify(app)}) if len(m)>1 and isinstance(m[1],str)}`,
		"missing=sorted(m for m in messages if not t.get(m))",
		"print(json.dumps({'total':len(messages),'missing':missing},ensure_ascii=False))",
	].join("\n");
	const result = benchJson(code);
	snapshot.apps[app] = result;
	console.log(`${app}: ${result.total - result.missing.length}/${result.total} translated; ${result.missing.length} missing`);
}
snapshot.accounts = benchJson([
	'from frappe.translate import get_all_translations',
	't = get_all_translations("ar")',
	'rows = frappe.get_all("Account", filters={"company": "Bunood Development"}, fields=["name", "account_name"], limit_page_length=0)',
	'print(json.dumps([{**row, "arabic": t.get(row["account_name"], "")} for row in rows], ensure_ascii=False))',
].join("\n"));
snapshot.provider = benchJson([
	'from bunood_theme.i18n import providers as providers_mod',
	'settings = frappe.get_single("Bunood Translation Settings")',
	'provider = settings.provider or "Claude"',
	'available, reason = providers_mod.PROVIDERS[provider]["available"](settings)',
	'print(json.dumps({"provider": provider, "available": available, "reason": reason, "cap_usd": settings.spend_cap_usd or 5.0}))',
].join("\n"));
mkdirSync(join("artifacts", "arabic-audit"), { recursive: true });
const path = join("artifacts", "arabic-audit", "coverage.json");
writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`Saved ${path}`);
