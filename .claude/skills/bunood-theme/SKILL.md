---
name: bunood-theme
description: Use when working on the bunood-theme Frappe/ERPNext theme — running the stack, verifying a change, or debugging a rule that "should work". Carries the environment recipe and the measurement traps that have cost real time here, none of which are inferable from the source.
---

# Working on bunood-theme

`CLAUDE.md` is the contract and `GUIDELINES.md` the doctrine. This is the part
neither can tell you: what actually goes wrong on this box, and how to find out
you are wrong before a user does.

## The environment, exactly

```
BND_DOCKER="wsl docker"          # Docker lives in WSL; Windows has no `docker`
BND_BACKEND=bunoodimg-backend-1  # NOT the `bunood-backend-1` default
BND_SITE=verify.bunood.test      # NOT the `demo.bunood.test` default
```

**`BND_SITE` is the one that ruins a day.** The frontend runs
`FRAPPE_SITE_NAME_HEADER=verify.bunood.test`, so the default authenticates
against a site the server does not serve. Every desk check then lands on
`/login` and times out on `.page-head` — **351 checks failing in a way that
reads as a broken product** and is nothing of the kind. `deploy.sh` has the same
default, so without it you clear the wrong site's cache and the desk keeps
serving the previous build while every asset URL returns 200.

Deploy runs through WSL (`bash.exe` is the WSL launcher, which is why the
documented recipe works from PowerShell). PDFs need the site name to resolve
inside the container — `tools/site-resolve-shim.py`, re-applied by `deploy.sh`.

## Before you believe a measurement

- **Check `innerWidth` first.** A hidden Browser pane reports 0, every
  `data-bnd-narrow` branch fires, and you will "measure" mobile behaviour on a
  desktop page.
- **Confirm the container serves the hash you just built.** A 200 on an asset
  URL proves the file exists, not that the desk uses it. Read the `<script>`
  and `<link>` the page actually loaded.
- **Mutate and read in separate evaluates.** Same-tick reads return stale
  values.
- **Prove your extractor before trusting a MISS.** A hand-rolled PDF text
  reader reported the footer absent from a file that also "lacked" the invoice
  number printed on its face. Search for something you know is there first.

## Four traps that cost hours here

**A running CSS transition outranks the entire cascade — `!important`
included.** The side pane sat at 50px while the vendor rule at (0,3,0) matched,
our rule at (0,5,1) lost, and an inline `width: 240px !important` lost. What
made a cascade explanation impossible: the placeholder, governed by the *same*
ancestor and the *same* variable, tracked correctly. `getAnimations()` named it —
a `CSSTransition` on `width`, `playState: "running"`. **When a correct rule will
not apply, check `getAnimations()` before re-reading specificity.**

**A rule scan that greps `width:` is blind to `inline-size:`** — and this repo
mandates logical properties, so your scan misses exactly our own rules. Same
class of error: recursing on `r.cssRules` examines nothing, because CSS nesting
gives every style rule an empty list.

**Dashboard widgets are DIRECT children of `.widget-group-body`.** The
descendant spelling finds 0 on a page showing 12. Worse, navigating by
`frappe.set_route` leaves the previous workspace's `.ce-block` tiles in the DOM,
so a cross-route probe "passes" by counting the page you just left. Navigate
properly, and mirror the selector you are testing.

**`frappe.get_route()` is transiently EMPTY during boot.** Keying a redirect on
it hijacked navigations to other pages — 21 checks red, all selector timeouts
rather than assertions. Key on `location.pathname`, which is what the user asked
for and does not flicker. (Uniform timeouts mean a hijacked navigation;
assertions fail with values.)

## The i18n gate cannot see the home dashboard

`home_text(source)` passes a **variable** to `__()`, and the extractor reads
literals only. So `npm run i18n:check` reports "coverage complete" for strings
it has never seen. Add anything user-visible to `locale/ar.po` and
`npm run i18n:emit`, then **look at the desk in Arabic**.

`i18n:emit` regenerates `ar.csv` **from the PO**. Rows written straight into the
CSV are silently dropped — that once cost 207 shipped translations, including
both spellings of the logout confirmation, with the gate green throughout.

## Verifying

Per change: `npm run build && npm run contrast && npm run icons:check &&
npm run i18n:check`, then a subset:

```
npm run verify -- --only "container:|invariant:|reserve:"
```

`--only` takes substrings OR'd with `|`, or `re:` for a regex. **Never
`/pattern/`** — Git Bash rewrites the leading slash and it silently matches
nothing. A filtered run deliberately refuses to print the green verdict.

Deploy and verify never overlap; the suite mutates one shared site. A suite that
dies mid-run strands scratch values in the branding fields — the `site data:`
preamble catches it, and it renders on the public sign-in page.

Never re-run `tools/axe-baseline.mjs` wholesale: it re-banks desk routes at
today's numbers and silently accepts regressions.

## When upstream moves

`npm run upstream` fails when a pinned Frappe/ERPNext fact changes. A red gate
is not noise: read what moved, port what it means, re-pin **in the same commit**,
and say what you ported. Depend on a new upstream fact, add it to
`bunood_theme/upstream.py` in that same commit. See GUIDELINES §1.2.

## Which general skill to reach for

- `superpowers:systematic-debugging` — before guessing at a defect. Every trap
  above was found by measuring, and lost time to guessing first.
- `superpowers:verification-before-completion` — before saying "done". Two
  claims in this repo's history were wrong at exactly that moment.
- `superpowers:test-driven-development` — the house rule is already "write the
  check first, and watch it fail for the right reason".
- `ui-ux-pro-max` / `frontend-design` — for a new surface, not for repairs;
  repairs go through the vendor ladder in GUIDELINES §1.2.
