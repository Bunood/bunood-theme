# Changelog

Versioning policy: SemVer, pre-1.0. MINOR = a coverage-checklist item (or a
feature set) ships; PATCH = fixes and refinements. **v1.0.0 is reserved for
the completion of all 38 coverage items.** Every release is an annotated git
tag, and `app_version` in hooks.py always matches the latest tag.

## [0.7.0] — 2026-07-31 — Breadcrumb kit (item 11)

The full trail treatment, as a kit of composable Theme Settings options
picked visually (same architecture as the sidebar: hidden fields -> boot
dict -> `data-bnd-crumb*` attributes -> one CSS matrix). The 0.4.0
unconditional module chip was retired first; the chip is now one option of
the kit. Everything is DECORATION of v16's own trail — Frappe's renderer
is wrapped (`frappe.breadcrumbs.update`), never forked, so decoration
survives its full-rebuild-on-save and every unknown value fails open.

### Styles (the picker's cards)
- **Quiet Trail** (default): muted small ancestors, strong last crumb —
  typography carries the hierarchy.
- **Title Fusion**: the last crumb IS the page title, large, one row.
- **Eyebrow Title**: tiny trail line above a large title on its own row;
  trail and title truncate independently (long Arabic/English names).
- **Crumb Pills**: every crumb a soft pill, current page filled; pills
  draw no separators.
- **Original**: ERPNext's stock trail, untouched — no attributes set.

### Extras (each its own option, any style)
- Separator: slash / chevron / dot / arrow — chevron and arrow mirror
  automatically under `[dir=rtl]` (generated content, not box properties,
  so the RTL build guard stays honest).
- Module icons: off / first crumb / every crumb (inference reuses the
  sidebar's hint table; unmatched crumbs stay text-only).
- Hover: soft pill / underline / darken (ancestors only).
- Copy link: hover-revealed button on the last crumb; clipboard + toast.
- Status pill: Frappe's own docstatus indicator styled into the trail row.
- Narrow screens: the trail collapses to a single labeled back crumb
  ("← Parent") under 992px, overriding Frappe's keep-the-last-crumb rule.

### Facts the implementation is built on (measured)
- Frappe's separator is generated content on the ANCHOR's ::before; all
  separator options move it to the LI so hover backgrounds can never paint
  over the glyph. The last crumb's color is Frappe `!important` — the kit
  restyles only size/weight and inherits the strong ink via the bridge.
- Frappe's mobile sheet hides all but the last crumb at (0,2,1) under
  992px; the kit's alignment rules are fenced to `min-width: 992px` so
  they can never accidentally un-hide crumbs.
- `frappe.db.get_single_value` CASTS a missing Check field to 0, so the
  seeder reads "never written" as row-absence in tabSingles — otherwise
  default-on checks could never be seeded (or worse, an admin's explicit
  off would flip back on).

Smoke suite grew to 28 checks: the four styles' attribute matrix +
decoration, Original-applies-nothing, Every-Crumb inference, live preview
flip/revert.

## [0.6.2] — 2026-07-30 — Fix: Theme Settings save conflict

- `write_brand_css` no longer bumps the document's `modified` timestamp when
  registering the brand stylesheet URL (`update_modified=False`, skip when
  unchanged). It runs in `on_update` AFTER the save stamps `modified`, so the
  bump left every open form stale and the next save failed with
  TimestampMismatchError — hit in production on the first day.

## [0.6.1] — 2026-07-30 — Rail feel, preview coverage, pane width

- Rail timing tuned (80ms open intent, 320ms close grace, in-pane focus
  ignored, soft unpin, Escape closes).
- Live preview covers every option: icon-source switches reprocess, badge
  modes rebuild, and a form reload/discard visually reverts the desk.
- Pane width setting: five stops 200–280px; stop 2 = v16's original 220px,
  the default. Manual Collapse stays Frappe-owned.

## [0.6.0] — 2026-07-30 — Settings experience + branding block

- LIVE PREVIEW: picker clicks restyle the desk instantly (attribute
  re-derivation + structural teardown/remount); Save keeps, leaving reverts.
- Theme export/import as JSON (download + clipboard / paste with validation).
- Settings search + per-group reset chips.
- Per-user personalize: avatar menu ▸ Sidebar Style; whole presets only,
  merged server-side in boot over site values.
- Brand block (Theme Settings logo + company name) pinned at the pane top,
  routing Home; the old Desktop/Workspaces cascade menus retired; module row
  navigates instead of opening a menu; Website moved to the avatar menu.
- Home & All Apps placement setting (Sidebar Top/Bottom, Top/Bottom Bar).

## [0.5.1] — 2026-07-30 — Rail behaviour system + smart icons

- Menu Rail split from its trigger (Always Expanded / Manual / Rail ×
  Hover / Click / Button Only / Hover+Pin); expand button with placement,
  shape and icon options; legacy stored labels still resolve.
- Icon Source: Smart (keep real icons, infer from label against the sprite,
  letter-chip fallback — 46/55 links inferred on Stock), Original, Letters.
- Full-desk render audit fixes: Desktop-page chrome guard, calm resting
  rail, true end-edge bar insets, apps-rail styling, overlay z-order.

## [0.5.0] — 2026-07-30 — Sidebar style kit (item 10; presets, item 30 pulled forward)

The sidebar becomes a KIT of 16 composable Theme Settings options with 8
presets on top. Values are the canon, presets are labels: applying a preset
writes its values into the fields; diverging one option relabels to "Custom".
Delivery: boot dict -> `data-bnd-sb-*` attributes -> one CSS matrix
(`chrome/_sidebar.scss`); every combination is attribute selectors composing,
no per-preset CSS. Missing/unknown values fail open per-option.

### Options
Placement (attached/floating) · Material (solid/glass) + 5-stop glass opacity
+ blur (off/soft/full, honours prefers-reduced-transparency) · Pane color
(match-theme/minimal/dark-contrast/brand) · Icon style (6) · Active link (7,
Folder Tab constrained to attached panes by the picker) · Section layout
(plain/divided/mini-cards/accordion) · Hue wash (off/subtle/rich; actives take
the section hue) · 5-stop surface intensity (bg/border/shadow move together) ·
Menu rail (expanded/manual/hover-expand/hover+pin) · Apps rail (separate
strip, renamed from workspace rail) · Badges (off/dots/counts, batched
`get_sidebar_counts`, zero = silent) · remember sections · scroll fades.

### Presets
Bunood Night (default: dark glass float, hue-washed mini-cards, hover rail),
Bunood Light (same design, daylight), Daylight, Ink, Carbon, Paper, Aurora,
Operator. Catalogue lives in `presets.py`, served by `get_sidebar_presets`.

### Mounted pieces (bunood.js, all reversible / fail-open)
Home + All Apps utility section · module row (current workspace icon + name,
opens the native workspace menu; resolved from route or crumb) · section
wrapping into hue-stamped cards — UNWRAPPED automatically while Frappe's
sidebar edit mode is active, rewrapped after (MutationObserver) · hover-expand
rail as a container-anchored overlay (content never reflows; keyboard
focus-within opens it too) · apps rail · badges.

### Fixed during live verification
- Rail overlay positioned against the viewport (container lacked
  position:relative) — pane painted from the window corner.
- v16 NESTS section children inside the section container: descendant label
  selectors uppercased/hued every link; child combinators now.
- Injected chips rendered sprite icons at intrinsic (huge) size — bounded.
- Badge throttle stamped before the item list existed, throttling away the
  observer's retry; now stamped only when there is something to fetch.
- Native sidebar header ships light-surface styling; restyled for kit panes
  (one inline-style-beating !important, the codebase's second, documented).

## [0.4.0] — 2026-07-30 — Desk layouts (checklist item 9; seeds item 14)

Five switchable chrome layouts, chosen from wireframes: **Top Bar** (default;
global bar + breadcrumb title row + status bar), **Compact** (cluster shares
the title row), **Classic** (stock sidebar chrome), **Bottom Bar** (global
controls on the bottom edge), **Dock** (no sidebar; floating workspace dock).
Selected site-wide on Theme Settings via a visual thumbnail picker; delivered
through boot as `data-bnd-layout`; unknown/missing value fails open to stock.

### Added
- `chrome/_layouts.scss` — the conditional matrix: what each layout hides,
  where the notifications panel opens, space reserved for fixed bars.
- `chrome/_navbar.scss`, `chrome/_statusbar.scss`, `chrome/_dock.scss`,
  `chrome/_cluster.scss`, `chrome/_breadcrumbs.scss` — the mounted pieces.
- `bunood.js` — layout attribute pre-DOMContentLoaded; chrome mounting after
  the shell exists. **Reuse principle throughout**: search/bell proxy-click
  the hidden native controls (icons cloned from them), the avatar menu calls
  only public `frappe.ui.toolbar.*` / `frappe.app.*` APIs; every native
  lookup guarded, so a Frappe rename degrades to a missing button, never a
  broken desk. Sidebar width tracked by ResizeObserver into
  `--bnd-sidebar-live-w` (the sidebar is user-resizable).
- **Menu split** (non-classic layouts): brand menu = places (Desktop /
  Workspaces / Website); avatar menu = personal (Appearance, Toggle Density,
  Session Defaults, Toggle Full Width, Keyboard Shortcuts, Reload, My
  Profile, Log Out — plus Desktop/Website in Dock). Brand-menu personal items
  hidden by icon/onclick selectors, locale-independent.
- **Breadcrumb module chip**: the workspace's own sprite icon prepended to
  v16's existing trail. Slug match on href, TEXT fallback (measured: Frappe
  emitted crumb "Home" with href `/desk/item`).
- **Status bar** (item 14's seed): connection dot + label, Background Jobs
  link, density toggle, clock. Bottom Bar variant adds search + cluster.
- Theme Settings: `desk_layout` Select + `layout_picker` HTML field with five
  clickable SVG thumbnail cards (`theme_settings.js`); `desk_layout` seeded
  "Top Bar" in setup DEFAULTS; boot delivers it; saving Theme Settings now
  clears the site cache (boot is cached per user).

### Fixed
- Bell proxy: the opening click bubbled to Frappe's document-level
  outside-click closer and shut the panel in the same instant —
  `stopPropagation()` on our button.
- Relocated notifications panel rendered 0×0: natively the wrapper is a
  positioning anchor with an absolute child; in bars the child becomes static
  so the wrapper is the panel.
- Dock: Frappe's sidebar JS writes inline `display: block` — the documented
  legitimate `!important` (first in the codebase). Active-workspace highlight
  uses route shape `["Workspaces", name]` (measured), not a slug segment.

### Verified (Playwright, all five layouts live)
- Per-layout structural assertions + interactions: avatar menu (opens down
  from top bar, UP from bottom bar), search modal via proxy, notifications
  panel open/position/close, compact cluster + chip re-injection on route
  change, dock navigation + highlight, picker click→save→boot round-trip.
- Login page console clean after cache clear (stale phantom-asset HTML).
- Known environmental: browsing via `localhost:8080` fails socket.io origin
  validation (frontend pins Host to the site name) → status bar honestly
  shows Offline; realtime works when browsing via the site hostname.

## [0.3.0] — 2026-07-30 — Print (checklist item 8)

Decision "B plus hardening": document-mode printing inside the single bundle.

### Added
- `_print.scss`, last import in the bundle: chrome and interactive elements
  stripped (page title kept), content full width, table headers repeating per
  page, rows/cards/sections never split across breaks, tabular numerals on
  paper, orphan/widow control, ink-friendly links, 14mm margins.
- Status indicators survive printing without the "background graphics" setting:
  outline fallback + `print-color-adjust: exact` when it is on.
- **Force-light through the token pipeline**: `@media print` overrides the
  `--bnd-*` tokens and `_bridge.scss` re-derives every Frappe variable light —
  verified live with a Dark-theme user (attr still `dark`, `--bg-color`
  `#ffffff`, ink `#000000`), zero component rules, zero `!important`.

### Fixed
- **Brand sheet now wraps in `@media screen`.** Measured bug: it loads after
  the bundle and its dark block tied the print override at (0,1,1), so
  later-sheet-wins kept `--bg-color` dark on paper. Brand colour is a screen
  concern; on paper the bundle owns every token unopposed.

### Rejected (recorded)
- Option C's site/date footer: `@page` margin boxes are unsupported in Chrome
  and the `position: fixed` fallback collides with content margins. C's
  report-URL expansion deferred with it.

## [0.2.1] — 2026-07-30 — RTL proven and guarded (checklist item 7)

### Added
- **Build-time RTL guard** in `build.mjs`: the build FAILS if the compiled CSS
  contains any physical property (`margin-left`, `left:`, `float: right`,
  `text-align: left`, ...). Checked on compiled output so nothing slips through a
  mixin; corner-radius longhands are the one documented allowance. Negative-tested:
  a planted `margin-left` kills the build.

### Verified (live Arabic session, Playwright)
- `dir=rtl` desk fully mirrored; density padding intact (`padding-block` is
  direction-agnostic); list sections swap sides correctly.
- **The architecture's central RTL claim held:** our hashed sheets
  (`bunood.<hash>.css`, `brand_<hash>.css`) loaded untouched — no `rtl_` prefix
  rewrite, no second build, zero CSS request failures. Frappe's own core sheets
  resolved via its `assets-rtl.json` (core apps are among its 5 surviving entries;
  the manifest remains stale for every OTHER app on this bench — a deployment
  landmine worth knowing about, though not ours).

## [0.2.0] — 2026-07-30 — Density (checklist item 4)

Decision "G with C": a site default plus a per-user override, where compact
shortens rows, padding and controls but **never text** — no font token appears in
any density block, and that is enforced by grep in the build checks.

### Added
- `Theme Settings.default_density` (Comfortable/Compact) — flows through `brand.py`
  into the per-site stylesheet at `:root`, seeded on install AND migrate because a
  field `default` never reaches an existing Single.
- Per-user override stored in `frappe.defaults` (server-side, cross-device — not
  localStorage), delivered via boot, applied as `data-bnd-density` on `<html>` by
  the theme's first JS file before Frappe renders anything density affects. User
  choice beats site default by specificity — (0,1,1) over (0,1,0) — not by order.
- "Toggle Density" in the user menu via a native Navbar Settings Action item
  (the same mechanism ERPNext uses for "Delete Demo Data"); cycles
  site-default → Comfortable → Compact with a confirmation toast.
- `_density.scss` — the consumption shim. Measured on the live desk: Frappe's
  `.list-row` height is content-driven (`.level-right` padding), so mapping
  `--list-row-height` alone changed rows by 2px. Driving the level paddings gives
  **45px vs 31px rows, fonts byte-identical** (verified via Playwright).
- `build.mjs` now hashes JS entries the same way as CSS.

### Fixed
- Removed phantom asset declarations from `hooks.py` (desk JS, web bundle, icon
  sprite) that 404'd on every page. New rule recorded in the file: never declare
  an asset before the commit that ships it.

## [0.1.0] — 2026-07-29 — Scaffold

First commit of the rewrite. No visual styling yet; this release establishes the
architecture and proves the build.

### Added
- `ARCHITECTURE.md` — ten behaviours verified against the running Frappe v16.27
  source, with file:line references, and the decision each one forces.
- `build.mjs` — dart-sass compile to a **content-hashed** CSS file, plus codegen of
  `bunood_theme/assets.py` so the hash reaches `app_include_css` with no hand-maintained
  version string.
- `_tokens.scss` — the complete `--bnd-*` vocabulary: colour seeds, derived surfaces,
  ink, spacing, type, radii, elevation, motion, density, a validated categorical ramp
  and a reserved status set. Light, dark and `automatic` variants.
- `_bridge.scss` — the only file that touches Frappe's own ~534 variable names, mapping
  ours onto theirs inside mode-scoped blocks.
- `context.py` — `update_website_context` handler that appends the per-site brand
  stylesheet to the desk `<head>`.
- `brand.py` — per-site brand CSS generation: atomic write, content-hashed filename
  under the site's own `public/files`, old files reaped.
- `api.py` — version-proof wrappers for `frappe.desk.*`, the DocType→Workspace ownership
  map, and workspace Card Break sections.
- `boot.py`, `setup.py`, Theme Settings DocType.

### Notably absent
- **No `www/` directory.** v1 shadowed Frappe's 77-line `www/desk.html` to inject brand
  colours before first paint, which pinned the app to one Frappe revision and forced
  shipping a `www/desk.py` whose shim was one refactor away from caching `frappe.boot`
  across users. `update_website_context` removes the need entirely.
- **No `@layer`.** Unlayered author styles beat layered ones, and Frappe's desk CSS is
  unlayered, so layering our overrides would make them lose.
- **No `?v=` cache-busters.** Content hashes make every URL immutable.
- **No physical CSS properties.** Logical properties only, so one sheet serves LTR and
  RTL with no rtlcss build and no `assets-rtl.json` dependency.
- **No parallel `localStorage` theme state.** `User.desk_theme` is already the per-user
  override and Frappe renders it server-side into `data-theme`.
