#!/usr/bin/env node
/**
 * Decide whether the Bunood MVP candidate is releasable from current evidence.
 *
 * Software checks can be automated; legal identity and physical print checks
 * cannot.  This gate therefore combines live, read-only Company data, package
 * identity, Git state and an explicit owner/physical acceptance record.  It
 * exits non-zero while any launch blocker remains so a green build cannot be
 * mistaken for production approval.
 *
 * Usage:
 *   npm run release:check
 *   npm run release:check -- --pre-tag
 *   npm run release:check -- --json
 *   npm run release:check -- --acceptance path/to/acceptance.json
 *
 * The local stack can be selected with the same BND_SITE, BND_BACKEND and
 * BND_DOCKER environment variables used by the other acceptance tools.
 */

import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

import {benchJson, SITE} from "./session.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ACCEPTANCE = resolve(ROOT, "docs/BUNOOD-MVP-RELEASE-ACCEPTANCE.json");

function blocker(code, message) {
	return {code, message};
}

function requireEvidence(blockers, code, passed, evidence, label) {
	if (!passed) {
		blockers.push(blocker(code, `${label} has not passed`));
		return;
	}
	if (!String(evidence || "").trim()) {
		blockers.push(blocker(`${code}.evidence`, `${label} is marked passed without evidence`));
	}
}

function isPlaceholderEmail(value) {
	const email = String(value || "").trim().toLowerCase();
	const match = email.match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
	if (!match) return true;
	const [, local, domain] = match;
	return /^(test|demo|sample|placeholder|xxx|yyy|zzz|jjj)$/.test(local) ||
		/^(example\.(com|org|net)|gma\.com|gmail\.con)$/.test(domain);
}

/** Evaluate already-collected facts. Exported so the release decision is tested. */
export function evaluateReadiness({acceptance, company, packageState, gitState, site = SITE, requireTag = true}) {
	const blockers = [];
	const candidate = acceptance?.candidate || {};
	const owner = acceptance?.owner_confirmation || {};
	const physical = acceptance?.physical_acceptance || {};

	if (acceptance?.schema_version !== 1) {
		blockers.push(blocker("acceptance.schema", "acceptance schema_version must be 1"));
	}
	if (candidate.site !== site) {
		blockers.push(blocker("candidate.site", `acceptance targets ${candidate.site || "no site"}, not ${site}`));
	}
	if (candidate.company !== company?.name) {
		blockers.push(blocker("candidate.company", "acceptance company does not match the live Company record"));
	}
	if (candidate.version !== packageState.version) {
		blockers.push(blocker("candidate.version", "acceptance version does not match the package version"));
	}
	if (packageState.version !== packageState.hooksVersion) {
		blockers.push(blocker("package.version", "__version__ and hooks.app_version do not match"));
	}
	if (!packageState.assetsPresent) {
		blockers.push(blocker("package.assets", "one or more content-hashed release assets are missing"));
	}

	if (!company?.tax_id) blockers.push(blocker("company.vat", "Company VAT number is empty"));
	if (!company?.address) blockers.push(blocker("company.address", "Company address is empty"));
	if (!company?.logo) blockers.push(blocker("company.logo", "Company logo is empty"));
	if (!company?.phone || String(company.phone).replace(/\D/g, "").length < 7) {
		blockers.push(blocker("company.phone", "Company phone is empty or still placeholder-length"));
	}
	if (isPlaceholderEmail(company?.email)) {
		blockers.push(blocker("company.email", "Company email is empty, malformed or placeholder-looking"));
	}

	if (!owner.confirmed_by || !owner.confirmed_at) {
		blockers.push(blocker("owner.identity", "owner confirmation needs confirmed_by and confirmed_at"));
	}
	for (const [field, label] of [
		["legal_identity", "legal company identity and VAT"],
		["address_and_contact", "company address and contact details"],
		["logo", "production logo"],
		["zatca_configuration", "ZATCA environment and configuration"],
	]) {
		if (owner[field] !== true) blockers.push(blocker(`owner.${field}`, `${label} is not owner-confirmed`));
	}

	requireEvidence(blockers, "physical.a4", physical.a4_print?.passed, physical.a4_print?.evidence, "A4 physical print");
	requireEvidence(blockers, "physical.thermal", physical.thermal_80mm?.passed, physical.thermal_80mm?.evidence, "80 mm physical print");
	requireEvidence(blockers, "physical.qr", physical.printed_qr_scan?.passed, physical.printed_qr_scan?.evidence, "printed QR scan");
	requireEvidence(
		blockers,
		"physical.compare",
		physical.preview_pdf_paper_match?.passed,
		physical.preview_pdf_paper_match?.evidence,
		"preview/PDF/paper comparison",
	);

	if (!gitState.clean) blockers.push(blocker("release.git_clean", `working tree has ${gitState.entries} status entries`));
	if (requireTag && !gitState.tags.includes(`v${packageState.version}`)) {
		blockers.push(blocker("release.tag", `HEAD is not tagged v${packageState.version}`));
	}

	return {
		decision: blockers.length ? "HOLD" : "PASS",
		site,
		company: company?.name || null,
		version: packageState.version,
		blockers,
	};
}

function versionFrom(path, pattern, label) {
	const match = readFileSync(path, "utf8").match(pattern);
	if (!match) throw new Error(`could not read ${label}`);
	return match[1];
}

function packageState() {
	const version = versionFrom(
		resolve(ROOT, "bunood_theme/__init__.py"),
		/__version__\s*=\s*["']([^"']+)["']/,
		"bunood_theme.__version__",
	);
	const hooksVersion = versionFrom(
		resolve(ROOT, "bunood_theme/hooks.py"),
		/app_version\s*=\s*["']([^"']+)["']/,
		"hooks.app_version",
	);
	const assets = readFileSync(resolve(ROOT, "bunood_theme/assets.py"), "utf8");
	const paths = [...assets.matchAll(/["'](\/assets\/bunood_theme\/dist\/[^"']+)["']/g)].map((match) => match[1]);
	const assetsPresent = paths.length > 0 && paths.every((path) => {
		const relative = path.replace("/assets/bunood_theme/", "bunood_theme/public/");
		try {
			readFileSync(resolve(ROOT, relative));
			return true;
		} catch {
			return false;
		}
	});
	return {version, hooksVersion, assetsPresent};
}

function gitState() {
	const status = execFileSync("git", ["status", "--porcelain"], {cwd: ROOT, encoding: "utf8"})
		.trim()
		.split(/\r?\n/)
		.filter(Boolean);
	const tags = execFileSync("git", ["tag", "--points-at", "HEAD"], {cwd: ROOT, encoding: "utf8"})
		.trim()
		.split(/\r?\n/)
		.filter(Boolean);
	return {clean: status.length === 0, entries: status.length, tags};
}

function liveCompany(name) {
	const encoded = JSON.stringify(name);
	return benchJson(
		`name = json.loads(${JSON.stringify(encoded)})\n` +
		`company = frappe.get_doc("Company", name)\n` +
		`address_name = frappe.db.get_value("Dynamic Link", {"link_doctype": "Company", "link_name": name, "parenttype": "Address"}, "parent")\n` +
		`address = frappe.get_doc("Address", address_name) if address_name else None\n` +
		`parts = [address.get(field) for field in ("address_line1", "address_line2", "city", "state", "pincode", "country") if address and address.get(field)]\n` +
		`print(json.dumps({"name": company.name, "company_name": company.company_name, "tax_id": company.tax_id, "country": company.country, "currency": company.default_currency, "phone": company.phone_no, "email": company.email, "logo": company.company_logo, "address": ", ".join(parts)}))\n`,
	);
}

function argument(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
	const acceptancePath = resolve(argument("acceptance", DEFAULT_ACCEPTANCE));
	const acceptance = JSON.parse(readFileSync(acceptancePath, "utf8"));
	const company = liveCompany(acceptance?.candidate?.company);
	const result = evaluateReadiness({
		acceptance,
		company,
		packageState: packageState(),
		gitState: gitState(),
		requireTag: !process.argv.includes("--pre-tag"),
	});

	if (process.argv.includes("--json")) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(`Bunood MVP release readiness: ${result.decision}`);
		console.log(`site=${result.site} company=${result.company} version=${result.version}`);
		for (const item of result.blockers) console.log(`- ${item.code}: ${item.message}`);
		if (!result.blockers.length) console.log("All automated, owner and physical acceptance gates have evidence.");
	}
	process.exitCode = result.decision === "PASS" ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch((error) => {
	console.error(`release readiness check failed: ${error.message}`);
	process.exitCode = 2;
});
