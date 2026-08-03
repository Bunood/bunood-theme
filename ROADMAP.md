# Coverage roadmap — 38 items to v1.0.0

> **Why this file exists.** These 38 items have driven every release since 0.2.0, and
> until 2026-08-03 they lived only in an assistant's per-project memory — invisible to
> everyone else and lost the moment that memory was. `GUIDELINES.md` §2.1 calls that
> governance drift; this file closes it. The memory now points here rather than holding
> it.

**Versioning.** SemVer, pre-1.0. MINOR = a coverage item (or a feature set) ships;
PATCH = fixes and refinements. **v1.0.0 is reserved for all 38 complete.** Every
release is an annotated tag and `app_version` in `hooks.py` matches the latest tag.

**Working method.** One item at a time. Each is preceded by solutions plus wireframes
grounded in what leading products actually do, then implemented, then verified against
the three gates: CI green, smoke suite green, adversarial release review clean.

Status: `[ ]` not started · `[~]` in progress · `[x]` done

## Foundation

1. `[x]` **Token vocabulary** — one namespaced `--bnd-*` set; nothing else hardcodes a value
2. `[x]` **Frappe bridge** — map tokens onto Frappe's ~534 names, mode-scoped only
3. `[x]` **Light / dark / automatic** — dark selected, not inverted; `automatic` needs a
   `prefers-color-scheme` block Frappe entirely lacks
4. `[x]` **Density** — site default + per-user override (`frappe.defaults` → boot →
   `data-bnd-density`); compact never touches type
5. `[x]` **Type scale** — rem-based, so one root size scales the whole desk
6. `[x]` **Motion** — duration tokens a reduced-motion query zeroes at once
7. `[~]` **RTL & internationalisation** — *reopened 2026-08-01.* 0.2.1 shipped direction
   only: the build fails on physical properties, verified live on an Arabic session.
   Marking it done made Arabic *look* covered when only half was. Remaining:
   - **(a) Rendering defects inside the original scope.** `letter-spacing` of
     0.02/0.04/0.05em breaks Arabic cursive *joining* (worst: `_sidebar.scss`, tracking
     and uppercase on the same rule, where uppercase is a no-op in Arabic). The clock's
     `toLocaleTimeString([], …)` pins `hour12` but not the numbering system, so an
     `ar-SA` browser renders `٠٩:٤٥` beside Frappe's Western digits. Extend the build
     guard to tracking, not just physical properties.
   - **(b) Typography.** No Arabic face is declared, so Arabic falls back to whatever
     the OS has and the desk looks different per platform. Pair a metric-matched face
     and raise RTL line-height.
   - **(c) String design, before translating.** Frappe's translation layer is flat
     key→value with no plural support; Arabic has singular, dual and two plurals.
     `__("{0} failed")` cannot be correct for n=1,2,3–10,11+. Rewrite as label+value.
   - **(d) Translation.** No `translations/` exists; 356 unique strings (101 runtime,
     255 settings). Fix a glossary against ERPNext core's own `ar.csv` first, or the
     desk speaks two vocabularies.
   - **(e) Gate.** Render in `ar` and assert no theme-owned source string appears
     verbatim. See also GUIDELINES §1.6 and §2.4 (bidi isolation).
8. `[x]` **Print** — in-bundle `@media print`, force-light through the token pipeline,
   repeated headers, unsplit rows; brand sheet wrapped `@media screen`

## Desk chrome

9. `[x]` **Navbar / top bar** — 0.4.0: five switchable layouts via a visual picker →
   boot → `data-bnd-layout`; controls proxy hidden native ones; fails open to stock
10. `[x]` **Sidebar** — 0.5.0: composable style kit, 22 options → `data-bnd-sb-*` → one
    CSS matrix; 8 presets. *Key fact:* v16 nests section children inside
    `.section-item` containers
11. `[x]` **Breadcrumbs** — 0.7.0: 4 styles + Original escape hatch, separator
    RTL-mirrored, icons, copy-link, status pill, narrow collapse. Decorates a wrapped
    `frappe.breadcrumbs.update`, never forks
12. `[x]` **Command palette** — 0.8.0: 4 styles over `frappe.search.utils.*`, grouped
    sections, pinned fallbacks; frecency per-user server-side. *Key fact:* this fork's
    awesomebar is already a Ctrl+K modal
13. `[x]` **Notification centre** — 0.9.0: 4 styles, filter tabs, rollup by document,
    keyboard triage, full page at `bnd-inbox`, plus the unread badge ERPNext lacks
    entirely (its selectors exist in no template)
14. `[x]` **Status bar + search placement** — 0.10.0 *(tagged locally, unpushed)*:
    search decoupled from layout into six slots with a per-layout fallback chain;
    status kit Quiet/Operator/Minimal/Off. Quiet never claims all-clear — an unreadable
    signal is absent, not zero. Carries the fixed-bottom-chrome clearance fix

## Content surfaces

15. `[ ]` Workspace / dashboard landing
16. `[ ]` List view — rows, hover, selection, bulk bar
17. `[ ]` Report view / datatable — sticky headers, tabular numerals, grouping
18. `[ ]` Form view — sections, tabs, child grids, sidebar
19. `[ ]` Alternate views — kanban, calendar, gantt, gallery
20. `[ ]` Charts + number cards — validated categorical palette, recessive gridlines
21. `[ ]` Overlays — modals, dropdowns, toasts
22. `[ ]` Empty states — an action, not a zero
23. `[ ]` Skeletons — loading that does not reflow
24. `[ ]` Filters + saved views

## Web side

25. `[ ]` Login / signup / forgot — separate sheet; Frappe's login bundle loads after ours
26. `[ ]` Website base + portal
27. `[ ]` Email templates
28. `[ ]` Print formats / PDF

## Configuration

29. `[~]` **Settings singleton** — brand, logo, favicon exist; being restructured by the
    component rework (below)
30. `[~]` **Presets** — sidebar preset system shipped in 0.5.0; remaining: colour-palette
    seeds per preset, more palettes
31. `[ ]` Per-user preferences — via `User.desk_theme`, never a parallel localStorage
32. `[ ]` **Contrast validation** — a white-label theme must refuse illegible brand
    colours. See GUIDELINES §2.2: the default seed already fails white-on-brand at
    4.27:1, and nothing validates a customer-chosen seed

## Quality gates

33. `[ ]` Icon system — SVG sprite via the `app_include_icons` hook
34. `[ ]` **Accessibility** — focus rings, ARIA, keyboard paths, contrast. Present in the
    components, asserted nowhere (GUIDELINES §2.3)
35. `[ ]` **Responsive** — including a mobile navigation mode. *Known:* below ~480px the
    Top Bar layout mounts no bar at all, because Frappe renders no
    `.main-section > header` at that width; it degrades toward Classic and the
    bell/avatar cluster is simply absent on phones
36. `[x]` No-FOUC first paint — CSS only; JS runs after the splash
37. `[x]` Cache correctness — content hashes, no manual version strings
38. `[x]` Upgrade resilience — resolving shims for renamed Frappe internals

## In flight — the component rework

Not a numbered item: a restructuring that items 15–38 will be built on top of, so it
lands first. Desk chrome is governed three ways at once — a monolithic `desk_layout`
preset, per-component settings, and hard-coded mount branches — and the seam between
them produced every defect in 0.10.0.

- `[x]` **Slice 0** — ownership stamps. A native affordance is hidden only once our
  replacement is stamped present, so a failed mount degrades to stock instead of
  deleting the user's logout
- `[x]` **Slice 1a** — `build_cluster` split into bell and user; host registry;
  `inbox_placement` / `user_placement`; migration patch writing what each layout
  *rendered*
- `[x]` **Slice 1b** — form width reclaimed (932 → 1210px at 1280), `desk_layout` read-only
- `[~]` **Slice 1c** — settings UI. Picker CSS moved into the guarded pipeline, shared
  `P` vocabulary, container queries, identity attributes, shape fixture. **3 of 7
  pickers ported** (search, status, layout); palette, notifications, breadcrumbs and
  sidebar remain
- `[ ]` **Slice 2** — remaining containers and tenants; `sidebar_quick_links` and
  `status_in_classic` deleted; master & detail settings form with the desk diagram as
  the placement control

**Chosen settings architecture** (wireframed 2026-08-02): master & detail — a grouped
left list (Overview / Bars & panes / Controls / Appearance), a detail pane with three
zones (placement via a shared desk diagram, style via thumbnail cards, extras as
switches), presets that *write values and then stop existing*, and an active-preset
label derived by comparison so it reads "Custom" the moment anything differs.
