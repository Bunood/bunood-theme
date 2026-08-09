/**
 * Which of our source strings does upstream already translate?
 *
 * WHAT IT WRITES
 *   `bunood_theme/locale/inherited.<lang>.txt` — GENERATED, do not hand-edit.
 *   One msgid per line, tab, then which app supplies it and what it says, so a
 *   reviewer can see the Arabic they are accepting without leaving the file.
 *
 * WHY IT READS THE CONTAINERS AND NOT A VENDORED COPY
 *   The answer depends on the frappe and erpnext versions this stack actually
 *   runs. A copy checked in here would be a snapshot that silently rots: the
 *   day ERPNext changes a word, the gate would still believe our stale version.
 *   Reading the deployed .po files means "inherited" always means "inherited by
 *   THIS deployment", and re-running is how you find out it moved.
 *
 * WHY IT IS A REVIEWED LIST AND NOT AUTOMATIC
 *   37 of our strings collide with upstream and several are false friends — the
 *   word matches, the meaning does not. ERPNext's "Operator" is a machine
 *   operator; "Count" is the verb; "More" is the comparative. Accepting every
 *   collision blindly would inherit those. So this prints a PROPOSAL and only
 *   writes what is not on the reject list, which a human maintains with reasons.
 *
 * USAGE
 *   npm run i18n:inherited          # rewrite the list for `ar`
 *   npm run i18n:inherited -- --dry # print the proposal, write nothing
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "bunood_theme");
const BACKEND = process.env.BND_BACKEND || "bunood-backend-1";
const LANG = process.argv.find((a) => /^--lang=/.test(a))?.split("=")[1] || "ar";
const DRY = process.argv.includes("--dry");

/**
 * Strings we deliberately do NOT inherit, and why.
 *
 * These are the false friends: upstream translates the same English word in a
 * different sense, so taking their Arabic would be wrong on our surface. The
 * fix for each is either a rename (done for "Operator") or our own row.
 * This list is small and argued; it is not a place to park anything awkward.
 */
const REJECT = new Map([
	["Count", "upstream عد is the VERB 'to count'; ours is a badge count (noun)"],
	["More", "upstream أكثر is the comparative 'more than'; a More button is المزيد"],
	["Full", "upstream ممتلئ means 'filled up'; ours is full intensity"],
	["Center", "upstream مركز is a hub (cost centre), not centre alignment"],
	["Mention", "upstream أشير is a verb; ours is a noun — but it is Frappe's own notification type, so we ship no row either"],
	["Mentions", "upstream يذكر is a verb; ours is a noun"],
]);

/**
 * Every app installed on the site, in `installed_apps` order — asked, not
 * listed.
 *
 * It was `["frappe", "erpnext"]` while those were the only two. The moment
 * hrms, crm, helpdesk, payments, telephony, ksa_compliance and
 * bunood_realestate joined, a hardcoded pair would have gone on reporting 30
 * inherited strings while the real answer was 51 — a stale list that still
 * looks like an answer, which is the failure mode this whole file exists to
 * avoid. Order matters too: it is the order the runtime merges them in, so
 * the app that actually WINS a colliding msgid is the last one here.
 */
function installedApps() {
	try {
		const out = execFileSync(
			"docker",
			["exec", BACKEND, "bash", "-lc",
			 `cd /home/frappe/frappe-bench/sites && ../env/bin/python -c ` +
			 `'import frappe,json;frappe.init(site="${SITE}",sites_path=".");frappe.connect();` +
			 `print("APPS=" + json.dumps(frappe.get_installed_apps()))'`],
			{ encoding: "utf8" }
		);
		const m = out.match(/APPS=(\[.*\])/);
		if (m) return JSON.parse(m[1]);
	} catch {
		/* fall through */
	}
	console.error("  WARNING: could not read installed_apps; falling back to frappe + erpnext");
	return ["frappe", "erpnext"];
}

const SITE = process.env.BND_SITE || "demo.bunood.test";
// Everything except ourselves: "inherited" means another app already answers,
// and reading our own ar.csv back would make every row we ship look inherited
// and then redundant — the gate would eat its own tail.
const APPS = installedApps().filter((a) => a !== "bunood_theme");

function poFromContainer(app) {
	try {
		return execFileSync(
			"docker",
			["exec", BACKEND, "bash", "-lc",
			 `cat /home/frappe/frappe-bench/apps/${app}/${app}/locale/${LANG}.po 2>/dev/null || true`],
			{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
		);
	} catch {
		return "";
	}
}

/** msgid -> msgstr, skipping obsolete (#~) entries and empty translations. */
function parsePo(text) {
	const out = new Map();
	let id = null, str = null, field = null;
	const unq = (s) => {
		const m = s.match(/"([\s\S]*)"\s*$/);
		return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : "";
	};
	const flush = () => { if (id && str) out.set(id, str); id = null; str = null; field = null; };
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith("#~") || line === "") { flush(); continue; }
		if (line.startsWith("#")) continue;
		if (line.startsWith("msgid_plural")) { field = "plural"; continue; }
		if (line.startsWith("msgid")) { flush(); id = unq(line.slice(5)); str = ""; field = "id"; continue; }
		if (line.startsWith("msgstr")) { str = unq(line.replace(/^msgstr(\[\d\])?/, "")); field = "str"; continue; }
		if (line.startsWith('"')) {
			if (field === "id") id += unq(line);
			else if (field === "str") str += unq(line);
		}
	}
	flush();
	return out;
}

const { extractCatalogue } = await import(`file://${join(ROOT, "tools", "i18n.mjs").replace(/\\/g, "/")}`);
const catalogue = extractCatalogue();

const upstream = new Map();
for (const app of APPS) {
	const po = poFromContainer(app);
	if (!po.trim()) {
		// Not an error. Most apps ship no Arabic at all — payments,
		// ksa_compliance, bunood_realestate and telephony each have zero, and
		// saying "is the stack running?" here sent me chasing a healthy stack
		// once already. If EVERY app comes back empty, the check below catches
		// that; one empty app is just an app with no translations.
		console.log(`  ${app}: no ${LANG}.po (ships no ${LANG} translations)`);
		continue;
	}
	// A PO the runtime cannot see is a claim, not a translation. The runtime
	// reads the COMPILED .mo under sites/assets/locale, and `bench get-app`
	// does not compile — crm and helpdesk sat exactly here: their POs fed this
	// list, the desk served English, and the coverage gate was green over a
	// gap. Warn loudly; the fix is one command.
	try {
		execFileSync(
			"docker",
			["exec", BACKEND, "bash", "-lc",
			 `test -f /home/frappe/frappe-bench/sites/assets/locale/${LANG}/LC_MESSAGES/${app}.mo`],
			{ encoding: "utf8" }
		);
	} catch {
		console.error(
			`  WARNING: ${app} ships ${LANG}.po but has NO compiled .mo — the runtime ` +
				`serves NONE of it. Run: bench --site <site> compile-po-to-mo`
		);
	}
	for (const [id, s] of parsePo(po)) if (!upstream.has(id)) upstream.set(id, { app, ar: s });
	console.log(`  ${app}: ${parsePo(po).size} translated msgids`);
}
if (!upstream.size) {
	console.error("no upstream translations read — refusing to write an empty inherited list");
	process.exit(1);
}

const hits = [...catalogue.keys()].filter((m) => upstream.has(m)).sort();
const accepted = hits.filter((m) => !REJECT.has(m));
const rejected = hits.filter((m) => REJECT.has(m));

console.log(`\n  our strings: ${catalogue.size}`);
console.log(`  upstream already translates: ${hits.length}`);
console.log(`  accepted as inherited: ${accepted.length}`);
console.log(`  rejected as false friends: ${rejected.length}`);
for (const m of rejected) console.log(`    ${JSON.stringify(m).padEnd(14)} ${REJECT.get(m)}`);

if (DRY) {
	console.log("\n  --dry: nothing written");
	process.exit(0);
}

const lines = [
	"# GENERATED BY tools/i18n_inherited.mjs — DO NOT EDIT BY HAND.",
	"#",
	"# Source strings that frappe or erpnext already translates, in a sense that is",
	"# correct for our surface too. We ship NO row for these: the runtime dictionary",
	"# is one flat global map, so their translation already answers, and shipping our",
	"# own would be a second copy that overrides theirs desk-wide.",
	"#",
	`# Regenerate with: npm run i18n:inherited      (read from ${BACKEND}, lang=${LANG})`,
	"# False friends are rejected in the script's REJECT map, with a reason each.",
	"#",
	`# ${accepted.length} inherited, from ${APPS.join(" + ")}.`,
	"",
	...accepted.map((m) => `${m}\t${upstream.get(m).app}: ${upstream.get(m).ar}`),
];

mkdirSync(join(APP, "locale"), { recursive: true });
const out = join(APP, "locale", `inherited.${LANG}.txt`);
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`\n  wrote ${out.replace(ROOT, ".")} (${accepted.length} entries)`);
