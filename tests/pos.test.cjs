const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bunood_theme/public/js/bunood.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "bunood_theme/public/scss/surfaces/_pos.scss"), "utf8");
const arabic = fs.readFileSync(path.join(root, "bunood_theme/translations/ar.csv"), "utf8");

function posModel(translate = value => value) {
	const start = source.indexOf("\tfunction pos_item_initial");
	const end = source.indexOf("\n\tfunction install_pos_gallery_guard", start);
	assert.ok(start > 0 && end > start, "POS gallery helpers are a bounded testable unit");
	class FakeImage {}
	const document = {
		createElement(tag) {
			return {
				tagName: tag.toUpperCase(),
				className: "",
				attrs: {},
				setAttribute(name, value) { this.attrs[name] = value; },
				remove() { this.removed = true; },
			};
		},
	};
	const api = vm.runInNewContext(
		source.slice(start, end) + "\n({pos_item_initial,repair_pos_thumbnail,repair_pos_item,repair_pos_gallery})",
		{ document, HTMLImageElement: FakeImage, __: translate },
	);
	return { ...api, FakeImage };
}

test("POS catalogue uses an adaptive readable grid instead of fixed clipped cards", () => {
	assert.match(styles, /container-type:\s*inline-size/);
	assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(10rem,\s*1fr\)\)/);
	assert.match(styles, /> \.item-detail > :is\(\.item-name, \.item-rate\)[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?text-overflow:\s*clip;/);
	assert.match(styles, /@include bnd-container-until\(bndpos, pos-cards\)[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("POS name is primary while code, rate and image fallbacks stay quiet and neutral", () => {
	const nameRule = styles.match(/> \.item-detail > \.item-name \{([\s\S]*?)\n      \}/)?.[1] || "";
	const codeRule = styles.match(/> \.item-detail > \.bnd-pos-item-code \{([\s\S]*?)\n      \}/)?.[1] || "";
	const fallbackRule = styles.match(/> \.item-display\.bnd-pos-thumbnail-fallback \{([\s\S]*?)\n      \}/)?.[1] || "";
	assert.match(nameRule, /color:\s*var\(--bnd-ink\)/);
	assert.match(nameRule, /font-weight:\s*var\(--bnd-weight-semibold\)/);
	assert.match(codeRule, /color:\s*var\(--bnd-ink-muted\)/);
	assert.match(codeRule, /font-size:\s*var\(--bnd-text-sm\)/);
	assert.match(fallbackRule, /background:\s*var\(--bnd-raised\)/);
	assert.doesNotMatch(fallbackRule, /brand|success|green|#[0-9a-f]{3,8}/i);
});

test("POS repair restores the full native item name and adds a secondary code", () => {
	const { repair_pos_gallery } = posModel();
	let codeNode = null;
	const rate = { className: "item-rate" };
	const name = { textContent: "Premium Saudi choc...", nextSibling: rate };
	const detail = {
		querySelector(selector) { return selector === ".bnd-pos-item-code" ? codeNode : null; },
		insertBefore(node, before) {
			assert.equal(before, rate);
			codeNode = node;
		},
	};
	const item = {
		dataset: { itemCode: "SKU-100" },
		matches: selector => selector === ".item-wrapper",
		querySelector(selector) {
			if (selector === ".item-name") return name;
			if (selector === ".item-detail") return detail;
			return null;
		},
		getAttribute(attribute) {
			if (attribute === "title") return "Premium Saudi chocolate assortment";
			if (attribute === "data-item-code") return "SKU-100";
			return null;
		},
	};
	const attrs = {};
	const search = { setAttribute(name, value) { attrs[name] = value; } };
	const selector = {
		matches: value => value === ".items-selector",
		querySelector(value) { return value === ".search-field input" ? search : null; },
		querySelectorAll(value) {
			if (value === ".item-wrapper") return [item];
			if (value === ".item-display > img.item-img") return [];
			return [];
		},
	};
	repair_pos_gallery(selector);
	assert.equal(name.textContent, "Premium Saudi chocolate assortment");
	assert.equal(codeNode.textContent, "Item code: SKU-100");
	assert.equal(attrs.placeholder, "Search by item name, code or barcode");
	assert.equal(attrs["aria-label"], attrs.placeholder);
});

test("POS item initials work for English and Arabic names", () => {
	const { pos_item_initial } = posModel();
	assert.equal(pos_item_initial("Riyadh dates"), "RD");
	assert.equal(pos_item_initial("قهوة عربية"), "قع");
	assert.equal(pos_item_initial(""), "•");
});

test("only unusable micro-images become neutral initial fallbacks", () => {
	const { repair_pos_thumbnail, FakeImage } = posModel();
	const classes = new Set();
	const display = {
		classList: {
			contains: value => classes.has(value),
			add: (...values) => values.forEach(value => classes.add(value)),
		},
		attrs: {},
		setAttribute(name, value) { this.attrs[name] = value; },
		replaceChildren(node) { this.child = node; },
	};
	const item = { getAttribute: () => "Riyadh dates", dataset: { itemCode: "DATES-1" } };
	const image = Object.assign(new FakeImage(), {
		alt: "Riyadh dates",
		complete: true,
		naturalWidth: 1,
		naturalHeight: 1,
		isConnected: true,
		dataset: {},
		matches: selector => selector === ".item-display > img.item-img",
		closest: selector => selector === ".item-display" ? display : item,
	});
	repair_pos_thumbnail(image);
	assert.equal(image.dataset.bndPosThumbnail, "ready");
	assert.ok(classes.has("bnd-pos-thumbnail-fallback"));
	assert.equal(display.attrs.role, "img");
	assert.equal(display.attrs["aria-label"], "Riyadh dates");
	assert.equal(display.child.textContent, "RD");

	const realDisplay = {
		classList: { contains: () => false, add() { throw new Error("real image was replaced"); } },
	};
	const real = Object.assign(new FakeImage(), {
		complete: true,
		naturalWidth: 64,
		naturalHeight: 64,
		isConnected: true,
		dataset: {},
		matches: () => true,
		closest: selector => selector === ".item-display" ? realDisplay : item,
	});
	repair_pos_thumbnail(real);
	assert.equal(real.dataset.bndPosThumbnail, "ready");
});

test("POS guard follows rerenders and ships complete Arabic search copy", () => {
	const guard = source.match(/function install_pos_gallery_guard\(\) \{([\s\S]*?)\n\t\}/)?.[0] || "";
	assert.match(guard, /route\[0\] !== "point-of-sale"[\s\S]*?pos_gallery_observer\.disconnect\(\)/);
	assert.match(guard, /characterData:\s*true/);
	assert.match(guard, /attributes:\s*true/);
	assert.match(guard, /attributeFilter:\s*\["title", "data-item-code"\]/);
	// The generated CSV quotes only the English field because it contains a
	// comma; the Arabic field does not need CSV quoting.
	assert.match(arabic, /"Search by item name, code or barcode",ابحث باسم الصنف أو رمزه أو الباركود,/);
});
