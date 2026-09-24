const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {resolve} = require('node:path');

const modulePromise = import(pathToFileURL(resolve(__dirname, '../tools/release-readiness.mjs')).href);

function accepted() {
	return {
		schema_version: 1,
		candidate: {site: 'rc20.localhost', company: 'Bunood Development', version: '0.46.35'},
		owner_confirmation: {
			confirmed_by: 'Owner',
			confirmed_at: '2026-09-20T12:00:00+03:00',
			legal_identity: true,
			address_and_contact: true,
			logo: true,
			zatca_configuration: true,
		},
		physical_acceptance: {
			a4_print: {passed: true, evidence: 'Printer A / invoice 1'},
			thermal_80mm: {passed: true, evidence: 'Printer T / invoice 1'},
			printed_qr_scan: {passed: true, evidence: 'Phone P / decoded invoice 1'},
			preview_pdf_paper_match: {passed: true, evidence: 'Compared invoice 1'},
		},
	};
}

function liveCompany() {
	return {
		name: 'Bunood Development', tax_id: '310000000000003', address: 'Riyadh',
		logo: '/files/logo.png', phone: '+966112345678', email: 'owner@bunood.example',
	};
}

test('release readiness passes only with complete evidence and a matching clean tag', async () => {
	const {evaluateReadiness} = await modulePromise;
	const result = evaluateReadiness({
		acceptance: accepted(),
		company: liveCompany(),
		packageState: {version: '0.46.35', hooksVersion: '0.46.35', assetsPresent: true},
		gitState: {clean: true, entries: 0, tags: ['v0.46.35']},
		site: 'rc20.localhost',
	});
	assert.equal(result.decision, 'PASS');
	assert.deepEqual(result.blockers, []);
});

test('release readiness refuses owner claims or physical passes without evidence', async () => {
	const {evaluateReadiness} = await modulePromise;
	const acceptance = accepted();
	acceptance.owner_confirmation.logo = false;
	acceptance.physical_acceptance.a4_print.evidence = '';
	const result = evaluateReadiness({
		acceptance,
		company: liveCompany(),
		packageState: {version: '0.46.35', hooksVersion: '0.46.35', assetsPresent: true},
		gitState: {clean: true, entries: 0, tags: ['v0.46.35']},
		site: 'rc20.localhost',
	});
	assert.equal(result.decision, 'HOLD');
	assert.ok(result.blockers.some(item => item.code === 'owner.logo'));
	assert.ok(result.blockers.some(item => item.code === 'physical.a4.evidence'));
});

test('release readiness reports live placeholders, dirty state and missing release tag', async () => {
	const {evaluateReadiness} = await modulePromise;
	const acceptance = accepted();
	const company = {...liveCompany(), phone: '0000', email: 'jjj@gma.com'};
	const result = evaluateReadiness({
		acceptance,
		company,
		packageState: {version: '0.46.35', hooksVersion: '0.46.34', assetsPresent: false},
		gitState: {clean: false, entries: 125, tags: []},
		site: 'rc20.localhost',
	});
	const codes = result.blockers.map(item => item.code);
	for (const code of ['package.version', 'package.assets', 'company.phone', 'company.email', 'release.git_clean', 'release.tag']) {
		assert.ok(codes.includes(code), code);
	}
});

test('pre-tag mode can approve a clean reviewed commit before its tag is cut', async () => {
	const {evaluateReadiness} = await modulePromise;
	const result = evaluateReadiness({
		acceptance: accepted(),
		company: liveCompany(),
		packageState: {version: '0.46.35', hooksVersion: '0.46.35', assetsPresent: true},
		gitState: {clean: true, entries: 0, tags: []},
		site: 'rc20.localhost',
		requireTag: false,
	});
	assert.equal(result.decision, 'PASS');
});
