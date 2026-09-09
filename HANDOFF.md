# Bunood V2 UI Handoff

**Prepared:** 2026-08-30  
**Repository:** `bunood-theme-ui`  
**Active branch:** `feat/theme-login-dashboard`  
**Current HEAD:** `2b5cc83` (`Merge pull request #5 from Bunood/tools/docker-binary-env`)  
**Local site:** `demo.bunood.test` at `http://localhost:8080`

## 1. Read this first

The Bunood V2 UI overhaul is present in the local working tree and deployed to the
local Docker/Frappe stack. It is **not yet a clean committed change set**. The working
tree contains many modified files, new source files, new hashed bundles, and deleted
older bundles.

Before committing or pushing:

1. Fetch and inspect the latest remote changes.
2. Compare them against this working tree for duplicate or overlapping solutions.
3. Resolve conflicts deliberately; do not discard unrelated local changes.
4. Run the build and verification suite.
5. Visually verify the complete Arabic and English experience.

GitHub identity rule:

- Use **`mrbrokenrightarm`** for Bunood and all non-Gamechanger work.
- Use **`absiadly-maker` only for Gamechanger** work.

Do not push this Bunood work with `absiadly-maker`.

## 2. Repository layout

The actual source paths in this repository are:

```text
bunood_theme/public/scss/          Theme SCSS source
bunood_theme/public/js/bunood.js  Main Desk JavaScript
bunood_theme/public/dist/          Generated hashed assets
bunood_theme/translations/ar.csv  Arabic CSV translations
bunood_theme/locale/ar.po          Arabic gettext catalogue
bunood_theme/assets.py             Generated/current asset references
build.mjs                          Build pipeline and architectural gates
tools/deploy.sh                    Local Docker deployment workflow
ARCHITECTURE.md                    Verified Frappe/Bunood architecture
GUIDELINES.md                      Design-system and quality rules
```

Earlier requests referred to `source/scss/`; that directory does not exist in this
checkout. Apply all SCSS work under `bunood_theme/public/scss/`.

## 3. Current architecture

Bunood is a Frappe/ERPNext theme. The implementation does not replace Frappe's Vue or
Editor.js workspace components. It layers a design system over Frappe using:

- `--bnd-*` design tokens in `bunood_theme/public/scss/_tokens.scss`.
- Frappe semantic-variable mappings in `bunood_theme/public/scss/_bridge.scss`.
- `html[data-theme]` and `html[data-bnd-*]` scopes.
- DOM signatures such as `.page-container:has(.frappe-list)` rather than URL routes.
- JavaScript enhancement and attribute generation in
  `bunood_theme/public/js/bunood.js`.
- Logical CSS properties for RTL/LTR compatibility.

### Vendor override rule

Prefer the least invasive layer in this order:

1. Map Frappe semantic variables to Bunood tokens in `_bridge.scss`.
2. Style universal controls in `scss/components/`.
3. Use a DOM-signature-scoped surface override only for layout/component behavior not
   exposed through variables.
4. Patch vendor Vue/Editor.js source only if the required behavior cannot be achieved
   safely through the public DOM and variable contracts.

Do not color generic Frappe containers directly when Frappe already exposes a semantic
CSS variable for that color.

### Route-agnostic rule

SCSS must not use `data-route=` or `data-page-route=`. `build.mjs` contains a negative
build gate that rejects both strings and tells the developer to use `:has()` DOM
signatures. The intended signatures are:

```scss
.page-container:has(.ce-block),
.page-container:has(.widget-group-body) // Workspaces

.page-container:has(.frappe-list)       // Lists
.page-container:has(.form-layout)       // Forms
.page-container:has(.report-view)       // Reports
```

Preserve the appropriate `html[data-bnd-*]` scope around these selectors.

## 4. Workspace variant attributes

The workspace system is fail-open: without a `data-bnd-ws` attribute, Frappe keeps its
stock presentation.

- `data-bnd-ws="grid"`: uses the Bunood grid/tile workspace composition and expanded
  desktop canvas.
- `data-bnd-ws-metric="display"`: presents number cards as prominent display metrics.
- `data-bnd-ws-rows="rail"`: gives links/quick-list rows an accent rail interaction.
- `data-bnd-ws-menu=""`: enables the workspace tile menu behavior; menu controls rest
  hidden and reveal on hover/focus, with touch/accessibility fallbacks.

The detailed selectors and supported alternatives are documented directly at the top
of `bunood_theme/public/scss/surfaces/_workspace.scss`.

## 5. UI work currently in the working tree

### Global shell and navigation

- Reworked Bunood top bar and sidebar styling.
- Removed the visible bottom status bar and reclaimed its reserved space.
- Forced global search into the centered top-bar slot.
- Hid the duplicate Frappe desktop header when the Bunood top bar is active.
- Removed redundant sidebar Home and active-module rows while retaining All Apps.
- Corrected RTL avatar dropdown layout, icon placement, logout icon direction, and
  brand-header alignment.
- Improved mobile off-canvas sidebar background, stacking, and shadow.
- Corrected single-letter avatar vertical alignment.

Primary files:

```text
bunood_theme/public/scss/chrome/_navbar.scss
bunood_theme/public/scss/chrome/_sidebar.scss
bunood_theme/public/scss/chrome/_statusbar.scss
bunood_theme/public/scss/chrome/_layouts.scss
bunood_theme/public/js/bunood.js
```

### Login

- Split-screen Bunood login treatment.
- Solid brand-green art column with Arabic welcome copy and subtle dot-grid texture.
- Removed the old hardcoded blue treatment.
- Corrected email input direction in Arabic mode.
- Replaced browser-blue focus styling with Bunood brand focus treatment.

Primary file: `bunood_theme/public/scss/web/_login.scss`.

### Desktop/dashboard/workspaces

- Added solid enterprise desktop cards with native SVG colors preserved (`filter:
  none`).
- Added distinct dashboard/home styling and supporting context/API work.
- Added full-width workspace rules based on DOM signatures.
- Added adaptive widget-icon contrast using `currentColor`/`color-mix()`.
- Added Arabic card-label line height, wrapping, and overflow fixes.
- Added mobile workspace/sidebar refinements.

Primary files:

```text
bunood_theme/public/scss/surfaces/_desktop.scss
bunood_theme/public/scss/surfaces/_home.scss
bunood_theme/public/scss/surfaces/_workspace.scss
bunood_theme/api.py
bunood_theme/context.py
```

### Universal components and theming

- Added `bunood_theme/public/scss/components/` for buttons, inputs, badges, and menus.
- Updated the main SCSS entry point to load components after core tokens/bridge and
  before surfaces.
- Expanded `_bridge.scss` so Frappe semantic variables inherit Bunood tokens.
- Added build enforcement for route-agnostic SCSS.

### RTL and translations

- Added Arabic logout-confirmation translations for both Frappe string variations.
- Updated Arabic translation sources/catalogue.
- Corrected bidirectional modal text behavior and branded primary modal buttons.

Relevant strings:

```csv
Are you sure you want to log out?,هل أنت متأكد من رغبتك في تسجيل الخروج؟
Are you sure you want to logout?,هل أنت متأكد من رغبتك في تسجيل الخروج؟
```

## 6. Studio boundary

`BND Report Studio` is a separate module/surface. It does not automatically become part
of the global theme just because the Desk shell is themed. Treat Studio-specific work
in `surfaces/_studio.scss` and `bnd-studio.*.js` as a separate integration boundary.
Also confirm which branch contains Studio work before changing it; previous Studio work
was reported as being on a branch rather than `main`.

## 7. Current generated assets

The latest locally built/deployed bundle set observed during handoff is:

```text
bunood-email.1c5e93a1.css
bunood-print.d37178c9.css
bunood-web.243733bc.css
bunood.672ec688.css
bnd-studio.a82a3f91.js
bunood.6acb3bc1.js
```

All six assets returned HTTP 200 during the latest local deployment verification.
Old generated hashes are deleted in the working tree and the new hashes are currently
untracked; this is expected build output but must be reviewed before commit.

## 8. Local server runbook

### Root cause of the server turning off

Docker is running inside the `Ubuntu` WSL distribution. When the last WSL process
exited, WSL changed to `Stopped`, cleanly shutting down all Bunood containers. Every
later command cold-started the database, backend, and frontend again. That caused both
the intermittent `ERR_CONNECTION_REFUSED` and the lag.

### Keep WSL and Docker alive

Run this once after Windows starts:

```powershell
Start-Process wsl.exe -ArgumentList @('-d','Ubuntu','--','sleep','infinity') -WindowStyle Hidden
```

Confirm it remains active:

```powershell
wsl.exe --list --verbose
```

Expected state: `Ubuntu  Running  2`.

### Build and deploy

From PowerShell:

```powershell
cd "C:\Users\abdul\Documents\Codex\2026-08-27\c-users-abdul-appdata-local-temp\work\bunood-theme-ui"
bash -lc 'export BND_STACK=bunoodimg; bash tools/deploy.sh'
```

Use `--no-build` only when the generated assets are already current:

```powershell
bash -lc 'export BND_STACK=bunoodimg; bash tools/deploy.sh --no-build'
```

Direct Bash invocation is the known working path. Avoid relying on PowerShell
environment variables flowing through `npm run deploy` into nested Bash; that path
previously reverted to the nonexistent `bunood-backend-1` container.

The active local containers use the `bunoodimg-*` prefix, including:

```text
bunoodimg-backend-1
bunoodimg-frontend-1
bunoodimg-queue-long-1
bunoodimg-queue-short-1
bunoodimg-scheduler-1
```

The deploy script ships the app to app containers, copies hashed assets into the
frontend, restarts only when asset hashes require it, clears the site cache, and checks
every generated asset over HTTP. A warning that the optional WSL mirror could not be
refreshed does not invalidate a successful non-bind-mounted Docker delivery, but it
does mean the mirror is stale.

### Verify from Windows

```powershell
Invoke-WebRequest -Uri 'http://localhost:8080/login' -UseBasicParsing -TimeoutSec 15
```

The latest delayed stability check returned HTTP 200 after 30 seconds while Ubuntu
remained running. The measured login response was approximately 563 ms.

Useful URLs:

```text
http://localhost:8080/login
http://localhost:8080/desk/home
http://localhost:8080/apps
http://localhost:8080/desk/theme-settings?shell=1
```

Hard-refresh changed assets with `Ctrl+Shift+R`.

## 9. Current Git state

The branch is dirty. At handoff time, the tracked diff covered 29 files with roughly
1,135 insertions and 14,079 deletions; most deletions are replaced generated bundles.

Important modified areas include:

```text
GUIDELINES.md
build.mjs
bunood_theme/api.py
bunood_theme/assets.py
bunood_theme/context.py
bunood_theme/hooks.py
bunood_theme/public/js/bunood.js
bunood_theme/public/scss/_bridge.scss
bunood_theme/public/scss/bunood.scss
bunood_theme/public/scss/chrome/*
bunood_theme/public/scss/surfaces/*
bunood_theme/public/scss/web/_login.scss
bunood_theme/translations/ar.csv
bunood_theme/locale/ar.po
tools/deploy.sh
```

Important untracked paths include:

```text
artifacts/
bunood_theme/public/scss/components/
bunood_theme/public/scss/surfaces/_desktop.scss
bunood_theme/public/scss/surfaces/_home.scss
bunood_theme/public/images/login-workboard.svg
new hashed CSS/JS bundles under bunood_theme/public/dist/
```

Do not clean, reset, or overwrite these files without reviewing ownership and intent.

## 10. Required next actions

1. Keep WSL alive and confirm the local stack stays healthy during an extended session.
2. Fetch the remote branch and audit every overlapping change for duplication or
   conflict before committing.
3. Run `npm run build` and resolve every architectural gate failure.
4. Run `npm run verify`, plus the focused contrast, icon, and i18n checks where needed.
5. Perform visual acceptance testing in Arabic RTL and English LTR across:
   login, home dashboard, Apps/Desktop, Buying/workspaces, lists, forms, invoices,
   reports, dialogs/dropdowns, mobile sidebar, and dark mode.
6. Verify that workspace full-width and adaptive number-card icon rules affect real
   Frappe components rather than only compiled CSS snapshots.
7. Verify Report Studio separately from the global Desk theme.
8. Review generated hashes and `assets.py`; remove only genuinely obsolete generated
   files.
9. Commit a coherent change set on the intended branch.
10. Push using the `mrbrokenrightarm` GitHub account.

## 11. Definition of done

The overhaul is ready to merge only when:

- The remote branch has been reconciled without duplicated implementations.
- The working tree contains only intentional source and generated changes.
- Build and verification gates pass.
- Arabic and English flows are visually accepted on desktop and mobile.
- Local deployment survives after the deploy shell exits.
- New bundle hashes are served and referenced by the rendered pages.
- The commit/push identity is `mrbrokenrightarm`.

