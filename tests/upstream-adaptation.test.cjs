const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const settings = fs.readFileSync('bunood_theme/bunood_theme/doctype/theme_settings/theme_settings.js', 'utf8');
const desk = fs.readFileSync('bunood_theme/public/js/bunood.js', 'utf8');

function effective(personal, field, raw = false) {
	const fn = settings.match(/function bnd_effective\([^]*?\n}/);
	assert.ok(fn, 'the effective preview resolver exists');
	const engine = {};
	const frappe = { boot: { bnd_personal: personal } };
	const context = { window: { frappe, bunood_theme: engine }, frappe };
	vm.runInNewContext(fn[0], context);
	return context.bnd_effective({ doc: { [field]: 'Site value' } }, field, raw ? {} : engine);
}

test('locked personal comfort never overrides a settings preview', () => {
	const p = { body_width: 'Wide', pane_state: 'Hidden', open: { bnd_body_width: 0, bnd_pane_state: 0 }, overrides: {} };
	assert.equal(effective(p, 'desk_width'), 'Site value');
	assert.equal(effective(p, 'sidebar_pane_state'), 'Site value');
});

test('effective overrides preserve falsy values and composer frames receive the form', () => {
	const p = { overrides: { list_reveal: 0, list_style: 'Dense Table' } };
	assert.equal(effective(p, 'list_reveal'), 0);
	assert.equal(effective(p, 'list_style'), 'Dense Table');
	assert.equal(effective(p, 'list_style', true), 'Site value');
});

test('live comfort setters take effect only on open axes and Rail aliases Open', () => {
	const p = { body_width: 'Wide', pane_state: 'Rail', open: { bnd_body_width: 1, bnd_pane_state: 1 }, overrides: {} };
	assert.equal(effective(p, 'desk_width'), 'Wide');
	assert.equal(effective(p, 'sidebar_pane_state'), 'Open');
});

test('each desktop kit reads effective values while frame engines read raw values', () => {
	for (const kit of ['sb', 'icon', 'crumb', 'palette', 'inbox', 'list', 'form', 'desk', 'workspace', 'chart', 'report', 'views', 'overlay', 'empty', 'skeleton', 'filters']) {
		const fn = settings.match(new RegExp('function bnd_' + kit + '_preview\\([^]*?\\n}'));
		assert.ok(fn && /bnd_effective\(frm, f, engine\)/.test(fn[0]), kit);
	}
});

test('changing quick-link caps rebuilds the menu only when its own trigger is open', () => {
	const fn = desk.match(/bunood\.panehead_apply = function \(vals\) {[^]*?\n\t};/)[0];
	const head = { getAttribute: () => 'true' };
	const calls = [];
	const context = { bunood: {}, window: { frappe: {} }, frappe: { boot: {} }, document: { querySelector: () => head }, close_menu: () => calls.push('close'), show_menu: (trigger, rows) => calls.push([trigger, rows]), sb_head_menu: () => ['rebuilt'] };
	vm.runInNewContext(fn, context);
	context.bunood.panehead_apply({ panehead_quick_links: 'Brief' });
	assert.equal(context.frappe.boot.bnd_panehead.quick_links, 'Brief');
	assert.equal(calls.length, 2);
	assert.equal(calls[0], 'close');
	assert.equal(calls[1][0], head);
	head.getAttribute = () => 'false';
	context.bunood.panehead_apply({ panehead_quick_links: 'Off' });
	assert.equal(calls.length, 2);
});

test('number-card delta selector outweighs vendor rules and neutral/arrow colours share tokens', () => {
	const css = fs.readFileSync('bunood_theme/public/scss/surfaces/_numbercard_delta.scss', 'utf8');
	assert.ok(/html\[data-bnd-ws\] \.widget\.number-widget-box:not\(\[style\*="background"\]\) \.widget-body \.widget-content/.test(css));
	assert.match(css, /\.grey-stat\s*{\s*color: var\(--bnd-ink-muted\)/);
	assert.match(css, /\.green-stat use,\s*\.red-stat use\s*{\s*stroke: currentColor/);
});

test('app identifiers opt out of translation and have no natural language', () => {
	assert.ok(/<tr><td lang="zxx" translate="no">/.test(settings));
});

test('runtime layout ignores search placement but the preset matcher still notices it', () => {
	const context = {
		bnd_layout_chrome: { Classic: { sidebar: 1 } },
		bnd_container_toggles: { sidebar: 'sidebar_enabled' },
		bnd_layout_tenants: { Classic: { search_placement: 'Side Pane end' } },
		bnd_layout_pane: null, bnd_shape_ignores: ['search_placement'],
	};
	for (const name of ['bnd_match_layout', 'bnd_desk_shape_of']) {
		vm.runInNewContext(settings.match(new RegExp('function ' + name + '\\([^]*?\\n}'))[0], context);
	}
	const frm = { doc: { sidebar_enabled: 1, search_placement: 'Top Bar center' }, get_field: () => true };
	assert.equal(context.bnd_match_layout(frm), 'Custom');
	assert.equal(context.bnd_desk_shape_of(frm), 'Classic');
});

test('print helper is registered and macro defaults come from the one catalogue', () => {
	assert.ok(fs.readFileSync('bunood_theme/hooks.py', 'utf8').includes('bunood_theme.printing.jinja.bunood_print_setting'));
	const macros = fs.readFileSync('bunood_theme/templates/bunood_print_macros.html', 'utf8');
	assert.ok(macros.includes('bunood_print_setting(field)'));
	assert.ok(!/_pset\("print_[^"]+",/.test(macros));
});
