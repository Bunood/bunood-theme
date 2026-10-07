/** Read-only live check: Arabic chart labels must not rename Account records. */
import { benchJson, openDesk, URL_BASE } from "./session.mjs";

const accounts = benchJson(
	'rows = frappe.get_all("Account", filters={"company": "Bunood Development"}, fields=["name", "account_name"], limit=2000)\n' +
	'print(json.dumps(rows, ensure_ascii=False))\n'
);
const { page, errors, close } = await openDesk();
try {
	await page.goto(`${URL_BASE}/desk/account/view/tree`, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => Boolean(window.cur_tree?.nodes?.["1000 - Application of Funds (Assets) - BDEV"]));
	const result = await page.evaluate(accounts => {
		const root = cur_tree.nodes["1000 - Application of Funds (Assets) - BDEV"];
		const source = root.label;
		const arabic = cur_tree.get_node_label(root);
		const previous = frappe.boot.lang;
		frappe.boot.lang = "en";
		const english = cur_tree.get_node_label(root);
		frappe.boot.lang = previous;
		return {
			language: previous,
			stored: source,
			arabic,
			english,
			untranslated: accounts.filter(row => !/[\u0600-\u06ff]/u.test(row.account_name) && __(row.account_name) === row.account_name).map(row => row.account_name),
			unlocalizedNodes: accounts.filter(row => !/[\u0600-\u06ff]/u.test(row.account_name) && cur_tree.get_node_label({ label: row.name }).includes(row.account_name)).map(row => row.name),
			liabilities: cur_tree.get_node_label(cur_tree.nodes["2000 - Source of Funds (Liabilities) - BDEV"]),
		};
	}, accounts);
	if (result.language !== "ar") throw new Error(`Expected Arabic desk, got ${result.language}`);
	if (!result.arabic.includes("الأصول") || result.arabic.includes("Application of Funds")) throw new Error(`Arabic tree label: ${result.arabic}`);
	if (!result.liabilities.includes("مصادر الأموال (الالتزامات)")) throw new Error(`Liabilities translation: ${result.liabilities}`);
	if (!result.english.includes("Application of Funds (Assets)")) throw new Error(`English label changed: ${result.english}`);
	if (result.stored !== "1000 - Application of Funds (Assets) - BDEV") throw new Error(`Account key changed: ${result.stored}`);
	if (result.untranslated.length) throw new Error(`Missing Arabic account names: ${result.untranslated.join(", ")}`);
	if (result.unlocalizedNodes.length) throw new Error(`Unlocalized tree nodes: ${result.unlocalizedNodes.join(", ")}`);
	if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
	console.log(`Arabic Account tree: ${accounts.length} names translated, English keys unchanged`);
} finally {
	await close();
}
