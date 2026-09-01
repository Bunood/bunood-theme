# Handover — read this first

> Written 2026-08-06. Everything needed to pick this up in a fresh session.
> `CLAUDE.md` is the working contract, `GUIDELINES.md` the doctrine and audit,
> `ROADMAP.md` the 38 items. **This file is the state of play**; those three are
> the standing rules. If this file and `ROADMAP.md` disagree, ROADMAP wins and
> this one is stale.

---

## 1. Where the work stands

**VERSION NUMBERING CHANGED 2026-08-20, AND IT IS A STANDING RULE: MINOR IS THE ROADMAP
ITEM NUMBER.** Item 29 released as `v0.29.0`, item 30 as `v0.30.0`; PATCH stays
fixes-on-top. The old increment-by-one scheme had drifted EIGHT behind the roadmap (0.20.0
was item 28), so a version number carried no information about its contents. **Item 38 is done and
releases as `v0.38.0`; the item in flight is 40, which releases as `v0.40.0` — do NOT
compute either from the previous tag, and note that 39 is spent (see below).** Releases
before 0.29.0 keep their numbers; the 0.20.0 to 0.29.0 jump is the adoption, not lost
releases. CHANGELOG's policy paragraph is the authority.

**`main` AND BOTH TAGS ARE PUSHED** (2026-08-20, at the user's request). Before this push
`origin/main` sat at `d6c7d5f` — NOT the `31bf8f3` an earlier revision of this file claimed;
`31bf8f3` is v0.20.0's release commit and `d6c7d5f` is the doc commit pushed on top of it.
Resolve the remote tip with `git rev-parse origin/main` rather than from this file.

**`v0.29.0` IS TAGGED AT `e89cd45`, NOT AT THE RELEASE COMMIT** — item 30 was already
committed when the numbering was decided, and a v0.29.0 cut at HEAD would have carried item
30's whole source inside a release named for item 29. The cost, recorded in CHANGELOG so it
is not rediscovered as a bug: the version files at that commit still read 0.20.0. The
"`app_version` matches latest tag" invariant resumes at `v0.30.0` (`649f4d1`).

**THE DIVERGENCE IS RESOLVED (2026-08-27, at the user's direction), AND THE SHAPE IS
WORTH KNOWING BEFORE YOU PUSH ANYTHING.** `origin/main` had reached `v0.39.1` — a
Report Studio numbered as item 39, plus ZATCA Phase-1 QR — from two human teammates,
**Hesham Mohammed Ahmed Ali** and **MrBrokenrightArm**. Neither tree contained the
other. The user chose to keep `main` as their own line: that work is preserved on the
pushed branch **`studio-zatca`** (`2b5cc83`), along with `feat/report-studio`,
`feat/zatca-phase1-qr` and the `v0.39.0` / `v0.39.1` tags, and local `main` was
force-pushed over `origin/main` with `--force-with-lease`. `v0.36.0` is pushed.

- **`origin/main` is a SHARED branch with human collaborators on it.** Check
  `git log origin/main` before assuming a divergence is another assistant session's,
  and never resolve one by discarding work without asking.
- **The version numbers on that branch are spent.** Items 39 and the 0.39.x tags name
  work that is not on `main`. MINOR = the ROADMAP item number still holds for this
  line; item 37 releases as `v0.37.0` even though a higher tag exists elsewhere.

**ITEM 40 (the side pane, rebuilt) — IN FLIGHT since 2026-08-28. Colour phase DONE;
FIELD MODEL DONE (19 style settings → 12, 13 with the filter); PLACE ROW DONE; ONE
LIFECYCLE DONE; SECTIONS DONE (paint, not surgery); LIST FEATURES DONE; SHORTCUTS
DONE (pins+recents, server caps 25/15, render-time permission re-resolution);
DRAG-TO-RESIZE DONE (free-pixel, 4px latch, SB_PANE_STOPS one table, bnd_sb_width
range axis, defects 23+24 fixed); ACCOUNT BAND + PANEL DONE (one toolbar at the
foot, W−12 owned, registry-derived order guarded; the avatar's role=dialog with
bdi identity, mode radios on Frappe's endpoint, the exact clamp; defect 22 fixed
for every menu); IDENTITY + PLACEMENT DONE (sidepane selector truth + host key,
MARKS rows for panehead/railbtn, data-bnd-sidepane setter, the end anchor asks
last-IN-FLOW — defect 20); PRESET INTEGRATION DONE (_SIDEBAR_LOOKS private, the
two-fetch race deleted with its endpoint, note = Default/Changed, reset returns
to SHIPPED, BND_SIDEBAR_FIELDS mirror under the guard); PANETOGGLE CLAIM DONE
(one affordance in rail mode; the rail stands down at narrow in JS AND all 17
CSS rules — the claim was hiding the drawer's only opener at 390px). The 8b
gate was 439/439 — the item's second perfect full run.**
The double render this item was opened for is CLOSED and asserted as a rendered
outcome — visible header rows counted across four colour modes plus rail and
floating, not just the ownership token.
Commits: `f73ffc2` · `c6d6780` · `b568246` · `c665602` · `df6a2d5` · `ddccf39` · `84a4551`
· `373e183` · `a592285` · `9598a12` · `0566c1e` · `71e73b9` · `d04a780` · `76b2cae`
· `845eb44` · `40ced44` · `19465ab` · `b17118b`. The plan lives at
`C:\Users\saltedfish\.claude\plans\lets-go-back-to-quirky-giraffe.md`; ROADMAP's
item-40 entry and CHANGELOG carry the account. What belongs HERE is what will cost time
again:

- **THE AXE BASELINE NO LONGER DRIFTS — FIXED 2026-08-30, and here is what it was.**
  `a11y: axe over the Desk` records node COUNTS, and Frappe's onboarding panel lives
  inside `.body-sidebar-container`, so it rendered on SIX scanned routes and was a large
  share of every count. Its content tracks the completion percentage — `.onb-progress-badge`
  literally renders "17% completed", and a finished step renders `.onb-step-text` with
  `line-through`, a node that does not exist at 0%. Documents created by the suite's own
  fixtures advance it, so the gate went red for reasons that were never ours.

  The panel is now excluded from the scan, and the baseline was regenerated once. Every
  count went DOWN and every decrease is the panel:

  | route | button-name | color-contrast | image-alt |
  |---|---|---|---|
  | `/desk/item` | 9 → 7 | 2 → 0 | 1 → 0 |
  | `/desk/item/BND-TEST-001` | 15 → 13 | 6 → 4 | 1 → 0 |
  | `/desk/selling` | 8 → 6 | 2 → 1 | 1 → 0 |
  | `/desk/dashboard-view/Selling` | 10 → 8 | — | 1 → 0 |
  | `/app/account/view/report` | 8 → 6 | 4 → 0 | 1 → 0 |
  | `/app/item/view/image` | 9 → 7 | 17 → 15 | 1 → 0 |

  **Why excluding it is not laundering.** This theme emits ZERO rules matching `.onb-*` —
  grepped across the SCSS and the runtime, and 0 occurrences in the compiled bundle — and
  the panel paints its own opaque `#ffffff` / `#fdfaed`. Nothing of ours reaches its
  contrast. **If we ever DO emit a rule for it, revisit this exclusion rather than widen
  it.**

  **The gate still catches our own regressions, and that was proven rather than assumed.**
  Setting `--bnd-sb-ink` to the pane's own background produced
  `/desk/item: NEW rule color-contrast (22 nodes)`. Two earlier sabotage attempts did NOT
  trip it, and both were the sabotage's fault, not the gate's: 52 of the pane's 62 labels
  are 0×0 inside collapsed sections (axe correctly skips them), and the visible ones take
  `color: inherit` rather than a rule appended at the end of the file. **If a contrast
  sabotage here comes back green, check that it applied before concluding anything.**

  **The route list is no longer duplicated.** `tools/axe-routes.mjs` holds the routes AND
  the scan, shared by the capture tool and the check. `build.mjs::assertAxeRoutesAgree` is
  retired with the duplication that needed it — it compared the two texts on route,
  selector and session, and could not have seen that only one copy had learned to
  `exclude()`. `assertAxeScanShared` replaces it and holds the five things that can still
  drift; every arm was watched failing.

- **HEADLESS CHROMIUM REPORTS `prefers-reduced-transparency: reduce`, AND NOBODY HAD
  LOOKED.** Measured 2026-08-30. Every desk this suite has ever driven runs in that
  branch, which means the glass materials have never been blur-tested and the degradation
  path was the only one under test — and it was broken. Its selector weighed (0,2,1)
  against a translucent surface rule carrying `:not([data-bnd-sb-color="brand"])` at
  (0,3,1), so it LOST the background and won only the blur: a pane left 75% transparent
  with its frosting removed, which is the one combination the degradation exists to
  prevent. **Size a selector against the RULE it must beat, not against the element** —
  this repo already had that lesson from a vendor `:hover` group, and it arrives here from
  our own file.

  To measure the other regime, emulate it: `page.context().newCDPSession(page)` then
  `Emulation.setEmulatedMedia({features: [{name: "prefers-reduced-transparency", value:
  "no-preference"}]})`. Playwright's own `emulateMedia` does not carry this feature. Do it
  on a FRESH context, never the shared page — emulation leaks, and this suite says so at
  `withGuest`.

- **`ar.csv` IS GENERATED. THE DECISIONS FILE IS `locale/ar.po`.** Edit the PO, then
  `npm run i18n:emit`. Slice 4d edited the CSV directly, `i18n:emit` in slice 4e silently
  reverted every one of those edits, and coverage went red — the banner saying so is in
  the PO header, not the CSV. New strings need a hand-authored PO entry carrying
  `#, fuzzy`, which is what marks them for the user's Arabic review; `i18n_po.mjs build`
  only ingests a provider map, and that key is a user-only errand.

  And **do not bulk-reap "unused" rows.** `node tools/i18n.mjs list` is a STATIC
  extractor: on 2026-08-30 it called 67 rows dead, and several of them — "Aurora",
  "Daylight", "Ink", "Paper", "Classic", "Site Default", "Apps", "Tools", "More" — are
  preset and layout NAMES translated at runtime from data. Deleting those drops Arabic
  labels with a green `i18n:check`, because that gate measures coverage in one direction
  only. Fifteen rows were reaped in 4e, each confirmed absent as a literal; the other 52
  are a filed task.

- **A PATCH THAT HAS ALREADY RUN CANNOT BE EXTENDED.** `bench migrate` records executed
  patches by module path, so adding a case to a patch file that ran on this site last
  week executes nothing here — and the next site gets both. Item 40's field model is four
  patches for that reason, not one. Related, and the reason all four read raw SQL:
  **`npm run deploy` never migrates.** A doctype change needs
  `bench --site demo.bunood.test migrate` after the deploy, or the field simply does not
  exist on the site while the code assumes it does.

- **THE FIXTURE'S THEME CARD DRIFTS WHEN THE SITE IS OFF SHIPPED DEFAULTS**, and a full
  run can leave it that way: on 2026-08-30 a run ended with `crumb_style: Eyebrow Title`
  and `crumb_narrow_collapse: 1` still set, so `no unexplained structural drift` reported
  a theme card that had lost `bnd-cbp-on` — nothing to do with the change under test.
  Before regenerating the shape fixture, diff the site against `setup.SHIPPED` and put
  back whatever a check did not; the diff must be `{}`.

- **THE PALETTE'S EMPTY STATE CAN SHOW ONE ROW TWICE, and it is the vendor's label.**
  `get_frequent_links` returns `route` as a STRING (while `get_recent_pages` returns an
  ARRAY), carries no `type` field, and labels both `List/ToDo/Calendar/default` and
  `List/ToDo/List` as "ToDo List" — doctype plus view CLASS, with the view dropped. Two
  destinations, one name, distinct keys. Now deduped by what the row READS as well; the
  label set is seeded from the CAPPED survivors, because seeding it from the pre-cap list
  lets a label that never rendered suppress a Recent row that would have.

- **A CHECK THAT DRIVES A GESTURE WHICH PERSISTS STATE MUST CLEAR THAT STATE,
  or every later run starts from this run's leftovers.** The resize drags
  persist the admin's personal pixel by design; three checks dragged and never
  cleared, so a family run inherited 280 — the clamp, where a +15px drag cannot
  move — and two checks failed with the engine entirely correct. The premise is
  now stated (clear before) and the leftover swept (clear in finally), the same
  discipline `withPersonal` already codifies for values it can snapshot.

- **A ZERO-NETWORK CLAIM COUNTS ITS OWN REQUESTS, never the world's.** The
  stop-menu check diffed the global resource count and five of Frappe's
  background polls drifted into the window; the arm now filters the delta to
  our own endpoints, which is the actual conformance claim.

- **A WHOLE-FUNCTION `try` TURNS A HARD ERROR INTO A QUIET STAND-DOWN.**
  `extend_bootinfo` swallows everything so a theme can never block boot — the
  right call — but that meant a NameError in one new boot key killed the ENTIRE
  `bnd_sidebar` payload and everything assembled after it, and the desk simply
  rendered stock: no error, no console line, a green build, five suite failures
  that read like five bugs. The import was module-level in one function and
  local in another. When a kit is inexplicably OFF, check `frappe.boot.bnd_*`
  BEFORE reading the mount chain — and any new key added to a swallowed
  assembly gets its imports checked at module scope.

- **`overflow: clip` ON A CONTAINER AMPUTATES A CHILD'S HIT AREA PAST THE EDGE,
  and Frappe's resize handle LIVES past the edge.** The drag floor needs
  `min-inline-size: 0` + `overflow: clip` on the expanded container; applied to
  the collapsed one it cut the handle's 4px overhang, the re-open click landed
  on `.page-content`, and the pane stuck at 51px — which then poisoned every
  later resize check, because Frappe persists collapse in localStorage. Two
  rules: scope geometry helpers to the STATE they serve (`.expanded`, the class
  Frappe flips), and a check that needs an expanded pane FORCES it first —
  state the premise, never inherit it.

- **A SABOTAGE THAT PASSES IS A CHECK THAT LIES, and slice 8b has the cleanest
  specimen yet.** The permission-vanish check pinned a FAKE docname, so the existence
  arm dropped the row and the check stayed green with the permission filter gutted.
  When a check has two arms that can each produce the same outcome, the probe must
  pin down which arm fired — here, by pinning a REAL record the fixture cannot read,
  with the fixture's lack of permission asserted as the premise. Clean passes /
  gutted fails / restored passes, all three watched.

- **`assertPersonalAxes` MATCHES TO THE FIRST CLOSING PAREN**, so a nested call
  (`frappe.as_json(x, indent=None)`) inside `set_default(...)` cuts its capture
  short of the `parent=` it exists to demand, and the build fails on a call that is
  actually correct. Hoist the nested expression into a variable — the guard's own
  comment says single-line calls only, and now there is a second reason.

- **SECTIONS REST COLLAPSED, AND FRAPPE'S `.hidden` IS `display: none !important`.**
  Two facts a pane feature will trip over: only ~6 of 60 links are visible at rest on
  this desk, and nothing beats that vendor literal unescalated. The filter's reveal is
  the sanctioned `!important` pattern's newest site (scoped to `data-bnd-sb-filtering`,
  which the filter alone stamps); anything else that needs to see inside a collapsed
  section goes the same way or re-aggregates on the toggle, never by flipping Frappe's
  own class — their collapse state machine owns it.

- **THE SPRITE GLYPH PAINTS BY `stroke`, NEVER BY `color` — and Frappe stamps its grey
  ON THE SVG ITSELF.** `.text-ink-gray-7` sits on the svg element, so a span-level
  `color` never reaches it (a direct rule beats inheritance), and
  `.current-color { stroke: currentcolor }` then paints from that grey. Every icon
  mode had tinted the span for the whole life of the kit and the glyph never followed.
  The repair is `color: inherit` on the svg at higher specificity, plus
  `--icon-stroke: currentColor` for our own `sprite_icon()` glyphs (no
  `.current-color` in their class list). **And measure `stroke` in any check about
  icon colour** — the first draft of slice 7's check read `color` and would have
  certified grey pixels.

- **A SETTINGS WRITE CAN REACH THE DESK A PAGE-LOAD LATE, and it looks exactly like a
  broken feature.** Seen repeatedly on 2026-08-31: a check writes value B, reloads,
  and the desk still renders value A — so a walk over five styles reports styles 1 and
  2 as identical, a preset matrix reports the previous preset's colour, and an icon
  check reports the default it just moved away from. The tell is that the WRONG value
  is always the PREVIOUS case's.

  Two layers. `boot.py` composes from `dict(site.as_dict())` — a CACHED Single, which
  `frappe.db.set_single_value` does not invalidate; a `doc.save()` does. And the
  backend's workers hold their own state: **restarting `bunood-backend-1` fixed three
  of four failing checks in one go**, which is the measurement, not a theory.

  Where a check MEASURES A RENDERING of a state it set, wait for the state first —
  `page.waitForFunction` on the `data-bnd-*` attribute. That is not laundering: the
  subject is the rendering, not the plumbing. Do NOT do it inside `withDeskUser`,
  where it times out rather than settling.

- **A `try_for` RETRY OUTLIVES THE CALL THAT SCHEDULED IT.** The head mounts inside
  one, so switching the pane off while attempts were pending let a later attempt land
  AFTER the teardown and put the head back on a closed pane. Any deferred body that can
  outlive its premise has to re-check it; returning `true` stops the loop rather than
  burning the budget. This was invisible until item 40 gave the pane a teardown.

- **`set_single_value` DOES NOT REFRESH THE CACHED SINGLE THAT `boot` READS.** `boot.py`
  composes from `dict(site.as_dict())`, and a site whose cached doc is stale serves the
  OLD value while `frappe.db.get_single_value` reports the new one — so a probe can
  show `sidebar_badges: "Counts"` stored and `"Off"` in `frappe.boot`. A `doc.save()`
  clears it. Symptom to recognise: a setting that measurably wrote, and a desk that
  behaves as though it did not.

- **THIS SITE DRIFTS OFF SHIPPED DEFAULTS WHENEVER A RUN IS INTERRUPTED**, and the next
  run then reports failures that belong to the state, not the change — on 2026-08-31 a
  killed filtered run left `inbox_placement`, `home/apps_placement` and `desk_order`
  moved, and the following run blamed the bell, the change dot and two presets. **Never
  run the suite in the foreground with a timeout shorter than it needs**; background it.
  And when failure sets SHIFT between runs, diff against `setup.SHIPPED` and restore
  with `doc.save()` before theorising — that is the 2026-08-08 lesson in a new costume.

- **THE LOGIN-ROUTE FAILURE CLUSTER IS ONE CAUSE WITH FOUR NAMES.** Seen in three
  consecutive full runs, 2026-08-30/31, and every one of them passes in isolation on a
  freshly restarted stack. The signature: `ERR_CONNECTION_RESET` on Frappe's OWN static
  assets (`frappe-web.bundle.*.js`, `login.bundle.*.css`, and our `bunood-*.css`) deep
  into a 45-minute run on this 6GB host. What it surfaces as:

  | check | how it reads |
  |---|---|
  | `login: the guest harness` | a console that is not clean, naming the reset |
  | `login: the card's text clears AA` | our sheet never arrived, so nothing is dressed |
  | `a11y: axe over the Desk` | `/login: NEW color-contrast (3)` + `image-alt 1 -> 4` |
  | `web: both sheets arrive` | `--bnd-page` resolves to nothing |

  **The axe one is the trap**, because it names a rule and a count and reads like a real
  regression on a page somebody just changed. It is not: our CSS failing to load is what
  puts Frappe's own undressed controls in front of axe. Before hunting it, check whether
  a `login:` check failed in the same run — they travel together — and re-run the pair
  after `BND_FORCE_RESTART=1 npm run deploy`.

- **CHANGING A DEFAULT MOVES WHAT "Default" MEANS, AND THE PLACEMENTS ARE THEME AXES.**
  `home_placement` and `apps_placement` are in `THEME_AXES`, and `bnd_theme_match`
  compares EVERY axis against each preset's composed values. Those values come from
  `presets._shipped_baseline()`, whose only source for these two fields is
  `LINKS_DEFAULTS` — grep it, one occurrence each. So moving the default and leaving
  existing rows alone (which is what the plan said to do) would leave every site
  storing "Side Pane Start" against a baseline reading "Off": no preset matches, and
  **all twelve theme cards read "Custom" on every site, forever.** That is item 37's
  own trap, and it was found by simulating the change rather than by reading the code.

  `v0_40_0/quick_links_stand_down` moves ONLY a row still holding the old default. A
  site that chose something keeps it. The honest limit, since Frappe stores no
  "explicitly set" bit: a tenant who deliberately picked the old default is
  indistinguishable from one who never opened the picker, and both move.

- **THE MODULE ROW STRANDED DOWNWARD, NOT UPWARD — measure before believing a plan.**
  The plan predicted it would strand at the TOP when the quick links moved to the
  foot. It anchored to `.bnd-sb-utils`, so with the links at Side Pane End the row
  saying WHERE YOU ARE rendered below the entire workspace list. Its position was an
  accident of how many times `sb_mount_utils` had run after it. The Place row is one
  node at one position, which is the repair.

- **THE LADDER WAS WRITTEN TWICE.** `mount_sidebar_kit` climbs it and `sb_observe`'s
  timer body climbs it again — the same mount order, free to disagree, which is
  exactly the plan's defect 5. Both lost their rung together; if you touch one, look
  for the other.

- **`withDeskUser` IS FOR A DIFFERENT USER OR AN EMULATED MEDIUM, NOT FOR A VIEWPORT.**
  The switcher's short-viewport arm used it and timed out waiting for `.bnd-sb-head`:
  the pane kit does not necessarily mount for that fixture. Every other
  short-viewport check here uses `page.setViewportSize` on the shared page with a
  restore in a `finally`, and so does this one now.

- **STATE THE PREMISE; DO NOT INHERIT IT.** The same check's first draft only
  navigated, and failed on a desk whose pane an earlier check had switched off — a
  timeout that reads exactly like the feature being missing.

- **`node tools/sweep-settings.mjs` DAMAGES THE SITE.** It leaves eleven `print_*` fields
  off their shipped defaults while printing "state restored", and four unrelated checks
  then go red — the picker-drift check, both `shell:` change-dot checks and a print
  rendering check — none of them naming the cause. Repair: load the Theme Settings
  document, set each drifted `print_*` field to its `setup.SHIPPED` value, and `doc.save()`
  — `set_single_value` does not fire `on_update`. Both this and the axe drift are filed as
  their own tasks.
- **THE DECISIONS ARE MADE; DO NOT RE-OPEN THEM.** Free-pixel drag-to-resize (overruling
  the design round) · `sidebar_menu_rail` drops to Expanded / Rail · the pane's colour is
  derived AND emitted per site · Minimal is tinted by the **ground, never the brand**, at
  **5% in dark and 0% in light**. The last one is drawn at
  https://claude.ai/code/artifact/46e3f9d9-efd5-4ec7-825c-e49d56e5c938 with every swatch a
  real `palette.derive` output.

  **And the two that gated slice 5, settled 2026-08-30.** POSTURE: **keep replacing, done
  correctly** — the pane's head stays ours; the recommendation to theme Frappe's own
  `.sidebar-header` instead was put and overruled. Read it narrowly: it is a decision
  about the HEAD. Nothing in it reopens the refusal to rebuild the workspace list, the
  frame or the drawer, which stands on five measured consequences. What it BUYS US AS
  WORK, and this is the part to not forget: the switcher menu must carry the **Workspaces
  cascade** Frappe's own header offers and ours currently drops, and the collapse memory
  and edit-mode stand-down stay ours. DEFAULT LOOK: **may change**, with today's exact
  configuration added to the theme catalogue by name so any site returns to it in one
  click.

  One thing the posture pick does NOT change: `guard_critical_reach` must never treat
  Frappe's header dropdown as a route to Log Out. That entry is pushed inside
  `if (frappe.boot.desk_settings.notifications)` — a per-user Check the user can switch
  off — so a user who unchecks Notifications loses Logout from that menu.
- **WHY LIGHT SHIPS AT 0%, because it looks like an omission and is not.** Minimal's own
  `--bnd-sb-ink-muted` is `#6d7570` on `#fafbfa` — **4.57:1 against a 4.5 floor** — and
  crosses at **1.36%** of the worst shipped ground. Every candidate percentage was a gate
  failure in light, and would have bought nothing: at 3% all six shipped grounds mix to
  the same hex. `check_sidebar_headroom` enforces it now.
- **RUN `python tools/sabotage_sidebar.py` BEFORE TRUSTING ANY NEW PANE GUARD.** Sixteen
  cases across `_sidebar.scss` and `palette.py`, each naming the guard that OWNS it. It
  mutates both files, so never beside a build or a suite, and it refuses a dirty tree. It
  has already caught a guard that could not do its job, a comparison that measured
  nothing, and its own rot.
- **THE PANE'S PALETTE IS DERIVED NOW.** `palette.SB_PANES` states each colour mode's
  recipe once, grouped by **polarity, not desk mode** — Dark Contrast is dark in BOTH desk
  themes, and putting it in the light walk drags the light binding pane from `#ebebeb` to
  `#111713` and moves all seven light hues. `fit_ink` cannot catch that; its bisection is
  only valid with every background on one side of the ink.

**ITEM 38 (per-user preferences) — DONE 2026-08-29. The last of the 38.** Commits:
`93f70ec` slice 0 · `18494ee` slice 1 · `37d8ac8` slice 2 · `e00b90c` slices 3–7.
ROADMAP's item-38 entry and CHANGELOG carry the account; what belongs HERE is what will
cost time again:

- **`ARCHITECTURE.md` LIED ABOUT `Automatic` FOR A MONTH, AND THE PLAN WAS BUILT ON IT.**
  §3 claimed `User.desk_theme = "Automatic"` normalises after one load, citing an
  empirical check, and item 38 was APPROVED with a slice to repair it. It does not
  reproduce on v16.27.0: `switch_theme` (`user.py:1458`) is the only writer, is
  click-only, and writes verbatim. Measured over three desk loads — the field stayed
  `Automatic` and `User.modified` never moved. The likely origin is that two things have
  almost one name: the FIELD holds the intent, the ATTRIBUTE holds today's answer, and
  `data-theme` genuinely does read back `light`. **Nothing contradicted it because every
  account on this site reads `Light`** — the branch had never been exercised. Re-measure
  a documented claim before building on it; §3 now carries the correction and the reason.
- **`frappe.db.get_single_value` IS THE WRONG READ FOR A CHECK.** It **raises** for a
  field the doctype meta does not have yet — every site between deploying code and
  running `bench migrate` — and it **casts a missing row to 0**, which for a lock means
  "closed". Use `get_cached_doc(...).get()`, which returns `None` in both states.
  `setup.py`'s seeder already recorded the cast and reads row-absence in raw SQL.
- **A ROLE-LESS SYSTEM USER CANNOT EXIST.** `user_type` is derived, not set:
  `set_system_user` (`user.py:415`) rewrites it from `has_desk_access()`, which is False
  for an empty role list. The desk fixture grants exactly `Desk User`. Corollary:
  `bnd-status-probe@example.com`, which `smoke.mjs` calls "a throwaway user with no
  roles", is a **Website User** — its check never noticed because it only calls
  `frappe.set_user()` and never loads a desk.
- **THE KEY LITERAL MUST STAY AT THE `frappe.defaults` CALL SITE.**
  `build.mjs::assertPersonalAxes` matches it there to check `personal.py` against the
  code in both directions. A `stored(key)` helper makes every key it reads invisible and
  the guard then reports them as declared-but-unread. Written down in slice 1 and
  violated in slice 3; the guard caught it.
- **`get_cached_doc` HANDS BACK A SHARED OBJECT.** The per-user resolve overlays a
  `dict(...)` copy. Mutating the doc would leak one person's look into every later
  consumer in that worker process.
- **THE PER-USER LAYER IS UNEXERCISED ON THIS SITE.** Zero `bnd_*` rows in
  `tabDefaultValue`. Any check needing a stored preference must create one, and
  `node tools/desk-fixture.mjs --audit | --clean` is how residue is found and cleared —
  `setSettings`' MUTABLE_FIELDS guard is structurally blind to that table and the
  `site data:` preamble matches branding VALUES.
- **A GLOBAL DEFAULT IS ONE KEYWORD ARGUMENT AWAY.** `frappe.defaults.set_default(k, v)`
  without `parent=` writes `parent = "__default"`, which every account inherits including
  Guest. The build guard refuses that spelling.
- **NOT DELIVERED:** remembering which side-pane sections a person left open. It needs
  Frappe's own expanded/collapsed contract measured. `sidebar_remember_sections` remains
  a field written by all eight sidebar presets and read by nothing, as since v0.6.0.
- **Item 38 adds 22 fuzzy `ar.po` rows** on top of item 37's 26 — **48 await the user's
  review**, their own commit as always.

**ITEM 37 (presets) — DONE 2026-08-28, released as `v0.37.0`.** The last piece of the
settings architecture: one catalogue for the whole desk, twelve looks writing 124 values
each, and **no preset name stored anywhere** — `sidebar_preset` and `desk_layout` are both
deleted. ROADMAP's item-37 entry and CHANGELOG carry the account; what belongs here is
what will cost time again:

- **THE RELEASE REVIEW FOUND SEVENTEEN DEFECTS AND THE TAG MOVED** (the item-32
  precedent). Run as six independent dimensions over `bd59f9b..HEAD` with every
  finding adversarially refuted-or-confirmed. The headline: **the per-user "Sidebar
  Style" menu was dead for every non-administrator.** Item 37 re-pointed it at
  `api.get_theme_presets`, which opens `frappe.only_for("System Manager")`, while
  the menu entry is pushed for EVERY desk user — deliberately, unlike the "Theme
  Settings" entry three lines above it. Every non-admin click was a 403 swallowed by
  an empty `catch`. **THE SUITE RUNS AS ADMINISTRATOR AND STRUCTURALLY CANNOT SEE
  THIS CLASS.** Three dimensions found it independently. The fix is a separate
  ungated `get_theme_sidebar_presets` serving only the eighteen fields `sb_apply`
  reads — which also stops handing non-admins the site's brand seeds.
  - **Five of eight per-user sidebar choices would have been silently voided**;
    `v0_37_0/migrate_user_sidebar_preset` maps each stored name to the theme preset
    carrying the identical side pane, derived from the catalogue rather than a table.
    Every one of the eight maps exactly, so nobody's desk changes.
  - **`get_single_value` RAISES for a field the doctype has lost** — measured, not
    assumed, after I refuted this finding wrongly. `v0_11_0/chrome_placement` read
    the deleted `desk_layout` that way and would have aborted `bench migrate` on any
    site last migrated before 0.11.0. Two of this item's own patch docstrings claimed
    the opposite and were corrected.
  - **The ground did not travel.** `api.effective_identity`, `palette.adjustments`
    and `email.tokens` all re-derived without it, so the Identity pane's console, its
    adjustment report, and email/print/letterhead described colours the desk does not
    paint.
  - **A translated label was compared against untranslated card values**, so no
    layout card lit on a localized desk; and `bnd_match_layout` compared only the
    five container toggles, colliding Bottom Bar into Classic — the same defect
    fixed server-side, still live in JS. Matchers return RAW names now; `bnd_tr_layout`
    translates at the edge, with `__("Custom")` spelled out because the extractor
    reads literals only.
- **A SCRIPTED DELETION TOOK 337 LINES AND `node --check` PASSED.** The edit was aimed at
  `LAYOUT_SLUGS` and one IIFE in `bunood.js`; it also removed density, icon weight, the
  `is_rtl` correction, chart grid and the chart colour patch. Deleting whole functions
  leaves valid JS, so the parse check this repo mandates said nothing. The signal was
  twelve suite failures across five unrelated kits — charts unwrapped, no icon stroke, no
  RTL correction — which read like five bugs and were one. **Diff the line count against
  the previous commit and account for the delta**, and assert the boundary lines inside
  the edit script. The repair is `git show <prev>:path` plus re-applying the four intended
  hunks, not a hand-patch.
- **A PAYLOAD BUCKET THAT SHRINKS IS A SYMPTOM, NOT A WIN.** The truncated bundle came in
  UNDER `js_gzip` and masked the theme picker's real growth. When the deletion was
  repaired the ceiling failed by 109 bytes and was raised to 93,600 deliberately.
- **DELETING A STORED NAME DOES NOT DELETE THE NEED FOR THE IDENTITY**, and this cost two
  full runs. Two runtime call sites still need the layout's shape (`search_fallback_order`
  and `container_on`'s fall-open), so it is DERIVED server-side by `presets.layout_of`
  comparing live values against `registry.layout_settings`, and served as
  `boot.bnd_desk_shape`. Three findings, all measured:
  - **Containers alone cannot tell Classic from Bottom Bar.** Their container rows are
    byte-identical; only the bell and profile placements differ. A first draft compared
    the five toggles and every Bottom Bar desk reported itself as Classic.
  - **The derivation must EXCLUDE the field whose question it answers.** With
    `search_placement` in the comparison, a Classic desk asking for search in a top bar it
    does not have matched nothing, reported `""`, and silently took the Top Bar fallback
    order. `presets.SHAPE_IGNORES` carries the exclusion and the reason.
  - **`layout()` was answering two questions** — "which shape" and "is our chrome system
    running" — which diverged the moment the shape stopped being stored. They are
    `layout()` and `theme_active()` now, and the second reads the BOOT PAYLOAD, because
    `data-bnd-desk` is stamped unconditionally and can no longer answer it.
- **`npm run contrast` gained `check_layout_identity`** and was watched to fail both ways:
  drop the search exclusion and two layouts report `""`; compare containers only and
  Bottom Bar collapses into Classic.
- **KILLING A SUITE MID-RUN COSTS A SITE HEAL, TWICE PAID HERE.** `TaskStop` on a running
  verify left `tagline="smoke-<ts>"` in the branding fields — which renders on the public
  sign-in page — and on the second occasion seven kit fields mid-test. The `site data:`
  hygiene preamble catches the branding half on the next run; **the kit fields it does
  not**. Heal with a diff against `presets._shipped_baseline()` and one `doc.save()`.
- **`presets.py` is now the composer AND the reverse.** `theme_settings(name)` flattens a
  look to fields; `layout_of(settings)` names the shape. `registry` stays the catalogue —
  the reverse lives in `presets` because `registry` cannot import it without a cycle.

**ITEM 36 (settings singleton) — DONE 2026-08-27, released as `v0.36.0` (tagged and
PUSHED 2026-08-27). Suite 407/407, contrast 4,080 pairs,
build guards and payload green, adversarial review run with all twenty confirmed
findings fixed.** Commits: `efa0aef` slice 1 (the identity
matrix + `_identity_meta` + `withBranding` + the hygiene preamble) · `53ee3db` 2a
(`SHIPPED_EMPTY` dots + `arabic_font` ownership) · `d94d8e4` 2b (export/import one
list) · `ea09ed7` 2c (the field set) · `f6ed35e` 3a (the Map 1 restructure) · `1929bec`
3 (the Identity pane + `effective_identity`) · `3e57352` 4 (phase-0 closures + doc
repairs) · `583b959` 4c (the two renames + patch) · `9aaba93` 4b (`desk_layout`
hidden) · `a89c672` + `00b7a5a` 5/5b (the honest-picker audit). ROADMAP's item-36 entry
and CHANGELOG's `[Unreleased]` block carry the full account; what belongs HERE is the
state and the things that will cost time again:

- **THE GATES ARE PAID, and it took five full-suite runs to get there** — each of the
  first four found something the last had not. Run 1: a server 500 on every run since
  item 35 (a `direction:` check navigating `/desk/print/user/...` with a LOWERCASE
  doctype, which print.js hands straight to `getdoc`), plus this item's own letterhead
  residue. Run 2: axe's injected script blocked by the email preview's sandbox —
  allowed, narrowly. Run 3: INVALID, and worth recording as a process failure — assets
  were deployed WHILE it ran, which the working contract forbids precisely because it
  manufactures phantom failures; its four failures were mine, not findings. Run 4: a
  fixture path that does not exist (`frappe-favicon.png`; frappe ships that mark as an
  SVG) and the email preview's absolutised mark on a non-standard port. Run 5:
  **407/407**, with contrast at 4,080 pairs, the build guards and the payload ceiling.
- **`desk_layout` WAS HIDDEN, NOT DELETED, AND THE REMAINDER IS NOW CLOSED BY ITEM 37 —
  but the estimate recorded here was wrong and the correction is the useful part.** This
  file said "~a dozen `_layouts.scss` rules position panels by that attribute". Measured:
  of FIFTEEN uses, **fourteen were bare presence guards** — "our chrome system started" —
  and exactly ONE read a value. **Count before you file a cost.**
- **A LAYOUT WROTE HALF OF ITSELF FOR THE WHOLE OF PHASE 0, AND THE SUITE COULD NOT SEE
  IT.** `setSettings` applies `registry.layout_settings`, which composes containers AND
  tenant placements; the FORM's `bnd_apply_layout_preset` wrote only the containers. So
  every layout check drove a state no gesture could produce, and picking "Bottom Bar" in
  the real picker left the bell pointing at a switched-off region. `LAYOUT_TENANTS` now
  rides beside the chrome in `get_shipped_defaults`. **When a helper composes two halves,
  check that the PRODUCT's writer uses it and not just the suite's.**
- **TWO CHECKS PASSED AGAINST A LIVE DEFECT BEFORE THEY WERE RIGHT.** (a) An unscoped
  `[data-field=…].bnd-dgm-on` query found the placement BOARD's slot, not the clicked
  picker's — the board draws the same `data-field` and repaints either way. (b) A generous
  `waitForFunction` timeout passed because autosave's own `refresh()` repaints everything
  ~3s later: measured still-wrong at t+1214ms, corrected at t+3003ms. **On anything the
  autosave also fixes, the WINDOW is the assertion** (900ms here).
- **A SINGLE'S `doc.save()` REWRITES ITS WHOLE `tabSingles` ROWSET.** So the orphan
  old-name rows a rename patch deliberately leaves behind are reaped by the first save
  after the migrate — which means a rename-survival check must INSERT its simulated old
  rows, not UPDATE them (an UPDATE on an absent row is a silent no-op, and the first draft
  measured exactly that as a failed carry). Real sites are safe: patches run before saves.
- **`get_single_value` READS THROUGH A VALUE CACHE that raw-SQL simulation does not
  invalidate** — a probe that writes tabSingles directly must read it back the same way.
- **The identity fields are exercised through ONE helper, `withBranding`** (snapshot →
  `doc.save` → restore → READ-BACK VERIFIED, loud banner naming the value on failure).
  Never `setSettings` (throws outside MUTABLE_FIELDS by design), never bare
  `set_single_value` for a `BRAND_INPUTS` field. The `site data:` hygiene preamble runs
  FIRST and makes any crash leftover the next run's first failure.
- **Item 36's 37 fuzzy `ar.po` rows were cleared by the user** (`5593dad`). **26 NEW
  ones from item 37 now await review** — the palette and preset names, their card blurbs
  and the picker copy. The item-7 handoff; their own commit as always.

**ITEM 35 (print / PDF) — RELEASED 2026-08-26 as `v0.35.0` at `b179a0a`, one gate
with v0.34.0** (adversarial review over the combined diff, 29 confirmed defects all
fixed in `2567d59`; the full suite twice over the merged tree; two post-review fixes,
`11f2e1e` dangling-company and `ede1d26` preview-frame origin). Six slice commits: `d15330a` slice 1 (the substituted
sheet + contracts + the never-applied default claimed) · `5725b3b` slice 2 (the RTL
closure, structural) · `ad568e9` slice 3 (the preset-over-axes anchor + the Print pane) ·
`4e01ac8` slice 4 (the third honest live preview + letterhead compositions) · `bcc7a44`
slice 5 (Ctrl+P residue) · the close (switches + docs). The thirteenth surface kit, the
first delivered as a DATABASE RECORD. Twelve fields; CHANGELOG's `[Unreleased]` block and
ROADMAP's item-35 entry carry the full account. What will cost time again:

- **The full-suite debt was paid at release** — two sweeps over the merged tree
  (389/390 then 387/390; the union covered every check, failures were one fixed
  preview defect and one backend transient episode that passes isolated). The
  machine-limits doctrine applies unchanged for the next item.
- **PDF DOWNLOAD OF A REAL DOCUMENT HAS NEVER WORKED ON THIS LOCAL STACK** — wkhtmltopdf
  gets `HostNotFoundError` because `get_url()` = `http://demo.bunood.test` does not
  resolve inside the backend container (bare-HTML `get_pdf` works, the engine is fine).
  Compose-level `extra_hosts` errand; the suite's future PDF smoke depends on it, and the
  pane's "Download sample PDF" button waits on it too.
- **The Print Style record is REGENERATED on every Theme Settings save** — sheet
  assembly (marker blocks per the four axes) + colour substitution both read the SAVED
  doc. `Frappe's own` on `print_letterhead` means the Letter Head record is never
  touched (sentinel-proved); every other pole recomposes it.
- **The per-section switches are read AT RENDER by the macros** (`_pset` →
  `frappe.db.get_single_value`), so there is no sync step to forget — but also nothing
  to cache-bust EXCEPT `clear_cache(doctype='Theme Settings')`, which the suite's
  drivers do after every `set_single_value`.
- **`benchPy` grew a `preConnect` slot** (`benchPyHostileImport`) that imports
  printview/pdf BEFORE the apps load — the direction checks REQUIRE the hostile order,
  because the rtl_patch's reach was an import-order accident and a green that depends on
  import order is not a closure.
- **The item-35 Arabic is APPROVED** — the user approved the 118 drafts 2026-08-26 and
  the flags were cleared in `23ab02f` (CSV byte-identical, md5-proved). The merge then
  brought THREE new fuzzy rows from the parallel session (upstream-gap strings: Tools ·
  What's New · Save Current Filter) — those are NOT covered by the earlier approval and
  still await the user's review.

**ITEM 34 (email) — RELEASED 2026-08-26 as `v0.34.0`, tagged retroactively at
`c622924` (the v0.29.0 precedent; costs in the CHANGELOG block).**
Five commits: `5c7aad8` slices 1+2 (the fork, the sheet, contracts E1–E3) · `d33b5af`
(the `ar.po` repair, its own commit) · `bc699d8` slice 3 (the anchor, `assertEmailSafeCss`)
· `e36ee71` slice 4 (the two axes, the preview) · `19bc4b4` slice 5 (branding). The
twelfth surface kit and the first not rendered by a browser. Four fields
(`email_style` · `email_header` · `email_action` · `email_theme`), `scss/email/email.scss`,
`bunood_theme/email.py`, and the theme's first fork of a Frappe template. Picks:
**Card · Follow the client · Logo + wordmark · Brand fill**. ROADMAP's item-34 entry
carries the full account; what belongs HERE is the state and the things that will cost
time again:

- **RELEASED 2026-08-26 as `v0.34.0`, tagged retroactively at `c622924`** — one gate
  with v0.35.0. After three full-suite attempts died OOM (the history the paragraph that
  stood here recorded: **481, 664 and 980 MB** host-free, `ERR_EMPTY_RESPONSE` once, 502s
  twice; the constraint was the editor sessions, not the stack), the gate ran twice over
  the merged 34+35 tree on a quiet machine — 389/390 then 387/390, the union covering
  every check; the adversarial review confirmed zero defects in this item's shipped code.
  Heading, bump, payload row and tag arrived together, the discipline the old paragraph
  demanded.
- **`v0.33.0` IS NOW TAGGED — at `0f231e3`, 2026-08-25, by the other session** *(this
paragraph said "never tagged" until the item-35 release review re-checked; resolve tag
state with `git tag`/`git ls-remote`, never from this file — its third such correction)*.
There is STILL no v0.33.0
  payload history row, and three item-33 fix commits sit on top of its release commit —
  while `__init__.py` and `hooks.py` both read `0.33.0` and CHANGELOG carries a `[0.33.0]`
  heading. The user's call (2026-08-25) was to leave it and start 34. **Item 34 therefore
  writes its CHANGELOG under `[Unreleased]` and does NOT create a `[0.34.0]` heading** —
  the heading-plus-bump-without-tag pattern is exactly what produced this. *(Resolved
  2026-08-26: the v0.33.0 payload history row was written retroactively — measured from
  the tagged tree `0f231e3` by the validated git-cat-file method — in the v0.35.0 release
  commit, alongside v0.34.0's row and heading, which arrived WITH their tag.)*
- **THE `email_css` HOOK IS A TRAP AND ERPNEXT IS IN IT.** Frappe's hook is a STATIC file
  list (so it can never carry a seed) and its `os.path.exists` filter is CWD-relative in
  whichever process sends — the queue and scheduler containers have no `bunood_theme`
  under `sites/assets`, so a hooked sheet works from the desk and vanishes for scheduled
  mail. ERPNext's own hook names a file that does not exist; **its email stylesheet has
  never applied on any site**, silently. We fork three templates and carry the CSS inside
  them instead.
- **`ar.po` HAD STOPPED DESCRIBING THE CSV.** Item 33 wrote its sixteen strings straight
  to `translations/ar.csv` and never to the PO, so the next `i18n_po.mjs emit` would have
  **deleted item 33's Arabic** with every gate green. Repaired in `d33b5af`, proved inert
  by `emit` reproducing the committed CSV byte-identically. **Edit the PO, then emit.**
- **DO NOT REGENERATE `inherited.ar.txt` CASUALLY.** `npm run i18n:inherited`, run
  speculatively, proposed `Split` → `انشق، مزق` ("torn, ripped") for a login LAYOUT POLE
  and `Theme` → `موضوع` ("topic", not a visual theme). That ledger is curated against
  false friends; regenerating it wholesale is not the no-op its name suggests.
- **A `perl -0pi` WITH `\x{...}` RE-ENCODED A WHOLE FILE.** `theme_settings.js` came back
  with 2,578 mojibake sequences — every em-dash and ellipsis — and **`node --check` passed
  on it**, because it was still valid JavaScript. A parse check does not detect encoding
  damage. Recovered with a latin1→utf8 round trip; use Node (or the editor) for any edit
  touching non-ASCII, and grep for `â` afterwards.
- **THE FRONTEND'S ASSET MOUNT CAN COME BACK EMPTY AFTER A RESTART.** `docker restart
  bunood-frontend-1` (done here during memory recovery) left
  `sites/assets/bunood_theme` as an empty root-owned directory instead of the mount, and
  **all four assets 404'd** while the backend still had them. `npm run deploy`'s own
  serving check caught it. Recovery is a plain restart, never a recreate — HANDOVER §5.
- **The 25 `#, fuzzy` rows in `ar.po` await the user's review**, as every item's have
  since 27. Clear them in their own commit.

**ITEM 33 (website + portal) — DONE, released as `v0.33.0`, LOCAL TAG, NOT PUSHED.**
*(CORRECTED 2026-08-25: there is no such tag — see item 34's entry above. The release
chain stopped after the version bump.)*
Twenty-one commits.

**THE RELEASE REVIEW RAN FOUR TIMES AND FOUND NINE CONFIRMED DEFECTS, THREE OF
THEM STORED XSS.** None was visible to a suite of 360. Run it; it is not
ceremony, and the contract ("empty confirmed list, or every finding fixed") is
what caught them. The single most useful sentence to carry forward: **"it is a
Data field, so it is sanitised" is the assumption that let all three XSS through
review-by-reading.** `docs/upstream/frappe-website.md` §12 records both holes —
`nh3` keeps `<a title="…">` and attributes never escape `<`/`>`; and `Attach`
fields are skipped by the sanitiser ENTIRELY. And escaping is not the fix for a
value another layer re-serialises: an entity-escaped favicon still executed,
because the browser decodes attributes when JS reads them back. Strip, do not
encode. The eleventh surface kit and the first whose surface is a
CLASSIFICATION rather than a list of routes. Three fields (`web_style` · `web_header` ·
`web_theme`), `public/scss/web/_site.scss`, `docs/upstream/frappe-website.md`, and the
theme's FIRST image asset (`public/images/bunood-mark.svg`). Picks: **Panel (default) ·
Branded · Follow OS**; `Rail` drawn and dropped on the degradation row. Full detail lives
in ROADMAP's item-33 entry and in the per-slice memory; what belongs HERE is the state of
play and the things that will cost time again:

- **The logo is PARKED, at the user's instruction (2026-08-24).** 171 marks were drawn
  and none was chosen; the shipped `bunood-mark.svg` is a placeholder solid B on the seed
  green. Do not restart that exploration unasked — it resumes after the remaining roadmap
  items. The finalists and the geometry findings are in memory; the artwork is NOT in the
  repo.
- **A Python-only edit needs `BND_FORCE_RESTART=1`.** `npm run deploy` decides on asset
  HASHES, so a `context.py` change ships to the container and stays inert. Slice 7's
  seams were live in the mirror and dead in the process for a whole measurement round
  because of this.
- **`deploy.sh` grew a second delivery channel and the reason matters.** The app is
  bind-mounted FROM the WSL mirror, so the rsync in that script is not a convenience copy
  — it IS the deploy, and when `wsl.exe` exec wedged (`Wsl/Service/0x8007274c`, every
  distro, containers still serving) two commits' worth of edits sat undelivered while
  every check measured the old tree. It now falls back to the `\wsl$` 9p share via
  robocopy, which needs `MSYS_NO_PATHCONV=1`, the `//wsl.localhost/<distro>/…` spelling,
  and a `-d` guard because `/MIR` DELETES. Same day, `localhost` (→ `::1`) stopped
  answering while `127.0.0.1` served; both self-healed within the hour. `BND_URL` now
  moves the whole toolchain, and `tools/fingerprint.mjs` still hardcodes its own copy.
- **NEVER pipe `npm run verify` through `tail`.** The pipeline's exit status is `tail`'s,
  so a 4-failure run reported "exited with code 0". That is the exact class of defect
  `tools/verify.mjs` was written to prevent, and it was reintroduced from outside.
  Redirect to a file instead.
- ~~**The axe route list is duplicated**~~ — CLOSED by `b6400d4` (2026-08-25, the
  parallel session): the two lists were made unable to disagree about context. The
  "follow-up task is filed" note above it was stale; confirmed by the item-36 census.
- **Three session contexts now exist for scanning**: Administrator, cookie-less guest,
  and the portal fixture user. The last is not optional — an Administrator renders a
  populated portal list through a DIFFERENT branch of `website_list_for_contact.py`, so
  scanning as one banks a DOM that looks correct and is not.
- **The website axe rows are banked KIT-ON**, unlike every desk route. `web_style` does
  have an `Original`, but the CONTRACTS survive it by definition, so a kit-absent number
  would leave the gate slack equal to every violation the item removed. The kit-OFF scan
  was taken as EVIDENCE and recorded, not as the gate. Same reasoning item 32 wrote down
  for `/login`.
- **Site data to leave alone:** `tagline` is `"One system for the whole business"` and
  `company_name` is `"Bunood"`. A suite run that dies before its `finally` leaves
  `tagline` as `smoke-<timestamp>`, which then renders on the public sign-in page. It has
  happened twice. Fix it through a real `doc.save()`, not `set_single_value`, or the
  brand stylesheet does not regenerate.
- **Still owed:** the 24 `#, fuzzy` rows in `ar.po` await the user's review, as they have
  since item 27 — their own commit, as every previous item did it.

**ITEM 32 SHIPPED TWICE: `v0.32.0` THEN `v0.32.1` (2026-08-22, both pushed).** `v0.32.1`
carries everything found by reviewing 0.32.0 — the five live defects, the two brand bugs
(`generate_hash` was random, not a content hash; the self-heal wrote from a GET), two new
build guards, and the layout builder moved onto the theme's own tokens. Gates at
`v0.32.1`: suite **341/341**, contrast **4,080 pairs**.

**WHY A PATCH AND NOT A MOVED TAG, which is the reusable part.** `v0.32.0` had already
been pushed. Moving a PUBLISHED tag rewrites a ref other people may hold, and git will
not update an existing tag on fetch without `--force` — so the tag would mean two
different commits depending on when you fetched. CHANGELOG's own policy already answers
this: "PATCH = fixes and refinements on top of one". The earlier move of `v0.32.0` off
`eeec87a` was fine precisely because it had NOT been pushed. **Check
`git ls-remote --tags origin` before moving any tag.**

**ITEM 32 (login / signup / forgot) — DONE, RELEASED as `v0.32.0` and PUSHED
(2026-08-22, at the user's request). `main` and `v0.32.0` are both on `origin` at
`e34a23d`; nothing is unpushed. THE TAG WAS MOVED once, off `eeec87a`, after an
adversarial release review found five live defects — see the block at the end of this
section. The move was safe because `v0.32.0` had never been pushed; check
`git ls-remote --tags origin` before ever moving a tag again, because moving a published
one rewrites a ref other people may hold.** Gates at the tagged commit: suite
**339/339**, contrast **4,080 pairs**, sweep CLEAN.

**AND THE FIRST FULL RUN OF THAT GATE WAS 337/339, BOTH FAILURES ENVIRONMENTAL.** Worth
recording because the shape recurs: `console error budget` reported two
`net::ERR_CONNECTION_RESET`s on `bunood_theme.api.get_status_signals` and
`i18n.api.get_state`, and `a11y: axe over the settings pickers` timed out after 15s
waiting for a pane to fill. One cause, not two — a reset connection means the pane's
`xcall` never lands. Measured during the run: backend 74% CPU, both queue workers
54-61%. Isolated per CLAUDE.md's rule rather than assumed: axe **3/3 green**, console
budget **2/2 green** with no resets at all, then a full re-run on an idle machine
(queues empty) came back **339/339**. A `waitForFunction` timeout in
`walkSettingsPanes` does not name the pane it was waiting on — worth fixing if this
recurs, because on an eighteen-pane walk it is a diagnostic dead end.
`v0.31.0` WAS ALREADY ON THE REMOTE — this file said it was not, for two days.
`git ls-remote --tags origin` showed it at `5fbf7e0`, exactly what the local tag pointed
at. Resolve tag and branch state with `git ls-remote` and `git rev-parse origin/main`,
never from this file: it has now been wrong about the remote twice. Ten commits on `main`: `11dbc41` slice 0 (the census + the first logged-out harness) · `a3fc2d7` 1a (the
dark-token mixin) · `fadda9f` 1 (the sheet + eight contracts) · `6185309` 2 (the anchor) ·
`1fda341` 3 (the axes + the picker) · `28a0faa` 4 (the axe gate) · `32f33c4` 4b (the tagline +
the per-site dark scope) · `b007d41` 4c (Split's `md` boundary, and the flex-direction defect
that hid behind its fix) · `650c320` (the logo override, proved) · `eeec87a` (the release). Three fields (`login_style` · `login_action` · `login_theme`),
`public/scss/web/_login.scss`, `docs/upstream/frappe-login.md`. Wireframes:
<https://claude.ai/code/artifact/46b356b4-b1e6-4f50-9285-62af96f98001>. Plan:
`~/.claude/plans/lets-work-on-item-jazzy-creek.md`. Picks **Split · Branded · the theme axis
IN · four poles** (`Bare` drawn and dropped in the round). Facts worth keeping:

- **THIS IS THE FIRST KIT NOT ON THE DESK, AND EVERY MECHANISM THE OTHER NINE STAND ON IS
  ABSENT.** `/login` is a WEBSITE page: no `app_include_css`, no `frappe.boot`, no
  `bunood.js`, and `templates/base.html` renders `<html lang dir>` with **no `data-theme`**.
  The anchor is therefore a SERVER-RENDERED `body_class` set from `update_website_context`
  (`base.html:57` renders it; it is an ordinary context key), and dark is
  `prefers-color-scheme`. **We deliberately never stamp `data-theme`** — Frappe's own dark
  login branch contains three of the census's findings and activating it inherits all three.
- **AN ADMIN CANNOT LOAD THE PAGE THIS KIT CONFIGURES.** `www/login.py:38-46` redirects any
  authenticated session to `/desk`. Consequences everywhere: the suite needs a COOKIE-LESS
  context (`withGuest`, and guest-ness is the ABSENCE of the sid cookie, so it cannot be had
  by clearing one); the axe baseline needs the same; there is no live preview and no
  `bunood.login_apply`, because a hook that cannot act is a lie in the shape of an API; and
  an iframe preview is closed off for the same reason. **Do not try to add one.**
- **NO CONTROL ON THAT PAGE SHOWED KEYBOARD FOCUS** — `outline: none 0px`, `box-shadow:
  none`, border unchanged, at every stop, driven with a real Tab. Two independent killers
  (`.btn:focus{outline:0}` and `.form-control:focus{outline:0;box-shadow:none}`, both
  `(0,2,0)`) and no fallback carrier. The ring is an `outline`, NOT a box-shadow: that
  channel is contested to `(0,5,0)` and item 31's critical defect was a box-shadow written
  into a channel already carrying focus.
- **SOURCE ORDER IS AGAINST US HERE.** `head.html` emits `web_include_css` inside
  `{% block head %}`; `login.html` OVERRIDES `{% block head_include %}` with the login
  bundle, which comes after. Every selector was sized against a competitor read out of
  `document.styleSheets`, never guessed.
- **BYTE-IDENTICAL OUTPUT IS NOT EVIDENCE ABOUT A TOOL THAT PARSES THE SOURCE.** Slice 1a
  extracted the dark tokens into a `@mixin`, proved it inert with a byte-identical rebuild,
  and said no suite run was needed. `contrast_gate.read_blocks` reads `_tokens.scss` as TEXT,
  so `html[data-theme="dark"] { @include dark; }` parsed as an EMPTY block, dark collapsed
  onto light, and the gate reported **150 failures across every seed** while the stylesheet
  was perfect. `read_blocks` now expands `@include` from `@mixin`. Two things read that file
  and only one of them is Sass.
- **`getComputedStyle` SERVED A STALE VALUE** when an attribute was mutated and re-read
  inside ONE `page.evaluate`, even with a forced layout between: removing `disabled` reported
  the disabled colours while a rule scan in the same tick showed `:not(:disabled)` matching.
  Split across separate evaluates with a real frame between, the true value appeared — and it
  was the severe one (1.06:1). **Mutate and read in different evaluates.**
- **A TRANSPARENT PARENT PARSES AS BLACK.** Under `Split` the card is transparent (the COLUMN
  is the surface), so three checks measured contrast against `rgba(0,0,0,0)` and reported a
  passing 7.94:1 as 2.52:1. They resolve the EFFECTIVE background by walking ancestors now,
  which is the rule `contrast_gate --check-measured` already applies.
- **COPYING AN EXPRESSION WITHOUT COPYING ITS HOST.** The field fill took
  `_filters.scss`'s `--bnd-flt-rest` verbatim on the strength of being character-identical to
  an already-gated string. It is — but there the HOST is `--bnd-surface` too, and here the
  card is `--bnd-page`: **4 channels of delta, not 9**, inside the range item 29 twice
  rejected as "renders as nothing". Mixed against the host, which cost two real gate rows.
- **THE GATE THEN CAUGHT THE INK.** Those rows failed at three pale seeds (4.38 / 4.24 /
  4.16): `--bnd-ink-subtle` is fitted against RAW surfaces and a fill darkened by an ink wash
  costs contrast. The placeholder moved to `--bnd-ink-muted`; the disabled label keeps
  ink-subtle and is exempt-and-measured.
- **A PER-SITE DEFECT THAT COULD ONLY EVER SHOW ON A CUSTOMER'S SITE.** `brand.py` emitted
  its dark values under `html[data-theme="dark"]` and `html[data-theme="automatic"]` — scopes
  a website page can never match — while its LIGHT block's `html:not([data-theme])` arm
  could. Dark therefore fell back to `_tokens.scss`'s literals, fitted for the SHIPPED seed:
  a blue-branded customer would have had a green art panel on their dark sign-in page, with
  every check green, because this site's seed IS the shipped one. **Found by reading the
  generated file.** The guard is seed-independent: the bundle declares dark surfaces as live
  `color-mix()`, the brand sheet emits concrete hex, and a custom property keeps its
  specified form — so "did the per-site sheet win here" is answerable from the value's SHAPE.
- **`SETTINGS_PANE_KEYS` IS DERIVED NOW.** Item 31 found the hole in an adversarial review,
  back-filled its own key and left it open: measured here, the list still omitted
  `workspace`, `chart`, `report`, `views`, `overlay`, `empty` and `skeleton` — seven kits
  never walked by the axe gate OR the accessible-name walk. The suite reads
  `.bnd-shell-item[data-key]` off the shell.
- **THREE TOOLS WOULD HAVE MISHANDLED A SECOND CSS FILE, SILENTLY.** `payload.mjs` took
  `find(f => f.startsWith("bunood."))` (one file per directory; `bunood-web.*` matched
  nothing, so it would have been measured by nothing) — now a bucket table with per-key
  ceilings and a THROW on any dist file no bucket claims. `deploy.sh` took `ls *.css | head -1`,
  and ASCII `-` sorts before `.`, so `bunood-web` would have sorted FIRST and the desk bundle
  would have 404'd. And the boot test read only `THEME_CSS`/`THEME_JS`.
- **`curl -o /dev/null` FAILS WITH EXIT 23 UNDER `MSYS_NO_PATHCONV=1`** — which the
  docker/wsl calls need — because Git Bash then stops translating `/dev/null` to `NUL`. With
  `set -e` that killed `deploy.sh`'s verify step SILENTLY, mid-loop, reporting success by
  saying nothing. It writes to a real temp file now.
- **576, NOT ~450.** Frappe's own collapse is `media-breakpoint-down(xs)` = Bootstrap's
  `max-width: 575.98px`. Bisected live; the planning document carried the wrong number.
  576 is already `bnd-bp(sm)`.
- **SPLIT'S SECOND COLUMN STARTS AT `md` (768), NOT AT FRAPPE'S `sm` COLLAPSE.** At
  `min(480px, 46%)` the form measured 258px at 700 and **201px at 576**, against Frappe's
  own 371px card. An art panel is only worth having if it has width. Between 576 and 768
  Split takes PANEL's variables verbatim rather than inventing a fourth composition for
  192px of viewport — which also DELETED four mobile stand-down rules, one of which had
  already put the form flush against both screen edges once.
- **AND THAT PUT SPLIT UNDER A `flex-direction: column` IT DID NOT WANT — TWICE-INVISIBLE.**
  Sharing the centring rule with Panel is what makes the sub-`md` band free, but that rule
  sets `flex-direction: column`, so at ≥768 the brand panel stacked BELOW the form column.
  `main` measured 480×423 in a 720-tall wrapper. **It looked fine**: the column's fill and
  the page ground are four channels apart in light, so the column ending short of the fold
  was invisible, and only the SIGNUP state (a shorter card) showed it plainly. **And both
  suite checks passed straight through it** — `display` was still `flex`, and in a column
  container an explicitly-sized item still sits at the inline start in LTR and the inline
  end in RTL, so the mirror check's x-position assertions held in both directions. Only the
  column's HEIGHT tells the two layouts apart, and that is what the check measures now.
  **If you share a layout rule between poles, assert the thing the sharing could break.**
- **frappe is 16.27.0.** `ROADMAP`, `HANDOVER` and `_filters.scss` all record item 31's
  platform as 16.28.0 — that is ERPNEXT's version, and it travelled into three documents.
- **THE LOGO OVERRIDE SHIPPED UNEXERCISED FOR THREE SLICES.** `context.logo` is a real
  key and one assignment fixes both routes — but `logo` is EMPTY on this site, so the
  `if logo:` guard correctly did nothing, every screenshot showed ERPNext's default, and
  "the guard skipped" stood in for evidence until the user asked. Measured properly it
  works (unset -> erpnext-logo.svg, set -> Theme Settings' value, both routes) and it is
  now watched-to-fail. **A branch whose guard is false on the dev site is an untested
  branch, not a working one** — and `logo`, `favicon` and `company_name` are in that
  category, because those three sit outside MUTABLE_FIELDS by design. `tagline` is the
  exception (it IS in MUTABLE_FIELDS, the save-round-trip scratch field); item 36's
  `site data:` hygiene preamble backstops the crash-leftover case the exclusion feared.
- **The 24 `ar.po` rows are `#, fuzzy` and AWAIT THE USER'S REVIEW** — the item-7 handoff.
  Clear them in their own commit, as items 27, 28, 29/30 and 31 all did.
- **Payload: the desk bundle is UNTOUCHED** (`css_gzip` 20809, 166 b free) because the login
  sheet is its own entry. New `web_css_gzip` ceiling 4000, currently 3160. Contrast 4,008 →
  4,080 pairs.
- **A NOTE ON SITE DATA:** `tagline` held `smoke-seed-1787182266604`, left by an earlier
  suite run. Invisible before this item, and it would have rendered on the sign-in page
  after it. Set to a plausible demo string.

**ITEM 31 (filters + saved filters) — DONE, RELEASED as `v0.31.0` (2026-08-21, local tag, NOT PUSHED).** Six commits on `main`: `1a7e9e4` (slices 1+2, contracts + anchor) · `26107c4` (slice 3, the two axes + the picker) · `78dc13e` (the close, plus an eighth contract its own axe scan found) · `67aaa1c` (the Arabic sign-off, its own commit) · `deb48c7` (the five defects the adversarial release review confirmed) · `5fbf7e0` (the release). Final suite **310/310**, contrast **4,008 pairs**, sweep CLEAN, release review run and clean after fixes. Three fields (`filters_style` · `filters_applied` · `filters_saved`),
`surfaces/_filters.scss`, `docs/upstream/frappe-filters.md`. **Releases as `v0.31.0`** — MINOR is
the ROADMAP item number; do NOT compute it from the previous tag. Facts worth keeping:

- **THE ADVERSARIAL RELEASE REVIEW FOUND FIVE DEFECTS AND ONE WAS CRITICAL — read this before
  trusting a green suite.** The anchor set `box-shadow` on the strip's controls UNCONDITIONALLY, at
  (0,4,2) against Bootstrap's `.form-control:focus` (0,2,0) — so it won the FOCUS state too. That
  vendor rule also sets `outline: 0` and these controls compute `border: 0px none`, which makes the
  box-shadow the SOLE focus carrier: under `Ruled` focus went `none` → `none`, and under
  `Outlined`, the SHIPPED DEFAULT, focus was identical to rest. **Nothing could have caught it:**
  `assertRingCoverage` and `a11y: focus draws a ring on every control that takes it` BOTH key on
  `bnd-` classes, and these are Frappe's controls; the kit's own checks read them at rest and on
  `:hover`. The hole was in the gates. Closed with a `:not(:focus)` guard AND contract R9 (our own
  accent ring, lifted out of the anchor as items 26 and 27 both did), plus a check that drives focus
  with a real Tab — `.focus()` does not match `:focus-visible` — and that was WATCHED TO FAIL with
  the defect reinstated. The other four: no `(hover: none)` stand-down on the saved-filter reveal
  (item 24's statement, which every other reveal in the project already makes); `.filter-area`'s
  repaint two-toning the popover under `overlay_style: "Solid"`, because `.popover-body` wraps it in
  15px of the panel's own colour; the Filters pane missing from `SETTINGS_PANE_KEYS`, so it escaped
  the axe hard gate AND the accessible-name walk; and a literal `─` escape left by a scripted
  edit. **None of the five would have been caught by CI, the suite or the sweep.**
- **THE LIST-VIEW SIDEBAR DOES NOT EXIST IN v16, and ~20 rules point at it.** `list_factory.js:30`
  hardcodes `const hide_sidebar = true`; `base_list.js:279-281` sets `no-list-sidebar`
  unconditionally; `list_view.js` contains the string "sidebar" ZERO times. The group-by /
  assigned-to / tags controls moved into `.standard-filter-section` in the PAGE FORM
  (`base_list.js:837-845`) while KEEPING their old `.list-sidebar-button` / `.list-link` class
  names — which is why the orphaning is invisible from the source. **Measured before being
  blamed:** the dropdown renders bounded and scrollable anyway (generic `.dropdown-menu` supplies
  max-height/overflow/min-width, item 28 supplies the paint), so a planned repair was DROPPED.
- **This corrected TWO documents that had inherited a wrong premise.**
  `docs/upstream/frappe-empty-states.md`'s `.empty-state`-in-the-list-sidebar entry and
  `_skeleton.scss`'s comment both reasoned from `list_sidebar.scss`, which cannot match anything.
  Both conclusions were right and both reasons were wrong — three documents deep, from reading the
  source instead of the bundle. The `_skeleton.scss` edit is comment-only and was proven inert by a
  BYTE-IDENTICAL rebuild (same md5, same content hash), the item-16 `_density.scss` technique.
- **`.btn-primary-light` IS THE DESK'S ONLY "ACTIVE CONTROL" VARIANT AND IT WAS 1.02:1 IN DARK.**
  Sass-literal fill (`$gray-300` light, `--bg-dark-gray` → `#999999` dark) under a CSS-variable ink
  (`var(--primary)` → `--bnd-brand-ink`) — the two halves disagree about whether they follow the
  theme. 4.12:1 light. **Three call sites: the Filter button, the report view's Add Group button,
  and THE SKIP LINK** (`page.js:191`), so the repair is wider than this kit. It is a STATE SET, not
  a declaration: Bootstrap's `button-variant` generates eight rules and every fill in them is a
  literal, so re-pointing the base rule alone reverts to `#ededed` on hover. Repaired to
  `--bnd-hover`, a `contrast_gate.SURFACES` member, so AA is guaranteed by an EXISTING gate row at
  all 11 seeds rather than by luck (4.93 / 4.51 measured).
- **`.page-form` IS THE CLEANEST SCOPE ANY SURFACE KIT HAS HAD.** It is `display:none` on form,
  settings and workspace routes and visible only where filters exist (measured on six routes), so
  one selector reaches the strip and nothing else — and the query-report route comes free.
- **`filter_area.clear()` DOES NOT RESTORE, AND IT LIES ABOUT IT.** It empties the live list and
  `filter_area.get().length` duly reports 0 — but `update_user_settings` has already written the
  filter into the **redis** `_user_settings` hash and the next navigation reads it straight back.
  The `__UserSettings` TABLE ROW stays clean the whole time. **The teardown is server-side:**
  `frappe.cache.hdel("_user_settings", f"{doctype}::{frappe.session.user}")`. A filter left on ToDo
  changes what every later list test sees and the failure does not name filters. Cost one confused
  probe cycle.
- **A FILTER DRIVEN ONTO A STANDARD FIELD NEVER REACHES THE COUNT.** `filter_area.add` routes a
  standard field to the page-form select rather than to `filter_list`, so `update_filter_button()`
  never runs and the button stays "0 Filter Applied". Two probes read "no applied state" that was
  really "no filter". Pick a NON-standard field at runtime by diffing the doctype meta against the
  rendered `.standard-filter-section [data-fieldname]` list.
- **`color-mix()` COMPUTES TO `color(srgb r g b)` ON A 0-1 SCALE, NOT `rgb()`** — and
  inconsistently: `--bnd-hover` is also a color-mix and serialises as `rgb()`. Anything parsing
  digits and assuming 0-255 mis-reads the first form. **It bit twice.** The second time a
  normaliser existed but had not been carried into a luminance helper running inside
  `page.evaluate`, and an Accented control measuring 4.74:1 was reported as **3.92:1** — a correct
  rule failed by a wrong check, and the CSS was chased first. Fixed structurally: **the page
  returns STRINGS and every number is computed on the Node side**, so one place knows how a colour
  serialises.
- **TWO POLES WOULD HAVE RENDERED AS NOTHING, caught by ARITHMETIC before either was written** —
  one stage earlier than item 29 caught its two. `--bnd-page` as a recessed well collapses to 1
  channel at a near-white seed and 0 at pure white (it is brand-mixed); and the anchor's default
  pole as drafted set the slot to `--bnd-surface`, a ZERO delta against the band, which would have
  re-opened the repaired defect while looking like a style choice. Both now ride an INK mix, which
  measures 9 (light) / 8 (dark) at ALL ELEVEN gate seeds. New rule in the file: **a pole may not
  take the slot's fill away.**
- **A CONTRACT AND AN ANCHOR POLE THAT WRITE THE SAME CSS PROPERTY CANNOT BOTH BE ASSERTED
  ABSOLUTELY.** R7's hover ring and `Outlined`'s resting ring share box-shadow, so "hover reveals an
  edge" is true only where the anchor leaves the channel free. That arm runs under `Original`;
  asserting it unconditionally was testing the anchor and calling it the contract.
- **ZERO new colour tokens; ONE new contrast pair (3,984 → 4,008).** The resting fill is
  character-identical to `_form.scss:147`'s tab track, so the gate already covered its inks. The
  one pair is the applied label on its brand wash, placed BESIDE the list kit's `SEL_BG` rows so
  the expression is reused rather than restated (worst 4.54:1 over 11 seeds × 2 modes).
- **A PRE-EXISTING WEAKNESS THIS SURFACED, recorded not fixed:** the list kit's selected-row wash
  is that same `SEL_BG`, so it too flattens at a pure-white seed — its inks stay gated, so rows
  remain readable, but the SELECTION is invisible there. Shipped since item 15. Out of scope for
  item 31.
- **Payload: `css_gzip` 20200 → 20600 (slice 1, crossed by 8 bytes) → 21000 (slice 3).** The JS
  estimate was WRONG in an instructive way: "one table row" first measured **+668 b** against a
  predicted +60-120, because twenty lines of comment around nine lines of code are payload in a
  bundle that is not minified. Trimmed to a pointer, recovering 313. **The picker is doctype JS, so
  slice 3 cost ZERO bundle bytes** — and needs `BND_FORCE_RESTART=1` to serve.
- **The 22 `ar.po` rows are `#, fuzzy` and AWAIT THE USER'S REVIEW** — the item-7 handoff. Clear
  them in their own commit, as items 27, 28 and 29+30 all did.
- Wireframes: <https://claude.ai/code/artifact/5e9a1264-9b54-4ac1-bd36-4deaa92ba821>. Plan:
  `~/.claude/plans/working-on-bunood-theme-we-validated-mountain.md`. Picks **Outlined · Accented ·
  Listed · repairs are contracts** — `Outlined` is a REDECISION: the round chose `Trough` on
  frappe-ui's `TabButtons` grammar, and reading Frappe's OWN five current apps overturned it
  (`p-px`, the trough's signature, appears on **zero** filter or toolbar nodes across crm v1.79.0,
  helpdesk v1.27.0, insights, gameplan and drive; crm uses `TabButtons` zero times). **crm and
  helpdesk are still on the bench at `/home/frappe/frappe-bench/apps` even though they were
  uninstalled from the SITE** — that is how they were read, and it is worth knowing for any future
  "what would Frappe do" question.

**ITEM 30 (skeletons) — DONE, RELEASED as `v0.30.0` (2026-08-20, local tag).** Two slices plus a close
on `main`: `783520e` 1 (contracts) · `00a61da` 2 (anchor + picker). Suite **298/298**. One
field (`skeleton_style`: Original · Still · Pulse · **Sweep**), `surfaces/_skeleton.scss`,
and the theme's FIRST `@keyframes`. Facts worth keeping:
- **THE SUITE ENVIRONMENT REPORTS `prefers-reduced-motion: reduce`.** Any motion assertion
  MUST emulate explicitly — `no-preference` to prove a treatment exists, `reduce` to prove
  the gate removes it. The first run of the motion check read `0s` for every duration and
  looked like a broken token. Reset in `finally`, and compare the teardown against the
  AMBIENT default, never `false` — the suite shares one page for the whole run.
- **A 0ms infinite animation renders the element's BASE declaration, not a held keyframe**
  (measured). So the token zero alone stills the bone correctly and the `no-preference` gate
  is genuinely belt-and-braces. Paint NEVER goes inside the gate — Discourse put a bone's
  background inside its own and reduce-motion users get an invisible skeleton.
- **Under Sweep the CARD is not animated — its `::after` is.** Reading the card's
  `animationDuration` returns `0s` and looks like a broken token when it is a broken
  assertion. Cost one debug cycle.
- **`--bnd-bone` is LIGHTER than `--bnd-hover` in dark** and darker in light: a bone reads
  by lifting off the surface in dark. `--bnd-active` was the obvious pick and lands within
  ~4 units of hover — the stock collapse re-created in our own vocabulary.
- **`.chart-loading-state` STAYS BARRED** — its loading and empty boxes differ only by child
  order, which is fail-unsafe. Kanban and the query report were taken; the chart was not.
- **The import-path preview call site was missed on the first pass AGAIN** (as in item 29):
  `String.replace` patches only the first match. Diff the new kit's call sites one-to-one
  against the previous kit's — that is what caught it both times.
- **`ar.po` carries ZERO fuzzy rows.** The 34 across items 29 and 30 were approved by the
  user 2026-08-20 and cleared in `cf1dc9b` — its own commit, as items 27 and 28 did. The
  `#. src: itemNN` provenance comments were KEPT; only the flag went. No runtime change: the
  emitter never filtered on the flag, so `translations/ar.csv` is byte-identical across it.
- **Payload: `css_gzip` 19600 to 20200** (slice 2 crossed by 247 bytes).

**ITEM 29 (empty states) — DONE, RELEASED as `v0.29.0` (2026-08-20, local tag).** Four gated slices on
`main`: `47d40d9` 1 (contracts) · `9e0009b` 2a (the kit refactor) · `ff84beb` 2 (anchor +
spine) · `f66572d` 3 (axes + picker). Suite **293/293** at the close. Plan +
slice-by-slice record: `~/.claude/plans/we-are-working-on-compiled-star.md`. Three fields
(`empty_style` · `empty_media` · `empty_action`), `surfaces/_empty.scss`, picker trio.
Facts worth keeping:
- **READ THE COMPILED BUNDLE, NOT THE .scss.** Two of the census's three planned contracts
  did not exist: the datatable's 90px no-data pin is already `max-content` upstream, and
  the list sidebar's "Sass literal $text-muted" compiles to `var(--text-muted)` — bridged
  all along. The census read source; the bundle is what cascades. One real defect remained
  (the child grid's `#999999`, 2.85:1, fixed by a scoped `--gray-500` re-point).
- **TWO STYLE OPTIONS WOULD HAVE RENDERED AS NOTHING.** `Filled` on `--bnd-raised` is a
  THREE-unit delta against `--bnd-page` in light (the boxes sit on page, measured both
  modes) — now `--bnd-surface`. `Framed` as a `border` computed to **0**, because the
  discriminator the kit keys on is Frappe's own `.no-border` and the desk ships
  `.no-border { border: none !important }` as a global utility — now a box-shadow ring
  (item 25's Hairline Grid technique). **Both were caught by checks written BEFORE the
  rules**, which is the whole argument for that order.
- **`.msg-box.no-border` is Frappe's own discriminator and it is the right one.** Five of
  the six places that construct a `.msg-box` carry `.no-border`; the sixth
  (`messages.js:14`, the legacy waiting helper) does not and ships an inline `width: 63%`
  we would only be fighting.
- **The 404 is smaller than the plan assumed.** Our sheet DOES load there (52 `data-bnd-*`
  attributes on `/app/note/BND-NO-SUCH-DOC` — note it is a missing DOCUMENT, not a bogus
  route, that renders `.message-page`), and the cartoon is already 100×100 with the Home
  button inside the fold at 375×812. The planned `svh` cap fixed a problem that does not
  occur. `.message-page-content` IS full-bleed (1190px) where `.msg-box` is shrink-wrapped,
  so treating them as one object needs the `max-inline-size` + auto inline margins.
- **The media plan's whole mechanism is a variable re-point, and it is proven.** The glyph's
  colour is an INLINE `stroke: var(--text-light)`; no rule beats an inline declaration, but
  it READS a variable, so a scoped re-point wins. Measured live before any rule depended
  on it.
- **DEFERRED, and stated rather than dropped:** the six `<img class="null-state">`
  illustrations (hardcoded hex, `#171717` = 1.11:1 on our dark surface). They are
  **unreachable in every drivable state** — probed 2026-08-20, the notification panel's two
  are in the DOM at 0×0 with `offsetParent` null. Waits for a route that shows them and for
  the mask-over-data-URI mark the survey costed at 250-290 B.
- **`ar.po` fuzzy rows: APPROVED** 2026-08-20 in `cf1dc9b` — 23 from this item, 34 counting
  item 30's, cleared in one commit exactly as items 27 and 28 did before their releases.
- **Payload: `css_gzip` 19100 → 19600**, raised in slice 2 (the commit that crossed).
  Slice 2a FREED ~1.1 KB of js by collapsing six hand-copied surface-kit blocks into one
  table (413 → 173 lines), which is what pays for the seventh kit (eight lines) and item
  30's eighth.
- **New build guard: `assertNoAuthoredCopy`.** A compiled `content:` whose quoted string
  carries two consecutive letters fails the build — CSS-authored prose bypasses
  `assertTranslationCoverage` entirely and would ship English into an Arabic desk. Escapes
  are stripped first, so the breadcrumb separators stay legal. Negative-tested.

**A SCRIM FIX SHIPPED SEPARATELY, AND WENT OUT IN `v0.29.0` (`07395ab`).** `overlay_scrim`
was INERT on `#freeze`: the tint painted correctly and was then covered by stock's own child
(`.freeze-message-container` is `inset: 0` with an opaque `--bg-light-gray`), so Dim, Tinted
and Blurred rendered identically on every document save — measured `rgba(16,26,22,.62)` under
an opaque `rgb(243,243,243)`. The check that covered this area passed throughout, because it
read `#freeze` itself and never what covered it. Also in `[Unreleased]`: the i18n commit
(`6502c1a`) that stopped the theme's Arabic depending on apps it does not ship, and fixed a
REAL BUG in `tools/i18n_inherited.mjs` — its PO parser ignored `msgctxt`, so a
context-qualified upstream entry was recorded as a plain inheritance the runtime could never
serve, and because the ledger claimed it we shipped no row of our own.

**THE SITE IS NOW ERPNEXT-CORE ONLY (2026-08-20, at the user's direction).** `crm`,
`helpdesk`, `hrms`, `payments`, `ksa_compliance` and `bunood_realestate` were uninstalled;
`frappe`, `erpnext`, `bunood_theme` and `telephony` remain. Consequences that cost time:
**18 Arabic strings were inherited from crm/helpdesk** and went English the moment those
apps left (now owned outright, see `6502c1a`); ERPNext's Payment Request gateway path
imports `payments` lazily and now fails on that path only; and `bench --site … backup`
at `20260820_021210` predates the removal if any of it must come back.
**ITEM 28 (overlays — dialogs, dropdowns, toasts) — DONE, RELEASED as `v0.20.0`, PUSHED
(2026-08-19).** Slices `afbf970` 1 · `6d7746b` 2 · `b14f0b3` 3 · `544c0ea` 4 · `0b84b32` 5,
then `d5d5a8c` (i18n sign-off), `c7baf78` (release-review fixes) and `31bf8f3` (the release).
`origin/main` reached `31bf8f3` here and the `v0.20.0` tag was pushed. Final suite **285/285**,
contrast **3,984 pairs**, sweep CLEAN.

**THE RELEASE CHAIN HAS A HOLE — FIX ITS WORDING BEFORE THE NEXT ONE.** This chain has always
said "bump `app_version`", and `bunood_theme/__init__.py`'s `__version__` was therefore never
bumped: it read `0.15.0` through v0.16.0, v0.17.0, v0.18.0 and v0.19.0, five releases stale,
while `pyproject.toml` names that file the SINGLE SOURCE OF TRUTH (flit reads it) and says
app_version must match. Corrected to 0.20.0 in `31bf8f3`. **The chain is: bump `__version__` in
`bunood_theme/__init__.py` AND `app_version` in `hooks.py` (they must agree), move the CHANGELOG
`[Unreleased]` block under the new heading, `node tools/payload.mjs --record vX.Y.Z`, tag, push
main + tag.** TWO ADDITIONS from the 29/30 double release: the version is the
ITEM NUMBER (above), and a tag placed RETROACTIVELY at an older commit needs its payload row
MEASURED FROM THAT TREE (`git cat-file blob` + gzip level 9), never taken from `--record` —
which measures the dist as built NOW and would charge a later item's growth to the earlier
one. Validate that route by measuring HEAD both ways and requiring the two to agree first, or
the number is an EOL artifact rather than payload. There is no `bunood_theme` entry in the bunood repo's `apps.json` (checked
2026-08-19 — it lists erpnext, payments, whitelabel and frappe-theme only); locally the app is
bind-mounted from the WSL mirror via `compose.local.yaml`, so there is no pin to bump. If a
deployment elsewhere pins it, that pin is not in this tree. Plan +
wireframes: `~/.claude/plans/item-28-overlays.md` and
<https://claude.ai/code/artifact/c8d9d7ca-375f-4e7f-9373-139e89d99a9b>. Facts worth keeping:
- **The desk has ~23 floating objects and they are ONE family — now written down** (ROADMAP's
  item-28 block, and `_overlays.scss`'s header). THREE were already owned when this started:
  `.graph-svg-tip` (item 25), the gantt popup and calendar grid (item 27). Settle ownership per
  object before touching an overlay.
- **`desk/dark.scss:189` is the trap of this surface.** `[data-theme="dark"] .modal,
  .form-in-grid` sets `--control-bg`/`--border-color` at (0,2,0), beating our bridge's (0,1,1),
  so dark dialogs took Frappe's `#232323` — measured 1.02:1, no visible line, no fill delta.
  Beaten at (0,2,1) with `:is()`. **`.form-in-grid` is the half that is easy to miss** — a
  dialog in all but name — and note there is one `.form-in-grid` PER GRID ROW, so scope any
  probe to `.grid-row-open` or you measure a closed one.
- **RTL DOCTRINE, new and now in GUIDELINES §1.3.** Frappe is RTL-correct by a build-time
  rtlcss pass (`sites/assets/frappe/dist/css-rtl/`); we are by logical properties; they do not
  compose. Any rule touching an overlay's inline-axis position must set BOTH logical sides, one
  to a value and one to `auto`.
- **Scrims COMPOUND.** Two open dialogs paint two `.modal-backdrop` nodes, both at z 1040
  (Bootstrap 4.6.2 does no z-bumping), so a 0.62 tint reads 0.86 stacked. The token is tuned for
  the stacked case; dark goes deeper (0.72), not lighter. Also: the vendor keeps the alpha in
  `opacity` while our token keeps it in the colour, and left alone the two MULTIPLY — hence
  `opacity: 1`.
- **Check the stock value before designing an axis around changing it.** `overlay_menu` was
  built on "stock rows are full-bleed"; stock is INCONSISTENT (Bootstrap row already an 8px pill
  in a 4px-padded popup, `.frappe-menu` row square at 0px). Flipped to item 27's `views_band`
  polarity — anchor unifies, `Inset` neutral, `Plain` the active override.
- **This kit's verification has no route.** An overlay exists only after a gesture; every check
  drives it. That discipline caught THREE defective checks, one of which passed before its fix.
- **Payload:** `css_gzip` raised 18000 → 18400 (slice 1) → 18700 (slice 3) → **19100** (the
  status-ramp token block, slice 5). The picker is doctype JS, so slice 4 moved neither bundle
  hash. Any doctype-JS change needs `BND_FORCE_RESTART=1` to serve.
- **The 19 `ar.po` rows are SIGNED OFF** (11 doctype + 8 picker, `#. src: item28`), commit
  `d5d5a8c`, 2026-08-19. `ar.po` carries zero fuzzy markers. Nothing awaits review here.
- **A LOCAL-ENVIRONMENT INCIDENT worth not repeating.** Git Bash MSYS path conversion silently
  rewrites POSIX arguments to `wsl.exe`/`docker exec` (`/usr/bin/rm` became
  `C:/Program Files/Git/usr/bin/rm`), and it emptied a `sed` in a hand-rolled rsync so the
  source became `/` — which, with `--delete`, destroyed the WSL mirror the app is bind-mounted
  from and took the stack down. **Export `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` before any
  such call, pass multi-line scripts as a FILE (quoting is eaten too), and never hand-roll what
  `tools/deploy.sh` already does.** Two recovery facts: Docker Desktop pins a WSL bind to a
  handle made at container-CREATE time, so recreating a mounted directory means the container
  must be RECREATED, not restarted; and recreating the frontend drops the per-app
  `sites/assets/<app>` symlinks, which must be re-made to match the backend. ~12 GB is parked at
  `~/bnd-mirror-junk` in WSL awaiting a privileged `rm`.

**ITEM 27 (alternate views — kanban · calendar · gantt · gallery) — DONE, MERGED, RELEASED as
`v0.19.0` (2026-08-18).** *(This entry read "LOCAL-ONLY, ON A BRANCH `item-27-views`" through the
item-27 work; the release chain closed it and item 28 corrected the record — the six slice commits
`9ddc5fe`→`5782d51` are on `main`, followed by the i18n sign-off `21aff3f` and the release commit
`f5eee78`, and `app_version` reads `0.19.0`.)* The full suite gated each shipping slice (last green
**260/260**). Plan + wireframes: `~/.claude/plans/we-are-working-on-mighty-willow.md` and
<https://claude.ai/code/artifact/0cb0d913-b974-4a14-a2df-55178117c96c>. Facts worth keeping:
- **Four vendors, four themability stories — and TWO hide colour inline** (the item that made this
  the hardest surface kit). Kanban column tint = inline `var(--bg-{indicator})` (re-point the var,
  the ONLY way to beat an inline colour without `!important` — which is why "Headed" was impossible
  and dropped). Calendar = FullCalendar 6, 30 `--fc-*` chrome vars, and its own `!important`
  border/ink rules beaten by re-pointing the `--gray-300`/`--text-light` they READ, scoped to
  `.fc`. Gantt = frappe-gantt SVG, its sheet loaded AFTER ours, so won on specificity `(0,4,0)+`.
  Gallery = a `.frappe-list` variant, but it inherits NOTHING from the list kit (no `.list-row-head`
  on that route — measured).
- **The kanban card taught "measure the selector" AGAIN.** Frappe paints the card FILL on a short
  `.kanban-card` (0,1,0) but the RADIUS + `box-shadow:none` on a full descendant chain (0,5,0), so
  the object rule needs the same depth (`.kanban-column .kanban-cards .kanban-card-wrapper
  .kanban-card`, 0,5,1). The gallery tile's rule is shallow and worked first try — the contrast is
  the lesson.
- **Calendar event colour is inline JS (`prepare_colors`) — item 25's chart problem exactly.** The
  wrap re-hues a DEFAULT event to `--bnd-accent`, keeps category (get_css_class) / admin (d.color
  hex). `frappe.ui.color_map` is snapshotted once at bundle parse, so a `data-theme` observer
  recomputes it + `refetchEvents()` — the flip re-colours events. `views_apply` calls the same
  repaint for a live mark change. Plain prototype wrap, NOT `class extends` (item 25's trap).
- **`window.Gantt` is undefined at boot** (lazily required), so unlike `frappe.Chart` there is no
  funnel to wrap for bar geometry — the gantt keeps its 35px bar in every density. Three such
  unreachable gaps are drafted in `docs/upstream/frappe-gantt-geometry.md` (bar geometry, Sortable's
  `animation:150` deaf to reduced-motion, gantt SVG physical RTL).
- **The picker is DOCTYPE JS (`theme_settings.js`), not the bundle**, so ZERO payload — item 27's
  only ceiling raise was the CSS (17000→18000, slice 2). Doctype-JS change needs `BND_FORCE_RESTART=1`.
- **`assertFieldMirrors` (build.mjs) landed** — the escapee guard HANDOVER §4.8 wanted. It fired on
  the exact predicted case (BND_INBOX_FIELDS omits inbox_placement, legit via the board) and was
  fixed by subtracting PLACEMENT_FIELDS everywhere (superset check). The escapee can't ship again.
- **Fixtures are CODE now** (`tools/fixtures-views.mjs`, idempotent) — the demo site shipped with 0
  boards/tasks/events, and the four views are gated. A pinned board "Bunood Memos" on ToDo, 24
  memos, 8 events, 12 imaged Items. The 12 Items raise `/desk/item`'s axe `label` baseline 2→14
  (documented, a ceiling, deterministic).
- **`ar.po` fuzzy rows await review**: item 27 added **29** `#. src: item27` rows (doctype labels,
  descriptions, Select options, picker blurbs/titles/descs/toggle). All `#, fuzzy`, part of the
  item-7 handoff.

**ITEM 26 (report view / datatable) — DONE, MERGED, RELEASED as `v0.18.0` / `v0.18.1`
(2026-08-17).** *(This entry read "LOCAL-ONLY, ON A BRANCH" through the item-26 work; the release
chain closed it and item 27 corrected the record — the six slice commits + two release commits are
on `main`, and `git tag` shows `v0.18.0`/`v0.18.1`.)* Facts worth keeping:
- **The header work is a BOUNDARY problem, not a positioning one** — `.dt-header` is a
  sibling of the scroll box and never scrolls away; stock just draws no boundary. And its
  fill is painted THREE ways (vendor var + `.dt-row-header` (0,3,0) + `.dt-cell--header
  .dt-cell__content` (0,4,0)), so the kit re-points the var AND beats both, the content
  box at (0,4,1). Measure the selector you override.
- **The grain rides HyperList's inline `top` parity**, validated at page length 100 — the
  default 20 doesn't virtualise, so `:nth-child` would look right and break at 100.
- **The picker is a DOCTYPE client script (`theme_settings.js`), not the bundle**, so it
  never counts toward payload — item 26 needed NO ceiling raise. It does need
  `BND_FORCE_RESTART=1` to serve (the bundle hash doesn't move).
- **48+ `ar.po` rows are `#, fuzzy`** and await the user's review (item-7 handoff); item 26
  added 27 (15 doctype + 12 picker).

**ITEM 25 (workspace/dashboard, charts, number cards) — DONE, MERGED, RELEASED as
`v0.17.0` (2026-08-16).** On `main` (`7f2ec64`), tag `v0.17.0` made and pushed; `main`
level with `origin/main`. (This entry read "LOCAL-ONLY, ON A BRANCH" through the item-25
work; the release chain closed it and item 26 corrected the record.) Facts worth keeping:

- **The chart colour split is FORCED, not chosen, and it is clean.** frappe-charts'
  CHROME (axis, gridlines, tooltip, labels) is CSS-reachable through its own bare-`:root`
  `--charts-*` variables; its SERIES colours are NOT — they arrive as a JS array written
  as inline SVG `style` (measured `stroke: rgb(246,131,174)` = the vendor `pink`), which
  beats every stylesheet rule. So chrome is themed via `surfaces/_charts.scss` mapping
  `--charts-*` → `--bnd-*` (one block under `html[data-theme] .chart-container`, wins
  Frappe's own dark override by equal specificity + later source order), and series are
  fed from JS.
- **The series ramp is DERIVED and BRAND-INDEPENDENT.** `palette.series_ramp(mode)` fits
  Paul Tol's muted scheme per mode and lands in `derive()`; it ignores the seed on
  purpose (series 1 is the same colour on every site), so ONE static block in
  `_tokens.scss` satisfies `check_defaults_agree` for all 11 gate seeds. Its binding
  background is computed from the surface FORMULAS at the extreme seed (`#f5f5f5` = a
  black seed's `--bnd-page`; `#32353b` = a white seed's `--bnd-raised`), NOT from
  `derive()` — that would recurse. New maths in `contrast.py` (`to_lab`, `delta_e`
  CIEDE2000, `simulate_cvd` Machado-2009-linear, `separation`); the model was chosen
  EMPIRICALLY — it ranks designed-safe palettes (Okabe-Ito 11.6, IBM 9.4) above unsafe
  (frappe 4.1, Tableau 0.7) with a clean gap, and the floor (6.0 common / 4.5 tritan
  advisory) sits inside it. `check_deltae_reference` pins CIEDE2000 to Sharma-Wu-Dalal
  every `npm run contrast`.
- **frappe-charts tokens authored as literal 6-digit hex ONLY.** `getComputedStyle`
  returns a token's computed value; a `color-mix()` or `var()`-chain token resolves to
  that unresolved string, which frappe-charts rejects, and its `getColor` drops an
  unpadded `rgb()` channel (`rgb(0,131,0)` → `#0830`). The JS hard-validates
  `/^#[0-9a-f]{6}$/i` and drops the whole array on any failure (coherent vendor default
  beats a half-ours mixture).
- **`frappe.Chart` is wrapped, not the widget method.** `new frappe.Chart(...)` is the
  ONE funnel all seven v16 call sites use; a plain-function wrap (NOT `class extends` —
  the constructor returns a different object, so a subclass prototype never joins the
  chain). It also sets `lineOptions.regionFill:1` on every line chart so the Filled Area
  style has a `.region-fill` to reveal via CSS opacity — keeping `chart_grid` a pure-CSS
  live preview. Theme flip repaints via ONE `MutationObserver` on `data-theme` (set_theme
  emits no event), `draw(false,false)` in place, hovered/focused charts deferred.
- **THE CASCADE, TWICE (item-16 lesson, again).** (a) Mixed Weights first keyed on
  `.widget.chart` — the bare type class the block toolbox *implies* but the rendered
  widget does NOT carry; it is `.widget` + the `*-widget-box` class only. (b) The number
  value lost to Frappe's `.widget.number-widget-box .widget-body .widget-content .number`
  (0,5,0); the metric rules now carry the full path in `$num`/`$title` so `html` + the
  attribute clear it. Both caught by their own suite assertions returning null/stock.
- **The `$scope`-variable double-`html` trap bit twice more.** A `$tile`/`$card` SCSS
  string that embeds `html[data-bnd-ws]` and is then given an `html[data-bnd-ws-metric]`
  prefix compiles to invalid nested `html html`. The rule: scope variables hold NO html
  anchor; prepend it per rule.
- **Hairline Grid's `overflow:hidden` stands down in `.edit-mode`.** Probed: editor.js
  puts `.new-block-button` at `left:-5px` and the settings sidebar at `right:100%` — in
  the gutter a gapless board + clip would eat them. Scoped
  `.layout-main-section:not(.edit-mode)`.
- **A form page has ZERO `.widget`.** So the kit's `:is(.ce-block, .widget-group-body)
  .widget` scope reaches the workspace and Dashboard grids and never a form's connections
  dashboard. The axe honesty check passed IDENTICAL kit-on vs Original on both routes.
- **Ceilings raised deliberately:** `css_gzip` 15400→17000, `js_gzip` 88000→92000, each
  in the slice that grew it. **48 `ar.po` rows are `#, fuzzy`** and await the user's
  review (item-7 handoff).
- **A 4-dimension adversarial release review ran before the close** (a Workflow: CSS
  cascade / colour science / runtime JS / anatomy completeness → verify) and found SEVEN
  real defects the per-slice suites missed, all fixed in the slice-6 commit. The one that
  mattered: `BND_WORKSPACE_FIELDS`/`_DEFAULTS` (the JS mirror of `presets.WORKSPACE_FIELDS`)
  omitted `workspace_metric` — so the metric never LIVE-PREVIEWED and was silently dropped
  from theme export/import. The item-18 "escapee" class, AGAIN, and green because the metric
  suite test drove `workspace_apply` directly, bypassing the `BND_WORKSPACE_FIELDS`-driven
  preview/export path. The others: a dashboard-route `border-radius` inert without an
  `overflow` clip; a raw-`8px` gutter fallback that also differed from the dashboard's
  token; `isValidColor` discarding admin-set NAMED colours frappe-charts honours; the
  tritan floor hard-failing despite being labelled "advisory"; and two wrong calibration
  figures. Two findings were correctly REFUTED (an `options.colors` in-place mutation whose
  reconstruct-precondition frappe never creates; a `chart_apply`-absent path that self-
  defeats).
- **FOLLOW-UP worth doing: a `build.mjs` guard that keeps the `BND_<X>_FIELDS` JS mirrors
  in sync with `presets.<X>_FIELDS`.** The escapee has now bitten twice. The guard is
  `BND_<X>_FIELDS` must contain every `<X>_FIELDS` entry EXCEPT `PLACEMENT_FIELDS`
  (`inbox_placement`/`user_placement` are legitimately export-separate via the placement
  board — verified, so a naive set-equality FALSE-positives on INBOX). Prototyped in the
  scratchpad (`mirror-check.mjs`), passes clean on all nine surfaces once placement is
  subtracted; left out of the item-25 close as out-of-plan scope.

**ITEM 24 (responsive) — DONE, LOCAL-ONLY (2026-08-16).** Seven gated commits on `main`
(`ea5f928` A · `c88d078` B · `752834b` C1 · `831550b` C2 · `367ca3f` D1 · `854b436` D2 ·
`adfb19f` D3), all suite-green, none pushed. The mobile desk works: below 768 it collapses
to a full-width bottom bar (search-as-palette-icon, alerts, you, All Apps), workspaces on
Frappe's own drawer, three toggles for the contents, the side pane out of flow, pinch-zoom
restored, touch targets ≥24px. The last full run was **213/213**. Facts worth keeping:
- **The header defect's real cause** (the roadmap's "~480px, no `<header>`" was wrong on
  both counts): Frappe renders the empty `<header>` at every width; `toolbar.js` REPLACES
  it below 768 (`frappe.is_mobile()`) OR on read_only / impersonation / an announcement
  widget — so `mount_topbar`'s `.main-section > header` query misses, and the boundary is
  768, not 480. Three of the four triggers fire on a full-size desk.
- **The sidebar's phantom column** was an INLINE `width: var(--bnd-sb-w)` set by
  `sb_apply_width` (an inline style beats every stylesheet rule). The narrow fix had to
  clear it in JS AND take the container out of flow in CSS; a Frappe `user-onboarding`
  widget rides inside the container and floors its width, hence `overflow:hidden`.
- **Mobile mode is applied, never persisted** — a runtime override
  (`is_narrow()` → `NARROW_CHROME`/`NARROW_PLACEMENT`), `matchMedia` on the threshold, the
  stored fields untouched. A resize is not a gesture.
- **The breakpoint guard parses `_breakpoints.scss`** for its allowlist (one source of
  truth); `@media` uses the viewport scale, `@container` the container scale, checked
  separately.

**ITEM 23 (icons) — largely shipped, LOCAL-ONLY (2026-08-13).** Twelve commits on
`main` past the item-22 work, none pushed. The item was reframed: the desk already
loads five sprites (2,085 symbols, no collisions), so the "ship a sprite for coverage"
premise was wrong and the work went elsewhere. What landed, each its own commit and
each verified in isolation (the full suite kept OOM-ing on this 3.8 GB host — targeted
families all green, and the sweep exits CLEAN):

- **Defects (all live in v0.14.0):** the 8×15 chip squash (`_sidebar.scss` lost a
  specificity contest to Frappe AND set no `flex: none` on the svg — fixed by naming
  `.item-anchor` to reach (0,4,1); the sidebar's passing tests never measured a rendered
  box, which is why a `getBoundingClientRect` check now exists); `--icon-stroke`/`--icon-fill`
  bridged so icons join the token pipeline; `sprite_icon` es-icon polarity (the inbox
  arrow was hollow); a `ws_symbol` guard for unbounded workspace ids; dead sprite ids.
- **The engine:** inference moved SERVER-side (`bunood_theme/icons.py`, called from
  `extend_bootinfo`), keyed on the untranslated `link_to` — so an Arabic desk resolves
  the SAME icon as English (was 0/44, a live parity test guards it). Emitted ids are
  verified against a shipped manifest (`bunood_theme/data/sprite_ids.json`, also what
  `npm run icons:check` gates); the DocType-icon map is cached in `api.py` and
  invalidated by a `DocType` doc_event. `sb_fix_icons`'s keyword pass is deleted; its
  letter fallback and a scoped `sb_existing_symbol` remain.
- **The consolidation:** one Icons section (an axis, beside Colours/Density). Four fields
  renamed in (`sidebar_icon_style`→`icon_style`, `_source`→`icon_source`,
  `sidebar_rail_button_icon`→`icon_rail_button`, `crumb_icons`→`icon_crumbs`) via patch
  `v0_15_0/rename_icon_fields` — migrate verified clean on demo, values carried. The
  eight sidebar presets no longer write icons. A card picker (`bnd_render_icons_picker`,
  `.bnd-icp-style` hook) with a live specimen, plus the new `icon_weight` axis
  (`data-bnd-icon-weight` → `_icons.scss`, measured 2px beating Frappe's 1.5).
- **KEY LESSON, the same one twice:** the load-bearing simplification was to keep the
  boot PAYLOAD keys, the `data-bnd-*` attributes and the field LABELS unchanged and
  rename only fieldnames — that kept every stylesheet and both Arabic files out of the
  diff. And the icon fields feed THREE runtimes (sidebar / breadcrumb / global weight),
  so `bnd_icon_preview` calls all three apply hooks; each hook's `set` no-ops on an
  absent value, so a partial values object never disturbs a pane's other settings.
- **DEFERRED, the user's explicit scope call:** `icon_set` (Lucide↔Tabler) and `icon_fill`
  (outline↔filled) need a shipped Tabler subset sprite via `app_include_icons` — the
  item's ORIGINAL sprite scope, and its closing slice. CSS ceiling was raised 14500→14700
  for `_icons.scss`.

**Pushed and green** (2026-08-06). `main` is level with
`origin/main` at `Bunood/bunood-theme`, the `v0.10.0` tag is pushed, and CI passed
all nine steps including the new contrast gate. The first CI run failed for 14
minutes inside "Set up job" — *"Failed to resolve action download info: Service
Unavailable"*, a GitHub outage before `actions/checkout` was even fetched — and a
re-run cleared it. **Still never push without being asked**; this time it was.

Shipped this session, all committed, all verified:

| | what |
|---|---|
| **Item 17 — contrast** *(was 32)* | WCAG 2.2 AA guaranteed for *any* brand seed. `npm run contrast` enforces 1,656 pairs over 11 seeds × 2 modes in CI (1,080 at this item's own release; item 22 added the sidebar pill/mark/stand-down rows) |
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

**Corrected by item 22, commit 5 (2026-08-13).** This paragraph's "both gestures
end in the same `drop_on`" was never quite true for the click path: clicking chip
B while chip A was armed re-armed to B without ever dropping A, silently losing
the pick with nothing to show for it — a real defect, found while restructuring
the board's ARIA (zones went from `role="button"` to `role="group"`, since a
button's *Children Presentational: True* was flattening the chips that ARE the
components out of the accessibility tree). The rewrite splits the board by FACT
rather than by gesture: **which zone** is now decided by an honest "Move to…"
menu on the armed chip (built from `bnd_field_slots`, so it can never list an
illegal target) reachable by click or Enter; **what order** is still the nudge
arrows, bounds-checked to the chip's own zone, exactly as `bnd_order_move`
always worked. Clicking a different chip now only changes which one is armed —
it never drops anything. A `role="status"` live region announces every pick,
move and refusal, and focus returns to the moved chip after each re-render.

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

**Item 15's (was 16) `list_picker` is still missing from the full-complement test's
EXPECTED map** — `form_picker` was added to both of its literals, list was
deliberately not back-filled there (separate concern, one line, free).

What that work needed, kept for the next surface kit:

* **Release state (updated 2026-08-13):** v0.14.0 shipped — `app_version` is
  `"0.14.0"`, the tag exists locally, and `payload-budget.json` carries its ledger
  row (14,211b css gzip). Its release COMMIT reached `origin/main`, but the standing
  chain stopped there: `git ls-remote --tags origin` shows no `v0.14.0` (nor any tag
  since `v0.9.0`), so the annotated tag was never pushed and the bunood repo's
  `apps.json` pin was never bumped. On top of that, **11 more commits are local-only
  and unpushed** — the ROADMAP renumber plus all eleven of item 22 (was 34 + 34a) —
  so `main` is now well ahead of `origin/main` on two fronts at once: an unfinished
  v0.14.0 chain and a whole unreleased item. The moment the user says "push it",
  the standing chain runs unprompted: push theme `main` → push the existing
  `v0.14.0` tag (already made — do not re-tag) → bump the pin in the bunood repo's
  `apps.json` (`ci: pin bunood-theme v0.14.0 — …`, rebase if origin moved) → push
  (Coolify deploys; the compose `migrate` service migrates). Item 22's own
  `[Unreleased]` entry in `CHANGELOG.md` is the next release's content once that
  chain closes. Never start it uninvited.
* **The surface-kit anatomy is now proven twice**, in the same 16-file order
  (registry SURFACES entry → doctype fields → presets → setup → boot →
  `apply_*_attrs` + the MANDATORY `bunood.*_apply` hook → `surfaces/_*.scss`
  working-set blocks → picker trio → contrast pairs → fingerprint → ar.csv →
  suite family). Diff against whichever kit is closer; both headers carry the
  same five-block contract. Six more edits live outside that list and are
  easy to miss: `build.mjs` FIELD_PREFIXES, the sweep's CRUMBS_ONLY **and**
  IMPLICIT, `bunood.scss`'s `@use`, the shell nav entry + `BND_SHELL_OWNS`
  prefix, the export **and** import field lists, and MUTABLE_FIELDS.
* **Probe BEFORE designing, and probe the CASCADE too.** Item 15 (was 16) taught
  "probe the DOM"; item 16 (was 18) added "probe the rules". Both of its defects were
  upstream selectors out-specifying ours (see the item-16 block above).
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

**THE UPSTREAM `is_rtl()` DEFECT NOW HAS A LOCAL FIX** (2026-08-13, user
asked directly: "is there a fix you can do for it"). Full mapping saved at
`~/.claude/plans/tender-leaping-stallman.md` before implementation, for
anyone picking this up cold. Frappe's `is_rtl()` — a four-language exact
match, no parent resolution — is duplicated TWICE: once in
`frappe/utils/jinja_globals.py` (consumed by `desk.py`, `printview.py`,
`pdf.py` via import-time binding, and by `bundled_asset()` internally,
which picks the `rtl_`-equivalent CSS bundle off the same check), and again,
independently, in client JS (`frappe.utils.is_rtl()`,
`public/js/frappe/utils/utils.js` — NOT derived from any boot field). The fix
closes both, without touching Frappe core:
  - `bunood_theme/setup.py::is_rtl(lang)` — the one corrected source of
    truth, built on the existing `RTL_LANGS`. `_warn_unreachable_rtl`
    retired: it existed because these codes were unreachable, and warning
    about a reachable one would be noise.
  - `bunood_theme/i18n/rtl_patch.py` — the ONE monkey-patch in this app,
    and why it's safe: Python's `from X import Y` binds a name at import
    time (which is why `desk.py`/`printview.py`/`pdf.py` can't be reached
    this way), but `bundled_asset()`'s internal call to `is_rtl(rtl)`
    resolves fresh from ITS OWN module namespace every call — so patching
    the `jinja_globals.is_rtl` attribute, once, at app-load
    (`bunood_theme/__init__.py` imports this module first thing), fixes
    the CSS-bundle selection reliably, no import-order race.
  - `context.py::desk_context` now also overwrites `layout_direction` —
    already runs AFTER `desk.py::get_context` per this file's own call-path
    trace, so no patching needed for the desk shell's `dir` attribute.
  - `bunood.js`'s `frappe.utils.is_rtl` gets reassigned client-side, fed by
    a NEW `bnd_rtl_langs` boot key (`RTL_LANGS`, threaded through rather
    than hand-copied — the boot doctrine's "keep this minimal" lost to "the
    same fact in two places" here, deliberately).
  - **The desk shell is complete; the print/PDF gap CLOSED in item 35
    (2026-08-26), structurally** — `printview.py`/`pdf.py` import-time-bind
    `is_rtl`, and the rtl_patch reached those bindings only by import-order
    accident (apps load first in the common worker lifecycle; any app-level
    `import frappe.utils.pdf` flips it). Now the document's direction is
    overwritten in `context.py`'s printview branch (the PDF body inherits it
    via `get_print`) and the header/footer sub-documents go through the
    last-wins `pdf_header_html`/`pdf_footer_html` hooks
    (`printing/pdf_direction.py`). The `direction:` checks force the hostile
    import order on purpose (`benchPyHostileImport`). Upstream-only remainder:
    WeasyPrint, and the four-code list itself — the filing stays worth making.
  - Proven, not asserted: the new suite test
    (`direction: the desk's dir, CSS bundle and JS agree...`) was run against
    the patch DISABLED first — `dir=rtl` but `coreBundleDirs` all `ltr`,
    exactly the half-flipped desk this whole design avoids — then against
    the real fix, green. `docs/upstream/frappe-is-rtl.md` updated (stale
    `www/app.py` → `www/desk.py`, `ku` dropped from the suggested patch,
    the JS-side duplicate added) — filing is still the user's call; the
    local fix removes the urgency, not the reason, since only upstream also
    reaches print/PDF.

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

**NEXT (updated 2026-08-13)**: items 7, 15, 16 and now **22** (was 34 + 34a) are
closed, so Phase 2's surface work is done apart from the report view, and
accessibility is no longer an open thread — see ROADMAP item 22 and this file's E2
correction and §8 above for what it changed. The open threads, in the order they
earn their place: **23** (the icon sprite, was 33 — three callers exist now, which
is the evidence Phase 3 wanted before freezing the interface); the honest-picker
audit; and the deferred floating selection bar. A release is also owed, and now a
larger one than usual — see the release-state bullet above.

---

### The release review, and the five defects it found (2026-08-22)

`v0.32.0` was tagged, gates green, and **not sound**. All five below were live on the
tagged commit; none would have been caught by CI, the suite, the sweep or the contrast
gate, because each sits in a place the checks did not look. Each is now covered by a
check that was verified by putting the defect back and watching it turn red.

- **THE SITE ROOT GOT NO KIT AT ALL, AND THIS IS THE ONE THAT MATTERED.** The branch
  matched `frappe.local.request.path` against `("login", "update-password")`, on a claim
  written into `context.py` that `context.path` is not assigned until after the hook
  runs. **That claim is false** — `TemplatePage.get_html()` calls `update_context()`,
  which sets `path`, `route` AND `template` in `set_page_properties()` before
  `post_process_context()` reaches us, and the desk branch had keyed on
  `context.template` since v2. On a stock site a guest hitting `/` is served the sign-in
  page and `request.path` is `""`, so **the address a customer actually types** got
  `class=""`: no scope, no anchor, no brand sheet, no logo, none of the eleven contracts
  including the focus ring. So did the redirect target from any `/app/*` hit by a
  signed-out user. All 22 login checks passed because **every one of them navigates to
  the literal `/login`**. Guard on `AUTH_TEMPLATES`, never on a route.
- **A RULE SCAN AT REST CANNOT SEE THE STATES, AND THAT COST THREE MORE.** Frappe groups
  `:hover, :focus, :active` into ONE selector list at `(0,5,0)` and ships a separate
  `:disabled` at `(0,5,0)`; our base rules were `(0,4,1)`. So `:focus` reverted the CTA
  to `#383838` (1.36:1, no ring — `:focus-visible` is false after a pointer click) and
  `:disabled` to `#171717` (1.12:1), which is one gesture away because `login.js`
  disables the button and `.btn-forgot` ships `disabled` in the markup. The strength
  meter is the same lesson through class-count rather than pseudo-class: ours was
  `(0,2,1)` against Frappe's `(0,3,0)`, so **the rule had never applied at all** and the
  track stayed `#f3f3f3` — 14.42:1 against a dark card. **Scan the states, not the
  selector.**
- **`.btn:active` IS `!important` AND ONLY HALF OF ITS PAIR FLIPS — WE MADE IT WORSE.**
  `website.bundle` ships `.btn:active { color: var(--text-color) !important;
  background-color: var(--control-bg) !important }`, unlayered. We re-pointed
  `--text-color` and not `--control-bg`, so a held button drew our flipping ink on
  Frappe's fixed `#f3f3f3`: **1.09:1 in dark, where stock managed 10.57:1.** A repair
  that re-points ONE variable of an `!important` pair is a regression. Both halves now.
  The 3:1 boundary is separately unwinnable there — `--control-bg` is the field fill, so
  a pressed button flattens into the card whatever we point it at — so the check asserts
  the LABEL and the exemption is argued in the file.

### Three measurement traps, all of which produced a confident wrong answer

- **`getComputedStyle` MID-TRANSITION IS THE STALE-VALUE TRAP'S SECOND FACE, AND IT
  FAILS IN THE SAFE-LOOKING DIRECTION.** Separate evaluates and two `requestAnimationFrame`s
  are NOT enough: these buttons carry a colour transition. A read 120ms after clearing
  `disabled` caught the submit at `78,133,87` en route to `74,130,83` and reported
  **4.22:1 for a pair that settles at 4.56:1** — a false AA failure. The same wait after
  a body-class swap read `53,87,61` for a button whose settled fill is `22,24,29`, an
  interpolation between two poles. One direction cries wolf; the other **certifies a
  live defect as repaired**. Stop waiting a fixed time: poll until three consecutive
  frames agree, with a frame cap. Both new state checks do.
- **A RULE SCAN THAT RECURSES ON `r.cssRules` NOW EXAMINES NOTHING.** With CSS nesting,
  `CSSStyleRule` implements `CSSGroupingRule`, so EVERY style rule carries an empty
  `cssRules` list and `if (r.cssRules) { walk(...); continue; }` skips all 6,063 of them.
  It reported zero `:active` rules, which reads as "the vendor has no such rule" rather
  than as a broken tool — and nearly retired a real finding. Guard with `!r.selectorText`.
- **`triple()` READ AN UNKNOWN COLOUR FORM AS BLACK, SILENTLY.** It knew `rgb()` and
  `color(srgb ...)`; Chrome also serialises a `color-mix()` as
  `oklab(0.554924 -0.0794364 0.0496738)`, which the digit-scraping fallback turns into a
  near-black triple. Nothing in the suite hit it yet — that is luck, not design. It
  THROWS on an unrecognised form now, and takes a resolved `[r,g,b]` array for the
  checks that resolve colours by painting them on a 1x1 canvas in the page (the only way
  to resolve `oklab()` without reimplementing the conversion).

### The pre-existing bug the review turned up, now fixed

- **`brand.py` DOCUMENTED A CONTENT HASH AND SHIPPED A RANDOM ONE, AND IT WAS A v17
  DEADLINE.** The module docstring says "content-hashed filename" three times and rests
  the whole cache argument on it — nginx sets no `Cache-Control` on `/files`, so the URL
  must be immutable per content — and the line was commented "Hash the CONTENT, so an
  unchanged save keeps the same URL". It called `frappe.generate_hash(css, 8)`, whose
  own docstring is *"Generates a random hash"*, whose body is `secrets.token_hex`, and
  **which discards `txt` entirely**. Consequences: `os.path.exists(target)` could never
  short-circuit, `_reap_old` spent its eight-file budget of still-referenced URLs on
  byte-identical rewrites, and every `after_migrate` re-issued the sheet. The cited
  precedent is where it came from — `website_theme.py` does use 8 hex chars, but its
  comment reads `# add a random suffix` and it DELETES old files each generate; the
  length was copied and the semantics were not. **And `txt` is deprecated, warns on
  every call, and is REMOVED in Frappe v17**, where the TypeError would have been eaten
  by `write_brand_css`'s own `except Exception`, `None` returned, and the brand sheet
  silently stopped generating on every site. Now `hashlib.sha256(css)[:12]` — TWELVE,
  because content addressing adds a failure mode randomness did not have (on a collision
  the existing file is served and the new content is never written, so a colour change
  silently does not happen).
- The check that pins it is the THIRD assertion, not the first two: same-URL-twice could
  be caching and a moved URL could be randomness, but **returning to a previously seen
  URL** can only happen if the name is a function of the content. Watched to fail
  against the deployed old code before the fix went in.
- **AND THE SELF-HEAL WROTE INSIDE A GET** (fixed 2026-08-22, after the tag). It ran in
  `update_website_context` while serving a read, and Frappe rolls back the transaction
  on a non-writing request — so `set_single_value` was discarded EVERY time. The stored
  URL stayed stale, the next request found the same missing file, and the heal ran
  again: a full palette render, a sha256, a directory listing and a WRITE LOCK on
  `tabSingles`, per request, forever, to record something immediately thrown away.
  Concurrent desk loads serialised on that lock in a state whose whole point was to be
  invisible.
  **The two brand fixes compose, and this one was not cleanly available before the
  other.** Once the filename is a digest of the content, the URL is a pure function of
  the settings, so the read path never needed to REMEMBER anything to be correct — only
  to avoid repeating the render. `write_brand_css` gained `persist`; the read path
  passes `False` (the FILE write is not transactional, and it is what makes the page
  work), and the remembering moved to `brand.HEAL_CACHE_KEY`, which survives a request.
  Ordering is the safety argument: **the stored value wins whenever its file is on
  disk**, the cache is consulted only after that and re-stat'ed, and a real save deletes
  it — so a leftover key can neither mask a save nor outlive its own file. `_reap_old`
  is gated on `persist` too: a read that reaps can 404 a sheet another live desk holds.
  **The symptom is invisible in the environment that has it.** In a real GET the stray
  write vanishes on rollback; in the bench console it sticks. That inversion is why it
  survived, and why the check runs in the console — a probe against the deployed old
  code returned `read_path_wrote: true`. The live proof is better still: with the DB
  pointing at a missing file, the served page linked the CORRECT healed sheet (200,
  5761 bytes) while the stored value stayed bogus.

### The phantom-token guard, and the five more it found (2026-08-22, after the tag)

- **`build.mjs` NOW REFUSES ANY `var(--bnd-*)` NAMING A PROPERTY NOTHING DECLARES.**
  Item 32 shipped `outline: var(--bnd-line-thick, 2px) solid var(--bnd-accent)` — a raw
  2px wearing a token's name, declared nowhere. It passed every guard: the no-raw-px
  rule cannot see a literal inside a `var()`, and an undeclared custom property is a
  valid identifier, so nothing is malformed. **The first thing the new guard did was
  find FIVE MORE** — `--bnd-accent-wash`, `--bnd-hairline`, `--bnd-radius`,
  `--bnd-surface-2`, `--bnd-surface-3` — across ELEVEN rules of the layout builder in
  `chrome/_settings.scss`, every one of them painted by a FRAPPE variable all along.
- **The quiet failure mode is the one without a fallback.** A `var()` naming an
  undeclared property is Invalid At Computed-Value Time, so the whole declaration
  resolves to `unset` rather than erroring. A misspelt token does not break loudly; it
  silently DELETES the property. That is how a focus ring or a background goes missing.
- **It runs per COMPILED sheet, and that is deliberate.** The desk gets `bunood.css`,
  the auth templates `bunood-web.css`, and they never load together — so "declared
  somewhere in the repo" is the wrong test. Compiled, not authored, because `@use`,
  mixins and nesting must resolve first; item 32's `@include dark` already proved that
  reading the source instead of the output is how a whole block vanishes unnoticed.
- **Its one exception is DERIVED, not listed.** `brand.py` declares tokens at runtime
  that no compiled sheet can contain (the seed palette, the Arabic face, the login
  tagline). `readRuntimeTokens` reads the names out of `brand.py`/`palette.py` and
  throws if it extracts implausibly few — a hand-kept second copy is the
  same-fact-in-two-places trap this repo keeps paying for.
- **The eleven offenders were collapsed to what they already rendered, NOT re-pointed**
  at real tokens. The compiled diff is exactly those eleven lines, which proves the
  no-op. Making them use `--bnd-border`/`--bnd-surface`/`--bnd-brand` is a visible
  change to the layout builder with contrast pairs to fit — a separate decision from
  removing a lie, and recorded in the file as a deliberate deferral.
- **One real change inside it:** `border-radius: var(--bnd-radius, 8px)` became
  `var(--bnd-radius-md)`, so **8px to 6px** on the dashed region placeholder. Collapsing
  it faithfully meant writing a raw `8px`, which breaks "tokens, never raw px" — a
  violation created to remove one. 8px is not on the scale (4/6/10/14), and the element
  nests inside `.bnd-bd-desk`, which already uses `--bnd-radius-lg`.

### The fallback sweep, and the pane-timeout diagnostic (2026-08-22, after the tag)

- **43 DEAD FALLBACKS REMOVED, SIX OF THEM LYING.** Once the phantom guard proves every
  `--bnd-*` is declared, a fallback on a BASE token (one in `_tokens.scss`'s
  unconditional `:root`) can never fire — it is dead code holding a SECOND COPY of the
  token's value, and second copies drift. Six already had: `--bnd-topbar-h` said 48px
  against a real **44px**, `--bnd-bottombar-h` 44px against **40px**, and three radius
  sites said 6px against **4px**. None were rendering — the token always wins — but the
  two heights are exactly CLAUDE.md's "declared reserve vs measured chrome" trap sitting
  in a `var()` waiting for a rename to arm it.
- **THE BOUNDARY IS THE PART THAT MATTERS, and it is not visible in the compiled sheet.**
  A WORKING-SET variable (`--bnd-form-sec-bg`, `--bnd-sb-hue`, `--bnd-rep-row-bg`) is
  also "declared in bunood.css" — but only under a POLE selector, so under `Original`
  the property is genuinely absent and its fallback is what renders. Those ~60 are
  load-bearing and `_form.scss` argues for them. So the new rule tests against
  `_tokens.scss`'s base `:root` specifically, not against everything the sheet declares.
  Verified both ways: reintroducing `var(--bnd-topbar-h, 48px)` fails the build, and the
  working-set fallbacks still pass.
- **Proven a no-op MECHANICALLY, not by eye.** All 42 changed compiled lines were
  re-derived from their originals by the same balanced-paren strip and compared; zero
  differed by anything but the removed fallback.
- **`walkSettingsPanes` NOW NAMES THE PANE IT WAS WAITING ON.** A bare
  `waitForFunction: Timeout 15000ms exceeded` across an eighteen-pane walk cannot tell
  "the bench was too loaded for the xcall to land" from "this nav item has no pane at
  all", and those need opposite responses — it cost a release gate's worth of guessing
  on 2026-08-22. It now reports the key plus `hidden`, `children` and the leading text,
  or `NO PANE ELEMENT` outright. Exercised by forcing the predicate to fail.
- **A THIRD TRANSIENT ON THIS HOST, recorded so the pattern is legible.** A run reported
  `pageerror: frappe.template.compile(...) is not a function` — new across five runs,
  in Frappe's own templating, and unreachable from a CSS-only change. It could NOT be
  isolated the way the other two were: the console budget reads a CUMULATIVE array from
  the shared desk page, so re-running that test alone starts from empty and passes
  vacuously — evidence-shaped and worth nothing. A full re-run returned **340/340** with
  zero hits. Three distinct transients now (connection resets, a pane starved of its
  xcall, this): on this host, read a lone failure in a full run as suspect and re-run
  before believing it — but never by re-running the one test when its state is
  cumulative.

### The layout builder is on the theme's own tokens now (2026-08-22, after the tag)

- **IT WAS THE LAST BLOCK IN THE THEME PAINTED BY SOMEONE ELSE'S VARIABLES.** Fifteen
  sites in `chrome/_settings.scss`'s `.bnd-bd-*` cluster moved to `--bnd-border`,
  `--bnd-page`, `--bnd-ink`, `--bnd-ink-muted`, `--bnd-ink-subtle`. A dead
  `box-shadow: 0 0 0 2px transparent` went too — it named the phantom accent-wash, so
  it had never drawn anything.
- **THE INKS MOVED WITH THE SURFACES, not after them.** Re-pointing a background to a
  theme token while leaving Frappe's ink on it is the half-a-pair mistake that put our
  flipping ink on Frappe's fixed grey at 1.09:1 in the release review. Both or neither.
- **NO NEW CONTRAST ROWS, which is why it was cheap.** `contrast_gate.pairs()` already
  crosses `TEXT_INKS` with `SURFACES`, and both `--bnd-surface` and `--bnd-page` are in
  it — all six ink/surface pairs were being enforced at AA over eleven seeds before this
  touched them. An accent WASH for the armed zone would have been a new token in
  `palette.derive` and a real cost; the armed state stays on its accent border.
- **THE OBVIOUS TOKEN WAS THE WRONG ONE, AND ONLY MEASURING CAUGHT IT.** First pick was
  `--bnd-pane` — the token literally named for a pane, and best of all in LIGHT at 14
  channels. But it is fitted to sit against `--bnd-page`, and here it sits against
  `--bnd-surface`, where it collapses to SIX channels in dark against a floor of five.
  Measured deltas against `--bnd-surface` (light / dark / worst): **page 7/9/7**
  (chosen) · pane 14/6/6 · raised 4/6/4 (would FAIL light) · hover 12/16/12 and active
  25/17/17 (both STATE tokens, not resting fills). Item 32's "copying an expression
  without copying its host" in a new costume — the value was fine, the RELATIONSHIP was
  borrowed wrongly.
- **The bar is `chDelta >= 5`, a CHANNEL delta and never a ratio** — item 22's
  resting-identification rule as the suite states it for the login field. These are
  surfaces against surfaces; a contrast ratio between two near-neighbours has no floor
  anyone can calibrate.
- **THE BUILDER IS IN THE `placement` PANE, NOT `layout`.** Guessing cost a run: the
  shell keeps EVERY pane mounted and hides all but the current one, so
  `waitForSelector(".bnd-bd-desk")` resolved it 33 times as hidden and then timed out.
  The check waits on `state: "visible"`. Watched to fail at exactly 4 channels with
  `--bnd-raised`.

### And three smaller things the review turned up

- **`submitOff` WAS COMPUTED AND NEVER ASSERTED**, off a bare `.btn-forgot`, in the
  button's SHIPPED state — which is `disabled`, i.e. the one state R5 is not about.
  Three recorded traps stacked in one dead line. Deleted, and replaced by a check that
  enables the button the way `login.js` does.
- **`AUTH_CLASSES` AND THE DOCTYPE `options` WERE THE SAME FACT IN TWO PLACES** with
  nothing comparing them. There is no client-side apply on this surface, so that map is
  the ONLY translation from a stored value to a rendered class: rename an option and
  `.get(value, "")` silently yields the empty slug and the kit turns itself off. Now
  compared against the LIVE meta.
- **`registry.py`'s `"Sign in"` IS CORRECT** — the review flagged it as inconsistent with
  the doctype's `"Sign-In Style"`, but every registry label is sentence case ("User
  profile", "Home link", "All apps link", "List view"). Left alone. Recorded so the next
  reader does not re-raise it.

## 2. Waiting on the user

1. **Release.** Item 17 (was 32) is a MINOR by the versioning policy but sits in
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
npm run contrast   # WCAG gate, 1,656 pairs. Needs Python.
npm run deploy     # build + ship to 5 containers + mirror to WSL + restart if hashes moved
npm run verify     # the full browser suite (200). NEVER while deploying.
npm run verify -- --only "container:"   # ~90s inner loop; says FILTERED, never a gate
```

**Deploying mid-suite invalidates the run and produces phantom failures.** It has
happened; do not do it.

---

## 4. Facts that cost time to rediscover

Each of these was worked out more than once. They are written down so nobody
pays for them a third time.

- **`bunood_theme/__init__.py` runs on ANY import of the package, including
  with no Frappe environment at all.** `tools/contrast_gate.py` imports
  `bunood_theme.palette` as plain Python (no bench, no site) — that's the
  whole point of `palette.py`/`contrast.py` being "pure math". Adding an
  unconditional `import frappe` to `__init__.py` (the RTL fix, 2026-08-13)
  crashed it instantly with `ModuleNotFoundError`, caught by the full suite,
  not by the targeted change. Any future `__init__.py` addition that touches
  Frappe needs the same guard already there: check `frappe` is importable
  first, rather than a blanket `except ImportError` around everything — that
  way a genuine bug inside the guarded code still fails loudly in a real
  Frappe environment.
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
- **A plain `docker restart bunood-backend-1` 502s the site until the FRONTEND is also
  restarted.** The backend's IP changes on restart and the frontend's nginx caches the
  upstream, so `localhost:8080` returns 502 while `backend:8000` (internal) answers 404
  (gunicorn up, just no site Host). `docker restart bunood-frontend-1` re-resolves it.
  `npm run deploy` avoids this (it restarts in a way the frontend follows); a hand restart
  does not. Cost a confused "backend is down" chase 2026-08-16.
- **Under memory pressure gunicorn workers get OOM-killed and the master does not always
  respawn them cleanly** — the site 502s with the container still "healthy". Recovery is a
  restart (then a frontend restart, above). The backend runs `GUNICORN_WORKERS=5`, each
  loading all ten apps (~1 GiB total) — the single biggest memory user; stopping the
  `queue-long`/`queue-short`/`scheduler` worker containers frees ~200 MB for a browser
  suite run and is safe (they are background job processors, not needed for HTTP/browser
  tests; RQ counts still come from Redis).
- **Docker Desktop itself can go fully down** (engine gone, both WSL distros stopped) under
  memory pressure — worse than §5's WSL-only case. Recovery: launch `Docker Desktop.exe`,
  wait for the engine, then the empty-mount race still bites (`apps/bunood_theme` mounts
  empty → ModuleNotFoundError) — fix with `docker restart` of the app containers once
  Ubuntu is confirmed up with mirror content. Hit 2026-08-16.
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
- ~~Clicking a slot in the User or Home/All-Apps picker does not repaint that
  picker~~ — CLOSED by item 36's picker audit: both routed through the inbox
  setter, which repainted the inbox picker. Measured with the defect reinstated,
  the selection was still wrong at t+1214ms and corrected at t+3003ms by the
  autosave's own `refresh()` — so a check with a generous timeout passed on the
  defect too, and the check's WINDOW (900ms) is the assertion.
- `tools/fingerprint.mjs` hardcodes an absolute path to one machine
  (`createRequire("C:/Users/saltedfish/...")`), so the documented
  fixture-regeneration command only runs there.

**Older, still true:**

- ~~The sidebar style kit's own 8-preset palette is outside the contrast gate~~
  — CLOSED by 34a slice 2 (`ce6995d`), ink-fitted per pane and enforced, 28
  rows. Item 22 (was 34/34a).
- ~~`--bnd-border` (1.22:1) and `--bnd-border-strong` (1.45:1) are measured and
  deliberately not enforced; whether a control needs a 3:1 resting boundary is
  a per-component question~~ — CLOSED by item 22 (was 34), 2026-08-13, **answered
  as a rule**: a control is identifiable at rest by a border clearing 3:1 **or**
  by a visible fill delta against its host — already written at
  `_navbar.scss:48-50` (the search field, the rule's original case) and matched
  by four more: the diagram slot's dashed hairline plus wash
  (`_settings.scss`), a list row's boundary plus the subject link's ink, a
  Floating Panel's border plus shadow plus title ink (~1.05:1 fill-vs-canvas on
  its own), and Segment Pills' active fill against its 4%-ink track (~1.1:1,
  carried by shadow, ink weight and the AA-passing label). Enforced
  structurally — the pattern applied everywhere it's needed, checked by the
  suite's `a11y: resting controls are identifiable` test — not by re-stepping
  `--bnd-border`, which `_bridge.scss:61-62` would push through every stock
  Frappe control too.
- `--bnd-ink-inverse` has zero in-repo callers. Kept because token names are a
  contract; do not reach for it for a brand fill.
- The first test of a cold stack routinely exceeds a 30s budget because
  `get_status_signals` takes ~5s on its first call. It fails as
  "desk boots authenticated with theme assets" and drags the console-error
  budget down with it. Environmental, recurring, not yet mechanised away.
