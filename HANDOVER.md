# Handover — read this first

> Written 2026-08-06. Everything needed to pick this up in a fresh session.
> `CLAUDE.md` is the working contract, `GUIDELINES.md` the doctrine and audit,
> `ROADMAP.md` the 38 items. **This file is the state of play**; those three are
> the standing rules. If this file and `ROADMAP.md` disagree, ROADMAP wins and
> this one is stale.

---

## 1. Where the work stands

**Pushed and green** (2026-08-06). `main` is level with
`origin/main` at `Bunood/bunood-theme`, the `v0.10.0` tag is pushed, and CI passed
all nine steps including the new contrast gate. The first CI run failed for 14
minutes inside "Set up job" — *"Failed to resolve action download info: Service
Unavailable"*, a GitHub outage before `actions/checkout` was even fetched — and a
re-run cleared it. **Still never push without being asked**; this time it was.

Shipped this session, all committed, all verified:

| | what |
|---|---|
| **Item 32 — contrast** | WCAG 2.2 AA guaranteed for *any* brand seed. `npm run contrast` enforces 1,080 pairs over 11 seeds × 2 modes in CI |
| **Rework 1c step 2** | Master & detail settings shell — **now the default** at `/app/theme-settings`; `?shell=0` still reaches the stacked form. Change dots, derived note, zone bands |
| **Rework 1c step 3** | The shared desk diagram as the placement control, plus the Overview |
| **Submit-label fix** | Theme Settings no longer reads "Submit" (upstream Frappe defect, corrected locally) |
| **Tooling** | `npm run deploy`, `npm run contrast`, `tools/session.mjs` |

`ROADMAP.md` phase 0: slices 0, 1a, 1b and 1c steps 1–3 are `[x]`.

**Slice 2 is half done.** Shipped: Home and All Apps place themselves
(`home_placement` / `apps_placement`, `sidebar_quick_links` deleted with a
migration patch, `build.mjs` FIELD_PREFIXES gained `home` and `apps`); and
`status_in_classic` deleted — the status bar is a component now, so
`status_style` decides in all five layouts and a patch preserved what each site
sees.

**NEXT: the container split.** Top bar, bottom bar, side pane and dock each get
their own on/off, instead of `desk_layout` deciding which mount. Read §7 before
starting it — that is the whole briefing.

Then: the honest-picker audit across every component (`bnd_region_blocker`
covers placement; the rest is unaudited).

After phase 0: item 7 (RTL & Arabic, reopened) then 34a.

---

## 2. Waiting on the user

1. **Release.** Item 32 is a MINOR by the versioning policy but sits in
   `[Unreleased]`; `app_version` in `hooks.py` is unbumped. A release needs the
   three gates: CI green (is), smoke green (is), adversarial release review clean
   (not yet run for this batch).

---

## 3. The local stack — constants, and how to drive it

**Use `tools/session.mjs`.** It holds every constant and mints an authenticated
browser session. The same forty lines had been retyped into eight throwaway
probes before it existed; do not write a ninth.

```js
import { openDesk, goto, benchPy, settingsDrift, setSettings } from "./tools/session.mjs";
const { page, close, errors } = await openDesk();
await goto(page, "/desk/theme-settings", ".bnd-shell");  // shell is the default
```

| constant | value |
|---|---|
| site | `demo.bunood.test` |
| url | `http://localhost:8080` |
| containers | `bunood-backend-1`, `-frontend-1`, `-queue-long-1`, `-queue-short-1`, `-scheduler-1` |
| compose project | WSL `~/bunood` (not a git repo; the deployment repo is the **Windows** checkout at `Desktop\bunood`) |
| WSL mirror of this repo | `~/bunood-theme`, kept current by `npm run deploy` |

**Never use `bench browse`** — its `xdg-open` crashes gunicorn.

### Commands

```bash
npm run build      # SCSS -> hashed CSS + assets.py codegen. Node only.
npm run contrast   # WCAG gate, 1,080 pairs. Needs Python.
npm run deploy     # build + ship to 5 containers + mirror to WSL + restart if hashes moved
npm run verify     # the 106-test browser suite. NEVER while deploying.
```

**Deploying mid-suite invalidates the run and produces phantom failures.** It has
happened; do not do it.

---

## 4. Facts that cost time to rediscover

Each of these was worked out more than once. They are written down so nobody
pays for them a third time.

- **`field_order` is what renders, not `fields`.** In a Frappe doctype JSON the
  two arrays are in *different* orders, and only `field_order` decides layout.
  Reasoning from `fields` put two shell entries on one section and cost a
  debugging round.
- **`get_status_signals` takes ~5,000 ms on its first call after a restart**, then
  8–10 ms. A cold first navigation therefore blows a 30 s selector budget, returns
  504, and cascades: the status bar gets no data and the container-query collapse
  test measures an empty bar. Two "failures" in this session were only this.
  `tools/session.mjs` defaults to a 60 s budget because of it.
- **The frontend serves from its own asset tree** (`/home/frappe/frappe-bench/assets/bunood_theme`),
  which is *not* what the backend unpacks. Feed only the backend and assets 404
  on the frontend. `npm run deploy` handles both.
- **`sites/assets` is a per-container symlink** into `apps/<app>/<app>/public`.
- **Frappe's primary-action label comes from a permission, not from
  `is_submittable`.** `model/perm.js` `_get_perm()` gives Administrator every
  right including `submit`; `form/toolbar.js` `can_submit()` reads it and never
  checks `is_submittable` (that word appears once in the file, in
  `add_discard()`); `get_action_status()` tests `can_submit()` before
  `can_save()`. Verified desk-wide — a stock ERPNext **Item** shows "Submit" too.
- **`rsync --exclude` also protects the destination from `--delete`.** Adding an
  exclusion cannot remove what a previous run already copied; that needs
  `--delete-excluded`. Cost a 439 MB mirror that reported itself as maintained.

---

## 5. The WSL bind mount — local-only, and its sharp edge

At the user's request, `~/bunood/compose.local.yaml` now mounts the WSL mirror
into the containers so the theme survives a `compose down`. **The theme repo is
not involved and must not be changed for this.** Original at
`compose.local.yaml.bak`.

**The sharp edge:** a `docker compose up` recreate runs the image entrypoint,
which rewrites `sites/apps.txt` from the apps it can discover. A mounted app has
no editable install in the image's env, so it gets dropped — leaving a site whose
`apps.txt` omits `bunood_theme` while the DB still lists it installed. The desk
then renders with no theme at all. This happened once and was recovered with:

```bash
docker exec bunood-backend-1 bash -lc 'cd /home/frappe/frappe-bench && grep -qx bunood_theme sites/apps.txt || echo bunood_theme >> sites/apps.txt' && docker restart bunood-backend-1
```

To revert the mount entirely:

```bash
wsl -- bash -lc 'cp ~/bunood/compose.local.yaml.bak ~/bunood/compose.local.yaml && cd ~/bunood && docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d'
```

Reads through the mount are ~3.4× slower than the image filesystem (0.54 ms vs
0.16 ms per read) — measured, and small enough not to matter.

---

## 6. Where the new code lives

- `bunood_theme/contrast.py` — colour maths, WCAG ratios, contrast-safe fitting.
- `bunood_theme/palette.py` — `derive(brand, accent, mode)`, the complete
  seed-dependent token set. **One derivation, two consumers:** `brand.py`
  formats it, `tools/contrast_gate.py` measures it. Never reimplement in JS.
- `tools/contrast_gate.py` + `tools/contrast.mjs` — the gate and its launcher.
- `tools/deploy.sh` — the whole deploy, including the WSL mirror.
- `tools/session.mjs` — stack constants + authenticated browser session.
- `theme_settings.js` — the shell (`bnd_shell_*`), bands (`P.zone`, `bnd_bands`),
  the desk diagram (`bnd_desk_diagram`, `BND_DESK_GEOM`, `BND_DESK_SLOTS`,
  `bnd_region_blocker`), the Overview (`bnd_render_overview`).

### Design rules that are load-bearing

- **The brand is three tokens**, because it does three jobs with three different
  contrast requirements: `--bnd-brand` (washes, exactly the seed),
  `--bnd-brand-solid` + `--bnd-on-brand` (fills and their labels),
  `--bnd-brand-ink` (brand as text). **Never paint with the raw seed.**
- **The shell relocates Frappe's DOM, never redraws it.** That is what makes
  "only one surface exists" a property of the construction rather than a rule.
- **Bands live inside the picker output**, not at the form-section layer: 59 of
  92 fields are `hidden: 1` and every component section holds exactly one visible
  field — its picker. A heading appears only where a picker has more than one
  populated band, computed from what rendered.
- **Only the side pane has a preset catalogue.** `crumb_style`, `palette_style`,
  `inbox_style`, `status_style` are style *choices*; nothing records what
  `desk_layout` writes to the component fields. Everything else gets
  Default/Changed. **Do not invent presets to have something to label.**

---

## 7. The container split — read this before starting

**This is the riskiest change left in the project.** It touches `mount_chrome`
in `bunood.js`, which is where every serious defect here has lived. Two of them,
both the same shape, both worth having in front of you:

* status style "Off" deleted the **Bottom Bar** layout's only chrome — that
  strip carries the bell, the badge and the avatar, and `_layouts.scss` hid the
  sidebar's copies keyed on the LAYOUT. Off left a desk with no way to log out.
* `user_placement: "Off"` did the same in **Dock**, because Dock hides
  `.body-sidebar-container` outright. Fixed 2026-08-07: `mount_placed_tenants`
  now releases the token FIRST, then asks whether the sidebar pane is usable at
  all, and keeps our control when releasing would bring nothing back.

**The rule that prevents this class:** a control may be removed only when
something else can still reach the same function. Ask the DOM, never a
declaration — and ask about the sidebar CONTAINER, not the affordance inside
it, because `mount_chrome` runs before Frappe paints the sidebar's contents.
Testing the affordance answers "not there yet" and turns the guard into a
refusal of every Off. That mistake cost a suite run on 2026-08-07.

**What the split has to decide.** Today `desk_layout` chooses which containers
mount (`mount_chrome`, ~line 4570). Afterwards each container is its own
setting, and `desk_layout` becomes a preset that WRITES those settings and then
stops deciding anything — the end-state the settings architecture note
describes. Two things follow that are easy to miss:

1. **There is still no table saying what each layout writes.** `registry.py`
   lists components and regions but no per-layout values; the 0.11.0 patch
   `chrome_placement.py` records what 0.10.0 *rendered*, which is a migration
   artefact, not a catalogue. That table has to be authored as part of this
   work, and it is what finally lets the derived "Custom" label cover the
   layout preset (today only the side pane has a real catalogue).
2. **Every container off at once is a reachable configuration.** Decide what
   that means before writing the code, not after — the invariant matrix in
   `tests/smoke.mjs` is the place to encode the answer.

**Do it in slices**, each verified: one container at a time, invariant matrix
green between each. Do not start it at the end of a long session.

## 8. Open, and honestly stated

From the adversarial review of 2026-08-06/07. Fixed since: the smoke suite's
restore bug (it could permanently destroy `company_name`, `brand_color`,
`accent_color`, `default_density`), the Dock "Off" defect, and Compact undoing
placement on every route change.

**Still open, and mine:**

- `home_placement` / `apps_placement` accept `"Dock"`, which no runtime branch
  handles — it falls through to the sidebar. Either handle it or remove it from
  the field's options.
- Clicking a slot in the User or Home/All-Apps picker does not repaint that
  picker, so the selection does not move until the form is refreshed.
- `tools/fingerprint.mjs` hardcodes an absolute path to one machine
  (`createRequire("C:/Users/saltedfish/...")`), so the documented
  fixture-regeneration command only runs there.

**Older, still true:**

- The sidebar style kit's own 8-preset palette is outside the contrast gate.
  Fixed values, so no per-tenant risk, but unmeasured. Item 34.
- `--bnd-border` (1.22:1) and `--bnd-border-strong` (1.45:1) are measured and
  deliberately not enforced; whether a control needs a 3:1 resting boundary is
  a per-component question. Item 34.
- `--bnd-ink-inverse` has zero in-repo callers. Kept because token names are a
  contract; do not reach for it for a brand fill.
- The first test of a cold stack routinely exceeds a 30s budget because
  `get_status_signals` takes ~5s on its first call. It fails as
  "desk boots authenticated with theme assets" and drags the console-error
  budget down with it. Environmental, recurring, not yet mechanised away.
