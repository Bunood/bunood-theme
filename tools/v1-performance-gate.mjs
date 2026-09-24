#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_BUDGET = resolve(ROOT, "quality", "v1-performance-budget.json");

export const REQUIRED_PROFILES = Object.freeze(["starter", "standard"]);
export const REQUIRED_LOCALES = Object.freeze(["en", "ar"]);
export const REQUIRED_DEVICES = Object.freeze(["desktop", "mobile"]);
export const REQUIRED_CACHE_STATES = Object.freeze(["cold", "warm"]);
export const REQUIRED_WEB_VITALS = Object.freeze(["lcp_ms", "inp_ms", "cls"]);
export const REQUIRED_OPERATIONS = Object.freeze([
	"route-ready-warm",
	"route-ready-cold",
	"common-read-api-warm",
	"first-page-list-filter",
	"global-search-result",
	"pos-item-search-result",
	"pos-add-edit-cart-line",
	"save-draft",
	"submit-native-transaction",
	"complete-local-pos-sale",
	"role-dashboard-ready",
	"standard-interactive-report",
	"print-preview",
	"pdf-generation",
]);
export const REQUIRED_QUEUES = Object.freeze([
	"user-blocking-short",
	"normal-default",
	"bulk-long",
]);
export const REQUIRED_CORRECTNESS = Object.freeze([
	"financial_integrity_errors",
	"stock_integrity_errors",
	"tax_integrity_errors",
	"permission_leaks",
	"duplicate_results",
	"false_success_events",
]);
export const REQUIRED_EVIDENCE_GROUPS = Object.freeze([
	"raw_metrics",
	"fixture_and_reconciliation",
	"load_and_soak",
	"queue_and_worker",
	"alerts",
	"backup_and_restore",
	"candidate_identity",
]);

function finite(value) {
	return typeof value === "number" && Number.isFinite(value);
}

function members(actual = [], expected = []) {
	return actual.length === expected.length && expected.every(value => actual.includes(value));
}

function duplicates(values = []) {
	const seen = new Set();
	return values.filter(value => seen.has(value) || !seen.add(value));
}

function add(blockers, code, message) {
	blockers.push({ code, message });
}

function requireFinite(errors, value, path, { minimum = 0, maximum = Infinity } = {}) {
	if (!finite(value) || value < minimum || value > maximum) {
		errors.push(`${path} must be a finite number from ${minimum} to ${maximum}`);
	}
}

function requireExactMembers(errors, value, expected, path) {
	if (!members(value, expected)) errors.push(`${path} must be exactly: ${expected.join(", ")}`);
	for (const duplicate of duplicates(value || [])) errors.push(`${path} repeats ${duplicate}`);
}

export function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function validatePerformanceBudget(budget, { root = ROOT, checkFiles = true } = {}) {
	const errors = [];
	if (budget?.schema_version !== 1) errors.push("schema_version must be 1");
	if (!String(budget?.disclaimer || "").toLowerCase().includes("not a benchmark receipt")) {
		errors.push("disclaimer must state that the budget is not a benchmark receipt");
	}
	if (!budget?.authority || (checkFiles && !existsSync(resolve(root, budget.authority)))) {
		errors.push("authority must point to the performance and reliability contract");
	}
	requireExactMembers(errors, budget?.required_profiles, REQUIRED_PROFILES, "required_profiles");

	for (const [id, profile] of Object.entries(budget?.profiles || {})) {
		for (const field of [
			"active_sessions", "companies", "items", "parties", "submitted_invoices",
			"gl_entries", "stock_ledger_entries",
		]) requireFinite(errors, profile?.[field], `profiles.${id}.${field}`, { minimum: 1 });
	}
	for (const id of [...REQUIRED_PROFILES, "high-volume"]) {
		if (!budget?.profiles?.[id]) errors.push(`profiles is missing ${id}`);
	}

	requireExactMembers(errors, budget?.dimensions?.locales, REQUIRED_LOCALES, "dimensions.locales");
	requireExactMembers(errors, budget?.dimensions?.device_classes, REQUIRED_DEVICES, "dimensions.device_classes");
	requireExactMembers(errors, budget?.dimensions?.cache_states, REQUIRED_CACHE_STATES, "dimensions.cache_states");

	for (const field of ["steady_minutes", "peak_minutes", "peak_session_multiplier"]) {
		requireFinite(errors, budget?.minimum_load_shape?.[field], `minimum_load_shape.${field}`, { minimum: 1 });
	}
	if (budget?.minimum_load_shape?.recovery_observed !== true) {
		errors.push("minimum_load_shape.recovery_observed must be true");
	}

	requireExactMembers(errors, Object.keys(budget?.web_vitals || {}), REQUIRED_WEB_VITALS, "web_vitals");
	for (const id of REQUIRED_WEB_VITALS) {
		const rule = budget?.web_vitals?.[id];
		if (rule?.percentile !== "p75") errors.push(`web_vitals.${id}.percentile must be p75`);
		requireFinite(errors, rule?.maximum, `web_vitals.${id}.maximum`, { minimum: 0 });
		requireFinite(errors, rule?.minimum_samples, `web_vitals.${id}.minimum_samples`, { minimum: 1 });
	}

	requireExactMembers(errors, Object.keys(budget?.operations || {}), REQUIRED_OPERATIONS, "operations");
	for (const id of REQUIRED_OPERATIONS) {
		const rule = budget?.operations?.[id];
		if (!rule) continue;
		if (!Array.isArray(rule.cache_states) || !rule.cache_states.length ||
			rule.cache_states.some(value => !REQUIRED_CACHE_STATES.includes(value))) {
			errors.push(`operations.${id}.cache_states must contain supported cache states`);
		}
		for (const key of ["p50_ms", "p95_ms", "p99_ms"]) {
			if (rule[key] !== undefined) requireFinite(errors, rule[key], `operations.${id}.${key}`, { minimum: 0 });
		}
		if (finite(rule.p50_ms) && finite(rule.p95_ms) && rule.p50_ms > rule.p95_ms) {
			errors.push(`operations.${id} p50_ms cannot exceed p95_ms`);
		}
		if (finite(rule.p95_ms) && finite(rule.p99_ms) && rule.p95_ms > rule.p99_ms) {
			errors.push(`operations.${id} p95_ms cannot exceed p99_ms`);
		}
		requireFinite(errors, rule.maximum_error_rate_pct, `operations.${id}.maximum_error_rate_pct`, { minimum: 0, maximum: 100 });
		requireFinite(errors, rule.minimum_samples, `operations.${id}.minimum_samples`, { minimum: 1 });
	}

	requireExactMembers(errors, Object.keys(budget?.queues || {}), REQUIRED_QUEUES, "queues");
	for (const id of REQUIRED_QUEUES) {
		const rule = budget?.queues?.[id];
		for (const field of ["ack_p95_ms", "start_age_p95_ms", "start_age_p99_ms", "minimum_samples"]) {
			requireFinite(errors, rule?.[field], `queues.${id}.${field}`, { minimum: field === "minimum_samples" ? 1 : 0 });
		}
		if (finite(rule?.start_age_p95_ms) && finite(rule?.start_age_p99_ms) && rule.start_age_p95_ms > rule.start_age_p99_ms) {
			errors.push(`queues.${id} start_age_p95_ms cannot exceed start_age_p99_ms`);
		}
	}

	const correctnessKeys = REQUIRED_CORRECTNESS.map(id => `maximum_${id}`);
	requireExactMembers(errors, Object.keys(budget?.correctness || {}), correctnessKeys, "correctness");
	for (const field of Object.keys(budget?.correctness || {})) {
		if (budget.correctness[field] !== 0) errors.push(`correctness.${field} must remain zero`);
	}

	for (const field of [
		"minimum_measurement_window_days", "minimum_availability_pct", "maximum_unexpected_5xx_5min_pct",
		"maximum_unexpected_5xx_monthly_pct", "maximum_unacknowledged_critical_alerts",
		"minimum_backup_success_pct", "maximum_rpo_minutes", "maximum_rto_minutes", "maximum_restore_drill_age_days",
	]) requireFinite(errors, budget?.reliability?.[field], `reliability.${field}`, { minimum: 0 });

	requireFinite(errors, budget?.regression?.maximum_p95_increase_pct, "regression.maximum_p95_increase_pct", { minimum: 0 });
	if (!budget?.regression?.bundle_budget || (checkFiles && !existsSync(resolve(root, budget.regression.bundle_budget)))) {
		errors.push("regression.bundle_budget must point to the build payload budget");
	}
	requireExactMembers(errors, budget?.required_evidence_groups, REQUIRED_EVIDENCE_GROUPS, "required_evidence_groups");

	return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

function evaluateMetric(blockers, code, measurement, rule) {
	if (!measurement || typeof measurement !== "object") {
		add(blockers, `${code}.missing`, `${code} measurement is missing`);
		return;
	}
	for (const key of ["p50_ms", "p95_ms", "p99_ms"]) {
		if (rule[key] === undefined) continue;
		if (!finite(measurement[key])) add(blockers, `${code}.${key}.missing`, `${code} ${key} is missing`);
		else if (measurement[key] > rule[key]) add(blockers, `${code}.${key}.budget`, `${measurement[key]} exceeds ${rule[key]} ms`);
	}
	if (!finite(measurement.error_rate_pct)) add(blockers, `${code}.error_rate.missing`, `${code} error_rate_pct is missing`);
	else if (measurement.error_rate_pct > rule.maximum_error_rate_pct) {
		add(blockers, `${code}.error_rate.budget`, `${measurement.error_rate_pct}% exceeds ${rule.maximum_error_rate_pct}%`);
	}
	if (!finite(measurement.sample_count) || measurement.sample_count < rule.minimum_samples) {
		add(blockers, `${code}.samples`, `${code} needs at least ${rule.minimum_samples} samples`);
	}
	const ordered = [measurement.p50_ms, measurement.p95_ms, measurement.p99_ms].filter(finite);
	if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) {
		add(blockers, `${code}.percentiles`, `${code} percentiles are not monotonic`);
	}
}

function evaluateVitals(blockers, code, measurements, rules) {
	for (const id of REQUIRED_WEB_VITALS) {
		const value = measurements?.[id];
		const rule = rules[id];
		if (!value || !finite(value.p75)) add(blockers, `${code}.${id}.missing`, `${id} p75 is missing`);
		else if (value.p75 > rule.maximum) add(blockers, `${code}.${id}.budget`, `${id} p75 ${value.p75} exceeds ${rule.maximum}`);
		if (!value || !finite(value.sample_count) || value.sample_count < rule.minimum_samples) {
			add(blockers, `${code}.${id}.samples`, `${id} needs at least ${rule.minimum_samples} samples`);
		}
	}
}

function expectedSliceKeys(budget) {
	const keys = [];
	for (const locale of budget.dimensions.locales) {
		for (const device of budget.dimensions.device_classes) {
			for (const cache of budget.dimensions.cache_states) keys.push(`${locale}|${device}|${cache}`);
		}
	}
	return keys;
}

function evaluateProfile(blockers, budget, result) {
	const profile = result?.profile || "<missing>";
	const code = `profiles.${profile}`;
	const target = budget.profiles[profile];
	if (!target) {
		add(blockers, `${code}.unknown`, `unsupported profile ${profile}`);
		return;
	}
	for (const [field, minimum] of Object.entries(target)) {
		if (!finite(result?.fixture_counts?.[field]) || result.fixture_counts[field] < minimum) {
			add(blockers, `${code}.fixture.${field}`, `${field} must be at least ${minimum}`);
		}
	}
	for (const field of ["steady_minutes", "peak_minutes", "peak_session_multiplier"]) {
		const minimum = budget.minimum_load_shape[field];
		if (!finite(result?.load_shape?.[field]) || result.load_shape[field] < minimum) {
			add(blockers, `${code}.load.${field}`, `${field} must be at least ${minimum}`);
		}
	}
	if (result?.load_shape?.recovery_observed !== true) add(blockers, `${code}.load.recovery`, "post-peak recovery was not observed");

	const expected = expectedSliceKeys(budget);
	const slices = result?.slices || [];
	const actual = slices.map(slice => `${slice.locale}|${slice.device_class}|${slice.cache_state}`);
	for (const key of expected) if (!actual.includes(key)) add(blockers, `${code}.slice.${key}`, `missing slice ${key}`);
	for (const duplicate of duplicates(actual)) add(blockers, `${code}.slice.duplicate`, `duplicate slice ${duplicate}`);
	for (const slice of slices) {
		const sliceCode = `${code}.slice.${slice.locale}|${slice.device_class}|${slice.cache_state}`;
		if (!expected.includes(`${slice.locale}|${slice.device_class}|${slice.cache_state}`)) {
			add(blockers, `${sliceCode}.unsupported`, "slice is outside the required matrix");
			continue;
		}
		evaluateVitals(blockers, sliceCode, slice.web_vitals, budget.web_vitals);
		for (const [id, rule] of Object.entries(budget.operations)) {
			if (rule.cache_states.includes(slice.cache_state)) {
				evaluateMetric(blockers, `${sliceCode}.operations.${id}`, slice.operations?.[id], rule);
			}
		}
	}

	for (const [id, rule] of Object.entries(budget.queues)) {
		const measurement = result?.queues?.[id];
		const queueCode = `${code}.queues.${id}`;
		if (!measurement) {
			add(blockers, `${queueCode}.missing`, `${id} queue measurement is missing`);
			continue;
		}
		for (const field of ["ack_p95_ms", "start_age_p95_ms", "start_age_p99_ms"]) {
			if (!finite(measurement[field])) add(blockers, `${queueCode}.${field}.missing`, `${field} is missing`);
			else if (measurement[field] > rule[field]) add(blockers, `${queueCode}.${field}.budget`, `${measurement[field]} exceeds ${rule[field]} ms`);
		}
		if (!finite(measurement.sample_count) || measurement.sample_count < rule.minimum_samples) {
			add(blockers, `${queueCode}.samples`, `${id} needs at least ${rule.minimum_samples} samples`);
		}
	}

	for (const id of REQUIRED_CORRECTNESS) {
		const maximumKey = `maximum_${id}`;
		const value = result?.correctness?.[id];
		if (!finite(value)) add(blockers, `${code}.correctness.${id}.missing`, `${id} is missing`);
		else if (value > budget.correctness[maximumKey]) add(blockers, `${code}.correctness.${id}`, `${id} must remain zero`);
	}
}

function evaluateReliability(blockers, budget, receipt) {
	const value = receipt?.reliability || {};
	const rules = budget.reliability;
	const minimums = [
		["measurement_window_days", "minimum_measurement_window_days"],
		["availability_pct", "minimum_availability_pct"],
		["backup_success_pct", "minimum_backup_success_pct"],
	];
	const maximums = [
		["unexpected_5xx_5min_pct", "maximum_unexpected_5xx_5min_pct"],
		["unexpected_5xx_monthly_pct", "maximum_unexpected_5xx_monthly_pct"],
		["unacknowledged_critical_alerts", "maximum_unacknowledged_critical_alerts"],
		["rpo_minutes", "maximum_rpo_minutes"],
		["rto_minutes", "maximum_rto_minutes"],
		["restore_drill_age_days", "maximum_restore_drill_age_days"],
	];
	for (const [field, rule] of minimums) {
		if (!finite(value[field])) add(blockers, `reliability.${field}.missing`, `${field} is missing`);
		else if (value[field] < rules[rule]) add(blockers, `reliability.${field}.budget`, `${value[field]} is below ${rules[rule]}`);
	}
	for (const [field, rule] of maximums) {
		if (!finite(value[field])) add(blockers, `reliability.${field}.missing`, `${field} is missing`);
		else if (value[field] > rules[rule]) add(blockers, `reliability.${field}.budget`, `${value[field]} exceeds ${rules[rule]}`);
	}
}

export function evaluatePerformanceEvidence({ budget, receipt, root = ROOT }) {
	const budgetResult = validatePerformanceBudget(budget, { root });
	const blockers = budgetResult.errors.map(message => ({ code: "budget.invalid", message }));
	if (!receipt) {
		add(blockers, "receipt.missing", "no performance evidence receipt was supplied");
		return Object.freeze({ decision: "HOLD", blockers: Object.freeze(blockers), profiles: 0, slices: 0 });
	}
	if (receipt.schema_version !== 1) add(blockers, "receipt.schema", "receipt schema_version must be 1");
	for (const field of ["commit", "release_hash", "measured_at", "environment", "topology", "fixture_hash"]) {
		if (!String(receipt?.candidate?.[field] || "").trim()) add(blockers, `candidate.${field}`, `${field} is required`);
	}
	if (receipt?.candidate?.measured_at && Number.isNaN(Date.parse(receipt.candidate.measured_at))) {
		add(blockers, "candidate.measured_at.invalid", "measured_at must be an ISO-compatible timestamp");
	}

	const results = receipt.profile_results || [];
	const profiles = results.map(item => item.profile);
	for (const id of REQUIRED_PROFILES) if (!profiles.includes(id)) add(blockers, `profiles.${id}.missing`, `${id} profile evidence is missing`);
	for (const duplicate of duplicates(profiles)) add(blockers, "profiles.duplicate", `profile ${duplicate} is repeated`);
	for (const result of results) evaluateProfile(blockers, budget, result);

	evaluateReliability(blockers, budget, receipt);
	const regression = receipt.regression || {};
	if (!["first-accepted-baseline", "compared-to-accepted-baseline"].includes(regression.mode)) {
		add(blockers, "regression.mode", "regression mode must establish or compare with an accepted baseline");
	}
	if (!String(regression.evidence_ref || "").trim()) add(blockers, "regression.evidence", "regression evidence_ref is required");
	if (regression.mode === "compared-to-accepted-baseline") {
		if (!finite(regression.maximum_p95_increase_pct)) add(blockers, "regression.p95.missing", "maximum p95 increase is missing");
		else if (regression.maximum_p95_increase_pct > budget.regression.maximum_p95_increase_pct) {
			add(blockers, "regression.p95.budget", `${regression.maximum_p95_increase_pct}% exceeds ${budget.regression.maximum_p95_increase_pct}%`);
		}
	}

	for (const id of budget.required_evidence_groups) {
		if (!Array.isArray(receipt?.evidence?.[id]) || !receipt.evidence[id].some(value => String(value).trim())) {
			add(blockers, `evidence.${id}`, `${id} needs at least one immutable evidence reference`);
		}
	}
	const sliceCount = results.reduce((total, item) => total + (item.slices?.length || 0), 0);
	return Object.freeze({
		decision: blockers.length ? "HOLD" : "PASS",
		blockers: Object.freeze(blockers),
		profiles: results.length,
		slices: sliceCount,
	});
}

function argument(name, fallback = undefined) {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
	const budgetPath = resolve(argument("budget", DEFAULT_BUDGET));
	const budget = readJson(budgetPath);
	const plan = validatePerformanceBudget(budget);
	const receiptArgument = argument("receipt");
	const requireReceipt = process.argv.includes("--require-receipt");
	if (!receiptArgument && !requireReceipt) {
		const result = { decision: plan.valid ? "PLAN_VALID" : "PLAN_INVALID", errors: plan.errors };
		if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
		else {
			console.log(`Bunood V1 performance budget: ${result.decision}`);
			console.log("Target declaration only — no runtime performance claim was evaluated.");
			for (const error of plan.errors) console.error(`- ${error}`);
		}
		process.exitCode = plan.valid ? 0 : 1;
		return;
	}
	let receipt = null;
	if (receiptArgument) {
		const receiptPath = resolve(receiptArgument);
		if (!existsSync(receiptPath)) {
			if (process.argv.includes("--json")) console.log(JSON.stringify({ decision: "HOLD", blockers: [{ code: "receipt.file", message: `receipt does not exist: ${receiptPath}` }] }, null, 2));
			else console.error(`Bunood V1 performance evidence: HOLD\n- receipt.file: receipt does not exist: ${receiptPath}`);
			process.exitCode = 1;
			return;
		}
		receipt = readJson(receiptPath);
	}
	const result = evaluatePerformanceEvidence({ budget, receipt });
	if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
	else {
		console.log(`Bunood V1 performance evidence: ${result.decision}`);
		console.log(`profiles=${result.profiles} slices=${result.slices}`);
		for (const blocker of result.blockers) console.error(`- ${blocker.code}: ${blocker.message}`);
	}
	process.exitCode = result.decision === "PASS" ? 0 : 1;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) main().catch(error => {
	console.error(`performance gate failed: ${error.message}`);
	process.exitCode = 2;
});
