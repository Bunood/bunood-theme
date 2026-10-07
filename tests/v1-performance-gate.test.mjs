import assert from "node:assert/strict";
import test from "node:test";

import {
	REQUIRED_CACHE_STATES,
	REQUIRED_DEVICES,
	REQUIRED_EVIDENCE_GROUPS,
	REQUIRED_LOCALES,
	REQUIRED_PROFILES,
	evaluatePerformanceEvidence,
	readJson,
	validatePerformanceBudget,
} from "../tools/v1-performance-gate.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const budget = () => readJson(new URL("../quality/v1-performance-budget.json", import.meta.url));

function metric(rule) {
	const result = {
		error_rate_pct: Math.min(rule.maximum_error_rate_pct, 0.05),
		sample_count: rule.minimum_samples,
	};
	for (const key of ["p50_ms", "p95_ms", "p99_ms"]) {
		if (rule[key] !== undefined) result[key] = rule[key] * 0.8;
	}
	return result;
}

function profileResult(plan, profile) {
	const slices = [];
	for (const locale of REQUIRED_LOCALES) {
		for (const device_class of REQUIRED_DEVICES) {
			for (const cache_state of REQUIRED_CACHE_STATES) {
				const operations = {};
				for (const [id, rule] of Object.entries(plan.operations)) {
					if (rule.cache_states.includes(cache_state)) operations[id] = metric(rule);
				}
				slices.push({
					locale,
					device_class,
					cache_state,
					web_vitals: {
						lcp_ms: { p75: 2000, sample_count: 30 },
						inp_ms: { p75: 150, sample_count: 30 },
						cls: { p75: 0.05, sample_count: 30 },
					},
					operations,
				});
			}
		}
	}
	const queues = {};
	for (const [id, rule] of Object.entries(plan.queues)) {
		queues[id] = {
			ack_p95_ms: rule.ack_p95_ms * 0.8,
			start_age_p95_ms: rule.start_age_p95_ms * 0.8,
			start_age_p99_ms: rule.start_age_p99_ms * 0.8,
			sample_count: rule.minimum_samples,
		};
	}
	return {
		profile,
		fixture_counts: clone(plan.profiles[profile]),
		load_shape: clone(plan.minimum_load_shape),
		slices,
		queues,
		correctness: {
			financial_integrity_errors: 0,
			stock_integrity_errors: 0,
			tax_integrity_errors: 0,
			permission_leaks: 0,
			duplicate_results: 0,
			false_success_events: 0,
		},
	};
}

function acceptedReceipt(plan) {
	const evidence = {};
	for (const id of REQUIRED_EVIDENCE_GROUPS) evidence[id] = [`immutable://${id}/receipt-1`];
	return {
		schema_version: 1,
		candidate: {
			commit: "abc1234",
			release_hash: "sha256:example",
			measured_at: "2026-09-20T12:00:00+03:00",
			environment: "production-like-isolated",
			topology: "recorded-topology-1",
			fixture_hash: "sha256:fixture",
		},
		profile_results: REQUIRED_PROFILES.map(profile => profileResult(plan, profile)),
		reliability: {
			measurement_window_days: 30,
			availability_pct: 99.95,
			unexpected_5xx_5min_pct: 0.05,
			unexpected_5xx_monthly_pct: 0.02,
			unacknowledged_critical_alerts: 0,
			backup_success_pct: 100,
			rpo_minutes: 10,
			rto_minutes: 180,
			restore_drill_age_days: 20,
		},
		regression: {
			mode: "first-accepted-baseline",
			evidence_ref: "immutable://regression/baseline-1",
		},
		evidence,
	};
}

test("the V1 performance budget is complete and remains a target rather than a receipt", () => {
	const plan = budget();
	const result = validatePerformanceBudget(plan);
	assert.deepEqual(result.errors, []);
	assert.equal(result.valid, true);
	assert.match(plan.disclaimer, /not a benchmark receipt/i);
	assert.deepEqual(plan.required_profiles, [...REQUIRED_PROFILES]);
});

test("a complete bilingual device cache and profile receipt can satisfy the gate", () => {
	const plan = budget();
	const result = evaluatePerformanceEvidence({ budget: plan, receipt: acceptedReceipt(plan) });
	assert.equal(result.decision, "PASS");
	assert.deepEqual(result.blockers, []);
	assert.equal(result.profiles, 2);
	assert.equal(result.slices, 16);
});

test("missing Arabic or Standard evidence fails closed", () => {
	const plan = budget();
	const receipt = acceptedReceipt(plan);
	receipt.profile_results = receipt.profile_results.filter(item => item.profile !== "standard");
	receipt.profile_results[0].slices = receipt.profile_results[0].slices.filter(item => item.locale !== "ar");
	const result = evaluatePerformanceEvidence({ budget: plan, receipt });
	assert.equal(result.decision, "HOLD");
	assert.ok(result.blockers.some(item => item.code === "profiles.standard.missing"));
	assert.ok(result.blockers.some(item => item.code.includes("slice.ar|desktop|cold")));
});

test("tail latency correctness and recovery cannot be averaged into a pass", () => {
	const plan = budget();
	const receipt = acceptedReceipt(plan);
	const starter = receipt.profile_results.find(item => item.profile === "starter");
	const warm = starter.slices.find(item => item.locale === "en" && item.device_class === "desktop" && item.cache_state === "warm");
	warm.operations["save-draft"].p99_ms = plan.operations["save-draft"].p99_ms + 1;
	starter.correctness.duplicate_results = 1;
	starter.load_shape.recovery_observed = false;
	const result = evaluatePerformanceEvidence({ budget: plan, receipt });
	assert.equal(result.decision, "HOLD");
	assert.ok(result.blockers.some(item => item.code.endsWith("save-draft.p99_ms.budget")));
	assert.ok(result.blockers.some(item => item.code.endsWith("correctness.duplicate_results")));
	assert.ok(result.blockers.some(item => item.code.endsWith("load.recovery")));
});

test("a declaration or empty template cannot be mistaken for runtime evidence", () => {
	const plan = budget();
	const result = evaluatePerformanceEvidence({ budget: plan, receipt: null });
	assert.equal(result.decision, "HOLD");
	assert.ok(result.blockers.some(item => item.code === "receipt.missing"));
	const template = readJson(new URL("../quality/templates/v1-performance-receipt.template.json", import.meta.url));
	const templateResult = evaluatePerformanceEvidence({ budget: plan, receipt: template });
	assert.equal(templateResult.decision, "HOLD");
	assert.ok(templateResult.blockers.length > 10);
});

test("the budget validator rejects a narrowed matrix and relaxed integrity", () => {
	const plan = clone(budget());
	plan.dimensions.locales = ["en"];
	plan.required_profiles = ["starter"];
	plan.correctness.maximum_duplicate_results = 1;
	delete plan.operations["complete-local-pos-sale"];
	const result = validatePerformanceBudget(plan);
	assert.equal(result.valid, false);
	assert.ok(result.errors.some(error => error.startsWith("dimensions.locales must be exactly")));
	assert.ok(result.errors.some(error => error.startsWith("required_profiles must be exactly")));
	assert.ok(result.errors.some(error => error.includes("correctness.maximum_duplicate_results must remain zero")));
	assert.ok(result.errors.some(error => error.startsWith("operations must be exactly")));
});
