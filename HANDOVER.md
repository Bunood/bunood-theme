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

**The container split is COMPLETE** (2026-08-07, suite 132/132). Top bar, page
header, bottom bar, side pane and dock each have their own on/off;
`mount_chrome` is five lines and not one of them reads `desk_layout`. A layout
is a preset that writes values — containers *and* tenant placements — and then
has no further say. The settings form derives its name by comparing those
values and reads "Custom" the moment one differs, which is what
`registry.LAYOUT_CHROME` was authored for.

Also shipped this session, and both worth knowing about:

* **Theme Settings autosaves.** A click IS the change; there is no Save step.
  Hooked to `frm.dirty` (one choke point, so a control added later is covered)
  and serialised on `frappe.ui.form.is_saving` — Frappe's own global, because a
  private flag misses saves started by the toolbar or Ctrl+S, and `_call`
  reacts with a SYNCHRONOUS `throw "saving"` that no `.catch()` sees.
* **The TimestampMismatch on save is fixed at the root.** See §4.

**NEXT: the honest-picker audit** — `bnd_region_blocker` covers placement; the
rest is unaudited. Two concrete items for it are in §8.

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
- **`npm run deploy` restarts on ASSET hashes, so a Python-only edit ships
  without one** and the backend keeps serving the modules it imported at boot.
  `tools/deploy.sh` says so and offers the flag; it is easy to read the cheerful
  "no asset change — skipping restart" as success. Use
  `BND_FORCE_RESTART=1 npm run deploy` whenever the change is `.py`.
- **A doctype change needs `bench --site demo.bunood.test migrate`** after the
  deploy — that is what syncs the field and runs the patch. The deploy does not.
- **An ABORTED suite run poisons the next one, twice over.** The suite restores
  the snapshot it took at START, so aborting run A leaves the bench mid-test, and
  run B then faithfully restores *that* on the way out. Two runs were voided this
  way on 2026-08-01 and it happened again on 2026-08-07. After any abort, reset
  the bench to `setup.SHIPPED` before trusting what you see.

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

**What the split has to decide** — all four settled on 2026-08-07, with slice
2c-1. They are recorded because re-deciding them mid-split would leave the five
containers governed inconsistently, which is the state the split exists to end.

1. **Five containers, not four.** `pagehead` is registered too. Compact's only
   distinguishing act is injecting the cluster that MAKES the pagehead region
   exist, so leaving it out would have left `desk_layout` still deciding one
   thing — and a layout that still decides can never carry a derived "Custom"
   label.
2. **The catalogue is `registry.LAYOUT_CHROME`**, authored complete and consumed
   one column per slice. It is NOT `patches/v0_11_0/chrome_placement.py`, which
   records what 0.10.0 *rendered*. They deliberately disagree; the disagreement
   is annotated in both files.
3. **The bottom bar's on/off will be `bottombar_enabled`, and `status_style`
   loses "Off"** (slice 2c-4). Today "Off" is the container's on/off in four
   layouts and not in the fifth — the same fact in two places.
4. **Every container off at once is refused at the last container.** The rule
   already in force for tenants covers it: a control may be removed only while
   something else can still reach the same function. So the side pane's off is
   honoured only while a mounted container can host the critical tenants. One
   guard derived from `critical` in `registry.py`, not five special cases.

**THE SEQUENCING MISTAKE, MADE AND CORRECTED IN SLICE 2c-1.** "Each container is
its own setting" and "the layout WRITES those settings" read like two steps and
are one. The moment the first container stops following the layout, the layout
picker half-works on every site — pick Compact and you get its page-head cluster
*and* keep the top bar. Five tests failed on exactly that. The preset write
therefore landed with the FIRST container: `api.get_shipped_defaults` serves
`layout_chrome` + `toggles`, `bnd_apply_layout_preset` writes them on layout
change, and the suite's `setSettings` does the same server-side, because writing
`desk_layout` alone is not a gesture any user can make. **Which** containers a
preset writes is decided by asking the doctype whether the field exists — never
by a list of which slices have landed.

**Do it in slices**, each verified: one container at a time, invariant matrix
green between each. Do not start it at the end of a long session.

## 8. Open, and honestly stated

From the adversarial review of 2026-08-06/07. Fixed since: the smoke suite's
restore bug (it could permanently destroy `company_name`, `brand_color`,
`accent_color`, `default_density`), the Dock "Off" defect, and Compact undoing
placement on every route change.

**Still open, and mine:**

- **`chrome_placement.py` maps Classic to `"Side Pane"`, and its own comment
  says "nothing of ours -> the sidebar's own bell and user button".** Those
  disagree: `"Side Pane"` mounts OUR bell into Frappe's sidebar and stamps
  `data-bnd-own`, which hides Frappe's own. Found on 2026-08-07 while giving
  the layout catalogue its placement column, where the right value for Classic
  is `"Off"` — release the token and the stock affordance renders. The patch
  has already run on real sites, so correcting it means writing over settings
  those admins may have changed since. Deliberately NOT auto-corrected; the
  catalogue is right for anyone who picks a layout from here on.
- **`_statusbar.scss` now uses `:has()`.** The bar sizes itself from what it
  contains, which is the honest rule, but on a browser without `:has()` the
  strip stays text-height and controls are cramped. Never absent, never
  unclickable — a soft failure, and the only unguarded modern-CSS dependency
  in the sheet.

- **The notifications panel guesses where the bell is, from the layout.**
  `inbox_placement` is the thing that knows, and has been its own setting since
  slice 1a — so a Top Bar desk with the bell in the side pane already gets a
  panel pinned under the top bar, nowhere near it. Slice 2c-1 makes one more
  such state reachable (a top bar on a Dock desk: both selectors match at equal
  specificity and source order gives it to the dock) and names it in
  `_layouts.scss` rather than fixing it, because keying all four rules on the
  bell's real region is a behaviour change and behaviour does not ride along
  with a refactor. It is one line of the honest-picker audit.
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
