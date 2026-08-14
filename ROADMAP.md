# Coverage roadmap — 38 items to v1.0.0

> **Why this file exists.** These 38 items have driven every release since 0.2.0, and
> until 2026-08-03 they lived only in an assistant's per-project memory — invisible to
> everyone else and lost the moment that memory was. `GUIDELINES.md` §2.1 calls that
> governance drift; this file closes it.

**Item numbers are work order, as of 2026-08-13.** Before this date they were identity, not
sequence, assigned by topic (foundation, chrome, surfaces, web, config, quality) — which read
sensibly and sequenced badly, so `CHANGELOG.md` and commit messages cite the OLD numbers for
everything shipped before this date. Renumbering broke those back-references on purpose: the
alternative was staying confused about what's next forever to keep old citations exact. The
mapping below is permanent — it is how an old citation resolves.

**Old → new**, where they differ (items 1–14 are unchanged and are not listed):

| new | item | was |
|---|---|---|
| 15 | List view | 16 |
| 16 | Form view | 18 |
| 17 | Contrast validation | 32 |
| 18 | No-FOUC first paint | 36 |
| 19 | Cache correctness | 37 |
| 20 | Upgrade resilience | 38 |
| 21 | Payload budget | *(shipped unnumbered, from `GUIDELINES.md` §2.5)* |
| 22 | Accessibility | 34 + 34a *(merged — 34a's own slice 2 delivered 34's stated scope; see below)* |
| 23 | Icon system | 33 |
| 24 | Responsive | 35 |
| 25 | Workspace/dashboard landing, charts and number cards | 15 + 20 *(already "deliberately together" — now also numbered together)* |
| 26 | Report view / datatable | 17 |
| 27 | Alternate views | 19 |
| 28 | Overlays | 21 |
| 29 | Empty states | 22 |
| 30 | Skeletons | 23 |
| 31 | Filters + saved views | 24 |
| 32 | Login / signup / forgot | 25 |
| 33 | Website base + portal | 26 |
| 34 | Email templates | 27 |
| 35 | Print formats / PDF | 28 |
| 36 | Settings singleton | 29 |
| 37 | Presets | 30 |
| 38 | Per-user preferences | 31 |

**Worst collisions, called out because the numbers now mean something different**: new 32 is
*login*, old 32 was *contrast validation* (now 17). New 33/34/35 are
*website/email/print*, old 33/34/35 were *icons/accessibility/responsive* (now 23/22/24).
A citation of "item 34" in any commit or `CHANGELOG` entry dated before 2026-08-13 means the
OLD item 34 (accessibility) — check this table, not the number alone.

**Why 34 and 34a merged into one item (22).** 34a was always "item 34, part a" — the letter
suffix existed because item 34's own Phase-3 placement required two real surface callers to
exist first (`GUIDELINES` Part 3: don't freeze an interface before it has two consumers), so a
first slice was pulled forward into Phase 1 wherever no design uncertainty blocked it. That
slice's own second half — "ink-fitting (with numbers) plus enforcement plus scoped axe" — is
*verbatim* item 34's original scope statement ("axe scoped honestly: hard gate on our
components, baseline-diff over Desk pages"), and it shipped in `ce6995d` / `50373ff` before
either item was ever marked `[x]`. Carrying two numbers for one piece of work past the point
where the split stopped meaning anything was the confusion this renumber exists to remove.

**Versioning.** SemVer, pre-1.0. MINOR = an item (or feature set) ships; PATCH = fixes.
**v1.0.0 is reserved for all 38 complete.** Every release is an annotated tag and
`app_version` in `hooks.py` matches the latest tag.

**Working method.** One item at a time, preceded by solutions plus wireframes grounded
in what leading products actually do, then implemented, then verified against three
gates: CI green, smoke suite green, adversarial release review clean.

---

## Why this order

The original numbering was by layer — foundation, chrome, surfaces, web, config, quality —
which is not the order things were built in, either. Work has always followed the reasoning
below; only the item *numbers* lagged behind it until this file caught up.

It defers every **cross-cutting contract** to the end, and those are precisely the items whose
cost grows with each surface already built.

| kind | items (old numbers) | cost of delaying |
|---|---|---|
| **Contracts** | 7, 32, 33, 34, 35 | grows linearly — every surface built first is a surface to retrofit |
| **Surfaces** | 15–28 | roughly flat — a list view costs the same whenever it is built |

Write plural-unsafe strings across ten surfaces and you rewrite ten. Ship ten surfaces
consuming tokens that fail contrast at the default seed and you audit ten. Establish a
focus contract after ten and you retrofit ten.

So: contracts before surfaces — **except** where a contract needs real callers to be
designed correctly. `GUIDELINES.md` Part 3 is explicit that an interface should not be
frozen until it has two. The icon system, the responsive contract and the full
accessibility contract were all in that category, so they were built *after* two
high-traffic surfaces rather than before — which is why item 22 (accessibility) sits
after items 15 and 16 (the two surface kits) in the new numbering, even though its
first slice shipped alongside the other contracts.

The result was five phases, kept below as historical rationale for *why* things landed
when they did. The item numbers no longer follow the phase groups exactly — item 22
folds together work that started in the "cheap now" phase and finished in the "freeze
against real callers" phase — but the phases explain the reasoning, and the table above
is the map from any old phase-relative number to where it lives now.

---

## Phase 0 — in flight: the component rework

Not a numbered item; a restructuring that the numbered items are built on. Desk chrome is
governed three ways at once — a monolithic `desk_layout` preset, per-component
settings, and hard-coded mount branches — and the seam between them produced every
defect in 0.10.0.

- `[x]` **Slice 0** — ownership stamps. A native affordance is hidden only once our
  replacement is stamped present, so a failed mount degrades to stock ERPNext instead
  of deleting the user's Log Out
- `[x]` **Slice 1a** — `build_cluster` split into bell and user; host registry;
  `inbox_placement` / `user_placement`; migration patch writing what each layout
  *rendered*, not what it stored
- `[x]` **Slice 1b** — form width reclaimed (932 → 1210px at 1280), `desk_layout` read-only
- `[x]` **Slice 1c step 1** — picker CSS into the guarded pipeline, shared `P`
  vocabulary, container queries, identity attributes, committed shape fixture.
  **All 7 pickers ported**; two duplicate class vocabularies deleted
- `[x]` **Slice 1c step 2** — master & detail settings form. **It is the settings page**
  as of 2026-08-06; `?shell=0` still reaches the stacked form for any field the shell
  has not placed. It shipped behind `?shell=1` while half-built, which was right then
  and wrong the moment it was finished — the work was invisible behind a query string.
  - `[x]` The shell: grouped left list (Bars & panes / Controls / Appearance, 10
    entries), a detail pane showing one component at a time. It **relocates** the
    sections Frappe built rather than drawing a second surface, so "only one surface
    exists" is a property of the construction rather than a rule to keep. Verified to
    survive a save, a route round-trip and an explicit `frm.refresh()`
  - `[x]` Change dots — `api.get_shipped_defaults` over `setup.SHIPPED` (one named map,
    which `smoke.mjs` and `fingerprint.mjs` now also read instead of each recomposing
    `{**DEFAULTS, **CHECK_DEFAULTS}`). Ownership is by **prefix**, the rule `build.mjs`
    already enforces, so there is no sixth hand-written field list
  - `[x]` Derived note — the side pane's real preset name via the existing
    `bnd_sb_match_preset`; **Default/Changed** for everything else, from the same
    function the dot uses. Deliberately *not* a preset label: only the side pane has a
    catalogue. `crumb_style`/`palette_style`/`inbox_style`/`status_style` are style
    choices that compose with their extras, and no table anywhere says what
    `desk_layout` writes to the component fields — the 0.11.0 patch records what
    0.10.0 *rendered*, which is a migration artefact, not a catalogue
  - `[x]` Doctype repair — `default_density` has its own section. It used to share
    `section_features` with `enable_command_palette`, which made two shell entries
    claim one section: a stranded "Features" heading over nothing, and the density
    control rendered at 636px against every other Select's 273px, having lost the
    `.form-column > form >` chain Frappe caps input width with
  - `[x]` **The zone split.** Bands live **inside the picker output**, not at the
    `.form-section` layer: 59 of the 92 fields are `hidden: 1` and every component
    section holds exactly *one* visible field — its picker — so the controls a user
    touches are not Frappe field wrappers at all. Zoning the form layer would have
    zoned almost nothing, and per-zone Section Breaks would have been permanently
    empty sections (`layout.js` only stamps `empty-section` when the parent is a
    tab-pane or form-page, which a shell pane is not).
    `P.zone` + `bnd_bands()`; each row declares `zone:` on the row that already
    exists, so there is no new table. **Headings appear only where a picker has more
    than one populated band**, computed from what rendered — so `search` (placement
    only) and `layout` stay exactly as they were. Both hand-rolled `__("Extras")`
    groups are deleted. The side pane earns a longer vocabulary —
    Style / Placement / Pane surface / Links & icons / Rail / Extras — because one
    "Style" band over its 20 groups is the wall the split exists to remove. Its filter
    now hides a band once every group in it is filtered out. Fixture regenerated
    deliberately: every delta is a band wrapper, `layout` and `search` unchanged
- `[x]` **Slice 1c step 3** — the shared desk diagram as the placement control, doing
  double duty as the Overview.
  - One desk drawn from one geometry table; a component contributes only the slots it
    can occupy, so the frame and the hit areas cannot drift apart. This replaces
    thumbnails-per-choice: search alone had six hand-drawn miniatures of the same desk,
    and the bell, user menu, home and all-apps would each have needed their own — about
    thirty pictures that all had to stay truthful. **`search_picker` went 63 → 23 nodes
    and 6 SVGs → 1**; `bnd_search_thumb` deleted (grepped to zero callers first)
  - **The bell and the user menu get a placement control at all** — `inbox_placement`
    and `user_placement` had appeared zero times in the settings form since slice 1a
  - The user menu is its own section and its own shell entry, matching `registry.py`,
    which has always called it a separate component — and the one marked `critical`
  - Availability is one function keyed by region (`bnd_region_blocker`), mirroring
    `mount_chrome`. It used to be search's own vocabulary; the bell and user menu would
    have restated it twice more. Warns, never blocks: the runtime falls back either way
  - **Overview**: every placed component on one desk, each mark a route to its control.
    Read-only on purpose — two ways to set one value is the duplication this rework
    exists to remove
- `[~]` **Slice 2** — remaining containers and tenants.
  - `[x]` **Home and All Apps place themselves** *(2026-08-06)*. They shared one
    field, `sidebar_quick_links`, which rode the sidebar STYLE kit — so a preset
    decided where both lived and neither could move alone. Now `home_placement` /
    `apps_placement`, each with its own desk diagram, the two sidebar
    sub-positions preserved as distinct slots, and a migration patch. `build.mjs`
    FIELD_PREFIXES gained `home` and `apps`: that list grows when a component is
    registered, never to make a build pass
  - `[x]` **`status_in_classic` deleted** *(2026-08-06)*. The bar was a consequence
    of the LAYOUT — four layouts mounted it, Classic did not, so Classic needed an
    opt-in. It is a component now: `status_style` decides and the layout has no
    opinion, which is one call correct for all five layouts because
    `mount_statusbar` already returns early on "Off". The per-layout override was
    the second place the same fact lived. A patch preserves what each site SEES —
    `status_style: "Off"` for a Classic site that had not opted in — and the
    honest cost is written down: that site switching to Top Bar later will find
    the bar off, which is what deleting a per-layout override means
  - `[x]` **The container split** *(complete 2026-08-07)* — each container with its own on/off instead of
    `desk_layout` choosing. **Touches `mount_chrome`**, where every critical
    defect in this project has lived. The ownership-stamp rule is the thing to
    keep in front of you. **One container per slice, invariant matrix green
    between each.**
    - **Five, not four.** `pagehead` is registered as a container too: Compact's
      only distinguishing act is injecting the cluster that MAKES the pagehead
      region exist, so leaving it out would have left `desk_layout` still
      deciding one thing — and a layout that still decides cannot have a derived
      "Custom" label
    - **`registry.LAYOUT_CHROME` is the catalogue**, authored complete with the
      first slice and consumed one column at a time. It is what finally makes
      the derived label possible; it is *not* `patches/v0_11_0/chrome_placement`,
      which records what 0.10.0 **rendered**. The two deliberately disagree —
      Classic writes no bottom bar, while a Classic site that had opted into the
      status bar keeps it until the layout is picked again
    - **Every container off at once** is answered by the rule already in force
      for tenants: a control may be removed only while something else can still
      reach the same function. So it is refused at the last container — the side
      pane's off is honoured only while a mounted container can host the
      critical tenants. One guard derived from `critical`, not five special cases
    - `[x]` **1 · Top bar** *(2026-08-07)*. `topbar_enabled`; three `_layouts.scss`
      rules re-keyed from `data-bnd-layout="topbar"` to `data-bnd-topbar`, the
      OUTCOME — which was already wrong before the split, since `mount_topbar`
      returns early on every viewport under ~480px and those desks were reserving
      space for a bar that never arrived
    - `[x]` **2 · Page header** *(2026-08-07)*. `pagehead_enabled` replaces
      `slug === "compact"` at BOTH call sites — the mount and the route-change
      handler. The only container that remounts per navigation, so it is the
      only one where "off" could undo itself on the next click
    - `[x]` **3 · Dock, and the side pane with it** *(2026-08-07)*. `dock_enabled`
      and `sidebar_enabled`. **They had to land together**: the dock hid the pane
      from `data-bnd-layout="dock"`, so the moment the dock became switchable
      something else had to say whether the pane was shown — split across two
      slices, every Dock site would have grown a pane on upgrade in between.
      Containers are independent, so a dock and a side pane coexist if both are
      on. **Every container off is now reachable**, and `guard_critical_reach`
      refuses it: the pane comes back when nothing else can reach what
      `registry.CRITICAL` names. The critical selectors travel in boot rather
      than becoming a fourth hand-written copy
    - `[x]` **4 · Bottom bar, and `desk_layout` stops deciding** *(2026-08-07)*.
      `bottombar_enabled` owns whether the strip exists; `status_style` lost
      "Off" and governs only content. `global_variant` and `.bnd-bottombar` are
      gone — the bar's size follows what it CONTAINS, generalising a rule that
      already existed for search alone. `mount_chrome` is five lines, none of
      which reads the layout. The catalogue gained the tenant placements too,
      because `desk_layout`'s own description promises "where global search,
      notifications and your profile live" and the preset was writing none of it
    - `[x]` **The derived label** — `bnd_match_layout` reads the layout's name by
      COMPARING the container values against `LAYOUT_CHROME`, and says "Custom"
      the moment one differs. This is what the catalogue was authored for: the
      side pane's picker has worked this way since item 10, and the layout was
      the last preset without it
    - `[x]` **5 · Side pane** — landed with the dock, above, for the reason
      given there. `desk_layout` stops deciding once the bottom bar follows
  - `[x]` **Honest-picker rules across every component** *(2026-08-07)*.
    `bnd_component_blocker` is the counterpart to `bnd_region_blocker`: that one
    answers "can a tenant go HERE", this one "does any of this matter right
    now". Three of the five findings were runtime lies rather than silent
    pickers — `"Dock"` fell through to the sidebar, links placed in a bar needed
    the side pane, and `registry.py` named the wrong element for BOTH link
    components. ~~The notifications panel's position is the one finding left
    open~~ — closed with E1 (`data-bnd-bell`, stamped from the mount's outcome)
  - `[x]` **E1 · One slot vocabulary** *(2026-08-08)*. Every placement is
    "<Region> Start|Center|End" derived from `registry.slots_for`; the side pane
    honestly offers two zones; a component offers only the zones its runtime
    implements. The migration maps each old value to what it MEASURABLY
    rendered; `heal_unknown_placements` runs on every migrate forever, because
    one un-offered Select value on a Single silently fails every later save of
    the whole document (measured: six unrelated tests red)
  - `[x]` **E2 · The desk is the form** *(2026-08-08)*. The placement board —
    one desk drawn big, every control a chip where it is, drag OR
    click-to-pick/click-to-drop, both ending in the same `drop_on`. Zones read
    from the field's own options, so the board cannot offer what a field
    refuses. Suite: `board:` tests
  - `[x]` **E3 · Order within a zone** *(2026-08-09)*. `desk_order` (the build
    guard's naming rule renamed it from the planned `chrome_order`, and was
    right to): one hidden field, tenant keys in desk order, seeded from the
    registry and suite-pinned to it. The runtime is a DOM sort pass after the
    mounts — idempotent, listener-safe, tolerant of stale strings, so no
    migration. The quick links joined the cluster zones on the way (they
    mounted at the bar's literal firstChild — one visual place, two
    containers, no expressible order). The board is the only control: chips
    render in desk order, drop ON a chip means before it, drop on blank zone
    means after its chips

---

## The 38 items, in the order we work them

Items 1–14 are unchanged from before the renumber and are all done: 1 tokens · 2 Frappe
bridge · 3 light/dark/automatic · 4 density · 5 type scale · 6 motion · 7 RTL &
internationalisation · 8 print · 9 layouts · 10 sidebar kit · 11 breadcrumbs · 12 command
palette · 13 notification centre · 14 status bar + search placement.

Full detail on the two most recent (7, and the two surface kits) is kept below, since it's
long and still worth having on hand. Item 7 in particular reopened once already — see its
entry.

- `[x]` **7 · RTL & internationalisation** — *reopened 2026-08-01, done 2026-08-09.*
  0.2.1 had shipped direction only; the reopened item closed as a MECHANISM — the
  catalogue is derived every build (`tools/i18n.mjs` ports Frappe's doctype
  extractor; the JS/PY halves refuse on under-extraction), so no count in this
  file can go stale again ("356 strings" was hand-counted; the derived number
  was 704).
  - **(a)** closed by `_cursive.scss` (language-scoped tracking reset, raised
    line-height) plus a build guard: no `letter-spacing` other than normal/0
    survives to compiled CSS. The clock pins Western numerals everywhere — the
    user's decision, made once.
  - **(b)** closed by `arabic_font` — four self-hosted faces + System,
    unicode-range `@font-face`, per-face line-height; `typography.py` is the one
    table and a build guard keeps FACES, the Select options and the shipped
    woff2 files identical.
  - **(c)** closed by the plural guard: count-governed strings are refused at
    build with an EMPTY exceptions map — the fix is reshaping to label+value,
    never translation.
  - **(d)** closed by `locale/ar.po` as the decisions file — 649 rows filled,
    bulk-approved (c89d0ae) — emitting `translations/ar.csv`; 48 strings
    inherited by omission from other apps' POs (generated ledger, REJECT map for
    false friends), 8 exempt with shrink-enforced reasons. The merge-order
    inversion (3rd of 10 apps) is defended by `_defend_identity_overrides` at
    the file layer.
  - **(e)** closed twice: the build coverage gate, and runtime — the merged dict
    serves every decision none-as-itself, and no visible theme-owned label
    equals its msgid across four surfaces. Direction was detect-and-refuse
    with a CLDR cross-check through 2026-08-09; **corrected locally 2026-08-13**
    (`bunood_theme/i18n/rtl_patch.py`) — see the HANDOVER entry for the full
    mechanism and its one accepted gap (print/PDF). `ku` stays out of
    `RTL_LANGS` (Latin-script per CLDR); the upstream `is_rtl` fix is drafted
    in `docs/upstream/frappe-is-rtl.md`, filing still waits on the user — the
    local fix removes the URGENCY, not the reason: upstream is the only route
    that also reaches print/PDF.
  - Beyond scope, at the user's direction: the **Translations surface** in Theme
    Settings — scan ledger over every installed app, provider runs as
    spend-capped proposals, export/import, manual save. A live provider run
    waits on a real key. Run at full scale 2026-08-13 (see `HANDOVER.md`): 6,983
    missing strings across all 10 apps translated and merged, missing count down
    to 262 verified non-linguistic. Surfaced and fixed two pre-existing data-loss
    defects in `import_translations_csv`/`upsert_translation` (whitespace-bearing
    sources silently corrupted; MariaDB case-insensitive collation silently
    merged translations across case) — `484b814`, each pinned by a suite test.

- `[x]` **15 · List view** *(was 16, done 2026-08-10)* — Rows, hover, selection, bulk
  bar, as the first SURFACE kit: attributes over Frappe's own DOM, nothing
  mounted, absent attributes ARE the stand-down. Wireframed and picked
  2026-08-09 (five style options after the market-survey round): **1C Floating
  Cards · 2B Edge Rail · 3C Bold Bar · 4A reveal-on-hover**, Open Rows joining
  from the survey; the floating selection bar (Linear/Attio) is DEFERRED with
  its `list_selection` slot reserved. On-screen tabular numerals landed with
  it; the density rules migrated in from `_density.scss` per its lifecycle
  note, proven a move by a baseline test written first. Phase-3 evidence: the
  picker is the sprite's second caller (23), the reveal's `:focus-within` path
  and the 3B judgements are recorded (22), the `(hover: none)` stand-down is
  the narrow-input statement (24). References: frappe-ui ListRow/SelectBanner,
  Directus tabular + `_list-interface.scss`, Discourse `_topic-list.scss`.

- `[x]` **16 · Form view** *(was 18, done 2026-08-10)* — Sections, tabs, child grids and
  the form sidebar, as the second SURFACE kit — the same construction as 15,
  which is the point: the anatomy was replicated, not reinvented. Probed live
  BEFORE designing (Frappe 16.27.0, an Item with tabs and a child table), then
  wireframed and picked: **1C Floating Panels · 2C Solid Pill · 3C Floating
  Pane · 4A reveal-on-hover**, the bolder option each time. Three fusions carry
  the design: sections, the child grid's frame and the connections dashboard
  are ONE container statement (the anchor), so a style cannot ship a floating
  section beside a naked grid; the tab BAR rides the canvas while only the
  MARKER is an axis; the sidebar is styling-only — no Off, because attachments
  and assignments must stay reachable. `--bnd-control-h` finally got its
  consumer, which let `_density.scss` retire exactly as its lifecycle note
  promised (proven pure by a byte-identical stylesheet). The family found two
  real defects, both the same lesson — upstream owns `.form-page` at (0,3,0)
  and every tab link at (0,4,0), so the kit's shorter selectors lost the
  cascade outright: measure the selector you are overriding. Phase-3 evidence:
  the picker is the sprite's third caller (23), the active tab's fill+shape
  and 2px width channels are the never-colour-alone statement and the grid
  reveal's `:focus-within`/any-checked doors are recorded (22), the
  `(hover: none)` stand-down repeats (24). Axe honesty: the new form route's
  baseline was scanned with the kit ON and with `Original`, identical counts —
  all six contrast failures are upstream's own `#999999` help text, so the kit
  banks none of its own. References: Salesforce record panels + shadcn Card
  (Floating Panels), Odoo's document sheet (Paper Sheet), Directus item detail
  (Hairline Panels, Quiet Pane), Linear/Notion (Open Canvas), Material 3 +
  Gmail (Solid Pill), iOS segmented + shadcn Tabs (Segment Pills).

- `[x]` **17 · Contrast validation** *(was 32, done 2026-08-06)* — Target stated (WCAG
  2.2 AA); the brand split into three roles so the seed contributes hue and the
  system controls lightness; inks fitted per tenant against the surfaces that
  seed produces, because seed-tinted surfaces mean no fixed value can pass for
  every seed (`ink-subtle` failed 96 of 96 placements). `npm run contrast`
  recomputes the full pair set over 11 seeds × 2 modes plus the no-brand-sheet
  fallback, in CI; the smoke suite ties it to rendered pixels. Nothing is ever
  rejected — Theme Settings reports what it adjusted. See `GUIDELINES.md` §2.2
  "RESOLVED". Two things it handed to item 22: (a) whether a control whose
  resting boundary is a 1.22:1 hairline is identifiable at all — a
  per-component judgement, not a token value; (b) the sidebar style kit's own
  8-preset palette, which was outside the contrast gate at the time. Both are
  now answered — see item 22.

- `[x]` **18 · No-FOUC first paint** *(was 36)*
- `[x]` **19 · Cache correctness** *(was 37)*
- `[x]` **20 · Upgrade resilience** *(was 38)*

- `[x]` **21 · Payload budget** *(shipped unnumbered, from `GUIDELINES.md` §2.5; done
  2026-08-09)* — The first measurement ever taken showed the drift the item predicted:
  78/183 KB raw had become 92/247 across five releases with nobody deciding it.
  `payload-budget.json` holds the ledger and the gzip ceilings (~15% over v0.12.0);
  `tools/payload.mjs` measures, checks and records; the suite enforces the ceiling on
  every verify, and the release chain appends a history row at tag time. The ceiling
  failing is the process working — raising it is one edit in the same commit as the
  growth, with the why in the message. Its own `--check` joins `build.mjs`'s other
  guards as of item 22, commit 1.

- `[x]` **22 · Accessibility** *(was 34 + 34a, done 2026-08-13)* — closed in eleven
  commits (the renumber, then ten): the payload and motion-primitive guards joined
  `build.mjs`; the sidebar's active-item pill stopped painting a category hue as a fill
  under a label; the avatar menu gained a full focus/keyboard contract other callers
  now share; the placement board split "which zone" (an honest menu) from "what order"
  (the nudge arrows, unchanged) and gained a live region; landmarks, `aria-current` and
  `aria-haspopup` are asserted; breadcrumbs and the inbox's filter row joined the
  audited surface; the settings surface joined the axe hard gate; and
  `assertRingCoverage` closed the last hole — every control this app's own JS builds
  now has a checked `:focus-visible` rule. See `CHANGELOG.md`'s `[Unreleased]` section
  for the full account.

  **What 34a slice 1 built** (2026-08-09, `4535c51`, on the `a11y-34a` worktree branch,
  merged): nine suite contracts (`a11y:` family), ARIA across every kit — menu triggers,
  landmarks (partial), the palette's dialog/combobox/listbox structure, the inbox panel's
  focus contract, the settings shell's real tablist with roving tabindex, switch/option
  states, the placement board's `role="button"` zones plus a keyboard nudge bar, the skip
  link. Design pick 1A (nudge bar over an arrow-key zone model).

  **What 34a slice 2 built** (2026-08-09, `ce6995d` / `50373ff` / `e2a4926` / `8678e2a`,
  all merged before item 34 was ever marked `[x]` — the reason the two items merge):
  the sidebar kit's palette ink-fitted per pane and held there by the gate (28 rows,
  ENFORCED — every global `--bnd-cat-N` hue had failed AA on at least one of the four
  panes, hue 4 at 1.97:1); axe scoped honestly — a hard gate on our chrome roots
  (`OURS`), a baseline-diff over Desk pages so only NEW violations fail
  (`tools/axe-baseline.mjs`, `tests/fixtures/axe-baseline.json`); Escape-consumption
  fixes for the palette and inbox; the bell's accessible name handled by identity
  (`data-bnd-part`) once it became state-dependent. Suite reported green at 156/156.

  **What was found still open, verifying "what's left" for this item** (2026-08-13):
  a live WCAG failure on the SHIPPED DEFAULT preset — the sidebar's active-item pill
  paints a category hue as a FILL under a label, when every one of those hues was fitted
  to be INK on a pane. Match Theme + Solid Pill at seed `#7f7f7f` (already a gate seed)
  measures 2.08:1; Dark Contrast + Solid Pill measures 2.17–2.40:1 across all seven
  hues; the brand pane with the wash off measures 1.00:1 (the raw seed under
  brand-solid — the same colour twice). Design answer, grounded in `_reference/`: no
  vendored product (Discourse, shadcn/ui, frappe-ui, Directus) puts a label on a
  category-coloured fill — the hue keeps exactly one role (text and marks), the pill
  is always the brand pair. Also found: the placement board's drop zones are
  `role="button"` containing chip `<button>`s (a `nested-interactive` violation — the
  chips that ARE the components can be flattened away in the accessibility tree); the
  avatar menu (`.bnd-menu`) is body-appended, outside every axe root, with no focus
  contract despite carrying Log Out; several ARIA promises made in slice 1
  (`aria-current`, `role="navigation"` landmarks, `aria-haspopup`) have never been
  asserted; the inbox's filter row promises a tablist it cannot deliver (its panel is
  a listbox); the settings surface itself was never brought into the axe hard gate; a
  documented invariant ("nothing hardcodes a duration") was already false in three
  places; and 15+ controls this app's own JS builds have no `:focus-visible` rule at
  all. `CHANGELOG.md` carries zero accessibility entries for any of the above — this
  item's last commit closes that too.

  Answers the resting-boundary question item 17 handed off: **a control is
  identifiable at rest by a border with ≥3:1 contrast OR by a visible fill delta
  against its host** — already written at `_navbar.scss:48-50`, enforced
  structurally (a design pattern applied everywhere it's needed, checked by the
  suite's `a11y: resting controls are identifiable` test) rather than by raising
  `--bnd-border`, which would repaint every stock Frappe control via
  `_bridge.scss:61-62`.

- `[~]` **23 · Icon system** *(was 33)* — REFRAMED and largely shipped 2026-08-13. The
  original scope was "an SVG sprite via `app_include_icons`". Investigation found the
  desk already loads five sprites (2,085 symbols, no collisions), so the coverage problem
  the item assumed does not exist — the real work was elsewhere, and this delivered it:
  - **Defects** (all live in v0.14.0): the 8×15 chip squash (a specificity loss to
    Frappe, plus a test-coverage gap — nothing measured a rendered box); icons brought
    into the token pipeline (`--icon-stroke` was on Frappe's greys); `sprite_icon`'s
    es-icon polarity (the inbox arrow rendered hollow); a guarded workspace-id helper;
    dead sprite ids.
  - **The engine**: inference moved to the SERVER (`bunood_theme/icons.py`,
    `extend_bootinfo`), keyed on the untranslated `link_to`, so every link gets a
    title-derived icon that resolves IDENTICALLY in Arabic — the old client engine drew
    0 icons in Arabic against 35 in English. Verified by a live parity smoke test. Uses
    a shipped sprite-id manifest to verify every emitted id; `sb_fix_icons` deleted.
  - **The consolidation**: one Icons section (an axis, beside Colours/Density). Four
    fields renamed in from the sidebar and breadcrumb kits via a `v0_15_0` migration; the
    eight sidebar presets no longer write icons. A card picker with a live specimen, and
    the one new axis — `icon_weight` (normalised stroke, the thing the mixed grids broke).
  - **DEFERRED** (the user's explicit scope call, 2026-08-13): `icon_set` (a Lucide↔Tabler
    switcher) and `icon_fill` (outline↔filled). Both need a shipped Tabler subset sprite
    via `app_include_icons` — which is where the item's ORIGINAL sprite-interface scope
    finally lands. That is the slice that closes this item. The stale `theme_settings.js`
    "second real caller" comment was retired when `sprite_icon` was reworked.

- `[~]` **24 · Responsive** *(was 35)* — including a mobile navigation mode. *Known
  defect, re-diagnosed 2026-08-14 against Frappe v16.27 (the old text said "~480px …
  Frappe renders no `.main-section > header`" — both halves were wrong):* Frappe renders
  the empty `<header>` at every width (`desk.html:38`), then `toolbar.js:9-21` REPLACES
  it whenever `frappe.is_mobile()` (`innerWidth < 768`) — or read_only, or impersonation,
  or an announcement widget, three triggers that fire on a full-size desk too. So
  `mount_topbar`'s `.main-section > header` query misses, the top-bar cluster does not
  mount, and below **768px** (not 480) the bell and avatar are unreachable — present only
  as Frappe's native affordances, zero-boxed inside the collapsed (`width:0`) sidebar.
  Measured on workspace/list/form/settings: search survives (its fallback chain), bell
  and user do not. It is a boot-time decision — nothing re-evaluates on resize. Being
  worked in four gated slices (A measure+record · B breakpoint vocabulary+guard ·
  C mobile nav, derived from `NARROW_CHROME` · D surfaces+settings+zoom lock)

- `[ ]` **25 · Workspace/dashboard landing with charts and number cards** *(was 15 + 20,
  already numbered together — the two were "deliberately together" from the start: a
  dashboard without its cards is half a feature, and doing them apart means designing
  the same grid twice)* — Charts need a validated categorical palette and recessive
  gridlines. Note for whoever designs the palette: item 22 established that a
  categorical hue should keep one role (text/marks), never a fill under a label — the
  same rule likely applies to chart series labels vs. chart fills.

- `[ ]` **26 · Report view / datatable** *(was 17)* — sticky headers, tabular numerals,
  grouping
- `[ ]` **27 · Alternate views** *(was 19)* — kanban, calendar, gantt, gallery
- `[ ]` **28 · Overlays** *(was 21)* — modals, dropdowns, toasts
- `[ ]` **29 · Empty states** *(was 22)* — an action, not a zero
- `[ ]` **30 · Skeletons** *(was 23)* — loading that does not reflow
- `[ ]` **31 · Filters + saved views** *(was 24)*

- `[ ]` **32 · Login / signup / forgot** *(was 25)* — separate sheet; Frappe's login
  bundle loads after ours
- `[ ]` **33 · Website base + portal** *(was 26)*
- `[ ]` **34 · Email templates** *(was 27)*
- `[ ]` **35 · Print formats / PDF** *(was 28)*
- `[~]` **36 · Settings singleton** *(was 29)* — brand, logo, favicon exist; being
  restructured by phase 0 and effectively completed by it
- `[~]` **37 · Presets** *(was 30)* — sidebar preset system shipped in 0.5.0; remaining:
  colour-palette seeds per preset, more palettes. Blocked on 17 — a preset that ships
  an illegible seed is worse than no preset
- `[ ]` **38 · Per-user preferences** *(was 31)* — via `User.desk_theme`, never a parallel
  localStorage

---

## Open, unnumbered threads

Carried forward regardless of the renumber — neither is one of the 38.

- **The honest-picker audit.** `bnd_region_blocker` covers placement; the rest was
  unaudited as of the 2026-08-06/07 review. Item 22 closes several concrete findings
  from it (the board's ARIA role, the menu's focus contract); what remains is a
  systematic pass, not yet scheduled.
- **The floating selection bar**, deferred from item 15 (list view): frappe-ui
  ListSelectBanner precedent, ~2 KB injected JS, must respect `--bnd-bottom-reserve`.
  A fourth `list_selection` option slot is reserved so the field doesn't churn. Not a
  surface by the registry's definition, since it injects chrome — which is why both
  surface kits left it alone.

---

## The settings architecture phase 0 is building toward

Wireframed 2026-08-02, chosen from eighteen concepts. Master & detail: a grouped left
list, a detail pane with three zones — placement via a **shared desk diagram**, style
via thumbnail cards, extras as switches — presets that *write values and then stop
existing*, and an active-preset label derived by comparison, so it reads "Custom" the
moment anything differs. The diagram is one asset reused per component rather than
~30 per-placement thumbnails that would each have to stay truthful.
