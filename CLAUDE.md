# Working contract — read this before acting

**Starting a fresh session? Read [HANDOVER.md](HANDOVER.md) first** — the state of
play, the stack's constants, the open decisions, and the facts that have cost time
to rediscover. This file is the standing rules; that one is where things stand.

`GUIDELINES.md` is the doctrine and the audit. This is the short form: what to do
every turn, and the traps this repo has actually fallen into. If the two ever
disagree, GUIDELINES wins and this file is stale — fix it.

## The loop, every change

1. **Write the check first, and watch it fail for the right reason.** A test that
   has never failed has no evidence it can. Three versions of one layout helper
   looked correct and asserted nothing; only breaking the build on purpose found it.
2. **Baseline before, re-measure after.** `tests/fixtures/picker-shape.json` is the
   before for the settings form. For anything else, capture the numbers first.
3. **Change one thing.** Refactor and behaviour go in separate commits.
4. **`npm run deploy`, then `npm run verify`** — never hand-assembled shell chains.
   `deploy` builds, ships to all four app containers *and* the frontend's own dist,
   mirrors the tree into WSL `~/bunood-theme` so the work is followable there,
   restarts only when the asset hash moved, and fails if the stack is not serving
   the build it just made. `verify` runs the suite: `grep -c` exits 1 on zero
   matches and reported a green run as failed; `| head` closed the pipe and killed
   a suite mid-run.
   **Never deploy while the suite is running** — it invalidates the run and
   produces phantom failures.
5. **Commit locally. Never push, tag-push or open a PR without being asked.**

## Non-negotiables

- **Logical properties only.** Build-enforced.
- **Tokens, never raw hex/px in a rule.** New tokens go in `_tokens.scss`, documented.
- **A colour token has one role.** The brand is three tokens — wash / fill+ink / text —
  because the three have different contrast requirements. Never paint with the raw seed.
  Adding or re-stepping a colour means running `npm run contrast`; `check_defaults_agree`
  in `tools/contrast_gate.py` asserts `_tokens.scss` matches `palette.derive()` — CI-
  enforced via `npm run contrast`, not `build.mjs`, which carries no colour guard.
- **Frappe variables only inside `[data-theme]`.** A neutral in bare `:root` is the
  light-leaks-into-dark bug. **One amendment** (item 32): a *website* page has no
  `data-theme` at all, so `web/_login.scss` scopes its overrides to `body.bnd-auth` —
  narrower than `[data-theme]`, not wider. GUIDELINES §1.3 carries the argument and
  the second half nobody expects: `brand.py`'s dark blocks need that scope too, or a
  customer's dark sign-in page silently paints the *shipped* seed.
- **`!important`** only in the sanctioned places — the `font-family` block, `@media
  print`, and (item 33) inside `body.bnd-web` to beat a vendor `!important` **literal**
  where the alternative is a measured WCAG failure. That third place exists because a
  website page has no `.bunood` on `<html>` to escalate through. GUIDELINES §1.3 carries
  the test; it is not a general licence.
- **Never touch Frappe-generated DOM.** Colour it through tokens. The ONE sanctioned
  exception (item 24): `repair_viewport_meta` in `bunood.js` rewrites the `<head>` viewport
  `<meta>` to unlock pinch-zoom — a meta tag is neither layout nor styling, there is no
  hook to reach it, and forking `desk.html` is retired (ARCHITECTURE §4).
- **Hide a native affordance only from `data-bnd-own`**, stamped after our
  replacement is in the DOM — never from `data-bnd-layout`/`data-bnd-search`, which
  are declarations that can outrun reality. Build-enforced.
- **Identity is `data-bnd-part`, defined in `registry.py`.** Classes are for styling.
  Build-enforced both ways.
- **Fields are `<component>_<property>`.** Build-enforced, with a shrinking
  exceptions list.

## The traps this repo has actually hit

- **The same fact in two places.** Every critical defect traces to it: layout vs DOM,
  on/off vs placement, declared reserve vs measured chrome, preset name vs values.
  Fix: make the second copy impossible, or derive it. The sidebar picker's label is
  derived by comparing 23 values — pinning the *name* pins nothing.
- **Sizing the CONTAINER while the vendor sizes the CONTENT.** Item 40's width
  control set `--bnd-sb-w` on `.body-sidebar-container`; Frappe sizes the pane
  inside it from `--sidebar-width` (their variable, default 220px) in their own
  rule. Every stop but 220 therefore rendered TWO boxes with different widths —
  at 240 the pane's wash stopped 20px short and the container's paint showed
  past it as a second layer; at 200 the pane OVERFLOWED its container; and a
  drag widened the GAP, not the pane. Six checks measured the container and all
  six were right about it. **A user's eyes found this, not the suite**, which is
  the tell: when a control governs a box, assert the CHILD it is supposed to
  move, not only the box you set. The fix is to feed the vendor's variable
  (`_bridge.scss` is where their names live), never to fight it with a second
  width — and it must be declared on the element where the runtime's inline
  custom property is in scope, because substitution happens where a property is
  DECLARED: on `html` it would freeze at the stop and the drag would move
  nothing.
- **An ALIAS that self-adapts is not the same fact as the literal it resolves to
  today — and a PERCENTAGE cannot self-adapt at all.** `html[data-bnd-sb-color=
  "theme"]` carries no `data-theme`, so it serves both polarities, and its values
  were `var(--bnd-ink)` / `var(--bnd-border)` precisely because an alias follows
  the mode. Replacing them with the light hexes they resolve to painted #16181d
  ink on the dark pane at 1.16:1. The repair then hit the mirror image: a card
  written as 55% white over the pane is right in light and, in dark, a light card
  under dark ink at 1.44:1 — so a percentage in a shared block needs a
  polarity-specific override where an alias needs none. Before rewriting a
  declaration, check whether its SELECTOR is polarity-scoped.
- **A colour fitted at the SHIPPED seed is not fitted for the fallback sheet.**
  Dark Contrast's pane is `mix(brand 10%, #131a15)`, so it moves with the tenant
  even with no brand sheet loaded; inks fitted at #3d8150 fell to 4.12:1 at
  brighter seeds. Static values on a seed-dependent surface must be fitted at the
  BINDING seed — the extreme the surface ever reaches — exactly as
  `_chart_binding_bg` and `_status_binding_bg` already do. Fit a hair above the
  floor (4.62, not 4.50): a fit that lands exactly on it rounds under somewhere.
- **`setup.SHIPPED` has no `ground_color` key**, so a restore loop written as
  `for f, v in SHIPPED.items()` never clears a ground somebody set — the site
  looks theme-derived when it is only still tinted, which is how a probe can
  "prove" a fix that has not shipped. Clear it explicitly.
- **Selecting by class measures the wrong element.** The badge is not the bell; the
  field is not search-in-any-form; the first `.bnd-cbp-opt` on the page is not the one
  in your group. Query by `data-bnd-part`, and scope to a root.
- **Green tests that assert existence, not correctness.** 75 tests were green while
  five real defects lived. Ask: reachable? in the right place? laid out right? not
  under something else?
- **A branch whose guard is false on the dev site is UNTESTED, not working.** Item 32's
  logo override shipped for three slices on the strength of "the `if logo:` guard
  correctly skipped" — with `logo` empty here, that sentence is true and proves nothing.
  Three branding fields (`logo`, `favicon`, `company_name`) are in this
  category, because they sit outside MUTABLE_FIELDS by design. `tagline` is the
  exception — it IS in MUTABLE_FIELDS (the save-round-trip scratch field), and
  item 36's `site data:` hygiene preamble is the crash-leftover backstop.
- **Verifying against the wrong tree or stale assets.** Confirm the container is
  serving the hash you just built. GUIDELINES §2.0 is an audit of the wrong repo.
- **Proving the output inert and calling the change inert.** A byte-identical rebuild
  is real evidence about the *compiled sheet* and none at all about a tool that parses
  the *source*. Item 32's `_tokens.scss` mixin was byte-identical and still collapsed
  `contrast_gate.read_blocks`'s dark map onto light — 150 failures across every seed
  from a perfect stylesheet. Ask who else reads the file.
- **Measuring the wrong tick, or the wrong parent.** `getComputedStyle` served a stale
  value when an attribute was mutated and re-read inside one `page.evaluate`; and a
  `transparent` parent parses as black, so a passing 7.94:1 read as 2.52:1. Mutate and
  read in different evaluates; resolve the effective background by walking ancestors.
  **Separate evaluates are still not enough if the thing transitions** — a read 120ms
  and two rAFs after clearing `disabled` caught a button mid-fade and reported 4.22:1
  for a pair that settles at 4.56:1, and the same wait after a class swap read an
  interpolation between two poles. One direction cries wolf; the other certifies a live
  defect as repaired. Poll until three consecutive frames agree, with a frame cap.
- **Matching a route when what is rendered is a template.** Item 32 keyed the auth kit
  on `request.path` and the SITE ROOT got nothing — a guest at `/` is served the sign-in
  page and the path is `""`. All 22 of its checks passed because all 22 asked for
  `/login` by name. A route is one of many addresses that reach a template; guard on
  `context.template`, and make one check use an address you did not write the rule for.
- **Sizing a selector against the ELEMENT instead of the RULE it must beat.** Two shapes,
  one mistake. (a) A vendor that groups `:hover`, `:focus` and `:active` into one selector
  list out-specifies a base rule sized against the base.
  Item 32 lost `:focus` (CTA reverted to grey on click, no ring), `:disabled` (1.12:1,
  one gesture away) and a strength track that had NEVER applied — three classes beats
  two classes plus an element. Scan the STATES. And where the competitor is
  `!important`, re-point BOTH halves of its pair or none: changing `--text-color` and
  not `--control-bg` put our flipping ink on Frappe's fixed grey at 1.09:1, where stock
  managed 10.57:1. A repair that moves half a pair is a regression.
  (b) **Our own file does it too.** Item 40's reduced-transparency block weighed (0,2,1)
  against a translucent surface rule carrying a `:not()` at (0,3,1), so it lost the
  background and won only the blur — a pane 75% transparent with its frosting removed,
  the one combination the degradation exists to prevent. It survived because **headless
  Chromium reports `prefers-reduced-transparency: reduce`**, so every desk this suite has
  ever driven was in that branch and nothing looked. Emulate the other pole through CDP
  (`Emulation.setEmulatedMedia`) on a fresh context — Playwright carries no flag for it.
  (c) **And removing that `:not()` is how it came back.** When the brand pane was
  deleted the guard read like dead weight, and it was checked — both sides of the pair
  dropped together, relative order unchanged, which is true and insufficient. The rule
  the degradation actually has to beat was a THIRD one 250 lines away:
  `[material][data-bnd-rail] .container .body-sidebar` at (0,4,1), against arms that had
  just fallen to (0,3,1). **Re-weigh against every rule that sets the same property on
  the same element, never only the one the comment names.** The repair is an attribute
  that is always present (`[data-bnd-sb-color]`) used purely as weight — say so at the
  site, or the next reader deletes it as a redundant condition and this recurs a third
  time. The expanded case passes either way; only the RAIL case catches it.
- **Aliasing a token onto one whose ROLE differs.** Collapsing the pane's palette onto
  the theme's, `--bnd-sb-cat-*` were pointed at the global `--bnd-cat-*`. The names match,
  the polarity handling is better, and it is wrong: `--bnd-sb-hue` is read as `color:` in
  six rules, so it is INK, while `--bnd-cat-*` are FILLS — the dot on a row, the bar on a
  chart. Measured: `#eda100` amber as text on a light pane is **1.82:1**, and 282 of 378
  pairs fail. When you collapse a component's palette onto a shared one, check each
  token's role AT ITS CONSUMERS, not by its name — and expect the survivors: a fit the
  global palette has no token for is exactly what must stay derived.
- **A source-parsing check that reads the FIRST of two identical selectors.** The new hue
  drift check found `html[data-bnd-sb-color]` with `re.search` — but two blocks carry that
  selector, and it read the alias block, which declares no hues. Seven false drifts, on
  correct code. This is `selecting by class measures the wrong element` arriving one level
  up, in a file parser rather than the DOM: the cascade merges every matching block, so a
  check that models the cascade must `finditer` and merge too.
- **A helper that guesses at an unrecognised input.** `triple()` knew `rgb()` and
  `color(srgb …)` and read `oklab(…)` — which Chrome also emits for `color-mix()` — as
  near-black, silently. A rule scan that recursed on `r.cssRules` examined NOTHING, because
  CSS nesting gave every `CSSStyleRule` an empty `cssRules` list, and reported zero
  matches as though the vendor had no such rule. Make the unknown case THROW.
- **Sharing a layout rule between poles, then asserting the wrong property.** Item 32's
  `Split` inherited `flex-direction: column` from the rule it shares with `Panel`, so its
  brand panel stacked *below* the form instead of beside it — and both checks passed,
  because `display` was still `flex` and a column container still puts a sized item at the
  inline start in LTR and the inline end in RTL. Only the column's HEIGHT told them apart.
  Assert the thing the sharing could break.
- **Clearing a cache BEFORE committing the write it invalidates.** `setSettings` in
  both `tests/smoke.mjs` and `tools/session.mjs` ran `frappe.clear_cache()` and THEN
  `frappe.db.commit()`. Any worker that touched Theme Settings in that window
  repopulated the cache from the UNCOMMITTED row, the commit landed behind a cache
  nobody clears again, and every later read served the value from BEFORE the write.
  **The symptom is always "the previous case's value"** — a five-style walk reporting
  styles 1 and 2 as identical, a preset matrix showing the preceding preset's colour,
  an icon check reporting the default it just moved away from. It looks like five
  unrelated bugs, it gets worse as the machine gets busier, and restarting the backend
  "fixes" it for a while, which is what makes it so easy to file as environmental.
  Commit, then clear. Measured after: one page load, every time.
- **A retry that treats a TRANSIENT as its premise.** `sidepane_sync` mounts the head
  inside a `try_for`; re-reading `sidebar_is_hidden()` on every attempt made it give up
  on a pane that was merely mid-layout, and three presets in a row lost their head while
  each passed when run alone. What is WANTED (a setting) stops a retry; what is not
  READY yet (the DOM) is the reason the retry exists.
- **Editing the GENERATED half of a pair.** `translations/ar.csv` is generated FROM
  `locale/ar.po`, and the banner saying so is in the PO. Item 40 edited the CSV; the next
  `i18n:emit` silently reverted every edit and turned coverage red. Ask which file is the
  source before editing either. And do not bulk-reap rows the extractor calls dead: it is
  STATIC, and preset NAMES reach `__()` as data — deleting those drops Arabic labels with
  a green gate, because coverage is measured in one direction only.
- **Extending a patch that has already run.** `bench migrate` records executed patches by
  module path, so a case added to a patch this site ran last week executes nowhere here
  and everywhere on the next site. One patch per change. Related: **`npm run deploy` never
  migrates** — a doctype change needs `bench --site demo.bunood.test migrate` after it, or
  the field does not exist while the code assumes it does.
- **Scripted multi-site edits.** End every one with a parse check (`node --check`,
  `ast.parse`). A heredoc with `\n` has mangled a file twice.
- **A parse check proves SYNTAX, not EXTENT.** Item 37's slice-4 deletion aimed at
  `LAYOUT_SLUGS` and one IIFE and took **337 lines** with it - density, icon weight, the
  `is_rtl` correction, chart grid, the chart colour patch - and `node --check` PASSED,
  because deleting whole functions leaves valid JS. The only signal was twelve suite
  failures across five unrelated kits, which read like five bugs and were one. Diff the
  line count against the previous commit and account for the delta; assert the boundary
  lines INSIDE the edit script. **And a payload bucket that unexpectedly SHRINKS is the
  tell, not a win** - the truncated bundle came in under `js_gzip` and masked the real
  growth of the feature being added.
- **A check that derives its expectation from the thing it is judging measures nothing.**
  Item 40's emission guard read `data-theme` off the selector it was checking and looked up
  the static block that matched THAT - so an emission downgraded to one attribute simply
  picked the bundle's one-attribute block as its target and compared equal. It returned a
  number, which is worse than returning nothing, and it would have let a per-site block
  lose the cascade on every site that set a ground. The expectation has to come from the
  SUBJECT (here: the colour mode), never from the artefact under test. Only a deliberate
  sabotage found it - reading the code did not.
- **A mutate-and-reimport probe must delete the BYTECODE, not just the module.** CPython
  validates a `.pyc` on `(mtime, size)`, so a sabotage that swaps `280` for `100` changes
  neither and the stale bytecode is reused - the NEXT case then reports the previous
  case's failure, and nothing in the output looks like caching. Same shape one level up:
  `from package import submodule` resolves as `getattr(package, "submodule")`, so popping
  `bunood_theme.palette` and leaving `bunood_theme` cached hands back the OLD module and
  the file on disk is never read. `tools/sabotage_sidebar.py` does both; copy it rather
  than rediscovering either.
- **Running a documented gate can damage the site — and the damage class is a ROW THAT
  DID NOT EXIST.** `tools/sweep-settings.mjs` once left eleven `print_*` fields off
  their shipped defaults while printing "state restored": a Single field never yet
  written has NO tabSingles row, the snapshot cannot carry it, the sweep's click
  CREATES the row, and a restore that loops snapshot keys leaves the click behind.
  Four unrelated checks then went red with none naming the cause. FIXED 2026-08-31:
  the restore deletes sweep-created rows, fires `on_update` once, and diffs itself
  against the snapshot - it refuses to say "restored" over a non-empty diff, and
  prints the doc.save() repair recipe instead (`set_single_value` fires no hooks).
  The standing advice survives the fix: before assuming a red suite is your change,
  **stash, redeploy and re-run at HEAD**; after any sweep, diff Theme Settings
  against `setup.SHIPPED`.
- **Deleting a stored name does not delete the need for the identity.** `desk_layout`
  went, and two runtime call sites still had to know the shape - so it is DERIVED by
  comparison (`presets.layout_of`), server-side, against the one catalogue. Two things
  that cost a run each: containers alone cannot tell **Classic from Bottom Bar** (their
  rows are byte-identical; only the bell and profile placements differ), and the
  derivation must EXCLUDE the field whose question it answers - letting `search_placement`
  decide the shape made every desk wanting search somewhere unusual report "" and take the
  Top Bar order. Also split the name: `layout()` was answering both "which shape" and "is
  our system running", and those diverged the moment the shape stopped being stored.

## Where things are

- `registry.py` — the components, their identity, what each replaces, which are
  critical. One table, several consumers.
- `tools/verify.mjs` · `tools/fingerprint.mjs` — the suite runner and the shape
  capture. Regenerate the fixture *deliberately* after an intended change.
- `tools/session.mjs` — the stack's constants and an authenticated browser
  session. **Use it for any ad-hoc probe.** The forty lines it replaces were
  retyped into eight throwaway scripts in one session before it existed.
- `tools/deploy.sh` (`npm run deploy`) — build, ship to all five containers,
  mirror to WSL, restart only when hashes moved, and fail if the stack is not
  serving the build it just made.
- `build.mjs` — RTL, ownership polarity, field naming, registry identity, typography
  sync, i18n coverage, motion-primitive, breakpoint-vocabulary, focus-ring coverage,
  phantom-token, thermal page-size and payload-budget guards. The phantom-token one refuses any
  `var(--bnd-*)` naming a property nothing declares — it found five in `_settings.scss`
  the day it was written, and its exception set is READ from `brand.py`/`palette.py`.
- `contrast.py` (colour maths) · `palette.py` (the seed-dependent token set) ·
  `tools/contrast_gate.py` (`npm run contrast`). One derivation, two consumers:
  `brand.py` formats it, the gate measures it. Never reimplement either in JS.
- `ROADMAP.md` — the 38 items and the phase order. It used to live only in assistant
  memory; GUIDELINES §2.1 records why that was governance drift.

## Open, from the audit

Bidi isolation is absent. Item 7 (RTL **and** Arabic) is reopened.

Contrast is **closed** (item 17, was 32, 2026-08-06): WCAG 2.2 AA, enforced by
`npm run contrast` over **27 seeds x 2 modes** — 11 when the item closed, plus the
sixteen shipped palettes item 37 added, each also re-derived as the (brand, accent,
ground) TRIPLE it actually ships.

**Closed is not the same as covered, and item 40 is the proof.** That gate had three live
defects inside its own subject: the `automatic` theme was 25 of the dark set's 55 tokens
(30 resolving LIGHT on a dark OS for the whole first-paint window), the side pane had no
`automatic` arm at all (seven hues at 1.79-2.79:1), and dark Minimal declared 12 of its 14
tokens so the chip's ink fell through to the light block at 3.76:1. None of the three was
a wrong RATIO — every one was a pair the gate had no row for, or a mode it never entered.
When a colour gate is green, ask what it does not ask about.

Accessibility is **closed** (item 22, was 34 + 34a, 2026-08-13): the two things
contrast handed off are both answered — a control is identifiable at rest by a border
clearing 3:1 **or** a visible fill delta against its host (five data points now, not a
token value), and the sidebar kit's own palette is fitted and gated. ARIA is asserted
(menu, board, landmarks, breadcrumbs, inbox), the settings surface is in the axe hard
gate, and every control our JS builds is checked against a `:focus-visible` rule.

Payload is **closed** (item 21, shipped unnumbered, 2026-08-09): `tools/payload.mjs`
measures, gates and records at tag time; its `--check` runs inside `build.mjs`.
