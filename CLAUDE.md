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
- **Sizing a selector against the RESTING rule.** A vendor that groups `:hover`, `:focus`
  and `:active` into one selector list out-specifies a base rule sized against the base.
  Item 32 lost `:focus` (CTA reverted to grey on click, no ring), `:disabled` (1.12:1,
  one gesture away) and a strength track that had NEVER applied — three classes beats
  two classes plus an element. Scan the STATES. And where the competitor is
  `!important`, re-point BOTH halves of its pair or none: changing `--text-color` and
  not `--control-bg` put our flipping ink on Frappe's fixed grey at 1.09:1, where stock
  managed 10.57:1. A repair that moves half a pair is a regression.
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
  phantom-token and payload-budget guards. The phantom-token one refuses any
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
`npm run contrast` over 11 seeds x 2 modes.

Accessibility is **closed** (item 22, was 34 + 34a, 2026-08-13): the two things
contrast handed off are both answered — a control is identifiable at rest by a border
clearing 3:1 **or** a visible fill delta against its host (five data points now, not a
token value), and the sidebar kit's own palette is fitted and gated. ARIA is asserted
(menu, board, landmarks, breadcrumbs, inbox), the settings surface is in the axe hard
gate, and every control our JS builds is checked against a `:focus-visible` rule.

Payload is **closed** (item 21, shipped unnumbered, 2026-08-09): `tools/payload.mjs`
measures, gates and records at tag time; its `--check` runs inside `build.mjs`.
