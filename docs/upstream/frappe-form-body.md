# Upstream: the desk body — form, grid, sidebar, footer, list, workspace

> Measured 2026-09-08 on `demo.bunood.test`, **frappe 16.33.0**, erpnext 16.34.1, at
> 1440×900 with the theme's shipped defaults in force (`data-bnd-form="cards"`,
> `data-bnd-list="cards"`, side pane Open at stop 5), against this repo at `e5241d4`
> (item 43 slice A0). Every number below was produced by `tools/probe-body.mjs` against
> the live desk, and every rule was read from the vendor's SCSS inside the container
> (`apps/frappe/frappe/public/scss/…`), not from the compiled bundle.

**Why this census exists.** Items 15, 16, 25–31 dressed the body's *frame* — the card
around a section, the pill on a tab, the hover rail on a row — and left the *anatomy*
inside the frame stock. Item 43 rebuilds the anatomy: the field box, the type scale, the
section rhythm, the grid, the sidebar, the activity, the document header, and the width
the whole thing runs at. Each of those has a vendor rule to beat or a vendor variable to
feed, and this file records which is which, with the weight of each.

Re-measure with `BND_URL=http://127.0.0.1:8080 node tools/probe-body.mjs` (writes
nothing; ensures the suite's Item fixture idempotently).

Siblings: `frappe-is-rtl.md` (item 7) · `frappe-datatable-rtl.md` (26) ·
`frappe-gantt-geometry.md` (27) · `frappe-overlays.md` (28) · `frappe-empty-states.md`
(29+30) · `frappe-filters.md` (31) · `frappe-login.md` (32) · `frappe-website.md` (33) ·
`frappe-email.md` (34).

---

## 0. The shape of a form page

Measured ancestry of the two things item 43 moves, on `/desk/item/BND-TEST-001`:

```
.main-section                      ← THE SCROLLER: 100vh, overflow-y auto (main.scss:37-42)
  div › .content.page-container.editable-form › .container.page-body › .page-wrapper
    .page-head                     ← sticky, top 0, z-index 6, content 48px (page.scss:119-131)
    .page-content › .layout-main.layout-two-column
      .layout-main-section-wrapper           ← the column: 873px beside a sidebar, 1150 without
        .layout-main-section                 ← overflow: visible on a form (no .frappe-card here)
          div › .std-form-layout › .form-layout › .form-page › .form-tabs-list + .form-tab-content › .form-section…
        div (.hide on an unsaved doc)        ← the FOOTER'S WRAPPER — a sibling of .layout-main-section
          .form-footer › .new-timeline + .comment-box
      .layout-side-section (277px) › .form-sidebar
```

So **`.form-footer` is not `.form-layout`'s sibling** — the question the plan asked — but
its wrapper IS `.layout-main-section`'s sibling under one parent, which means an
activity column beside the form is grid placement on `.layout-main-section-wrapper`
(form in column 1, footer wrapper in column 2), never a DOM move. Frappe's own sidebar
stays outside that grid, at the end of `.layout-main`.

`.page-head` is sticky with a fixed 48px content height (`--page-head-height`), and the
form tabs stick beneath it at `navbar + page-head - 1px` (`form.scss:527-535`). Nothing
mounts inside the head without feeding that variable; the band (A8a) mounts as the first
child of `.layout-main-section` instead. `.main-section` being the scroller with
`.layout-main-section` overflow visible is what makes a `position: sticky` foot bar
inside the page feasible (A8c) — measure it there before falling back to `fixed`.

The theme's attributes on `<html>` at the time of measurement (the kit state a form is
read under): `data-bnd-form="cards"`, `data-bnd-form-tabs="pill"`,
`data-bnd-form-side="card"`, `data-bnd-list="cards"`, `data-bnd-list-hover="rail"`,
`data-bnd-list-select="bold"`, `data-bnd-ws="soft"`, `data-bnd-report="slab"`,
`data-bnd-crumbs="pills"`, `--bnd-row-h: 32px`. `data-bnd-desk` is the presence mark.

---

## 1. The cap — `--page-max-width: 900px` and everything that reads it

Declared once: `common/css_variables.scss:22`. Read in five places:

| reader | rule | weight |
|---|---|---|
| section head and body | `.std-form-layout .section-head, .section-body { margin: auto !important; body:not(.full-width) & { max-width: var(--page-max-width) } }` — `desk/form.scss:88-96` | (0,2,0) + the `!important` margin |
| section description | `.form-section .form-section-description { max-width: var(--page-max-width); margin: auto }` — `form.scss:30-36` | (0,2,0) |
| the footer | `.form-footer { body:not(.full-width) & { max-width: var(--page-max-width) } margin: auto; padding: 0 15px }` — `form.scss:464-483` | (0,2,0) |
| the workspace | `.layout-main` measured `max-width: 900px; margin-left: 125px` on `/desk/selling` | — |
| `body.full-width` | lifts every one of them (`form.scss:82-86, 93`) | Frappe's own user toggle |

**Measured, the two widths:** on `/desk/sales-invoice/new` (an unsaved doc — the sidebar
is `.hide`, so the column is the full 1150px) the theme's section card is **1126px** wide
and `.section-body` inside it is **900px**, centred with **97px of dead card on each
side** (`margin-left: 97px; margin-right: 97px`). On `/desk/item/BND-TEST-001` (sidebar
shown, column 873px) the card is 849 and the body 817 — the cap does not bind below 900.
The workspace column is 900 in a 1150 section, 125px of gutter each side.

**How it is fixed (A1):** feed `--page-max-width` from our token on `html` — the vendor
reads it at `:root` weight (0,1,0) and a later `html` declaration wins by order — never a
second width on the card. Full Bleed = `none`; Measured Column = 1120; Narrow = 1040;
Original leaves the vendor's 900. `body.full-width` keeps working because it never
touched the variable.

---

## 2. The type scale the body renders at

| element | measured | source |
|---|---|---|
| `.section-head` | **14px / 500**, `#16181d` (`--text-color`), padding 15px | `@include get_textstyle("md", "medium")`, `form.scss:41-45` |
| `.control-label` | **14px / 420**, `rgb(73,77,87)` (`--text-muted`), `margin-bottom: 6px` | `form.scss:155-162` |
| `input.form-control` | 14px, height 30px, radius 8, padding-inline 8, **background `#fbfcfc` on `#ffffff`, no border** | the theme's Floating Panels state; stock adds `--control-bg` |
| `.help-box` | 13px, `#999` (`--text-light`) | `form.scss:428-433` |
| `.form-tabs .nav-link` | 14px | `form.scss:497` |
| `.page-title .title-text` | 13px / 500 | the crumb kit's title |
| grid heading | 13px, `#7c7c7c` (`--gray-600`) | `grid.scss:19-23` |
| list header | 14px / 420 | `.list-row` `get_textstyle("base")`, `list.scss:137-142` |

The diagnosis in numbers: **the section head is the label's size**, the input box is a
1.02:1 tint with no edge, and the help text is one point under the label. Everything is
14 except the things that should lead. A2/A3 give the head 15/600, the label 12.5–13
and the box an edge; `desk_scale` (A1) moves the whole set together.

---

## 3. Control anatomy

```
.frappe-control[data-fieldtype="Data"][data-fieldname]
  .form-group
    label.control-label            ← above the box, 6px under
    .control-input-wrapper
      .control-input › input.form-control
      .control-value (read-only)   ← plain text in place of the box
      .help-box
```

Columns: `.form-column.col-sm-6` (two per section) with 15px gutters; a single
`.form-column.col-sm-12` caps every control at `> form > .input-max-width { max-width:
50% }` above `md` (`form.scss:571-575`) — the rule the settings shell once severed by
moving a bare wrapper out of `.form-column > form` (273px became 636px). `.form-grid`
inside a half column lifts that cap (`form.scss:578-580`). Property Rows (A2) sets the
control's own grid and leaves these chains alone.

---

## 4. The child grid (`common/grid.scss`)

| part | measured | rule |
|---|---|---|
| `.form-grid` | border 1px, radius 10px (theme), bg white (theme; stock `--subtle-accent`) | `grid.scss:5-12` |
| `.grid-heading-row` | **32px**, bg `#fbfcfc`, `#7c7c7c` 13px, border-bottom 1px | `grid.scss:19-23` |
| heading cells | `.grid-static-col, .row-check, .row-index { height: 32px; padding: 4px 8px !important }`, then `.grid-static-col { padding: 6px 8px !important }` | `grid.scss:60-76` — **`!important` paddings** |
| sticky columns | `.row-check, .row-index { position: sticky; left: 0 }`, index at `left: 31px` | `grid.scss:66-74` — physical `left`; the RTL census (item 7) covers it |
| data row | **44px**; cells `border-right: 1px #ededed`, `border-bottom: 0` | measured on the Sales Invoice items grid |
| numeric cells | Float and Currency `text-align: right` already | Frappe's own alignment; A4 keeps it and adds `--bnd-numeric` |
| editable row | `.grid-body .editable-row { --control-bg: var(--neutral); .grid-static-col { padding: 0 !important } }` | `grid.scss:283-291` |
| add row | `.grid-add-row` button in the grid's footer toolbar; no `.grid-footer` element | — |

Two consequences for A4: cell padding can only be changed at equal weight with
`!important` (do not — leave the vendor's paddings and work with borders, heights,
header type and row wash), and the sticky `left` offsets are physical, so a rule that
moves the index column must also move `left`.

---

## 5. The form sidebar (`desk/form_sidebar.scss`)

`:root { --form-sidebar-width: 277px; --form-sidebar-image-width: 80px }`. The image
rule is `.form-sidebar .sidebar-image-section .sidebar-image, .sidebar-standard-image {
width: var(--form-sidebar-image-width); height: …; border-radius: var(--border-radius-lg) }`
at (0,3,0) — measured 80×80, radius 12. **Feed the variable** (`--form-sidebar-image-width:
40px` under the Inspector Rail attribute) rather than out-weighing the rule — the item-40
lesson, and it keeps the wrapper's `fit-content` geometry honest.

The twelve `.sidebar-section`s in order: image (`.hide` when there is none), meta
details, rating (`.hide`), an unnamed hidden one, user actions, **assignments,
attachments, tags, shared** (the four the rail keeps as groups), followed-by, another
hidden, and the "created / modified" footer (`.text-muted.pt-3`). Each `.sidebar-section`
carries `padding: var(--padding-md) var(--padding-md) 0` and its own `.form-sidebar-items`
flex row (`form_sidebar.scss:9-30`). On an unsaved document the whole
`.layout-side-section` is hidden.

---

## 6. The footer and the timeline

`.form-footer { margin: auto; padding: 0 15px; position: relative }` with the 900 cap
(§1), holding `.new-timeline` (the comment composer first, then `.timeline-item`s — 5
on the fixture) and `.comment-box`. Its wrapper is `.hide` until the document is saved.
The Drawer (A6) positions this element off-canvas by CSS under `data-bnd-own~="drawer"`
only; Beside grids `.layout-main-section-wrapper` (§0). Nothing here is moved.

---

## 7. The page head and its actions

- `.page-head`: `position: sticky; top: 0; z-index: 6; border-bottom: 1px` with
  `.page-head-content { height: var(--page-head-height) }` — 48px, fixed.
- `.page-title .title-area > .indicator-pill` — the status pill (`indicator-pill
  no-indicator-dot blue`, "Enabled" / "Not Saved"), a BARE span: there is no
  `.page-indicator-pill` wrapper on 16.33 (measured 2026-09-08), so the crumb kit's
  `html[data-bnd-crumb-pill] .page-head .page-indicator-pill` rule matches nothing on this
  build — a crumb-kit defect to file. The stage path (A8b) owns the bare span under
  `data-bnd-own~="stagepath"`.
- `.page-actions .primary-action[data-label="Save"]` — **one jQuery `click` handler**
  bound by `page.js:283-286` (`$._data(btn, "events") → {click: 1}`), so
  `frm.page.btn_primary.trigger("click")` runs it and the foot bar (A8c) never touches the
  button; it hides it only under `data-bnd-own~="docfoot"`.

---

## 8. The list (`desk/list.scss`)

| part | measured |
|---|---|
| `.list-row-container:first-child` | the header, `position: sticky; top: 0; z-index: 2` (`list.scss:11-15`) |
| `.list-row-head` | 32px, 14px / 420, bg `#fbfcfc` |
| `.list-row` | 45px, 14px; `border-bottom: 1px` |
| `.list-row-col` | `min-width: 150px; max-width: 400px` inside `.level-left` (`list.scss:16-22`, weight (0,7,0) with a `:not()`) |
| alignment | every header cell AND every body cell `text-align: left` — **no stock misalignment on the Item list**; A7 must re-check a list with a Currency column (Sales Invoice) before repairing anything |
| `.level-right` | sticky at `right: 0`, 130px (`no-assign-to`), `border-left: 2px solid var(--highlight-color)` — physical `right`/`left` |
| status | `.indicator-pill.blue.filterable.no-indicator-dot` inside the subject column |

---

## 9. The workspace

`.layout-main` renders at `max-width: 900px` centred (`margin-left: 125px` in the 1150
column); the editor inside is 870. Three `.number-widget-box` tiles with a **14px gap**
here; the dashboard route's tiles abut (the item-43 A9 defect). The same width token
that feeds the form feeds this.

---

## 10. The band's tiles — `in_list_view` per doctype

The decided rule: the band shows the doctype's first four `in_list_view` fields,
excluding the title field and `status`, formatted by `frappe.format`. What that yields
on this site:

| doctype | title | submittable | `in_list_view` (in order) | tiles the rule gives |
|---|---|---|---|---|
| Sales Invoice | customer_name | yes | posting_date, due_date, grand_total, status | posting date · due date · grand total |
| Sales Order | customer_name | yes | delivery_date, grand_total, status, per_delivered, per_billed | delivery date · grand total · % delivered · % billed |
| Purchase Order | supplier_name | yes | transaction_date, schedule_date, grand_total, per_billed, per_received | 4 |
| Purchase Invoice | supplier_name | yes | posting_date, due_date, bill_no, grand_total | 4 |
| Quotation | customer_name | yes | transaction_date, company, grand_total, status | 3 |
| Delivery Note | customer_name | yes | posting_date, grand_total, per_billed, status, per_returned | 4 |
| Payment Entry | title | yes | payment_type, posting_date, paid_from, paid_to | 4 |
| Journal Entry | title | yes | company, total_debit | 2 |
| Customer | customer_name | no | customer_type, customer_group, territory, default_currency | 4 |
| Supplier | supplier_name | no | supplier_type, supplier_group, default_currency | 3 |
| Item | item_name | no | item_group, stock_uom, is_fixed_asset, is_sales_item | 2 + two Checks |
| Employee | employee_name | no | employee_name, department, employment_type, designation, branch | 4 (employee_name IS the title) |
| Lead | title | no | job_title, status, company_name, territory | 3 |
| HD Ticket | subject | no | raised_by, status, priority | raised by · priority |
| CRM Deal | organization | no | status | **none** |

Two things the print settles for A8a: **Check fields make poor tiles** ("Is Fixed Asset:
No") — exclude `Check` and `Table` fieldtypes as well as the title and `status`; and a
doctype can yield zero tiles (CRM Deal), so the band must read correctly with its meta
line alone. No per-doctype table is needed for the doctypes that matter.

## 11. The stage path's states

`frappe.workflow.workflows` is empty for all fifteen doctypes on this site — **no
workflow anywhere** — so the docstatus ladder (Draft · Submitted · Cancelled) is what
every submittable doctype shows first, and the Workflow branch is a branch whose guard
is false on the dev site: A8b's check creates a Workflow fixture and deletes it. Status
Select option counts, for the record of why those were not used: Sales Invoice 13,
Purchase Invoice 10, Sales Order 9, Lead 9, Quotation 8, Delivery Note 8.

## 12. Not ours, noted

`/desk/sales-invoice/new` opens a **"Not found"** dialog on this site (an installed app
references a DocType Property this site lacks); the probe dismisses it. Three resource
loads fail with 400/404 on the same route, in the same cause. Neither is the theme's.
