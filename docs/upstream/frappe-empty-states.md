# Upstream: empty states — what cannot be fixed from an app

Written 2026-08-19/20, during item 29. Platform measured: **frappe 16.27.0**
(`frappe/__init__.py`) — the stack's image tag is `frappe/erpnext:v16.28.0`,
which is the *erpnext* release, not frappe's. Everything below was measured on a
running desk or read out of the **compiled** bundle, not off a changelog.

Siblings: `frappe-is-rtl.md` (item 7), `frappe-datatable-rtl.md` (item 26),
`frappe-gantt-geometry.md` (item 27), `frappe-overlays.md` (item 28).

---

## 1. Six `null-state` illustrations carry hardcoded hex and are served as `<img>`

`frappe/public/images/ui-states/` ships eight assets, six of them SVGs rendered
as `<img class="null-state" src="…">` (`ui/notifications/notifications.js:353,
483, 532`; `ui/toolbar/search.js:153`). Every one carries literal hex:

| asset | colours |
|---|---|
| `event-empty-state.svg` | **`#171717`** · `#74808B` |
| `notification-empty-state.svg` | **`#171717`** · `#74808B` |
| `list-empty-state.svg` | **`#383838`** · `#A6B1B9` |
| `grid-empty-state.svg` | `#A6B1B9` |
| `empty-app-state.svg` | `#98A1A9` · `#F56B6B` |
| `search-empty-state.svg` | `#2D95F0` · `#A6B1B9` |

`#171717` on a dark desk surface (`#16241F` at this stack's seed) computes
**1.11:1**; `#383838` computes **1.37:1**. An `<img>` referencing an external SVG
accepts no `currentColor`, no CSS variable and no `fill` — only `filter`,
`opacity` and `display`, none of which is a way to set a colour.

**Upstream already tried and the attempt is still in the source, inert.**
`desk/page.scss:221-223` writes `.null-state img { fill: var(--fg-color) }` —
`fill` on an `<img>` element does nothing, and no desk `.msg-box` ever contains a
`.null-state` anyway, so the rule cannot match. That is the strongest evidence
these are a known, unsolved problem rather than a deliberate choice.

**Fix:** render them as inline SVG components whose every paint is a theme
variable. **The existence proof is shipped and public**: Discourse's
`documents-checkmark.gjs` is 279 lines with zero hex, every colour a
`var(--*)`.

## 2. `form/save.js:91` comments out its own freeze message

`frappe.ui.form.save` computes a `working_label` ("Saving", "Submitting",
"Updating", "Amending", "Cancelling") at `:8-16`, threads it into `_call` as
`freeze_message` at `:32` and `:64` — and then `_call` passes
`frappe.call({ freeze: true, /* freeze_message: opts.freeze_message, */ … })`
with the line commented out. So **every document save on the desk shows a
full-viewport blocking overlay with an empty message**. The comment at `:78`
("they can see 'Saving' in freeze message") is stale.

This is the most-seen loading state in the product. Fix: uncomment the line.

## 3. `.message-page` has zero CSS in the entire framework

`grep -rn "message-page" frappe/public/scss/` returns **nothing** (verified
2026-08-19). The 404 / not-permitted page (`pageview.js:150`) therefore renders
with no stylesheet of its own on every unresolved route.

Measured, it is less broken than that sounds — the cartoon lands at 100×100 and
the Home button stays inside the fold at 375×812 — but nothing about that is
*specified*, and the page inherits whatever the desk happens to give it.

## 4. No DOM discriminator exists between loading and empty

`query_report.js` renders its empty state (`:106`) and its loading screen
(`:1161`) from **byte-identical markup**, differing only in the `<p>`. Both are
`.msg-box.no-border`. `common/grid.scss:154` puts `.grid-empty` and
`.list-loading` in one rule. `kanban_board.html:10` names a node
`.kanban-empty-state` whose only content is `__("Loading...")`.

`aria-busy` appears **zero times** in frappe, erpnext, hrms, crm, helpdesk or
`frappe-datatable` (verified across all installed apps).

**Fix, in the order they help:** a `data-loading` attribute on the shared nodes
is the cheap, idiomatic one — Discourse ships exactly that
(`d-conditional-loading-spinner.gts:37`), and frappe-ui already discriminates
its own identical boxes with `data-slot="loading"` vs `data-slot="empty"`
(`ComboboxResults.vue:112-125`). `aria-busy="true"` is the accessibility-correct
companion and a free CSS hook. Without either, no consumer can style a loading
state without also styling an empty one — which is why this app's own kit had to
draw the line at "box, tone and air only" on those nodes.

## 5. `.kanban-empty-state` is a pure loading node wearing an empty-state name

`store.state.empty_state` is initialised `true`, re-set `true` at the top of
`init`, and set `false` when data lands — **unconditionally, regardless of card
count** (`kanban_board.bundle.js:21, 31, 48`; those are the only three
assignments in the file). A board with zero cards still gets `false`. The class
therefore never means "empty"; it means "loading", and its rendered string says
so.

Fix: rename, or make the flag honest.

## 6. The chart widget discriminates loading from empty by child order alone

`chart_widget.js:49-69` appends loading, empty and error into a freshly emptied
`.widget-body`. Loading and empty carry the **identical** class list
(`chart-loading-state text-extra-muted`) and identical inline heights; only
`:first-child` vs `:nth-child(2)` separates them. Any consumer keying on order
breaks silently the day the order changes.

## 7. `.text-extra-muted` pins the child grid's "No rows" below AA

`desk/global.scss:608` — `.text-extra-muted { color: var(--gray-500) !important }`
= `#999999`, which computes **2.85:1** on a white surface, under the 4.5:1 floor.
It is the empty state that sits inside a form the user is actively editing.

`--gray-500` is not bridged by design in this app (bridging it would repaint
every stock consumer of the grey ramp), so the app-level fix is a scoped
re-point. The upstream fix is to stop pinning body-adjacent text to a ramp step.

## 8. The list skeleton hides the whole layout, and covers only `fetch_meta`

`list_view.js:57-79`: `show_skeleton()` sets `.layout-main` to `display: none`
and appends `.list-skeleton` as a SIBLING, then `hide_skeleton()` restores it —
and the pair brackets `fetch_meta` only (`base_list.js:9-20`), which is a cache
hit in steady state. So the skeleton is ~0 frames, the *rows* are unreserved, and
the visible sequence is: two grey bars → empty page chrome → rows.

Related: **Load More has no loading state at all** (`base_list.js:426-430` sets
`start` and refreshes; nothing indicates work), and `no_spinner` is a dead
option — `request.js:51-53` maps `opts.quiet` onto it and nothing ever reads it.

## 9. `body[data-ajax-state]` is not refcounted

`request.js:395` sets it to `"triggered"` in `prepare` and `:428` to
`"complete"` in `cleanup`. With concurrent calls the first completion clears the
attribute while others are still in flight, so it cannot be trusted as a global
"is the desk busy" signal — which is a shame, because it is otherwise the only
one. Cypress (`support/commands.js:271`) and the onboarding tours
(`onboarding_tours.js:343`) both already depend on it.

## 10. Two dead skeleton systems, and a live one that is dark-broken

- `workspace_sidebar_loading_skeleton.html` is bundled (`desk.bundle.js:105`) and
  **never rendered** — no producer in any of the ten installed apps, and no CSS
  for `.workspace-sidebar-skeleton` or `.sidebar-box` anywhere. Its only
  reference is a presence check in `onboarding_tours.js:341`.
- `.freeze-row` (`desk/list.scss:29-41`) is styled and animated; **no JS emits
  it**.
- `@keyframes breathe` is defined **twice** — `desk/list.scss:44` (an opacity
  pulse) and `desk/frappe_datatable.scss:191` (transparent → transparent, its
  middle stop commented out). `desk/index.scss` imports list at `:35` and
  datatable at `:39`, so the **no-op wins** and neither consumer animates.
- The one shimmer that does run, the print preview's
  (`print_preview.scss:114-141`), is painted with bare `#c8cfd5` / `#e2e6e9` and
  has no dark override.

And **`prefers-reduced-motion` appears zero times in all of
`frappe/public/scss`** — every animation in the desk bundle that runs, runs
unconditionally. The only reduced-motion handling reaching the desk comes from
bundled Bootstrap.

## 11. Filed for completeness

- **The tag-search empty state prints its own markup.** `search.js:107` returns
  `"<div>No documents found tagged with {0}</div>"` and `:155` passes it through
  `frappe.utils.escape_html`, so the user reads the literal `<div>`.
- **`.empty-state` in the list sidebar is coloured from a Sass variable**
  (`list_sidebar.scss:53-57`). NOT a defect: `$text-muted` aliases
  `var(--text-muted)`, and the compiled rule is `color: var(--text-muted)`. Filed
  because reading the source suggests otherwise, and this app's own census
  believed it until the bundle was checked.
  **CORRECTED 2026-08-21, during item 31, and the correction is worth more than
  the entry.** That rule cannot match ANYTHING: `.list-sidebar` is never rendered
  in v16 (`list_factory.js:30` hardcodes `hide_sidebar = true`,
  `base_list.js:279-281` sets `no-list-sidebar` unconditionally, and
  `list_view.js` contains the string "sidebar" zero times). The live
  `.empty-state.group-by-loading` and `.group-by-empty` render inside
  `.standard-filter-section .group-by-dropdown` in the PAGE FORM
  (`base_list.js:1085`, `:1097`), which `list_sidebar.scss` does not reach. The
  conclusion still holds — measured live, the node is themed — but by a
  different rule, so the reasoning above was right about the outcome and wrong
  about the mechanism. The whole of `list_sidebar.scss` is orphaned; see
  `frappe-filters.md` §6.
- **The filtered-to-zero copy promises a control that does not exist.**
  `list_view.js:538` says "Clear filters to see all {0}" and no clear-filters
  button is rendered. Both Discourse and Directus converged independently on the
  same architecture: the component that owns the filter state injects the reset,
  and the empty-state component — which owns no filter handle — never does.
  Directus ships `clear_filters` from five routes; Discourse's Reset lives in
  `DFilterControls`, default-on, twelve consumers.
- **`frappe.ui.Page.get_empty_state()`** (`ui/page.js:76-88`) has **zero call
  sites** across all ten installed apps. Dead code shaped like API.
