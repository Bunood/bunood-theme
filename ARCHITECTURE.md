# Architecture

Why this theme is built the way it is. Every claim below was **verified against the
running Frappe v16.27 / ERPNext v16.28 source**, not recalled — file and line
references are given so the next reader can re-check them after an upgrade.

This document exists because v1 of this theme accumulated a set of invisible,
undocumented contracts, and every one of its hardest bugs came from breaking one.

---

## 1. Frappe is themed entirely through CSS custom properties

Frappe defines **~534** custom properties across `frappe/public/scss/`, in three tiers:

| Tier | File | Example |
|---|---|---|
| Primitives | `scss/espresso/_colors.scss` | `--gray-500`, `--blue-100` |
| Semantic | `scss/common/css_variables.scss` | `--bg-color`, `--card-bg`, `--text-color`, `--padding-md` |
| Component | `scss/desk/css_variables.scss` | `--page-head-height`, `--list-row-height` |

**Dark mode is a remap of the same names, not a second palette.**

- Light: `scss/desk/css_variables.scss:4` → `:root, [data-theme="light"] { … }`
- Dark: `scss/desk/dark.scss:2` → `[data-theme="dark"] { --bg-color: var(--gray-900); … }`

### Consequence: the `:root` trap

Both selectors have specificity `(0,1,0)`. If we set a **Frappe-owned** variable at
`:root` in a sheet that loads *after* `desk.bundle.css`, we win in light mode **and in
dark mode**, because later-sheet-wins breaks the tie. Dark mode then silently dies for
that variable.

**Rule:** never write `:root { --bg-color: … }`. We own the `--bnd-*` namespace only, and
map it onto Frappe's names inside correctly scoped blocks (see `_bridge.scss`).

---

## 2. `@layer` cannot be used to override Frappe

For normal (non-`!important`) declarations, **unlayered author styles beat layered
ones**. Frappe's desk CSS is entirely unlayered. So wrapping our overrides in
`@layer` makes them *lose* every conflict.

**Rule:** beating Frappe is a *specificity* problem. Use the scope prefix
`html[data-theme] .foo`. `@layer` is only useful for ordering our own sheets against
each other — and since we ship a single compiled bundle, we do not need it at all.

*(v1 learned this three separate times: the nav rail rendering accent-blue, the
palette input losing its glass background, and the mobile tab bar appearing mid-page
because Frappe ships an unlayered `nav { display: block }` reset.)*

---

## 3. `data-theme` is native — do not fight it

`frappe/www/desk.html:2` already renders:

```html
<html data-theme-mode="{{ desk_theme.lower() }}" data-theme="{{ desk_theme.lower() }}" …>
```

`desk_theme` comes per-user from `sessions.py:182`
(`frappe.get_cached_value("User", user, "desk_theme")`).

Therefore:

- **`User.desk_theme` already IS the per-user override**, server-rendered, zero flash.
- We keep **no** parallel `localStorage` theme state. A client-side preference cannot
  beat a server-rendered attribute without a visible flip.
- `frappe.ui.set_theme()` re-derives `data-theme` from `data-theme-mode` at startup, so
  any `data-theme` JS sets is overwritten milliseconds later. **If we ever need a JS
  override, set `data-theme-mode`.**

### "Automatic": measured behaviour (corrected 2026-07-29 on the live site)

The mechanism is subtler than it looks, and an earlier draft of this document got it
wrong. What actually happens:

* `sessions.py:182` puts `User.desk_theme` into boot **unresolved** — so boot really can
  contain `"Automatic"`, and `desk.html` really does render
  `data-theme="automatic"` on a cold load.
* `frappe.ui.set_theme()` (`public/js/frappe/ui/theme_switcher.js:154-163`) then resolves
  it client-side from `data-theme-mode` plus `prefers-color-scheme`, and **rewrites
  `data-theme` to a concrete value**.
* `theme_switcher.js:132` calls `frappe.core.doctype.user.user.switch_theme`, which
  **persists the resolved value back to `User.desk_theme`**. Verified empirically: the
  field was set to `Automatic`, one desk load occurred, and the field read back `Light`.

Three consequences for this theme:

1. **`html[data-theme="automatic"]` only ever matches during the first paint**, before JS
   runs. That is precisely the window we care about, so the rule stays — but it is a
   first-paint-only rule, not a steady-state one. Do not rely on it for anything else.
2. **`Automatic` is not durable.** It normalises to Light or Dark after one load, so it
   cannot be treated as a persistent user preference we can read.
3. **Never write `data-theme` from JS.** `set_theme()` overwrites it at startup. A JS
   override must set `data-theme-mode`, which is what Frappe derives from.

The `@media (prefers-color-scheme: dark) { html[data-theme="automatic"] { … } }` block in
`_tokens.scss` and `_bridge.scss` therefore serves exactly one purpose: correct colours on
the cold-load splash for a dark-OS user whose stored value is still `Automatic`.

---

## 4. No `www/` directory — the fork is retired

v1 shadowed `frappe/www/desk.html` (77 lines, **no Jinja blocks**, so it can only be
copied wholesale) in order to inject brand colours before first paint. Two costs:

1. The app is pinned to whichever version of that template was copied.
2. `TemplatePage.set_pymodule()` (`website/page_renderers/template_page.py:127`) looks
   for the colocated `.py` **in the app that supplied the template** — so shadowing
   `desk.html` also forces shipping `desk.py`, and v1's delegating shim omitted
   Frappe's module-level `no_cache = 1`. It survived only because
   `_frappe_get_context` also sets `"no_cache": 1` in the context dict. One Frappe
   refactor away, `@cache_html` would have started caching `frappe.boot` **across
   users** — a cross-user data leak.

### The replacement: `update_website_context`

`website/page_renderers/base_template_page.py:32` calls `update_website_context()`
during `post_process_context()` — i.e. **after** `www/desk.py::get_context` has
populated `app_include_css`, `desk_theme` and `boot`. A hook can therefore mutate the
desk context per request without owning the template. See `context.py`.

The handler must guard on `context.template` (it also fires for every portal page,
`/login`, and error pages) and must never raise (it sits in the website router).

---

## 5. Per-site brand CSS: hashed file, not a dynamic route

The compiled bundle is identical for every site. Only the customer's brand colours
differ, so those are emitted as a **separate, tiny, render-blocking stylesheet**.

Delivery is modelled directly on Frappe's own `Website Theme`
(`website/doctype/website_theme/website_theme.py:92-121`), which writes per-site
generated CSS to `sites/<site>/public/files/` with a **hash-suffixed filename** and
reaps old files.

| Why not a dynamic route | |
|---|---|
| Render-blocking `<link>` in `<head>` | every desk load would block first paint on a synchronous Python request through gunicorn |
| Failure mode | an exception returns 500 *on a stylesheet*; a static file keeps serving from nginx even if the DB is down |

**Why the hash matters.** nginx here sets no `Cache-Control` on `/files` (verified:
only `Last-Modified` + `ETag`), so browsers apply RFC 9111 heuristic freshness —
roughly `(now − Last-Modified) / 10`. A stable URL would leave a colour change
invisible for hours or days with no revalidation. A content-hashed filename makes the
URL immutable and the missing header harmless.

This also retires v1's 30-plus hand-maintained `?v=N` cache-busters.

---

## 6. Never put `.bundle.` in a path we reference

`frappe/utils/jinja_globals.py:147` `bundled_asset()`:

```python
if ".bundle." in path and not path.startswith("/assets"):
    if path.endswith(".css") and is_rtl(rtl):
        path = f"rtl_{path}"
    path = bundled_assets.get(path) or path
```

Two traps:

1. A logical bundle name is looked up in `sites/assets/assets.json`. In this
   deployment that manifest is **stale** (the `sites` volume mounts over it and
   nothing in the compose pipeline rebuilds it), so the lookup misses and the raw
   string is served → 404.
2. `is_rtl` is true for `ar`, `he`, `fa`, `ps`. On an **Arabic** site the path becomes
   `rtl_/files/x.bundle.css` → 404. This stack ships `ksa_compliance`, so Arabic sites
   are a live target — this would fail *only* for them.

**Rule:** reference an explicit, content-hashed `/assets/bunood_theme/dist/css/…` path.
`build.mjs` codegens that path into `assets.py`, which `hooks.py` imports.

---

## 7. Build outside the container

`node` **is** present in the container (`/home/frappe/.nvm/versions/node/v24.12.0/bin/node`)
but is not on the PATH for non-interactive shells, and `bench build` writes to
`apps/<app>/<app>/public/dist/` — the container's **writable layer**, which is lost on
recreate. So we compile with `npm run build` on the host and ship the output.

---

## 8. First paint is the splash screen, not an empty body

`www/desk.html:38` includes `templates/includes/splash_screen.html` as the first child
of `<body>`; it is removed much later by `desk.js:374`. `app_include_js` is emitted at
the **end of body**.

**Consequence:** anything that must be correct at first paint has to be **CSS**, not JS.
An end-of-body IIFE always runs after a real paint.

Also: v1 set an inline `background-color` on `<html>` for flash prevention. Inline
styles outrank every stylesheet permanently, so after a runtime theme switch the canvas
stayed pinned to the hardcoded hex. We do not do this — `html`'s background already
comes from `--bg-color` (`scss/desk/global.scss:1`).

---

## 9. RTL by authoring, not by build

`bench build` can emit an rtlcss variant, but per §6 we cannot rely on the manifest
here. Instead we author exclusively in **CSS logical properties**
(`margin-inline-start`, `inset-inline-start`, `padding-inline`, `text-align: start`)
and ship one sheet for both directions.

`frappe.utils.jinja_globals.is_rtl` exact-matches four language codes (`ar`, `he`,
`fa`, `ps`) with no parent resolution, so every other RTL language (`ur`, `ckb`, a
hand-created `ar-SA`…) got RTL translations on an LTR desk. **This app now corrects
both halves together** (item 7(b), 2026-08-13), because correcting only `dir` while
`bundled_asset()` (§6) still selected the LTR stylesheet off the broken check would
have produced a half-flipped desk — worse than a consistently wrong one, so neither
half shipped alone.

The fix is one corrected function, `bunood_theme/i18n/rtl_patch.py::is_rtl`, reached
three ways: `bundled_asset()` picks it up because `rtl_patch.py` reassigns the module
attribute `frappe.utils.jinja_globals.is_rtl` itself — safe specifically because
`bundled_asset` calls it as a plain name resolved from *its own module's* namespace
on every call, not one bound at import time (the reasoning, and why the same trick
cannot reach `printview.py`/`pdf.py`, is in that file's own docstring); the desk's
`dir` attribute is corrected separately, with no patching, via
`context.py::_correct_layout_direction` hung off the existing
`update_website_context` hook; and `templates/base.html`'s Jinja-level `{{ is_rtl() }}`
call is closed through the `jinja.methods` hook entry. `boot.py` also threads
`bnd_rtl_langs` to the client so `bunood.js` can correct `frappe.utils.is_rtl()`
client-side, a fourth, independent copy of the same four-code defect. The suite's
`direction:` gate checks `dir`, the CSS bundle direction and the client correction
together, against a CLDR-derived (`Intl.Locale`) expectation. The one-line upstream
fix is drafted in `docs/upstream/frappe-is-rtl.md`, filing is still outward-facing
and unfiled.

---

## 10. Call Frappe internals through resolving shims

Frappe renames internal desk APIs between minors without deprecation. Verified case:
`frappe.desk.desktop.get_workspace_sidebar_items` → `get_workspaces` between v16.20 and
v16.22 (pure rename). v1 broke loudly on half of v16 until it added a shim.

**Rule:** every call into `frappe.desk.*` goes through a wrapper in `api.py` that
resolves whichever name exists and fails soft with empty data.

---

---

## 11. Space for fixed chrome is taken off `.main-section`'s height, never its padding

`.main-section` is the desk's scroll container — `frappe/public/scss/desk/main.scss:37`:

```scss
.main-section {
	width: 100%;
	height: 100vh;
	overflow: scroll;
	overflow-x: hidden;
	overflow-y: visible;
}
```

Anything this theme fixes to the bottom edge (the status bar, the dock) covers
content unless the page reserves the space. **Padding cannot make that
reservation**, because Frappe measures the container's *border box*:

`frappe/public/js/frappe/list/base_list.js:452` `set_result_height()`:

```js
let main_rect = $(".main-section").get(0).getBoundingClientRect();
let result_top = $result_container.get(0).getBoundingClientRect().top - main_rect.top;
let resultContainerHeight = Math.floor(
	main_rect.height - this.$paging_area.get(0).getBoundingClientRect().height - result_top
);
```

`getBoundingClientRect().height` is the border box, so `padding-block-end` is
invisible to it: the list keeps sizing itself to the whole viewport and the
paging row keeps landing under the bar. Measured 2026-08-01 on `/desk/item`:
padding on `.main-section`, padding on `.page-body`, a margin on
`.list-paging-area`, and making the bar `position: sticky` all left the paging
row at `y=900` exactly — unmoved.

**Rule:** shrink the box. `block-size: calc(100vh - var(--bnd-bottom-reserve))`
on `.main-section` (`chrome/_layouts.scss`) fixes every page type at once,
because Frappe's own arithmetic — JS *and* the `calc(100vh - …)` rules in
`report.scss`, `form_sidebar.scss`, `kanban.scss` — then resolves against a
viewport that ends where the bar starts. Content that no longer fits scrolls
instead of hiding, and the amount of scrolling is unchanged: for a border-box
scroll container, `padding-block-end: R` adds `R` to both `scrollHeight` and
`clientHeight`, so `scrollHeight - clientHeight` is identical either way.

### The one box a shorter container does not fix: `position: sticky`

Shrinking the scroll container works because content that no longer fits
*scrolls*. A sticky box cannot — it is pinned, so anything past the container's
foot is unreachable at every scroll position. There is exactly one such box on
the desk, `frappe/public/scss/desk/form_sidebar.scss:273-279`:

```scss
body[data-route^="Form"] .layout-side-section {
	height: calc(100vh - var(--page-head-height));
	position: sticky;
	top: var(--page-head-height);
}
```

It is sized to the viewport, so it needs the reserve subtracted explicitly
(`chrome/_layouts.scss`) — tags, share and assignments live at its foot.
Measured on `/desk/item/BND-TEST-001`: 41px unreachable without that rule.

The report view's pane (`report.scss:100`) uses the same `calc(100vh - …)` and
is **static** — and item 26 (slice 1) found it needs the reserve anyway, which
sharpened this rule of thumb. Two reasons the old *"static just scrolls"* was
wrong here: `.report-view .layout-main-section` is `overflow: hidden`, so content
past its foot is CLIPPED rather than scrolled; and our top bar is sticky IN
`.main-section` flow (Frappe's own navbar is `position: fixed` and overlays), so
it offsets the pane down by `--bnd-topbar-h` that `100vh - page-head` never
counted. Measured 71px unreachable at the shipped topbar+status defaults before
the fix. So the real rule is: *a box sized from raw `100vh` needs the reserve
whenever it cannot scroll its own overflow away — sticky OR `overflow: hidden`;
only a genuinely scrolling box (`overflow: auto`) inside a reserve-aware parent
needs nothing*. Fixed in `chrome/_layouts.scss`; the query-report route, whose
`.layout-main-section` is `overflow: visible`, does scroll and was left alone.

### The reserve is measured, not declared

`--bnd-bottom-reserve` is written by `bunood.js` (`observe_bottom_reserve`) from
the chrome that actually rendered — the same contract as `--bnd-sidebar-live-w`,
for the same reason: it is a runtime fact, not a constant. A static matrix of
per-layout values was written first and was wrong in three states, each measured:

| State | Static matrix | Truth |
|---|---|---|
| Dock | 76px (`--bnd-dock-h` + 20) | 62px — Dock mounts a pill **and** a status bar, and the pill renders 50px, not its 56px token |
| Classic with the status bar opted in | 0px — every selector named a layout, and Classic was not one | 26px |
| Bottom Bar with the status bar switched Off | 40px | 0px |

Measuring also makes the failure mode right by construction: no bar in the DOM
means no reserve, so a half-failed boot degrades to stock geometry rather than
to a strip of viewport nobody can use.

---

## Verification checklist after any Frappe upgrade

1. `data-theme` still on `<html>` in `frappe/www/desk.html`.
2. `update_website_context` still called from `base_template_page.py`.
3. `bundled_asset()` still passes non-`.bundle.` paths through untouched.
4. Frappe's light block is still `:root, [data-theme="light"]` and dark is still
   `[data-theme="dark"]`.
5. Splash screen still the first child of `<body>`.
6. The `api.py` shims still resolve.
7. `.main-section` is still `height: 100vh` and still the scroll container, and
   `base_list.js` still sizes the result area from its `getBoundingClientRect()`
   (§11). The `reserve:` checks in `tests/smoke.mjs` fail loudly if not.
8. `bundled_asset()` still calls `is_rtl(rtl)` as a plain name resolved from its own
   module's namespace on every call, not one bound at import time (§9) — that is the
   entire reason `rtl_patch.py`'s module-attribute reassignment is safe. If a Frappe
   refactor changes this, the patch stops reaching `bundled_asset()` silently:
   `dir` stays corrected (it goes through `context.py`, independent of the patch)
   while the CSS bundle reverts to the four-code check — the exact half-flipped
   desk §9 says is worse than a consistently wrong one. The `direction:` gate in
   `tests/smoke.mjs` checks both together and would flip red.
