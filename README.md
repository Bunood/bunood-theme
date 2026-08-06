# Bunood Theme

A modern, white-label theme for Frappe/ERPNext **v16**. Pure presentation: it
restyles and augments the desk without touching business logic — no template
forks, no `@layer`, no `?v=` cache-busters, and (almost) no `!important`.

> **Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything.** It
> documents the Frappe behaviours verified against the running source, each
> with a file:line reference, and explains the decision each one forces. Most
> are invisible in the code and were learned by shipping the mistake first.
> Per-release detail is in [CHANGELOG.md](CHANGELOG.md).

## What it does today (v0.4.0)

- **Design tokens** — a complete `--bnd-*` vocabulary (color, type, spacing,
  radii, elevation, motion, density). Nothing hardcodes a value;
  `_bridge.scss` maps tokens onto Frappe's ~534 variable names inside
  mode-scoped blocks, so dark mode cannot be silently broken by a later sheet.
- **Per-site branding** — customers set two seed colors (plus optional dark
  seeds) on **Theme Settings**; `brand.py` derives every surface with
  `color-mix()` and writes a content-hashed CSS file served by nginx,
  injected via the `update_website_context` hook.
- **Light / Dark / Automatic** — rides Frappe's native `User.desk_theme`, and
  adds the `prefers-color-scheme` block Frappe lacks for "Automatic".
- **Density** — site default + per-user override (server-stored,
  boot-applied before first render). Compact shortens rows and controls,
  never text.
- **Five desk layouts** — chosen visually on Theme Settings:

  | Layout | One-liner |
  |---|---|
  | **Top Bar** *(default)* | Search, notifications and profile in a bar above the page; slim status bar below |
  | **Compact** | Global controls share the page title row — no extra bars |
  | **Classic** | Everything stays in the sidebar, closest to stock ERPNext |
  | **Bottom Bar** | Global controls along the bottom edge |
  | **Dock** | No sidebar; workspaces float in a centered bottom dock |

  Every control **proxies Frappe's own machinery** (the hidden native search
  and notification triggers, public `frappe.ui.toolbar.*` APIs) — nothing is
  reimplemented, and an upstream rename degrades to a missing button, never a
  broken desk. An unknown or missing layout value fails open to stock chrome.
- **Print** — in-bundle `@media print`: force-light through the token
  pipeline, repeating table headers, unsplit rows, ink-friendly output.
- **RTL** — logical properties only, enforced by a build-time guard that
  fails the build on any physical property. One sheet serves LTR and Arabic
  with no rtlcss pass.
- **Contrast** — WCAG 2.2 AA, guaranteed for *any* brand colour a tenant
  enters, not just the shipped one. The seed contributes hue; the theme fits
  the lightness of each fill and ink against the surfaces that seed produces.
  Nothing is ever rejected — a bright yellow keeps its yellow and gets dark
  labels. Enforced in CI over 11 seeds in both modes.

## Quick start

```bash
npm install          # dart-sass, dev only
npm run build        # SCSS -> hashed CSS, regenerates bunood_theme/assets.py
npm run contrast     # WCAG 2.2 AA over every brand seed a tenant could enter
npm run verify       # the browser suite; needs the local stack running
```

`npm run contrast` needs a Python interpreter — it imports the same
`bunood_theme.palette` the server runs, rather than a second copy of the maths
in JavaScript. `npm run build` needs only Node.

```bash
bench get-app bunood_theme /path/to/bunood-theme
```

```bash
bench --site <site> install-app bunood_theme
```

`after_install` / `after_migrate` seed Theme Settings defaults (idempotently —
only empty fields are filled) and generate the first brand stylesheet. Then
configure at **/app/theme-settings**: company, brand colors, default density,
and the desk layout picker.

**Compiled output in `public/dist` is committed on purpose**: the runtime
containers cannot build (writable layer lost on recreate; `node` off PATH), so
the build runs on the host and its output ships with the app.

## The five rules

1. **Never set a Frappe variable at bare `:root`.** Frappe's dark mode remaps
   its own names under `[data-theme="dark"]`; both selectors are specificity
   (0,1,0), so a later `:root` rule wins in *both* modes and silently kills
   dark mode. Write `--bnd-*` and let `_bridge.scss` map it, mode-scoped.
2. **Never use `@layer` to beat Frappe.** Unlayered beats layered. Use the
   `html[data-theme]` scope prefix. (`!important` has exactly two documented
   exceptions; both fight inline styles.)
3. **Never reference a path containing `.bundle.`.** Frappe resolves those
   against a manifest that is stale here, and prefixes them with `rtl_` on
   Arabic sites — a 404 that would hit Arabic tenants only.
4. **Logical properties only.** `margin-inline-start`, never `margin-left` —
   the build enforces it.
5. **Anything visual must arrive as CSS.** Frappe emits JS at the end of
   `<body>` and renders a splash screen first, so anything applied by JS is
   applied *after* a paint. (Density and the layout attribute are the two
   documented exemptions — everything they affect renders later still.)

## Layout

| Path | Purpose |
|---|---|
| `bunood_theme/hooks.py` | app manifest; imports hashed paths from `assets.py` |
| `bunood_theme/assets.py` | **generated** by `build.mjs` — do not hand-edit |
| `bunood_theme/boot.py` | minimal boot payload (behaviour flags, never appearance) |
| `bunood_theme/context.py` | `update_website_context` — replaces the v1 template fork |
| `bunood_theme/brand.py` | per-site hashed brand stylesheet generation |
| `bunood_theme/api.py` | whitelisted endpoints + version-proof Frappe wrappers |
| `bunood_theme/setup.py` | install/migrate seeding, idempotent |
| `.../doctype/theme_settings/` | the Single + its form script (the layout picker) |
| `public/scss/_tokens.scss` | the `--bnd-*` vocabulary |
| `public/scss/_bridge.scss` | the only file touching Frappe's variable names |
| `public/scss/chrome/` | the desk-layout system (matrix + bars + dock + menus) |
| `public/scss/bunood.scss` | bundle entry; import order is the cascade |
| `public/js/bunood.js` | the only desk script: density + layout mounting |
| `build.mjs` | dart-sass build, RTL guard, hashing, `assets.py` codegen |

## Testing

Two layers, split by what they need:

- **CI gates** (`.github/workflows/ci.yaml`, every push/PR): the SCSS build —
  whose RTL guard fails on any physical property — plus dist/assets.py drift
  detection and JS/Python syntax checks. No bench required.
- **The browser smoke suite** (`npm test` → `tests/smoke.mjs`): every
  behaviour ever verified by hand, re-run against the local dev stack — boot
  and assets, all five desk layouts, the Desktop-page chrome guard, all eight
  sidebar presets, rail triggers and the expand button, the icon engine, live
  preview, the double-save regression, and a console-error budget. Needs the
  local docker stack and `npx playwright install chromium` once. Settings are
  snapshotted and restored even on failure.

**A release tag requires the smoke suite green.** New verifications belong in
the suite, not in throwaway scripts — that is the lesson of v0.4–v0.6.

## Versioning and releases

SemVer, deliberately pre-1.0 while the [38-item coverage checklist] is being
worked through in order:

- **MINOR** (`0.X.0`) — a checklist item or feature set ships.
- **PATCH** (`0.x.Y`) — fixes and refinements to shipped work.
- **`v1.0.0` is reserved for the completion of all 38 items.**

Every release is an annotated git tag (`vX.Y.Z`) on `main`; `app_version` in
`bunood_theme/hooks.py` AND `__version__` in `bunood_theme/__init__.py` (what
`bench list-apps` reports) both match the latest tag; every release has a
CHANGELOG entry. Commit messages follow Conventional Commits
(`feat:`/`fix:`/`chore:`), one logical change per commit.

**A tag is cut only when all three gates pass:**

1. **CI green** on the release commit.
2. **`npm test` green** against the local stack.
3. **The adversarial release review is clean** —
   `tools/release-review.workflow.js` runs four independent reviewers over
   the full diff since the previous tag and adversarially verifies every
   finding. Confirmed findings are fixed (and the review re-run) or
   explicitly waived in the CHANGELOG entry. No tag ships on the author's
   own confidence alone.

**Keep releases small.** If a change can ship alone, it ships alone — one
setting, one fix, one behaviour per release. Small diffs keep the review
honest and make a bad release trivially bisectable.

## Documentation standard

Every file opens with a header explaining what it is and any non-obvious
constraint. Every function has a docstring. Comments explain **why**, not what
— "Frappe renamed this between v16.20 and v16.22" beats "gets the workspace
list".
