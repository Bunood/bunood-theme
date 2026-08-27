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
    mechanism; its one accepted gap (print/PDF) was CLOSED structurally by
    item 35 (2026-08-26) — the printview context branch + the last-wins
    `pdf_header_html`/`pdf_footer_html` hooks; WeasyPrint and the four-code
    list itself remain upstream-only. `ku` stays out of
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

- `[x]` **24 · Responsive** *(was 35, done 2026-08-16)* — a mobile navigation mode, and
  the known defect fixed at its real cause. *The defect was re-diagnosed against Frappe
  v16.27 (the old text said "~480px … Frappe renders no `.main-section > header`" — both
  halves were wrong):* Frappe renders the empty `<header>` at every width (`desk.html:38`),
  then `toolbar.js:9-21` REPLACES it whenever `frappe.is_mobile()` (`innerWidth < 768`) —
  or read_only, impersonation, or an announcement widget, three that fire on a full-size
  desk too. So the boundary is **768px, not 480**, and below it the bell and avatar were
  unreachable (zero-boxed in Frappe's collapsed sidebar). Delivered in seven gated slices:
  - **A** — corrected the phantom in the three places that carried it; the `responsive:`
    suite family pins the real 768 boundary.
  - **B** — one breakpoint vocabulary (`_breakpoints.scss`, viewport = Frappe's own
    `$grid-breakpoints`, a separate named container scale) behind a build guard
    (`assertBreakpointVocabulary`, parsed from the SCSS so it cannot drift).
  - **C1/C2** — the mobile nav, DERIVED from `registry.NARROW_CHROME`/`NARROW_PLACEMENT`
    and APPLIED-NEVER-PERSISTED (a resize is not a gesture); `matchMedia` remounts on the
    threshold. Below 768 the desk collapses to a full-width bottom bar carrying search (an
    icon that opens the palette), alerts, you and All Apps — the tenants Frappe buries;
    workspaces stay on Frappe's own menu. Three toggles choose the contents; search has no
    toggle, being the only search on a phone.
  - **D** — the side pane collapses to Frappe's drawer (our kit had pinned an inline width
    that squeezed the desk to a strip); pinch-zoom restored (`repair_viewport_meta`, the
    one sanctioned touch of Frappe DOM); touch targets clear 24px on a coarse pointer;
    the translations table stacks on a phone; a scoped axe scan gates the mobile nav at
    390. `100vh` kept over `dvh` and the `bnd_region_blocker` below-768 case left as moot,
    both documented decisions.

- `[x]` **25 · Workspace/dashboard landing with charts and number cards** *(was 15 + 20,
  done 2026-08-16)* — Five gated slices: the chart series palette, its runtime, the
  chart frame, the workspace tile kit, and the number card. Wireframed and picked
  first (artifact recorded in the plan): **1C Hairline Grid · 2B Display Metric · 3E
  Filled Area · 4C Edge Rail · reveal on**; all options ship, these are the defaults.
  - **The series palette is DERIVED, not eyeballed.** `palette.series_ramp` (Paul
    Tol's muted scheme, lightness-fitted per mode, brand-independent) lands in
    `derive()` beside every other token; `--bnd-series-*`, a family separate from
    `--bnd-cat-*` because a series index is the very index-cycle the categorical hues
    forbid. `contrast.py` gained CIELAB, CIEDE2000 (pinned to Sharma-Wu-Dalal) and a
    Machado-2009 colour-vision sim; the gate enforces marks at 1.4.11's 3:1 across 11
    seeds and `check_series_separation` holds the worst pair ≥ 6.0 over the common
    CVDs (measured light 9.16 / dark 6.90; frappe's own default 4.1 is rejected).
    The answer to item 22's note: a chart series colour is a MARK, never a fill under
    a label, so it keeps the one role — verified against `_reference/`, no vendored
    product labels a category-coloured fill.
  - **Charts are themed through one `frappe.Chart` wrap** (all seven v16 call sites);
    the frame through frappe-charts' own `--charts-*` variables (recessive gridlines,
    themed tooltip, the 2px/5px discontinuity removed), with `chart_grid` choosing
    the weight (Filled Area default). Admin per-chart colours kept; a theme flip
    repaints in place via a MutationObserver.
  - **The workspace tile kit** (`workspace_style`) styles both the workspace and
    Dashboard routes — Hairline Grid's gapless board is a shadow ring, stood down in
    `.edit-mode` so it never clips editor.js's gutter controls. `workspace_rows` and
    `workspace_menu_reveal` complete the frame; `workspace_metric` the number card's
    figure, with tabular numerals and the delta re-tokenised, guarded against an
    admin-coloured card (`:not([style*="background"])`). Phase-3 evidence: charts are
    the token pipeline's newest consumer, and the `(hover: none)` reveal stand-down
    repeats item 24's narrow-input statement a fourth time.

- `[x]` **26 · Report view / datatable** *(was 17, done 2026-08-17)* — the fourth
  SURFACE kit, over frappe-datatable. Six gated slices. What the surface taught, which
  reshaped the roadmap's three named goals:
  - **"Sticky headers" was already solved; the boundary was not.** `.dt-header` is a
    sibling of the scroll box (never scrolls away), but stock draws NO boundary and the
    fills are ~1.5% apart — invisible AS a header. So the anchor `report_style` ships five
    styles (Original · Ruled Grid · Ledger Rows · Open Sheet · **Pinned Slab**, the default:
    a filled, elevated header slab with a border). The header fill is painted three ways
    (vendor var + `.dt-row-header` (0,3,0) + `.dt-cell--header .dt-cell__content` (0,4,0)),
    so the kit re-points the var AND beats both — the content box reached at (0,4,1).
  - **"Tabular numerals" was a defect fix, not an axis.** Frappe sets `tnum` on body cells
    only, in the `font-feature-settings` form `getComputedStyle` can't see — the header and
    total rows (where money lands) were excluded. One `font-variant-numeric` rule on every
    `.dt-cell__content` fixes both; it rides the anchor (Original stays stock).
  - **"Grouping" had nothing to bind to** (Frappe's group-by is a query control, no DOM
    key). Deferred (band → item 27, control → item 31); what ships is `report_grain` (Row
    Stripes), which does for the eye what grouping would. Its coupling — odd row pitch,
    even scroll-padding — is validated at page length 100 against real HyperList
    virtualisation, not the default 20 where `:nth-child` would lie.
  - Also: `report_rows` (hover+selection fused); a route-gated checkbox reveal; the focus
    ring lifted OUT of the anchor as a contract (`GUIDELINES.md`); the live `100vh` reserve
    collision fixed (slice 1, correcting `ARCHITECTURE.md`); the query-report `.report-summary`
    taken from the workspace kit by ancestor. No payload ceiling raise (the picker is doctype
    JS, not the bundle). `docs/upstream/frappe-datatable-rtl.md` drafted (physical positioning,
    no app-level fix). References: Directus `v-table`, shadcn `ui/table`, Discourse
    `admin_report_table`.
- `[x]` **27 · Alternate views** *(was 19, done 2026-08-18)* — kanban, calendar, gantt and
  gallery, the fifth SURFACE kit and the first over FOUR vendors at once. ONE anchor
  (`views_style`, Floating Cards default) dresses the kanban card, gallery tile and calendar chip
  as the same object drawn three ways; the gantt is a data mark, not a card, so it takes the repair
  and no style of its own. Five gated slices. What the four vendors taught:
  - **Each view has a different themability story, and two hide their colour inline.** Kanban is
    Frappe's own DOM (the column tint is an inline `var(--bg-{indicator})`, re-pointed for `Plain`);
    calendar is **FullCalendar 6** (30 `--fc-*` chrome vars re-pointed on `.fc`, and its own
    `!important` border/ink rules beaten by re-pointing the `--gray-300`/`--text-light` they READ,
    scoped to `.fc` — not by out-specifying); gantt is **frappe-gantt** pure SVG (won on
    specificity over a sheet loaded after ours); gallery is a `.frappe-list` variant.
  - **The gantt was a repair before a style** — stock paints `.bar`/`.grid-row`/`.grid-header`
    literal white, invisible on a dark page. Re-tokenised on the SVG, with an admin per-task colour
    carved out (`:not([class*="color-"])`), the item-25 law for admin data.
  - **The calendar's event colour is inline JS (`prepare_colors`) — item 25's chart-series problem
    exactly**, so the same answer: wrap the one funnel. A default event is re-hued to `--bnd-accent`,
    a category/admin colour kept; the `views_mark` axis (Dot · Chip · Outlined) reshapes the same
    hue. `frappe.ui.color_map` is snapshotted once, so a `data-theme` observer recomputes it and
    `refetchEvents()` — the flip re-colours events.
  - **Two axes forced from three to two by measurement, not preference.** `views_band` dropped
    "Headed" (an inline column colour can be nulled OR moved to a header, never both, from one var);
    the report_grain 4→2 precedent. Phase-3 evidence: the calendar wrap is the token pipeline's
    newest consumer, the `(hover: none)` reveal repeats item 24's narrow-input statement a fifth
    time, and the focus ring lifts out of the anchor as a contract. Also landed:
    `assertFieldMirrors` (the build guard HANDOVER wanted since the escapee bit items 25 and 26),
    the fixtures tool (`tools/fixtures-views.mjs`), and two free fixes (the full-complement test's
    missing `list_picker`/`report_picker`, `fingerprint.mjs`'s hardcoded path). References:
    Directus `layouts/kanban` + `styles/lib/_fullcalendar.scss` + `layouts/cards`, frappe-ui
    `Calendar` and `ListGroupHeader` (item 26's banked grouping precedent). Upstream:
    `docs/upstream/frappe-gantt-geometry.md` (bar geometry, Sortable animation, gantt RTL).
- `[x]` **28 · Overlays** *(was 21, done 2026-08-19)* — dialogs, dropdowns and toasts, the
  SIXTH surface kit and the first that is on EVERY page rather than on one route. Five gated
  slices. Three fields (`overlay_style` anchor · `overlay_scrim` · `overlay_menu`) — the
  smallest set any surface kit has shipped, because this kit's weight is in nine measured
  repairs, not in its choices. What the surface taught:
  - **The desk's floating objects are ONE family, and nobody had written that down.** The
    census found 23 of them and, more importantly, that **three were already owned** — item 25
    paints `.graph-svg-tip`, item 27 the gantt popup and the calendar grid. A kit claiming
    "every overlay" walks straight into the same-fact-in-two-places trap, so ownership was
    settled per object before a line was written. It also corrected a false comment in
    `_charts.scss` (the chart tooltip is *container*-appended, not body-appended — the comment
    said the opposite, and a body-appended node could neither inherit the container's custom
    properties nor be matched by the descendant selector that was working).
  - **"Original" had to mean something different here, and that is the item's real decision.**
    Item 27's rule — *"Original renders as stock, warts and all"* — is right for one opt-in
    route and wrong for a surface on every page: three of the nine failures are measured WCAG
    AA failures, on the page where the setting is chosen. So the repairs are CONTRACTS scoped
    `html[data-theme]` and survive the stand-down; only the style is anchored. Precedent
    existed three times over (`_list` density, `_report` focus ring, `_views` focus ring).
  - **Frappe is RTL-correct by a build-time rtlcss pass; we are by logical properties; the two
    DO NOT COMPOSE.** A rule setting only `inset-inline-end` lands on the same physical side as
    the vendor's flipped rule in one direction and the opposite in the other, and physical and
    logical declarations do not overwrite each other — so the element ends up pinned on both
    sides. New doctrine in `GUIDELINES.md` §1.3: set BOTH logical sides, one to a value and one
    to `auto`.
  - **The central obstacle was a theming hook overridden above the hook.**
    `desk/dark.scss:189` sets `--border-color`/`--control-bg` at (0,2,0) on `.modal` AND
    `.form-in-grid`, beating any app's `html[data-theme="dark"]` bridge at (0,1,1). Measured
    1.02:1 — no visible line, no fill delta — i.e. item 22's "identifiable at rest" contract
    failing inside every dialog on the desk. Beaten at (0,2,1), no `!important`.
  - **Two axes were reshaped by measurement, not preference.** `overlay_menu` was built on the
    premise that stock rows are full-bleed; stock turned out to be INCONSISTENT (Bootstrap row
    already an 8px pill, `.frappe-menu` row square at 0px), so "round the row" was a no-op on
    one vocabulary. Flipped to item 27's `views_band` polarity: the anchor unifies, `Inset` is
    the neutral, `Plain` is the active override. And the scrim's alpha is tuned for the STACKED
    case — two dialogs paint two backdrops at the same z-index, so scrims compound.
  - **Verification had no route to visit.** An overlay exists only after a gesture, so every
    check drives the overlay and reads a computed value. The discipline caught three DEFECTIVE
    checks, one of which PASSED before its fix (a synthetic node missing the ancestor the vendor
    rule needs, measuring nothing). References: shadcn `dialog`/`dropdown-menu`/`sonner` and its
    eight named styles, Directus `v-dialog`/`v-menu`/`v-overlay`, Discourse `d-modal`/`d-menu`/
    `d-toasts`, frappe-ui `Dialog`/`Menu`/`Toast` — the anchor's default is frappe-ui's own
    dialog recipe. Upstream: `docs/upstream/frappe-overlays.md` (six filings).
- `[x]` **29 · Empty states** *(was 22, done 2026-08-20)* — an action, not a zero, and the
  action turned out to already exist. The SEVENTH surface kit, in four gated slices. Three
  fields (`empty_style` anchor · `empty_media` · `empty_action`), `_empty.scss`, and the
  four DOM shapes drawn as one object. What the surface taught:
  - **The roadmap's brief and `registry.py`'s definition of a surface were in direct
    tension** — "an action, not a zero" asks for a control, and a surface mounts nothing.
    It resolved because Frappe ALREADY renders the create button and already distinguishes
    first-run from filtered-to-zero in both copy and label. The kit promotes what exists.
    Measured, stock's CTA is `rgb(251,253,252)` with a **0px border** on a
    `rgb(248,250,248)` ground — a three-unit delta, so item 22's "identifiable at rest"
    contract fails on the one control an empty screen exists to offer.
  - **Read the COMPILED bundle, not the .scss.** Two of three planned contracts died there:
    the datatable's 90px no-data pin is already `max-content` upstream, and the sidebar's
    "Sass literal" compiles to `var(--text-muted)`, i.e. already bridged. One real defect
    remained (the child grid's `#999999`, 2.85:1) and it is fixed by a scoped re-point,
    the item-28 Quill lever's third outing.
  - **Two style options would have rendered as nothing, and measurement caught both.**
    `Filled` on `--bnd-raised` is a 3-unit delta against `--bnd-page` in light (now
    `--bnd-surface`); `Framed` as a border computed to 0 because the kit's own
    discriminator, Frappe's `.no-border`, is also `border: none !important` (now a
    box-shadow ring, item 25's technique).
  - **A refactor paid for the kit**: six hand-copied surface-kit blocks became one table
    (413 → 173 lines, ~1.1 KB js freed), so the seventh kit is eight lines and item 30's
    eighth fits behind it. And `assertNoAuthoredCopy` joined `build.mjs` — `content:`
    with prose bypasses `assertTranslationCoverage` entirely.
  - **Deliberately not done:** the six `null-state` illustrations (hardcoded hex, 1.11:1
    in dark) are unreachable in every drivable state — measured 0×0, no offset parent — so
    replacing them waits for a route that shows them. Upstream:
    `docs/upstream/frappe-empty-states.md` (twelve filings, including `form/save.js:91`
    commenting out its own freeze message, so every save shows a blank overlay).
- `[x]` **30 · Skeletons** *(was 23, done 2026-08-20)* — loading that does not reflow. The
  EIGHTH surface kit, in two slices plus a close. One field (`skeleton_style`), the theme's
  FIRST `@keyframes`, and `_skeleton.scss`. What the surface taught:
  - **The bone was a COLLISION, not a bad colour.** Stock's `--skeleton-bg`, `--control-bg`
    and `--subtle-accent` all resolve to `#232323` in dark, so a skeleton was
    indistinguishable from a card. `--bnd-bone` is fitted against the measured family, and
    is LIGHTER than `--bnd-hover` in dark because a bone reads by lifting off the surface
    there — `--bnd-active`, the obvious pick, lands within `4 units of hover and would have
    re-created the collapse in our own vocabulary. Declared in THREE token blocks: the
    `automatic` subset enforces no membership, and a skeleton paints before a theme resolves.
  - **Most "loading states" are TEXT.** Only two owned nodes are solid bones; the rest render
    the word "Loading…". So bones sweep and prose pulses, and the vendor's string is never
    hidden — it is the only signal these nodes give an assistive technology, since frappe
    sets `aria-busy` nowhere and ships no live region on any loading state.
  - **THE SUITE ENVIRONMENT REPORTS `prefers-reduced-motion: reduce`.** Found the hard way —
    the first motion check read `0s` for every duration and looked like a broken token. Every
    motion assertion now emulates explicitly, in both directions; one that trusts the ambient
    default is testing the host. The suite's first media emulation, so the hazards (reset in
    `finally`, compare teardown against ambient) are recorded where the next one will find
    them.
  - **Two barred nodes became one.** `.kanban-empty-state` is a pure LOADING node wearing an
    empty-state name (verified live: hidden on a 28-card board), and the query report's
    loading and empty boxes are DIFFERENT SIBLINGS reachable by position. But
    `.chart-loading-state` stays barred: its two boxes differ only by child order, which is
    fail-UNSAFE — an upstream reorder would shimmer an empty chart. Filed upstream instead.
  - **G1 was planned and cut, in the file.** The list's `.result` already carries stock's
    200px floor and a density-aware restatement lands at or below it. The 1-row-to-N jump
    stays as stock has it rather than being claimed as fixed. Upstream:
    `docs/upstream/frappe-empty-states.md` covers both items (twelve filings).
- `[x]` **31 · Filters + saved views** *(was 24, done 2026-08-21)* — the filter strip, the
  NINTH surface kit and the second (after item 28) that is on more than one route by
  default. Three fields (`filters_style` anchor · `filters_applied` · `filters_saved`),
  `_filters.scss`, and three DOM shapes dressed as one object. Wireframed and picked
  2026-08-20, then AMENDED 2026-08-21 by a gap round: **Outlined · Accented · Listed ·
  repairs are contracts**. What the surface taught:
  - **The item is smaller than its name, and the census is what shrank it.** The list-view
    sidebar — the filters/tags/group-by column the title implies — **does not exist in
    v16**: `list_factory.js:30` hardcodes `hide_sidebar = true`, `base_list.js:279` sets
    `no-list-sidebar` unconditionally, and `list_view.js` contains the string "sidebar"
    zero times. ~20 rules in `list_sidebar.scss` are orphaned. They were MEASURED before
    being blamed — the group-by dropdown they no longer reach renders bounded and
    scrollable anyway, because the generic `.dropdown-menu` supplies max-height/overflow/
    min-width and item 28 supplies the paint — so a planned repair was DROPPED and the
    filing is dead-code rather than defect. Item 23's shape, twice over.
  - **"Saved views" is not a thing Frappe has.** It has `List Filter` (named, has a menu),
    `List View Settings` (a dialog, per doctype not per user) and `__UserSettings`
    (invisible) — three disjoint mechanisms and no unified object. The kit dresses the one
    that has a DOM surface and says so, rather than inventing a rail. Item 29's
    "the kit promotes what exists".
  - **The headline defect was not only this kit's.** `.btn-primary-light` — the desk's
    ONLY "this control is active" variant — mixes a Sass-literal fill with a
    CSS-variable ink, so the two halves disagree about whether they follow the theme:
    **4.12:1 in light, 1.02:1 in dark**, measured in place. Its three call sites are the
    Filter button, the report view's Add Group button (which closes item 26's deferral for
    free) and **the skip link**, a control item 22 built its keyboard contract around. It
    is a state SET, not a declaration — Bootstrap generates eight rules and every fill in
    them is a literal — so a repair to the base rule alone reverts on hover.
  - **`.page-form` is the most exact scope any surface kit here has had.** It is
    `display:none` on form, settings and workspace routes and visible only where filters
    exist, measured on six routes — so one selector reaches the strip and nothing else,
    and the query-report route comes free.
  - **Two poles would have rendered as nothing, and ARITHMETIC caught both before either
    was written** — one stage earlier than item 29 caught its two. `Trough`'s well cannot
    be `--bnd-page` (brand-mixed, so it collapses to 1 channel at a near-white seed and 0
    at pure white); and the anchor as drafted set `Outlined`'s slot to `--bnd-surface`, a
    ZERO delta against the band, which would have re-opened the repaired defect while
    looking like a style choice. Both now ride an INK mix, invariant at all eleven gate
    seeds. New rule in the file: **a pole may not take the slot's fill away.**
  - **A contract and an anchor pole that write the same CSS property cannot both be
    asserted absolutely.** R7's hover ring and `Outlined`'s resting ring share box-shadow,
    so the "hover reveals an edge" arm is true only where the anchor leaves the channel
    free. It now runs under `Original` — asserting it unconditionally was testing the
    anchor and calling it the contract.
  - **The colour-serialisation trap, twice, and the second time it shipped a wrong
    verdict.** `color-mix()` computes to `color(srgb r g b)` on a 0-1 scale, not `rgb()`.
    A normaliser written for the channel-delta helper was not carried into a luminance
    helper inside `page.evaluate`, and an Accented control measuring 4.74:1 was reported
    as 3.92:1 — a correct rule failed by a wrong check. Fixed structurally: the page
    returns STRINGS and every number is computed on the Node side.
  - Zero new colour tokens and ONE new contrast pair (4,008 total): R2's resting fill is
    character-identical to `_form.scss`'s tab track, so the gate already covered its inks.
    Payload `css_gzip` 20200 → 20600 → 21000; the picker is doctype JS, so slice 3 cost
    **zero** bundle bytes. References: Discourse `select-kit`/`category-drop` (the anchor's
    default and the applied signal), Directus `system-filter`/`Nodes.vue` (Pill), frappe-ui
    `TabButtons`/`TextInput` (the hover recipe, and the refutation of Trough-as-default),
    and Frappe's OWN crm v1.79.0 / helpdesk v1.27.0, read from checkouts on the bench.
    Upstream: `docs/upstream/frappe-filters.md` (twelve filings).

- `[x]` **32 · Login / signup / forgot** *(was 25, done 2026-08-21)* — the TENTH surface
  kit and the **first that is not on the desk**. Four gated slices plus a close. Three
  fields (`login_style` anchor · `login_action` · `login_theme`), `web/_login.scss`, and
  the theme's SECOND stylesheet. Wireframed and picked 2026-08-21: **Split · Branded ·
  the theme axis in · four poles** — `Bare` was drawn and dropped in the round. What the
  surface taught:
  - **Every mechanism the nine desk kits stand on is absent, and the replacement is a
    body class.** `/login` is a WEBSITE page: no `app_include_css`, no `frappe.boot`, no
    `bunood.js`, and `templates/base.html` renders `<html lang dir>` with **no
    `data-theme` at all**. So the anchor is `body_class`, set from
    `update_website_context` — server-rendered, correct at first paint, zero JS — and
    dark is `prefers-color-scheme`, because a guest has no `User.desk_theme`. We
    deliberately never stamp `data-theme`: Frappe's own dark login branch contains three
    of the census's findings and activating it would inherit all three.
  - **Source order is against us, so every selector was sized against a measured
    competitor.** `head.html` emits `web_include_css` inside `{% block head %}`;
    `login.html` overrides `{% block head_include %}` with the login bundle, which
    therefore comes after. A rule scan over `document.styleSheets` gave the numbers —
    `(0,4,0)` for the card's fills, `(0,5,0)` for the button's hover, `(0,2,0)` for the
    two rules that kill focus — and `body.bnd-auth` is worth `(0,1,1)` as a prefix.
  - **NO CONTROL ON THE PAGE SHOWED KEYBOARD FOCUS.** Driven with a real Tab, every stop
    matching `:focus-visible`: `outline: none 0px`, `box-shadow: none`, border unchanged.
    Two independent killers, and no fallback carrier. WCAG 2.4.7 AA, on the form a
    keyboard user crosses first. The ring is an `outline` and not a `box-shadow`
    precisely because that channel is contested to `(0,5,0)` and item 31's critical
    defect was a box-shadow written into a channel already carrying focus.
  - **The literal-versus-token split, three more times.** `--surface-gray-7` flips and
    the `color: white` beside it does not (the enabled Send Link, **1.06:1** in dark);
    `--red-50` has no dark value under an ink that has one (the error banner, 2.52:1);
    `--gray-900` is not redefined in dark while `--bg-color` resolves to it (the primary
    button's fill IS the page, 1.00:1). Item 31 filed `.btn-primary-light` for the same
    shape.
  - **A pole would have rendered as nothing, and arithmetic caught it before it was
    written** — the third item running to do so. `Plate`'s obvious wash,
    `color-mix(--bnd-brand 14%, --bnd-page)`, measures **zero channels** against the card
    at a pure-white seed: the seed and the brand-mixed page go white together. It rides
    `--bnd-brand-solid` (fitted, so never near-white) over an ink floor instead —
    30.5–53.5 channels in light, 17.9–28.0 in dark, across all eleven gate seeds.
  - **Frappe flips this page itself, so our rules must not.** An `ar` page serves
    `dist/css-rtl/login.bundle…css`, and the field icon, the input padding and the card
    head all move. GUIDELINES §1.3 in full: the file restates none of them. `Split`'s
    column rides **flex order** rather than insets, so `dir` does the work and the
    stylesheet contains no direction-aware declaration at all.
  - **A pole that shares a layout rule inherits what that rule decides, and the suite has
    to assert the thing the sharing could break.** `Split`'s second column starts at `md`
    rather than at Frappe's `sm` collapse (at `46%` the form measured **201px at 576**
    against Frappe's own 371px card), and taking Panel's composition below it is what
    deleted four mobile stand-down rules. But it also put Split under Panel's
    `flex-direction: column`, which stacked the brand panel BELOW the form column — and
    that was invisible twice over: the column's fill and the page ground are four channels
    apart in light, and both existing checks passed, because `display` was still `flex`
    and a column container still puts an explicitly-sized item at the inline start in LTR
    and the inline end in RTL. Only the column's HEIGHT distinguishes them.
  - **A per-site defect that could only ever have shown on a customer's site.**
    `brand.py` emitted its dark values under `html[data-theme="dark"]` and
    `html[data-theme="automatic"]` — scopes a website page can never match — while its
    light block's `html:not([data-theme])` arm could. So dark fell back to
    `_tokens.scss`'s literals, fitted for the SHIPPED seed. Found by reading the
    generated file, not by a check; the check that now guards it is seed-independent,
    keying on whether the value is a concrete hex (per-site) or a live `color-mix()`
    (bundle fallback).
  - **The kit ships no `*_apply` hook, and that is the honest choice.** Every other kit
    live-previews on click; `www/login.py:38-46` redirects an authenticated session to
    `/desk`, so the only person who can open this picker is the only one who cannot load
    the page it configures — an iframe is closed off for the same reason. A hook that
    cannot act is a lie in the shape of an API, so the mandatory-hook check is inverted:
    assert its absence, and assert that the click lands in the field and the page renders
    the class.
  - **Two promises the settings page had already made are now kept**: the logo (one line,
    because `update_website_context` runs after `get_context` and `context.logo` is a
    real key) and the `tagline`, whose description has read "Shown on the login page"
    since the beginning while nothing read it.
  - **`SETTINGS_PANE_KEYS` is derived now, not listed.** Item 31 found the hole in an
    adversarial review, back-filled its own key and left it: measured here, the list was
    still missing seven kits, none of them ever walked by the axe gate or the
    accessible-name walk. The suite reads the panes off the shell.
  - Axe over both routes: **3 and 4 contrast violations to zero**; the survivor needs an
    attribute in someone else's template. Payload: the desk bundle is UNTOUCHED (the
    sheet is its own entry, and `payload.mjs` now throws on any dist file no bucket
    claims); `web_css_gzip` 3160 against a new 4000 ceiling. Contrast 4,008 → 4,080
    pairs. References: Directus `public-view.vue` (Split, already logical-property
    authored), Discourse `login-signup-page.scss` and shadcn `card` (Panel). Upstream:
    `docs/upstream/frappe-login.md` (twelve filings).
  - **THE RELEASE REVIEW FOUND FIVE LIVE DEFECTS AND THE TAG WAS MOVED** *(2026-08-22)*.
    All five sat where nothing looked. The worst: the kit matched the request PATH, so a
    guest at `/` — the address a customer types, and where a stock site serves the
    sign-in page — got no scope, no anchor, no brand sheet and no focus ring, while all
    22 checks passed because all 22 asked for `/login` by name. **Guard on the template,
    not the route.** Three more came from a rule scan that read the controls only AT
    REST: Frappe groups `:hover, :focus, :active` in one selector list at (0,5,0) and
    ships `:disabled` separately, so a base rule at (0,4,1) lost both — the branded CTA
    reverted to grey on click (1.36:1, no ring) and to near-black when disabled (1.12:1)
    — and the strength track's rule had never applied at all, three classes against two
    classes plus an element (14.42:1). The fifth was ours: `.btn:active` forces
    `--text-color` and `--control-bg` `!important`, we re-pointed only the first, and a
    held button measured **1.09:1 in dark where stock managed 10.57:1**. Six new checks
    cover the STATES; each was verified by restoring the defect and watching it go red.
    Also fixed: `_css_string` missed U+000C, which CSS counts as a newline.
- `[x]` **33 · Website base + portal** *(was 26, done 2026-08-24)* — the ELEVENTH surface
  kit, and the first whose surface is a CLASSIFICATION rather than a list. Eleven gated
  slices plus a close. Three fields (`web_style` anchor · `web_header` · `web_theme`),
  `web/_site.scss`, and the theme's first image asset. Wireframed and picked 2026-08-22:
  **Panel (default) · Branded · Follow OS** — `Rail` was drawn and dropped in the round.
  The first round in this repo NOT to default to the boldest pole: `Panel` won on
  coverage, being the only one that renders on every route in scope. What the surface
  taught:
  - **The delivery mechanism already existed, which inverts item 32 exactly.** `hooks.py`
    had shipped `web_include_css` since the login kit, so the compiled sheet was already
    downloading on every website page and painting nothing, every rule of it scoped
    `body.bnd-auth`. This item needed a RULE, not an asset.
  - **`context.template` is the only discriminator that survives every renderer.**
    `DocumentPage.update_context()` never calls `set_page_properties()` and
    `WebFormPage` inherits that, so on every Web Page, Help Article and Web Form
    `context.path` and `context.route` are EMPTY when the hook runs. The rendered HTML
    still carries a correct `data-path`, filled afterwards — so reading it back looks
    exactly like confirmation. The guard is a DENYLIST whose default branch dresses,
    because enumerating the surface would be a second copy of Frappe's route table:
    twelve erpnext portal routes collapse onto ONE template.
  - **The page cache is keyed on `(path, lang)` and nothing else.** Measured: a guest
    received the Administrator's rendered `/attribution`; `/404` fetched with a valid
    session returned the guest render. So the body class may encode SITE state only —
    never user, never role. That is why `frappe-session-status` is refused as a styling
    discriminator despite being free at `base.html:57`, and why `Follow OS` is the theme
    default: a client-side media query is the only cache-safe way to answer per-visitor.
  - **The colour contracts depend on the anchor's ground, so the plan's slice order was
    wrong.** Painting a mode-flipping fill before `body.bnd-web` re-points Frappe's own
    variables gives a DARK control on a WHITE page — measured, in dark, with our tokens
    flipping correctly and nothing reading them. The bridge (`--bg-color`, `--fg-color`,
    `--text-color`, `--control-bg`, `--border-color`) belongs to the pole scope, not the
    contracts, and it must re-point BOTH halves of a vendor `!important` pair or neither.
  - **Specificity was got wrong four times in one item, always by inference.**
    `body:is(…) a` is (0,1,2) and not (0,2,1) — `:is()` counts as ONE class;
    `.navbar-light .navbar-brand` is (0,2,0); `body{color:…}` ships TWICE as a literal;
    and a branded ink at (0,3,1) lost to a bridge rule whose `:is()` took its HEAVIEST
    arm at (0,3,2). **Scan for the winning declaration; never infer from the rule beside
    it.** The same scan is what kept the sanctioned `!important` down to ONE line:
    re-pointing `--text-muted` changed nothing, and a per-element winner scan split the
    nineteen failures four ways, only one of which needed the escalation.
  - **A THIRD sanctioned `!important` now exists** (GUIDELINES §1.3), inside
    `body.bnd-web`, only to beat a vendor `!important` LITERAL, only where the
    alternative is a measured WCAG failure. It exists because the escalation the rule
    assumes — `.bunood` on `<html>` — cannot happen on a website page: `<html>` is
    hardcoded in `base.html`, there is no hook, and a JS stamp lands after first paint.
  - **The framework's name was on the customer's site and on their staff's desk.** The
    tab icon was erpnext's on every page including the desk, the navbar read the literal
    `_("Home")`, every footer said "Powered by ERPNext", the desk splash was erpnext's
    logo and the desk title was the literal `"Frappe"` — which is the shipped `default`
    of `app_name` in BOTH `website_settings.json` and `system_settings.json`, so a stored
    "Frappe" carries no information and a precedence rule that reads it is a no-op.
  - **Frappe's Jinja has no autoescaping anywhere**, so anything a theme derives from a
    Data field and pushes through a context key must be escaped by the caller. Measured,
    not inferred: `footer_powered` set to `ACME <i>Ltd</i>` rendered an italic *Ltd*.
  - **A branch whose guard is false on the dev site is UNTESTED, not working** — item 32
    shipped its logo override for three slices on that confusion, and slice 7 is the
    whole class. Every branding check asserts the STOCK render first, naming the vendor
    string that must not be there. Nine sabotages across slices 7 and 7b, each red for
    its own reason; one of them stayed GREEN and exposed a check that proved nothing,
    because a seeded `company_name` short-circuits the `or` before the term under test.
  - **RTL was a prohibition, not a task.** Frappe flips this surface itself with a
    build-time rtlcss pass — an Arabic page serves `css-rtl/website.bundle.css` and the
    rail moves from x=99 to x=1159 — so their flipped physical rules and our logical ones
    do not compose. The item restates none of them; the standing check's job was to stay
    green, and it did.
- `[x]` **34 · Email templates** *(was 27, RELEASED 2026-08-26 as **v0.34.0**,
  tagged retroactively at `c622924` — one gate with v0.35.0, see the end of this
  entry)* — the TWELFTH
  surface kit, and the first that is not rendered by a browser at all. Six slices. Four
  fields (`email_style` anchor · `email_header` · `email_action` · `email_theme`),
  `public/scss/email/email.scss`, `bunood_theme/email.py`, and the theme's first fork of
  a Frappe template. Wireframed and picked 2026-08-25 **after the census rather than
  before it**, which is why `Card` won: **Card · Follow the client · Logo + wordmark ·
  Brand fill**. What the surface taught:
  - **The delivery hook is a trap, and ERPNext has been in it for years.** Frappe themes
    mail through `email_css`, and that hook is disqualified twice: it is a STATIC file
    list, so it can never carry a customer's brand seed — which is why every ERPNext site
    on earth sends identical colours — and `inline_style_in_html`'s `os.path.exists`
    filter runs CWD-relative in whichever process sends, so a hooked sheet styles
    desk-triggered mail and is silently dropped for scheduler-triggered mail. ERPNext's
    own hook names `email_erpnext.bundle.css` while the built file is
    `erpnext_email.bundle.css`: **its email stylesheet has never applied anywhere**, with
    no log. So this item forks `templates/emails/{standard,email_header,email_footer}.html`
    and carries the CSS inside them. ARCHITECTURE §4 retired the `desk.html` fork for two
    reasons; only the version pin applies here, and it is PAID — the suite hashes Frappe's
    shipped copies and fails when upstream moves.
  - **The defect was an ABSENCE, not an ugliness, and that reshaped the kit.** A
    Notification email — the commonest shape a site sends, because `notification.py:510`
    passes neither `header` nor `with_container` — has no opaque ancestor above any of its
    text: five of five elements, ink `#171717`, ground whatever the mail client decides.
    So the floor is a CONTRACT outside the anchor and `Original` is narrower here than in
    any previous kit: a pole may change what the floor looks like, never whether it
    exists. Item 31's rule arriving by a different route.
  - **Two more live AA failures, both stock.** The footer at 4.17:1 (`.text-muted`
    `#7c7c7c` — the SAME literal item 33 repaired on `/404` and every portal row, third
    surface) and **every link at 3.15:1** (`a { color: $blue-500 }`). The link one was
    missed on the first census pass because the fixture carried a `.btn` and no bare `<a>`
    — and then the same blind spot was reproduced INSIDE the regression test written to
    catch it, which passed with the repair deleted. **A check is only as wide as its
    fixture.**
  - **No `var()` may reach an inbox**, because Premailer does not resolve custom
    properties and Outlook does not support them — but hand-mirroring hexes is the defect
    `printing/bunood_print_style.css` already carries. So the sheet is authored in ordinary
    `var(--bnd-*)` and SUBSTITUTED at render from `palette.derive()`: one derivation, three
    consumers. `substitute` throws on an unknown token and the whole sheet stands down, so
    the degradation is total and visible. It fired for real when the anchor's first cut
    used a custom-property working set — all four poles rendered as stock, in one render.
    A Sass `@mixin` keeps the compose-once guarantee and compiles to what a client reads.
  - **Dark in email was an open question and the census settled it.** A
    `prefers-color-scheme` block survives Premailer into a preserved `<style>`, and
    Premailer **adds `!important`** to everything it preserves — which is the only reason
    the dark values beat the light ones already inlined. Frappe ships nothing here and
    Directus commented its own dark block out. `email_theme` is therefore NOT a body class
    like `login_theme`/`web_theme`: Gmail strips `<html>` and `<body>`, so the mode decides
    which rules are EMITTED.
  - **The framework's name was on the customer's mail, three ways.** The header title read
    the LAST INSTALLED APP (`app_title[-1]` — "Telephony" here, and it changed with the
    last `bench get-app`); the footer said "Sent via ERPNext"; and an unbranded mark linked
    to `frappeframework.com`. The footer is FILTERED, not dropped — only lines that LINK to
    a vendor host go, so a legitimate app keeps its own and the word "ERPNext" in a
    tenant's text survives.
  - **This kit has the first honest live preview in the project.** Items 32 and 33 each
    refused one for a reason that fails here: an email is composed on the server and
    carries no other user's data. It does not use frappe's whitelisted `get_email_html`,
    which crashes on any site with no outgoing Email Account — and the suite reproduces
    that crash so the filing cannot be closed as unreproducible.
  - **A guard for the client we cannot test in.** `assertEmailSafeCss` is an allowlist over
    the email entry only, because that sheet is verified in Chromium and read in Outlook.
    It is a regression net, not a conformance claim — and it caught a gap in ITSELF
    (`display: flex` passed its first version) before governing anything.
  - Payload: a third bucket, ceiling 2000, currently ~550 B gzip; the desk and web bundles
    are untouched. Contrast unchanged at 4,080 pairs — every value is an existing token.
    Rendered email 6–11 KB against Gmail's ~102 KB clip. References:
    `_reference/directus/api/src/services/mail/templates/base.liquid` and
    `_reference/discourse/lib/email/styles.rb` (SVG stripping, `dir` handling). Upstream:
    `docs/upstream/frappe-email.md` (seven filings).
  - **The debt this entry used to carry was paid 2026-08-26**: after three full-suite
    attempts died OOM on this host, the gate finally ran twice over the merged 34+35
    tree (389/390 then 387/390, the union covering every check; failures were one
    fixed preview defect and one backend transient episode that passes isolated), the
    adversarial review confirmed ZERO defects in this item's shipped code, and the
    heading, bump, payload row and tag all arrived together — **v0.34.0 at `c622924`**,
    item 34's last commit before item 35 began (the v0.29.0 retro precedent; costs in
    the CHANGELOG block).
- `[x]` **35 · Print formats / PDF** *(was 28, RELEASED 2026-08-26 as
  **v0.35.0** at `b179a0a` — one gate with v0.34.0: adversarial review over the
  combined diff, 29 confirmed defects all fixed in `2567d59`, then the full
  suite twice over the merged tree)* — the THIRTEENTH surface kit, and the first delivered as
  a DATABASE RECORD: the compiled sheet is substituted per site from
  `palette.derive()` (fourth consumer) and written into the Print Style
  "Bunood", which frappe inlines into every print view and PDF. Five slices
  (pipeline+contracts · RTL closure · preset-over-axes anchor · preview+
  letterhead · Ctrl+P) plus the switch catalogue. Twelve fields; the anchor is
  a PRESET over four section axes — the named styles write values and stop
  existing, the label derives by comparison, and selection happens at
  GENERATION via marker blocks the sheet assembler keeps or drops (unknown =
  total stand-down). What the surface taught:
  - **The delivery mechanism already existed and had never fired.** v16
    defaults `print_style` to "Redesign", a name the installer's vacancy tuple
    predated — the Bunood style was installed on every site and applied on
    none, ERPNext's never-loading email CSS in a second costume. A one-time
    patch claims it; the honest cost is in the patch.
  - **The item-7 "accepted gap" was an import-order accident, not a wall.**
    printview/pdf bind `is_rtl` at import time, but they import LAZILY — the
    rtl_patch reached them whenever the apps loaded first, and any app-level
    `import frappe.utils.pdf` silently un-fixed it. The suite now FORCES the
    hostile order (`benchPyHostileImport`); the closure is structural
    (context.py's printview branch + last-wins pdf header/footer hooks).
  - **The census, not the plan, sized the slices**: `?doc=` renders specimens
    through the real funnel (the preview's whole mechanism, upstream already);
    `hook_func[-1]` means last-wins; stock Redesign PASSES AA on the standard
    layout (so `Original` ships honestly) while ERPNext's nine inline-styled
    formats fail at 4.17/3.93 (the #7c7c7c literal's FOURTH surface, repaired
    by contract); and PDF download had never worked on this stack at all
    (`get_url()` unresolvable in-container — an environment errand, filed).
  - **A check that cannot fail was deleted, and that is the record**: the dark
    print-skeleton repair the upstream filing promised was already paid by
    item 30's bone token (measured live); the census's light reading was a
    mid-load race. The filing stands for themeless sites.
  - **The compliance guard is the switch catalogue's spine**: `print_qr: Hide`
    is honoured only where the QR is optional — a format declaring
    `required=True` keeps its QR and its warning, watched red under sabotage.
  - Deferred, stated: watermark, logo fine-grain, meta/contact/density/receipt
    axes, footer toggles, `arabic_font` wiring, the sample-PDF button (blocked
    on the environment errand). `Side Column` drawn and killed by measurement
    (grid on Qt-WebKit 534). References: Odoo's four-layout configurator
    (source-confirmed two-colour model), Stripe's restraint, shadcn typeset's
    `break-*` pairing; wireframes:
    <https://claude.ai/code/artifact/9f3c2014-976c-4790-98bc-969c37f55f2f>.
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
