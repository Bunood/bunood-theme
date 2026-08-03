# Working contract — read this before acting

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
4. **`npm run verify`** — never a hand-assembled shell chain. `grep -c` exits 1 on
   zero matches and reported a green run as failed; `| head` closed the pipe and
   killed a suite mid-run.
5. **Commit locally. Never push, tag-push or open a PR without being asked.**

## Non-negotiables

- **Logical properties only.** Build-enforced.
- **Tokens, never raw hex/px in a rule.** New tokens go in `_tokens.scss`, documented.
- **Frappe variables only inside `[data-theme]`.** A neutral in bare `:root` is the
  light-leaks-into-dark bug.
- **`!important`** only in the two sanctioned places.
- **Never touch Frappe-generated DOM.** Colour it through tokens.
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
- **Verifying against the wrong tree or stale assets.** Confirm the container is
  serving the hash you just built. GUIDELINES §2.0 is an audit of the wrong repo.
- **Scripted multi-site edits.** End every one with a parse check (`node --check`,
  `ast.parse`). A heredoc with `\n` has mangled a file twice.

## Where things are

- `registry.py` — the components, their identity, what each replaces, which are
  critical. One table, several consumers.
- `tools/verify.mjs` · `tools/fingerprint.mjs` — the suite runner and the shape
  capture. Regenerate the fixture *deliberately* after an intended change.
- `build.mjs` — RTL, ownership polarity, field naming, registry identity guards.
- Coverage checklist and release policy live in the assistant memory for this
  project, not in a repo. See GUIDELINES §2.1 — that is itself governance drift.

## Open, from the audit

Contrast has no stated target and the default seed already fails white-on-brand
(4.27:1). Accessibility is present in the components but asserted nowhere. Bidi
isolation is absent. Payload is unmeasured. Item 7 (RTL **and** Arabic) is reopened.
