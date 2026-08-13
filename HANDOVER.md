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

**Slice 2 is finished.** Earlier in it: Home and All Apps place themselves
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
* **Containers apply live** (`bunood.chrome_apply`). They were the only
  components that did not, which nobody noticed until autosave removed the
  reload that had been hiding it. **Any new container or kit must re-apply on
  click** — and note the trap: every container test writes settings
  server-side and then navigates, so the whole click-to-desk path can be
  broken with the suite fully green. Drive the control.

**E1 IS DONE** (2026-08-08). The slot vocabulary — every placement is
"<Region> Start|Center|End", every consumer reading `registry.slots_for` —
landed the hard way: the vocabulary changed under FIVE consumers that carried
their own copies (the pickers' slot lists, the desk-diagram geometry tables,
`SEARCH_SLOTS`, `sb_mount_utils`'s bar table, `LAYOUT_TENANTS`), and each was a
place placement silently stopped working. All five now read the field or parse
the slot; none carries a list. Three decisions worth keeping:

* **The side pane has TWO zones** (`registry.ZONES_BY_REGION`). Measured three
  ways: its content fills the column, so "after the workspace list" and "the
  foot" are the same position. A third choice that cannot differ is the
  two-options-one-pixel defect this vocabulary exists to delete.
* **A component offers only the zones its runtime implements** (the `zones` key
  on the component). Search has no page-header slug and Home mounts at
  `firstChild` only; offering more would be a dishonest picker. Search's bar
  "End" is genuinely missing and worth building.
* **An illegal Select value on a Single fails the WHOLE document.** One stale
  `inbox_placement` broke six unrelated save tests with nothing naming
  placement. `heal_unknown_placements` (runs on every migrate, forever) falls
  any un-offered value back to `setup.SHIPPED`; two suite tests pin that
  nothing this app writes and nothing the site holds can be un-offered.

**E2 IS DONE — the placement board.** One desk drawn big (`placement_board`
HTML field, `bnd_render_placement_board`), every control a chip sitting where
it is, moved by HTML5 drag OR click-to-pick/click-to-drop — both gestures end
in the same `drop_on`, so neither rots alone. Zones come from
`bnd_field_slots`, which reads the FIELD's options (generated from
`slots_for`), so an illegal drop is refused rather than accepted-and-dropped
elsewhere. Three suite tests own it (`board:`). The per-component pickers
remain as the detail view.

**ITEM 18 IS DONE** (2026-08-10) — the form view, the second surface kit, in
four commits: a repair, the kit, the family, and a retirement.

Picks: **1C Floating Panels · 2C Solid Pill · 3C Floating Pane · 4A
reveal-on-hover** — the bolder option each time, as every round so far. The
kit is `form_style` / `form_tabs` / `form_sidebar` /
`form_grid_checkbox_reveal`, four `data-bnd-form*` attributes, and
`surfaces/_form.scss`. `bunood.form_apply` shipped on day one.

Things worth carrying forward:

* **THE CASCADE LESSON, TWICE IN ONE FILE.** Upstream owns
  `.std-form-layout > .form-layout > .form-page` at (0,3,0) and
  `.form-tabs-list .form-tabs .nav-item .nav-link` at (0,4,0). The kit's
  first cut used `.form-page` and `.form-tabs .nav-link` — both LOST,
  silently: the tinted canvas never appeared and every inactive tab stayed a
  white box on a tinted bar. `html[data-bnd-*]` is not a magic prefix; it
  adds one attribute's worth of specificity and nothing else. **Measure the
  selector you are overriding** (the rule-scan probe in the scratchpad reads
  `document.styleSheets` and prints every competing rule — reach for it
  before writing a component rule over Frappe's own).
* **The three fusions**, each one field that could have been two: sections +
  grid frame + `.form-dashboard` are one container statement; the tab BAR
  rides the canvas while only the MARKER is an axis; the sidebar is
  styling-only, no Off.
* **The grid heading carries its own select-all**, so the reveal scopes to
  `.grid-body` — the header's checkbox stays visible as the discoverable
  entry to selection, which is the list kit's 3B judgement transposed.
* **`.grid-row-open` is styled with ONE background rule and nothing else**,
  because that state was never probed at rest (the hover-only pencil blocks
  a cold click). Styling an unprobed state is what the bulk header punished.
* **The axe baseline was not taken on trust.** A baseline captured with a kit
  ON banks that kit's own bugs as "standing" — so the new form route was
  scanned twice, once with `form_style: Original`. Identical counts: all six
  contrast failures are upstream's `#999999` help text. **Do this for every
  future surface kit**; it is the only way the axe diff stays meaningful.
* **`_density.scss` is gone**, its lifecycle note honoured, proven pure by a
  byte-identical stylesheet (same content hash AND md5 across the deletion).

Two item-16 escapees were repaired first, in their own commit: the list
block had been inserted BETWEEN `section_density` and `default_density`, so
the Density section rendered empty and its control sat under "List View";
and the theme export listed `BND_LIST_FIELDS` while the import's `known` set
did not, so exported list values were silently refused on re-import.

**Item 16's `list_picker` is still missing from the full-complement test's
EXPECTED map** — `form_picker` was added to both of its literals, list was
deliberately not back-filled there (separate concern, one line, free).

What that work needed, kept for the next surface kit:

* **Release state**: items 7, 16 and 18 are all committed and **nothing is
  pushed** — `main` is now well ahead of `origin/main`, and v0.13.0 was never
  released. `app_version` in hooks.py is unbumped and `[Unreleased]` holds
  three items' worth of changelog. The moment the user says "push it",
  the standing chain runs unprompted: push theme `main` → annotated tag
  `v0.13.0` → `node tools/payload.mjs --record v0.13.0` + commit the ledger
  row → push the tag → bump the pin in the bunood repo's `apps.json`
  (`ci: pin bunood-theme v0.13.0 — …`, rebase if origin moved) → push
  (Coolify deploys; the compose `migrate` service migrates). Never start it
  uninvited.
* **The surface-kit anatomy is now proven twice**, in the same 16-file order
  (registry SURFACES entry → doctype fields → presets → setup → boot →
  `apply_*_attrs` + the MANDATORY `bunood.*_apply` hook → `surfaces/_*.scss`
  working-set blocks → picker trio → contrast pairs → fingerprint → ar.csv →
  suite family). Diff against whichever kit is closer; both headers carry the
  same five-block contract. Six more edits live outside that list and are
  easy to miss: `build.mjs` FIELD_PREFIXES, the sweep's CRUMBS_ONLY **and**
  IMPLICIT, `bunood.scss`'s `@use`, the shell nav entry + `BND_SHELL_OWNS`
  prefix, the export **and** import field lists, and MUTABLE_FIELDS.
* **Probe BEFORE designing, and probe the CASCADE too.** Item 16 taught
  "probe the DOM"; item 18 added "probe the rules". Both of its defects were
  upstream selectors out-specifying ours (see the item-18 block above).
  Distrust truncated HTML dumps — the 300-char truncation caused the wrong
  bulk-header inference.
* **Wireframes are the user's decision point**: options per axis, the user
  picks; they have consistently preferred the bolder option (Floating Cards,
  Bold Bar, solid side pane, Floating Panels, Solid Pill, Floating Pane).
  Record picks in the commit body + ROADMAP.
* **Known traps that WILL recur**: any new picker card class must join the
  sweep's CRUMBS_ONLY exclusion AND its IMPLICIT map (`.bnd-lvp-style` was
  the fourth incident, `.bnd-fvp-style` the fifth and the first to do it on
  the same day); the change-dot test pins ALL of MUTABLE_FIELDS to shipped —
  never re-add a hand-picked polluter list; new suite fields join
  MUTABLE_FIELDS or teardown clobbers them; a full-complement EXPECTED entry
  has TWO literals to update, not one; the other session may commit your
  working tree (`3c85e7c` did) — check `git log -- <file>` before assuming
  your files are uncommitted; cold bench after deploy = §4.
* **Deferred and waiting, not lost**: the floating selection bar
  (frappe-ui ListSelectBanner precedent, ~2 KB injected JS, must respect
  `--bnd-bottom-reserve`), with a fourth `list_selection` option slot
  reserved so the field doesn't churn. It is its own follow-up slice — and
  note it is NOT a surface by the registry's definition, since it injects
  chrome; that is precisely why both kits left it alone.

**ITEM 16 IS DONE** (2026-08-10, closed at `1676b0c` — full gate 173/173,
sweep clean, contrast 1,848 pairs, payload within ceiling) — the list view,
the first surface kit and the first Phase 2 item. Five `list_*` fields,
`surfaces/_list.scss` with the working-set pattern, `bunood.list_apply` from
day one (the status kit's missing-hook failure class, not repeated), the bulk
header restyled in place (probed live: `.checkbox-actions` inside
`.list-row-head`; checked rows carry NO native class, so selection rides
`:has()` with the stock-mark soft failure). Three new contrast pairs enforced
(1,848 total). The two test bugs its own family caught: the first
`.list-row-container` is the HEADER, and `.result` interleaves non-row nodes
— "consecutive data rows" is the honest zebra unit, not child parity. And the
kit bug only axe caught: `.checkbox-actions` EXISTS at rest (stylesheet-
hidden, no inline marker), so gating the bulk header on `:has()` of its mere
presence painted every header brand-solid under Frappe's muted ink (1.79:1).
The regate rides `.frappe-list:has(.list-row-checkbox:checked)` — style on
the *user's signal*, never on a node's existence.

**ITEM 7 IS DONE** (2026-08-09) — RTL & Arabic as a MECHANISM. Nothing lists
the strings: `tools/i18n.mjs` derives the catalogue every build (Frappe's own
doctype extractor ported; self-checking regexes over `__()`/`_()`, because a
hand-rolled scanner silently lost 152 of 308 call sites and under-extraction
reads as full coverage). Decisions live in `locale/ar.po` — 649 rows, machine-
filled, bulk-approved by the user (c89d0ae); `translations/ar.csv` is GENERATED
from it, 48 strings are inherited by OMISSION (generated ledger, REJECT map for
false friends), 8 exempt with reasons the gate forces to shrink. Five build
gates: coverage in both directions, placeholder token-SET equality, the plural
guard (empty exceptions map — reshape the string), cursive safety, typography
sync. `arabic_font` is a settings axis — four self-hosted faces + System,
unicode-range `@font-face`; honest cost ~60–90KB once, since Chromium downloads
on in-range DOM chars and boot carries native language names. Direction is
DETECTED AND REFUSED, never corrected: upstream `is_rtl` exact-matches four
codes, and correcting `dir` alone half-flips the desk (the `rtl_` sheet keys
off the same check); the suite's CLDR cross-check is what kept `ku` out
(Kurmanji is Latin-script). The merge-order inversion — we are 3rd of 10 apps,
later apps override our rows — is defended at the FILE layer
(`_defend_identity_overrides` upserts Translation rows for identity holes and
releases closed ones). Beyond the item, at the user's direction: the
**Translations surface** in Theme Settings — a scan ledger over every installed
app (22,433 sources / 6,983 missing at first scan), providers writing
spend-capped PROPOSALS only, export/import, manual save.

**THE CROSS-APP TRANSLATIONS SURFACE WAS RUN AT FULL SCALE** (2026-08-13, at
the user's direction: "translate all scanned strings here and add them").
6,983 missing strings across all 10 apps, translated in 62 batches of ~120
(one agent translates, an independent second agent reviews and fixes —
98 real defects caught this way: gender agreement, wrong technical sense,
an accounting Dr/Credit inversion, cross-batch glossary drift), merged with a
mechanical gate (placeholder/format-token equality, digit rule, script
presence), applied through `import_translations_csv`. Missing count: 6,983 →
262, and the remainder is verified non-linguistic (naming-series patterns,
CSS units, minified-JS extraction artifacts Frappe's own scanner picks up,
paper sizes) — not a shortfall.

Doing this at scale surfaced two real, pre-existing defects in
`bunood_theme/i18n/apply.py`'s `import_translations_csv`/`upsert_translation`
— both now fixed and each pinned by a suite test:
  - **Whitespace-bearing sources were silently corrupted.** `.strip()` on
    both CSV columns before storing meant a source of `" App Name"` (a real
    msgid — Frappe's dictionary is exact-match) landed under the DIFFERENT
    key `"App Name"`. 55 rows, mostly multi-line HTML help text, rendered
    English forever with no error anywhere. `import_translations_csv` now
    stores exactly what the row carries; `.strip()` is still used to test for
    an empty cell, never to decide what gets written.
  - **MariaDB's case-insensitive collation silently merged translations
    across case.** `upsert_translation`'s lookup filter matches "Amber"
    against an existing row storing "amber" — and updating THAT row left
    `source_text` lowercase while Frappe's dictionary is a case-sensitive
    Python dict, so the correctly-cased lookup never found it. 65 rows
    vanished this way, each looking like a clean "updated" at the time.
    The row the database hands back is now re-checked byte-for-byte in
    Python before being trusted as a match — portable to Postgres too, since
    it doesn't rely on a MariaDB-specific collation override.
  - **A related, smaller trap for whoever documents this file next:** don't
    write an ``_()`` call inside a docstring as an illustration, even in
    prose — `tools/i18n.mjs` cannot tell an example from a real call site,
    and two such examples in these same docstrings briefly broke `npm run
    build`'s OWN coverage gate (item 7d, a different mechanism from the
    cross-app one above) for strings no UI ever shows.

**E3 IS DONE** (2026-08-09) — order within a zone. `desk_order` holds tenant
keys in desk order (one global list; position is meaningful wherever two
tenants share a zone). Enforcement is `enforce_desk_order()` in bunood.js — a
DOM sort after each mount pass, never a mount rule, so mounts stay independent
and the order lives in one place. The quick links now mount into the same
cluster zones as the bell (`host_for`), which is what made them orderable at
all. The board writes the order: drop ON a chip = before it, drop on a zone's
blank space = after its chips — and the first cut clobbered the former with
the latter's append, so the drop_on/`order_settled` handshake is load-bearing.
Also: the shell's container query moved to a `.bnd-shell-viewport` wrapper —
a `@container` rule cannot style the container it queries, so the shell's own
narrow rule never fired while its children's did, which is what "breaks its
format instead of reflowing" was.

**The notifications panel follows the BELL now** (`data-bnd-bell`, stamped by
`mount_placed_tenants` from where the mount landed, cleared on off/absent/no
host). The four `_layouts.scss` panel rules key on it — the last "the layout
decides" in the sheet, and §8's oldest open item, closed.

**reserve_cluster once nested a cluster inside a cluster** — several host
lookups return the cluster when one exists, and blind `querySelector` from
there built a second, giving a bar two "end" zones (tenants in one, every
measurement reading the other). It now recognises a host that IS the cluster.

**The settings sweep** (`tools/sweep-settings.mjs`, new) clicks every option
of every picker through the user's own click path — 186 options across four
kinds (option buttons, style cards, toggles, preset cards, plus stock
checkboxes and selects) — and demands each click saves, lands, and stays
console-clean. It found four real defects its first day, all shipped fixed:

* **The status picker's "Off" card wrote a value the field refuses.**
  `status_style` lost "Off" on 2026-08-06; the card survived, and one click
  failed validation for the WHOLE Single — the form read "Not Saved" forever
  and every later control timed out behind it. Card deleted; the card list now
  filters against the field's own options.
* **Every status toggle was inert.** The status `P.toggle` call omitted
  `cls: "bnd-stp-toggle"`, so the handler bound a class the markup never
  carried — the exact port defect P.toggle's docstring warns about. The knob
  looked right; the click did nothing; no error anywhere.
* **Autosave could fabricate permanent dirtiness.** `bnd_merge_and_retry`'s
  give-up branch set `__unsaved = 1` with an empty diff — a state no save can
  clear. Empty-diff give-ups now return clean, mid-retry refusals reschedule,
  and `bnd_autosave` heals a dirty form whose diff is empty.
* **The stale brand CSS** — see the closed item in §8.

**Shipped sidebar defaults changed** (the user's re-chosen combination,
2026-08-08): Bunood Night is now Attached + Solid + Match Theme + width 3 +
Always Expanded + rail button None. "Bunood Light" keeps the old
floating-glass rail look one click away. Two defects fell out of verifying it
in the browser rather than trusting the values:

* **The width stops above 220px never rendered.** The pane is a flex child
  with Frappe's `flex: 0 1 auto`, so the width was only a basis and
  flex-shrink handed back the difference — variable 240px, inline 240px, pane
  220.9px. `flex-shrink: 0` in expanded mode pins it; the main section
  absorbs, which is what a flexible main pane is for.
* **The rail button floated over the workspace list when the pane opened.**
  It is absolute against the CONTAINER (52px), and the open pane is an overlay
  that grows past it — so opening slid the pane out from under the button.
  Every placement now has an at-rest offset and an OPEN offset derived from
  the same two widths the pane uses, and glides with the same duration.

**THEN: the honest-picker audit** — `bnd_region_blocker` covers placement; the
rest is unaudited. Two concrete items for it are in §8.

**NEXT**: items 7 and 16 and 18 are closed, so Phase 2's surface work is done
apart from the report view. The open threads, in the order they earn their
place: **34a** (the sidebar kit's own 8-preset palette, still outside the
contrast gate, plus the two measured-not-enforced hairline judgements the
list and form kits have now both fed it); **33** (the icon sprite — three
callers exist now, which is the evidence Phase 3 wanted before freezing the
interface); the honest-picker audit; and the deferred floating selection bar.
A release is also owed — see the release-state bullet above.

---

## 2. Waiting on the user

1. **Release.** Item 32 is a MINOR by the versioning policy but sits in
   `[Unreleased]`; `app_version` in `hooks.py` is unbumped. A release needs the
   three gates: CI green (is), smoke green (is), adversarial release review clean
   (not yet run for this batch).
2. **A provider key — lower priority now.** The 2026-08-13 full-scale fill
   (see above) closed the missing-string count directly via multi-agent
   translation + `import_translations_csv`, bypassing `providers.py` entirely
   — so `Bunood Translation Settings`' Claude/DeepL/Google/Microsoft path is
   STILL never exercised end to end with a real key, only against the
   estimate step. Worth doing eventually to prove that specific code path,
   but the content gap it exists to close is gone.
3. **The upstream `is_rtl` filing.** `docs/upstream/frappe-is-rtl.md` is
   drafted (exact-match four-language list, no parent resolution, suggested
   one-line fix). Filing against frappe/frappe is an outward act, so it waits
   here.

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
npm run verify     # the full browser suite (132). NEVER while deploying.
npm run verify -- --only "container:"   # ~90s inner loop; says FILTERED, never a gate
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
- **THE FULL SUITE IS THE ONLY HONEST SIGNAL, AND A BASELINE IS CHEAPER THAN A
  THEORY.** On 2026-08-08 six consecutive full runs gave 20/15/12/9/28/12
  failures with a DIFFERENT set each time, and the cause was hunted through the
  environment — gunicorn workers, cold calls, Docker health — for hours.
  Stashing the working tree and running the PUSHED commit took ten minutes and
  settled it in one run: the baseline failed identically, so the working tree
  was never the cause. **When failure sets shift between runs, measure the
  baseline before theorising.**
- **Two intermittents seen once each on 2026-08-07, neither explained.** A
  `pageerror: frappe.template.compile(...) is not a function` in one full run
  (the theme calls `render_template` nowhere — that is the only path to it,
  `microtemplate.js:104` — and it did not recur in a re-run, a 13-test targeted
  run, or a four-state sweep of the settings page); and `tools/fingerprint.mjs`
  timing out on `.bnd-dgm-slot`, which it waits for VISIBLE while a probe found
  24 of them PRESENT. Re-running fixed both, unchanged. Recorded because one
  sighting is not enough to call something environmental — if either returns,
  it has a second data point waiting here rather than starting from scratch.
- **An ABORTED suite run poisons the next one, twice over.** The suite restores
  the snapshot it took at START, so aborting run A leaves the bench mid-test, and
  run B then faithfully restores *that* on the way out. Two runs were voided this
  way on 2026-08-01 and it happened again on 2026-08-07. After any abort, reset
  the bench to `setup.SHIPPED` before trusting what you see.
- **The full suite needs a QUIET machine.** The host has 6GB with the stack
  capped at 3.8GiB; the same tree gave 156/156 quiet and rotating phantom sets
  loaded (one loaded run started at 132MB host-free). Check free memory and
  that no second session is working before burning a ~25-minute run.
- **Stale desk sessions degrade the suite.** 382 rows in `tabSessions` took a
  run from 125 to 114 of 137; the suite now reaps sessions older than an hour
  in `main()`. If failure sets rotate for no reason, look at the session table
  before the tests.
- **MySQL error 1020 is a transient, not a defect.** Ten apps' scheduler jobs
  contend on `tabSingles`/`tabUser`; both `benchPy` copies (suite and
  `tools/session.mjs`) retry a 1020 once. It has killed a run at startup and a
  probe inside its own `finally` — treat a lone 1020 as weather.
- **Seven of the ten installed apps live in the container writable layer.**
  `compose down` destroys them; a rebuild from `apps.json` also needs
  `telephony` added (ships only on frappe's develop branch, and helpdesk
  imports it at boot — its absence 500s the whole desk). After any `get-app`,
  run `bench --site demo.bunood.test compile-po-to-mo` or the new apps'
  translations silently do not serve (get-app does not compile them).

---

**A gate started right after `BND_FORCE_RESTART` is a coin toss.** The suite's
warm-up outruns a freshly restarted gunicorn set: two full runs (2026-08-09)
failed 8-14 tests each in areas the day's commits never touched — status-bar
mounts, cold badge paints, search fallbacks — and every one passed in
isolation minutes later. Deploy, give the workers a beat (one authenticated
request settles them), THEN gate; and read a broad, incoherent failure set as
"the bench was cold or moving", never as fourteen simultaneous regressions.
The converse discipline also holds: two of the "poisoned" failures that day
were REAL (the bell-selector break and the status Off card) — isolation
re-runs are what separate the two, not judgement calls on the pattern.

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

**The second sharp edge — the empty mount on engine start** (hit 2026-08-09).
WSL died mid-suite under memory pressure and took the Docker engine with it;
on relaunch, the containers auto-start with the engine (restart policy) and
RACE the Ubuntu distro. If they mount before Ubuntu's filesystem is up, the
mirror resolves EMPTY: `apps/bunood_theme` exists but has nothing in it,
`apps.txt` is intact, and every request dies with `ModuleNotFoundError:
No module named 'bunood_theme'`. The recovery is NOT a recreate (that is the
first sharp edge): start Ubuntu, confirm the mirror has content
(`wsl -d Ubuntu -- ls ~/bunood-theme`), then plain-`docker restart` the app
containers — the remount resolves correctly and nothing in the writable
layers is touched. Related watcher lesson: **0% backend CPU is also what
dead looks like** — any "machine is quiet" check must include a liveness
probe (an HTTP 200 from the site), or it will read a dying stack as calm.

**The THIRD sharp edge — apps.txt truncated to what the entrypoint could
find** (hit 2026-08-10, same crash class). WSL died again under memory
pressure mid-session. On relaunch the mount resolved correctly this time —
but the entrypoint had rewritten `sites/apps.txt` down to **`erpnext` and
`frappe` alone**, dropping EIGHT of the ten installed apps, while the
database still listed all ten and `apps/` still held all ten. The §5 recovery
already on record only re-adds `bunood_theme`; this is the same edge, wider.

**It is nearly invisible from the outside.** `/api/method/ping` returns 200,
the desk renders, and our CSS/JS assets serve — because runtime app loading
reads `installed_apps` from the DB. What breaks is MODULE resolution: opening
Theme Settings 404s on `frappe.desk.form.load.getdoctype` and puts up
*"Module Bunood Theme not found"*, and the whole settings page renders as
nothing. **A `bench migrate` in that state would silently skip eight apps.**

Recovery, and note the second half — re-adding the lines is NOT enough,
because the module→app map is cached:

```bash
docker exec bunood-backend-1 bash -lc 'cd /home/frappe/frappe-bench && for a in bunood_theme payments hrms ksa_compliance bunood_realestate crm telephony helpdesk; do grep -qx "$a" sites/apps.txt || echo "$a" >> sites/apps.txt; done'
docker restart bunood-backend-1
docker exec bunood-backend-1 bash -lc 'cd /home/frappe/frappe-bench && bench --site demo.bunood.test clear-cache'
```

Get the authoritative order from the database, never from memory —
`frappe.get_installed_apps()` is the list, and we sit 3rd of ten (which the
translation merge order depends on).

**Diagnostic worth keeping: a `tools/fingerprint.mjs` timeout on
`.bnd-dgm-slot` can mean "the settings page did not render AT ALL", not the
2026-08-07 intermittent.** That is how this was found — it looked exactly
like the recorded transient, and re-running (the recorded remedy) did not
clear it. Two runs failing identically is the tell: a transient that
reproduces is not a transient. Probe the page for a modal before assuming.

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

- ~~An open desk tab loses its brand colours when somebody changes them~~ —
  CLOSED 2026-08-08, found live by the settings sweep as a stale-brand-CSS
  MIME error on page load. Both halves landed: `_reap_old` keeps the newest
  eight files instead of one (a tab holding any recent URL keeps its
  stylesheet), and `context._append_brand_css` self-heals — one stat per desk
  render, and a stored URL whose file is missing triggers `write_brand_css`
  before serving. The second half also fixes the case the first cannot: a
  database-only restore (the suite and the sweep write tabSingles back raw)
  reviving a URL whose file was reaped long ago.
- **Saving Theme Settings still writes the WHOLE document.** The merge above
  makes that safe for the user's click, but it is a property of Frappe Singles,
  not something this app chose, and any future writer of the Single should
  expect to be overwritten between a form's load and its next save.

- ~~The notifications panel guesses where the bell is~~ — CLOSED 2026-08-08:
  the panel keys on `data-bnd-bell`, stamped from where the bell's mount
  actually landed. See §1.
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

- ~~`home_placement` / `apps_placement` accept "Dock" with no runtime branch~~
  — CLOSED by E1: `sb_mount_utils` resolves every slot through `parse_slot`
  against `BAR_HOSTS`, and the dock is one of them.
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
  a per-component question. Item 34. **Both surface kits have now fed this the
  same shape of judgement**: a list row is identified at rest by its boundary
  plus the subject link's ink, and a Floating Panel by its border plus shadow
  plus its title ink (~1.05:1 fill-vs-canvas on its own). Segment Pills' active
  fill against its 4%-ink track is the third (~1.1:1, carried by shadow, ink
  weight and the AA-passing label). Three data points, one question: item 34
  should now be able to answer it as a rule rather than case by case.
- `--bnd-ink-inverse` has zero in-repo callers. Kept because token names are a
  contract; do not reach for it for a brand fill.
- The first test of a cold stack routinely exceeds a 30s budget because
  `get_status_signals` takes ~5s on its first call. It fails as
  "desk boots authenticated with theme assets" and drags the console-error
  budget down with it. Environmental, recurring, not yet mechanised away.
