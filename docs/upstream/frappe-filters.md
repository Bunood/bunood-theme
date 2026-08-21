# Upstream: filters and saved filters — what cannot be fixed from an app

Written 2026-08-20/21, during item 31. Platform measured: **frappe 16.28.0**, and
in this filing that number is exact — `crm` **v1.79.0** and `helpdesk`
**v1.27.0** were read from real git checkouts on the same bench, so where this
document says "Frappe's own newer apps do X", X was read out of their source and
not inferred. Everything else was measured on a running desk or read out of the
**compiled** bundle.

Siblings: `frappe-is-rtl.md` (item 7), `frappe-datatable-rtl.md` (item 26),
`frappe-gantt-geometry.md` (item 27), `frappe-overlays.md` (item 28),
`frappe-empty-states.md` (items 29 and 30).

---

## 1. `.btn-primary-light` is illegible in light and invisible in dark

The desk has exactly one "this control is active" button variant, and three
things use it:

| call site | control |
|---|---|
| `public/js/frappe/ui/filters/filter_list.js:138` | the list's **Filter** button, once any filter is applied |
| `public/js/frappe/ui/group_by/group_by.js:436` | the report view's **Add Group** button, once grouped |
| `public/js/frappe/ui/page.js:191` | **the skip link** — `sr-only sr-only-focusable btn btn-primary-light` |

`public/scss/common/buttons.scss:58-69`:

```scss
.btn-primary-light {
	@include button-variant(
		// not happy with this
		$background: $gray-300,
		$border: $gray-800,
		…
	);
	color: var(--primary);
}
```

and `:144-148`:

```scss
[data-theme="dark"] {
	.btn-primary-light {
		background-color: var(--bg-dark-gray);   // -> var(--gray-400) -> #999999
		box-shadow: none;
	}
}
```

**The two halves of a contrast pair disagree about whether they follow the
theme.** The ink is a CSS variable and moves with the palette; the fill is a
**Sass literal** in light and a grey variable in dark that does not track it.

Measured in place on a real driven filter, seed `#44764b`:

| mode | fill | ink | ratio |
|---|---|---|---|
| light | `#e2e2e2` (`$gray-300`) | `#44764b` | **4.12:1** — fails WCAG AA (needs 4.5) |
| dark | `#999999` (`--gray-400`) | `#76a27c` | **1.02:1** — the label is invisible |

`filters.scss:1-3` puts `--icon-stroke: var(--primary)` on `.filter-icon.active`,
so **the funnel mark fails with the label**, on the same ground.

The vendor's own comment — `// not happy with this` — suggests this is known.

**Fix:** make the fill a variable that tracks the ink, or fit the ink to the
fill. Either half moving is enough. Note that `button-variant` generates eight
rules (base, `:hover`, `:focus`, `.focus`, `:disabled`, `.disabled`, `:active`,
`:active:focus`) and **every fill in them is a hardcoded literal**, so a fix that
touches only the base rule reverts to `#ededed` on hover.

**Severity:** this is an AA failure on a shipped default, on a variant shared
with an accessibility affordance.

---

## 2. The saved-filter list carries no bit saying which filter is active

`list_filter.js:157-170` renders each saved filter as:

```html
<li class="saved-filter-item" data-name="${filter.name}">
  <a class="dropdown-item d-flex justify-content-between align-items-center">
    <span class="filter-label">…</span>
    <span class="remove-filter …">…</span>
```

No `aria-current`, no `.active`, no `.selected`, no data attribute. The active
filter is signalled **only** by mutating the trigger button's text node
(`:66-70`):

```js
$(`.inner-group-button[data-label="${encodeURIComponent("Saved Filters")}"] button`)
	.contents().first()[0].textContent = label;
```

`this.active_filter` is an in-memory field and is not persisted, so **the
indication is lost on reload** even though the filters themselves are restored
from user settings.

`.saved-filter-item` also has **zero CSS in the entire bundle** — one occurrence,
the line above.

**Frappe's own newer apps already solve this, and differently from each other in
presentation but identically in structure**: `crm/frontend/src/components/ViewBreadcrumbs.vue`
marks the active view with `lucide-check size-4 text-ink-gray-7`, and helpdesk's
independently-written equivalent uses `FeatherIcon name="check"`. Both derive it
from state the DOM carries.

**Fix:** put `aria-current="true"` on the active `<li>` and persist the
selection. A theme can style a marked row; it cannot mark one.

---

## 3. Two accessible names are hardcoded English with hand-rolled plurals

`filter_list.js:143-146`:

```js
this.filter_button.attr(
	"title",
	`${this.filters.length} Filter${this.filters.length > 1 ? "s" : ""} Applied`
);
```

`group_by.js:441`:

```js
this.group_by_button.attr("title", `Results are Grouped by ${this.get_group_by_field_label()}`);
```

Neither is inside `__()`. On an Arabic desk the filter button's accessible name
reads "1 Filter Applied" in English — and the hand-rolled `s` suffix would be
wrong in most languages even if it were translated, since Arabic has six plural
forms and many languages have none.

**Fix:** `__()` with a count-aware message, or reshape to `label: value` so no
plural is needed.

---

## 4. A translatable string carries an inline style and closes with the wrong tag

`group_by.js:437`:

```js
__("Grouped by <span style='font-weight:600;'>{0}</b>", [this.get_group_by_field_label()])
```

A `<span>` opened and a `</b>` closed. The inline `font-weight` also means a
translator must carry markup, and a theme cannot restyle it.

**Fix:** move the emphasis to a class, and close the tag.

---

## 5. `-var()` is not valid CSS, and the declaration is silently dropped

`public/scss/desk/page.scss:159-163`:

```scss
.form-inner-toolbar {
	.inner-group-button {
		.icon { margin-right: -var(--margin-xs); }
```

There is no unary minus for `var()`. The declaration does not parse and is
discarded — so the negative margin the author intended has never applied.

**Fix:** `calc(-1 * var(--margin-xs))`. (And logical: `margin-inline-end`.)

---

## 6. The list-view sidebar is dead, and ~20 rules are orphaned with it

`list_factory.js:30` hardcodes `const hide_sidebar = true`, `base_list.js:279-281`
sets `no-list-sidebar` on `<body>` unconditionally from `setup_main_section()`,
`list.scss:68-80` hides `.layout-side-section` from that class, and
`list_view.js` contains the string `sidebar` **zero times**. A repo-wide grep for
`class="list-sidebar` returns nothing. `list_sidebar_group_by.js:5` says so in
its own comment: `// TODO: … currently this file is not use`.

`public/scss/desk/list_sidebar.scss` (104 lines) therefore never matches. So do
`main.scss:12-18`'s `body[data-route^="List"] .main-menu .list-sidebar { display: block !important }`
— there is no `.main-menu` in v16 — and `list.scss:174-177`'s `.list-tags`, which
is already commented out.

The controls that lived there moved into the page form: `base_list.js:837-845`
rebuilds the group-by / assigned-to / tags dropdowns as
`.group-by-field.list-link` carrying `.list-sidebar-button`, and `:865` appends
them to `.standard-filter-section`. **They keep the old class names while living
outside the container those names were scoped to.**

**Measured, and worth stating so nobody "fixes" it twice:** the orphaning causes
**no visible defect**. The group-by dropdown renders `max-height: 500px`,
`overflow-y: auto`, `min-width: 200px`, `max-width: 220px` anyway, because the
generic `.dropdown-menu` rule supplies the first three and
`.page-form .standard-filter-section .group-by-field .group-by-dropdown` supplies
the fourth. This is dead code, not a bug.

**Fix:** delete `list_sidebar.scss`, the `main.scss` block and the commented
`.list-tags`; or revive the sidebar. Two of the orphaned declarations are worth
noting if the file is ever revived rather than deleted, because both are RTL
defects: `left: -10px !important` (`:38`) and `text-align: left` (`:96`).

---

## 7. `$(".filter-x-button").on("click", …)` — an unscoped global, rebound per refresh

`list_filter.js:26-30`:

```js
const filter_x_btn = $(".filter-x-button");
filter_x_btn.on("click", () => { … });
```

Called from `refresh_list_filter()`, which runs on construction **and** after
every save and remove. The selector is document-wide rather than scoped to this
list's page, and the handler is added without ever being removed.

A live `TypeError: Cannot read properties of undefined (reading 'parent')` from
`render_saved_filters` was captured on a gallery route during the same session —
`this.saved_filters_btn` is assigned on the line *after* the `.then()` that reads
it, and `add_inner_button` can return undefined for a group that already exists.

**Fix:** scope to `this.list_view.page.wrapper`, and bind once.

---

## 8. `.filter-label` names two unrelated objects

`list.scss:532-541` styles `.page-form .filter-selector .btn-group .filter-label`
— the applied-count pill. `list_filter.js:161` uses the same class for a saved
filter's **name**. Measured live with one filter applied:
`document.querySelectorAll(".filter-label").length === 2`, in two different
containers, meaning two different things.

**Fix:** rename one. Any theme or extension writing a rule on the bare class hits
both.

---

## 9. Three physical properties in a codebase that is otherwise machine-flipped

Frappe is RTL-correct by a build-time `rtlcss` pass over its own bundle. These
three sit outside what that pass can reach or fix:

1. **`base_list.js:675`** — `this.$filter_list_wrapper.find(".filter-selector").css("margin", "0 0 0 auto")`,
   set **inline** in `setup_mobile`. `rtlcss` operates on stylesheets, so an
   inline physical margin survives the flip unchanged and pins the control to the
   wrong side below 768px. It also cannot be corrected by any app without
   `!important`.
2. **`filters.scss:87`** — `.filter-popover { margin-left: -5px }` below `sm`.
3. **`filter_list.js:56`** — the Bootstrap popover is created with
   `offset: "-100px, 0"`, a physical offset in JS.

A fourth is a *composition* hazard rather than a defect: `.popover .arrow` ends
up with an inline `left` from Popper **and** a computed `right` from the flipped
stylesheet, i.e. pinned on both inline sides at once. Measured: `left: 329px`
inline, `right: 129px` computed.

**Fix:** logical properties for 2, and a direction-aware offset for 1 and 3.

---

## 10. Saved filters do not exist below 768px

`list_filter.js:15`:

```js
refresh_list_filter() {
	if (frappe.is_mobile()) return;
```

Measured at 390×844: `.custom-actions` is `display: none`, `.saved-filter-item`
count is **0**, and `.standard-filter-section` is `display: none` too. So on a
phone a saved filter cannot be applied, created or removed — and the applied
count is hidden as well, since it lives inside `.button-label.hidden-xs`, leaving
the `.btn-primary-light` fill of filing 1 as the only signal that the list is
filtered at all.

**Fix:** a mobile presentation for the saved-filter menu, or at minimum keep the
count visible.

---

## 11. Clear-all is rendered unconditionally

`base_list.js:1406` renders `.filter-x-button` as a permanent member of the
button group, whether or not anything is applied.

Four of four surveyed products render it only while something is applied —
shadcn `{isFiltered && …}`, Discourse `{{#if …hasActiveFilters}}`, frappe-ui
`v-if="filterCount != 0"`, Directus `v-if="isBookmarkResetable"`. **Frappe's own
newer apps are among them**: `crm/frontend/src/components/Filter.vue` renders the
clear button under `v-if="filters?.size"` and fuses it to the trigger by dropping
the trigger's trailing radius.

Noted rather than pressed: an always-present clear control is a defensible
choice. It is listed because it is the one place all four references and Frappe's
own next-generation apps agree, and the desk does not.

---

## 12. Three axe violations in the filter strip, two of which no theme can fix

Scanned with `@axe-core/playwright`, `include('.page-form')`, on `/app/todo`,
`/app/todo/view/report` and `/app/file/view/list`. Every count below is
identical with this theme's filter kit on and with it stood down, so none of
them is a theming artefact.

**(a) `color-contrast`, 2 nodes per list/report route — FIXED HERE, and reported
because the fix is a workaround.** Every empty standard filter renders its field
name as `<span class="placeholder text-extra-muted xs">`, and `global.scss:608`
paints that class `color: var(--gray-500) !important` — a hardcoded `#999999`.
Measured **2.63:1** against the control it labels. A theme can only fix this by
re-pointing `--gray-500` in a scoped block, because the rule is `!important`;
that works, but it means every consumer has to discover the same workaround.
**Fix:** `--text-extra-muted` should be a variable a theme can bridge, or the
value should be fitted against `--control-bg` rather than fixed.

**(b) `select-name`, 2 nodes — a theme cannot fix this at all.** The standard
filter `<select>`s (`select[placeholder="Status"]`, `select[placeholder="Priority"]`)
have no implicit label, no explicit label, no `aria-label` and no
`aria-labelledby`. `placeholder` is not an accessible name on a `<select>` — it
is not even a valid attribute there. A screen-reader user is offered two unnamed
combo boxes on every list view that has Select filters.
**Fix:** `aria-label` from the same string already used as the placeholder.

**(c) `button-name`, 2–3 nodes — likewise.** `.match-type-dropdown-btn`
(`filters.scss:115`) renders as an icon-only dropdown toggle with no text and no
`aria-label`; the file-view route contributes a third such button.
**Fix:** `aria-label` naming what the control switches (`"Match type"`).

An accessible name cannot be added from a stylesheet, so (b) and (c) are
recorded here and left standing rather than worked around.

---

## Not filed, and why

- **`.filter-popover`'s `min-width: 500px`** is a deliberate sizing choice, not a
  defect.
- **The condition row having no box** (`edit_filter.html`) matches what
  crm, helpdesk and insights all do independently. Stock is right here.
- **The count being derived rather than stored** is correct and matches all four
  references — `update_filters()` recomputes from `this.filters`. Worth saying
  out loud because it is the one thing this surface gets unambiguously right.
