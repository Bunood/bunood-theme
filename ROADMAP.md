# Coverage roadmap — 38 items to v1.0.0

> **Why this file exists.** These 38 items have driven every release since 0.2.0, and
> until 2026-08-03 they lived only in an assistant's per-project memory — invisible to
> everyone else and lost the moment that memory was. `GUIDELINES.md` §2.1 calls that
> governance drift; this file closes it.

**Item numbers are identity, not sequence.** They are referenced by `CHANGELOG.md` and
by commit messages ("item 13", "item 14"), so they never change. The *order of work* is
the phases below.

**Versioning.** SemVer, pre-1.0. MINOR = an item (or feature set) ships; PATCH = fixes.
**v1.0.0 is reserved for all 38 complete.** Every release is an annotated tag and
`app_version` in `hooks.py` matches the latest tag.

**Working method.** One item at a time, preceded by solutions plus wireframes grounded
in what leading products actually do, then implemented, then verified against three
gates: CI green, smoke suite green, adversarial release review clean.

---

## Why this order

The original order was by layer — foundation, chrome, surfaces, web, config, quality —
which reads sensibly and sequences badly. It defers every **cross-cutting contract** to
the end, and those are precisely the items whose cost grows with each surface already
built.

| kind | items | cost of delaying |
|---|---|---|
| **Contracts** | 7, 32, 33, 34, 35 | grows linearly — every surface built first is a surface to retrofit |
| **Surfaces** | 15–28 | roughly flat — a list view costs the same whenever it is built |

Write plural-unsafe strings across ten surfaces and you rewrite ten. Ship ten surfaces
consuming tokens that fail contrast at the default seed and you audit ten. Establish a
focus contract after ten and you retrofit ten.

So: contracts before surfaces — **except** where a contract needs real callers to be
designed correctly. `GUIDELINES.md` Part 3 is explicit that an interface should not be
frozen until it has two. The icon system, the responsive contract and the full
accessibility contract are all in that category, so they sit *after* two high-traffic
surfaces rather than before.

The result is five phases. Phase 1 is what is cheap now and expensive later; phase 2
supplies the callers; phase 3 freezes the contracts against them.

---

## Phase 0 — in flight: the component rework

Not a numbered item; a restructuring that items 15–38 will be built on. Desk chrome is
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
  - `[ ]` **`status_in_classic` deleted** — the bar is its own component, so a
    layout-conditional should not gate it. Patch must preserve what Classic sites
    see: `status_style: "Off"` where they had not opted in. Small; do it first
  - `[ ]` **The remaining containers** — top bar, bottom bar, side pane, dock each
    with their own on/off instead of `desk_layout` choosing. **Touches
    `mount_chrome`**, where every critical defect in this project has lived. The
    ownership-stamp rule is the thing to keep in front of you
  - `[ ]` **Honest-picker rules across every component** — `bnd_region_blocker`
    covers placement; the rest is unaudited

## Phase 1 — contracts with no design uncertainty

Cheap now, expensive after ten surfaces, and none of them needs a future caller.

- `[~]` **7 · RTL & internationalisation** *(reopened 2026-08-01)* — 0.2.1 shipped
  direction only; marking it done made Arabic *look* covered when half was missing.
  Do (a)–(c) here; (d) and (e) can follow phase 2.
  - **(a) Rendering defects inside the original scope.** `letter-spacing` of
    0.02/0.04/0.05em breaks Arabic cursive *joining* (worst: `_sidebar.scss`, tracking
    and uppercase on one rule, where uppercase is a no-op in Arabic). The clock's
    `toLocaleTimeString([], …)` pins `hour12` but not the numbering system, so `ar-SA`
    renders `٠٩:٤٥` beside Frappe's Western digits. Extend the build guard to tracking.
  - **(b) Typography.** No Arabic face is declared, so Arabic falls back to whatever
    the OS has and the desk differs per platform. Pair a metric-matched face, raise
    RTL line-height.
  - **(c) String design, before translating.** Frappe's translation layer is flat
    key→value with no plural support; Arabic has singular, dual and two plurals.
    `__("{0} failed")` cannot be correct for n=1,2,3–10,11+. Rewrite as label+value.
    **This is the item that must precede the surfaces.**
  - **(d) Translation** — no `translations/` exists; 356 strings. Glossary against
    ERPNext core's `ar.csv` first, or the desk speaks two vocabularies.
  - **(e) Gate** — render in `ar`, assert no theme-owned source string appears verbatim.
- `[x]` **32 · Contrast validation** — *done 2026-08-06.* Target stated (WCAG 2.2 AA);
  the brand split into three roles so the seed contributes hue and the system controls
  lightness; inks fitted per tenant against the surfaces that seed produces, because
  seed-tinted surfaces mean no fixed value can pass for every seed (`ink-subtle` failed
  96 of 96 placements). `npm run contrast` recomputes 1,080 pairs over 11 seeds × 2 modes
  plus the no-brand-sheet fallback, in CI; the smoke suite ties it to rendered pixels.
  Nothing is ever rejected — Theme Settings reports what it adjusted. See GUIDELINES
  §2.2 "RESOLVED".
- `[ ]` **34a · Accessibility assertions for the components that already exist** — the
  kits already use ARIA and handle Esc; none of it is asserted. Focus contracts on the
  palette and inbox are cheap because the harness already drives them. See §2.3.
  **Item 32 handed two things to this one:** (a) whether a control whose resting
  boundary is a 1.22:1 hairline is identifiable at all — a per-component judgement, not
  a token value; (b) the sidebar style kit's own 8-preset palette, which is outside the
  contrast gate. Both are measured and published, neither is enforced.
- `[ ]` **Payload budget** *(from GUIDELINES §2.5, not a numbered item)* — record CSS
  and JS bytes in each release commit and set a ceiling that requires a decision to
  cross. Currently 78 KB / 183 KB, unmeasured across every release so far.

## Phase 2 — two real callers

The highest-traffic surfaces in an ERP by a wide margin. Built here so the phase-3
contracts have something real to be designed against.

- `[ ]` **16 · List view** — rows, hover, selection, bulk bar
- `[ ]` **18 · Form view** — sections, tabs, child grids, sidebar

## Phase 3 — freeze the contracts against those callers

- `[ ]` **33 · Icon system** — SVG sprite via `app_include_icons`. Already used
  informally by the chrome (`sprite_icon`); formalised here, with two surfaces proving
  the interface
- `[ ]` **34 · Accessibility, full** — focus rings, ARIA, keyboard paths, contrast, as
  a property of the component library rather than a per-surface effort. `axe` scoped
  honestly: hard gate on our components, baseline-diff over Desk pages
- `[ ]` **35 · Responsive** — including a mobile navigation mode. *Known defect:* below
  ~480px the Top Bar layout mounts no bar at all, because Frappe renders no
  `.main-section > header` at that width; it degrades toward Classic and the
  bell/avatar cluster is simply absent on phones

## Phase 4 — the remaining surfaces

Cheap and consistent now that the contracts exist.

- `[ ]` **15 + 20 · Workspace/dashboard landing with charts and number cards** —
  deliberately together. A dashboard without its cards is half a feature, and doing
  them apart means designing the same grid twice. Charts need a validated categorical
  palette and recessive gridlines
- `[ ]` **17 · Report view / datatable** — sticky headers, tabular numerals, grouping
- `[ ]` **19 · Alternate views** — kanban, calendar, gantt, gallery
- `[ ]` **21 · Overlays** — modals, dropdowns, toasts
- `[ ]` **22 · Empty states** — an action, not a zero
- `[ ]` **23 · Skeletons** — loading that does not reflow
- `[ ]` **24 · Filters + saved views**

## Phase 5 — web side and remaining configuration

- `[ ]` **25 · Login / signup / forgot** — separate sheet; Frappe's login bundle loads
  after ours
- `[ ]` **26 · Website base + portal**
- `[ ]` **27 · Email templates**
- `[ ]` **28 · Print formats / PDF**
- `[~]` **29 · Settings singleton** — brand, logo, favicon exist; being restructured by
  phase 0 and effectively completed by it
- `[~]` **30 · Presets** — sidebar preset system shipped in 0.5.0; remaining:
  colour-palette seeds per preset, more palettes. Blocked on 32 — a preset that ships
  an illegible seed is worse than no preset
- `[ ]` **31 · Per-user preferences** — via `User.desk_theme`, never a parallel
  localStorage

## Done

**Foundation** — 1 tokens · 2 Frappe bridge · 3 light/dark/automatic · 4 density ·
5 type scale · 6 motion · 8 print
**Desk chrome** — 9 layouts · 10 sidebar kit · 11 breadcrumbs · 12 command palette ·
13 notification centre · 14 status bar + search placement *(0.10.0, tagged locally,
unpushed)*
**Quality** — 36 no-FOUC first paint · 37 cache correctness · 38 upgrade resilience

---

## The settings architecture phase 0 is building toward

Wireframed 2026-08-02, chosen from eighteen concepts. Master & detail: a grouped left
list, a detail pane with three zones — placement via a **shared desk diagram**, style
via thumbnail cards, extras as switches — presets that *write values and then stop
existing*, and an active-preset label derived by comparison, so it reads "Custom" the
moment anything differs. The diagram is one asset reused per component rather than
~30 per-placement thumbnails that would each have to stay truthful.
