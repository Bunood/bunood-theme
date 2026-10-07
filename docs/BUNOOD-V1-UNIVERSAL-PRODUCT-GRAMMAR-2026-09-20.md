# Bunood V1 Universal Product Grammar

**Document date:** 2026-09-20  
**Epics:** V1-UX-02 through V1-UX-06  
**Authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Executable declaration:** `quality/v1-acceptance-manifest.json`  
**Status:** target contract; individual existing surfaces retain their evidence state
from `BUNOOD-V1-EXECUTION-LEDGER-2026-09-20.md`

## 1. Product promise

Bunood presents one calm, legible system from first-time cashier to expert
accountant. Complexity is disclosed when the job needs it, not removed from the
underlying ERP document. Every route should answer five questions immediately:

1. Where am I?
2. What requires my attention?
3. What information must I enter or understand?
4. What will the primary action do?
5. What happened, and how do I recover if it failed?

This grammar governs Bunood-owned presentation. ERPNext remains authoritative for
documents, permissions, validation, workflows, posting, stock, tax, and ledgers.

## 2. System-wide principles

1. **One source document.** Simple and Advanced modes edit the same `frm.doc`; no
   parallel invoice, payment, stock, customer, or approval model is allowed.
2. **Task before module.** Role homes begin with today's work and exceptions, then
   KPIs and broad navigation.
3. **Name before code.** People identify items, customers, suppliers, warehouses,
   and accounts by meaningful names. Codes remain visible as secondary traceability.
4. **Neutral before branded.** White and neutral surfaces carry content. Dark green
   marks the brand, current selection, primary action, or success—not every card.
5. **Progressive disclosure.** The default view contains the minimum complete job;
   Advanced exposes the full native document without moving to a different record.
6. **Consequences before confirmation.** Labels state outcomes such as Save draft,
   Save and submit, Record payment, or Cancel invoice.
7. **Recovery is part of the component.** Failed work restores controls and focus,
   preserves safe input, explains the consequence, and offers one clear next step.
8. **Arabic and English are equal products.** RTL is structural, not a mirrored
   afterthought; all owned copy, layout, icons, numbers, and truncation are tested.
9. **Permission-aware by construction.** Navigation and actions reflect effective
   server permissions; hiding a control never constitutes authorization.
10. **Evidence before promotion.** A component or route is not “done” because one
    screenshot looks correct. It must pass its declared matrix and data result.

## 3. Foundation tokens

Existing Bunood tokens remain the implementation source. New work must consume those
tokens rather than introduce isolated hex values, radii, shadows, spacing, or type
scales.

| Token family | Contract |
|---|---|
| Neutral surfaces | Page, panel, input, hover, selected-neutral, divider, and disabled states remain visibly distinct in light and dark themes |
| Brand/semantic colour | Dark green is reserved for brand/current primary/selected/success; warning, danger, information, and neutral states use their semantic tokens |
| Spacing | Use the shared spacing scale; no component-specific “almost the same” gaps |
| Typography | One Arabic-capable UI stack; predictable heading/body/meta scale; Arabic line height must not clip ascenders or descenders |
| Geometry | Ordinary controls use restrained shared radii; circles are for avatars/icon buttons, and pills only for compact statuses or true segmented choices |
| Borders/shadows | Borders express structure; shadows express elevation. Do not stack both decoratively on every section |
| Motion | Short functional transitions only; respect reduced-motion preference and never blank the page during a panel transition |
| Focus | Shared visible focus ring with sufficient contrast in both themes and directions |

### Pill rule

Pills are allowed only for statuses, compact counts, tags, or a genuinely exclusive
segmented choice. Navigation rows, ordinary buttons, cards, field containers, and
section headings must not be rounded into decorative capsules. Simple/Advanced is a
restrained segmented control: the active option is dark green, the inactive option
is neutral/white, and both remain recognizably rectangular controls.

## 4. Canonical shell

### 4.1 Ownership

- One top bar owns route identity, global search, language/account access, and the
  single navigation toggle appropriate to the viewport.
- One sidebar owns desktop workspace navigation. One drawer owns the same hierarchy
  on compact widths. They never coexist as competing visible navigation.
- Breadcrumbs communicate hierarchy and remain readable in Arabic without clipping.
- Route content owns its heading and actions; the shell must not repeat a second
  competing document heading.

### 4.2 Desktop and tablet

- Content is centred inside the available canvas after accounting for the sidebar.
- Collapsed and expanded navigation preserve a deliberate content gutter.
- Section containers share an aligned content edge and usable maximum width.
- Search and create actions never obscure the route title or document state.

### 4.3 Compact and phone

- The menu control must open a modal drawer with a labelled close action, focus
  management, outside/Escape dismissal, scroll containment, and RTL-safe placement.
- Bottom navigation has four stable, evenly distributed destinations: Home, Apps,
  Search, and Account. A permission-limited destination becomes unavailable through
  the correct product decision; remaining items do not sit in a lopsided three-cell
  layout.
- Fixed bottom navigation and sticky document actions reserve safe-area and content
  space so neither hides the last row or action.
- Text may wrap to two deliberate lines where necessary; Arabic glyphs may never be
  clipped by fixed line boxes.

### 4.4 Unsaved navigation

When leaving an edited document, Bunood uses the native dirty state and offers a
clear keep-editing/discard/save decision as appropriate. A mode switch, sidebar
toggle, preview, or language UI must not discard edits or create another document.

## 5. Canonical form anatomy

Every promoted form uses five ordered zones. A zone may be compact when its content
is small, but its purpose and position remain stable.

| Zone | Purpose | Required behavior |
|---|---|---|
| 1. Identity and state | Document type, meaningful name/number, lifecycle, unsaved state | One heading; restrained status; no duplicate banner title |
| 2. Business context | Company, party, dates, source, responsible person, high-value configuration | Most important fields first; required state obvious; related context grouped |
| 3. Primary work | Items, allocations, stock movement, payment, master data, or report filters | The task receives the largest visual share and supports keyboard/touch entry |
| 4. Totals and validation | Subtotal, discounts, tax/VAT, total, outstanding, stock/accounting consequence, errors | Large, clear hierarchy; derived values visibly read-only; errors adjacent and summarized |
| 5. Actions and continuation | Primary outcome, secondary actions, preview, tools, next-document behavior | One primary action; result and recovery explicit; sticky only when it does not cover content |

### 5.1 Field grid

- Default desktop groups use a balanced responsive grid rather than arbitrary field
  widths. Related fields share a row and visual width unless one genuinely needs more
  space.
- Long selectors such as customer/item may span two columns. Short dates, quantity,
  currency, tax rate, and codes should not consume the same width by accident.
- At compact widths the grid becomes one logical reading column or two short paired
  fields when both remain legible.
- Labels, required markers, help, values, and errors align consistently in RTL/LTR.
- Read-only fields remain readable and do not resemble disabled missing data.

### 5.2 Simple and Advanced

- The mode control sits inline with the form's own section/header rhythm, never
  floating at an unrelated canvas edge.
- Simple shows the minimum complete task, plus any mandatory native fields that the
  current configuration introduces.
- Advanced reveals the full native layout on the same document.
- Switching modes preserves values, scroll context where practical, dirty state,
  validation, permissions, and lifecycle actions.

## 6. Data-entry grammar

### 6.1 Search and identity

- Results show the human name first; code, barcode, VAT number, or other identifier
  appears as secondary text.
- Search supports Arabic/English names and exact codes without changing source data.
- Empty, loading, no-result, denied, and network states are visually different.
- “Create new” appears only when the user has server permission and the quick-entry
  path preserves required business data.

### 6.2 Transaction rows

- Completing the last meaningful row creates exactly one ready row for continued
  entry where rapid repeated entry is appropriate.
- An untouched ready row is presentation scaffolding. It is pruned before validation
  and persistence, never blocks save/submit, never alters totals, and never prints.
- Deleting the ready row may recreate one ready row; users are not required to delete
  it before saving.
- Quantity, UOM, rate, discount, tax consequence, warehouse/account, and line amount
  remain understandable without horizontal hunting.
- Errors identify the exact row and field using the human item name where possible.

### 6.3 Tables and cards

- Desktop uses aligned tables for comparison and repeated numeric work.
- Compact views may use row cards only when column compression would destroy meaning;
  cards keep the same information order and actions.
- Selection, bulk actions, sorting, filtering, pagination, empty state, and recovery
  remain native or share one documented pattern.
- Product images use real media or a calm neutral placeholder. A missing/broken image
  must never become a bright green block.

## 7. Action grammar

### 7.1 Hierarchy

| Level | Use | Visual treatment |
|---|---|---|
| Primary | The single most likely safe next outcome | Dark green filled; specific verb and consequence |
| Secondary | Preview, save alternate, create another, supporting route | Neutral/white bordered or text action |
| Overflow | Infrequent document tools | Labelled menu with grouped actions |
| Dangerous | Cancel, delete, destructive reversal | Danger semantic treatment plus consequence confirmation |

### 7.2 Document-state examples

| State | Primary candidate | Notes |
|---|---|---|
| New/draft | Save draft or Save and submit | Expose both only when both are permitted and meaningfully distinct |
| Valid draft requiring posting | Save and submit | Confirmation describes ledger/stock/tax consequence where material |
| Submitted unpaid invoice | Record payment | Uses the native mapper; does not invent an invoice payment ledger |
| Submitted quotation | Create Sales Invoice/Order as configured | Uses native mapping and permission checks |
| Submitted receipt/document | Print or next governed task | No fake edit action |
| Cancelled | Amend when permitted | Cancellation remains visually clear |

### 7.3 In-progress and failure

- Only the invoked action becomes busy unless the native document truly must lock.
- Double activation is idempotent and cannot create duplicate financial/stock data.
- On client validation failure, controls re-enable immediately and focus moves to the
  first actionable error.
- On server rejection, conflict, or integration failure, preserve safe input, state
  whether anything was saved/submitted, and provide one recovery action.
- Success states announce the actual result and navigate only after persistence is
  confirmed.

## 8. State and recovery grammar

`docs/SYSTEM-STATES.md` defines the existing shared feedback component. V1 acceptance
also covers form validation, write conflict, partial success, and integration
rejection as scenarios owned by their domain controller.

| Scenario | User must understand | Required recovery |
|---|---|---|
| Loading | What bounded result is loading | Wait without losing context; cancel only when genuinely supported |
| Configured empty | Setup is valid but no records match | Create, change filters, or continue—according to permission |
| Setup incomplete | Which prerequisite is missing and who can fix it | Direct permitted users to exact setup; others to a named owner |
| Validation error | What must change before the action can succeed | Focus first field and preserve all safe input |
| Permission denied | Which action/resource is unavailable | Safe return or request-access route; never masquerade as empty |
| Recoverable error | Request failed and no unsafe side effect occurred | One idempotent Retry |
| Conflict | Another change won and what local input remains | Reload/merge decision without silent overwrite |
| Partial success | Exactly what succeeded and what remains | Resume only the incomplete step without duplication |
| Delayed/offline integration | Core ERP availability versus delayed external service | Continue safe local work or Retry/status check |
| Integration rejected | Provider/regulator rejected a specific submission | Show reference/reason, preserve native state, correct and resubmit safely |

## 9. Preview and supporting panels

- Preview opens as a stable side rail or bounded panel; the document canvas remains
  mounted and visible beneath a non-destructive scrim.
- The whole page must never blank while price, print, tax, or document preview loads.
- Loading, empty, error, and retry are contained inside the panel.
- Tabs and close controls remain visible; focus enters the panel and returns to the
  invoker on close.
- Live preview identifies that it is a draft summary rather than the final PDF when
  they are not identical.

## 10. Bilingual and RTL contract

- Owned Arabic and English catalogues ship together. Missing translation is a gate,
  not an acceptable mixed-language fallback for promoted routes.
- Direction follows the UI language while individual business values use correct
  bidirectional isolation.
- Logical CSS properties govern spacing and placement. Direction-specific overrides
  require a documented semantic reason.
- Chevrons, progress direction, drawers, breadcrumbs, table alignment, and action
  order follow language direction; universal symbols do not flip arbitrarily.
- Currency amounts keep unambiguous number/currency order and exact halala precision.
- Arabic copy uses natural Saudi business terminology reviewed in context, not word-
  for-word translation.
- Labels wrap before truncating. When truncation is necessary, the full accessible
  name and a discoverable visual value remain available.

## 11. Accessibility contract

- One `h1` identifies the route/document and headings form a logical hierarchy.
- Every field has a programmatic label; placeholder text is never the only label.
- Status is not communicated by colour alone.
- Modal/drawer focus is contained and restored. Escape behavior is predictable.
- Keyboard order follows reading/task order in LTR and RTL.
- Touch targets are at least the product's shared accessible control size and do not
  overlap at phone width.
- Axe blocking findings, keyboard task completion, 200% zoom/reflow, contrast, and
  reduced-motion behavior are recorded for promoted representative routes.

## 12. Role-adjusted density

The grammar is shared; density and default disclosure adapt by job.

| Persona | Default emphasis |
|---|---|
| Cashier | Touch/scan speed, item and tender clarity, minimal interruptions |
| Sales/buyer | Party, product, status, follow-up, and mapping continuity |
| Warehouse | Item, UOM, quantities, source/target location, scan and exception |
| Accountant | Source, dimensions, tax, balances, reconciliation, and audit trail |
| Finance manager | Exceptions, approvals, ageing/cash/tax/close reconciliation |
| Owner | Plain-language position, change, risk, and governed drill-down |
| Administrator | Readiness, configuration, migration, integration, and system health |

Role adjustment may change ordering, density, defaults, and help. It may not alter
the authoritative document, hide a mandatory consequence, or grant authority.

## 13. Anti-patterns that fail V1 review

- Green-filled media placeholders, green section fields, or green-tinted page floods.
- Every block inside a rounded card, or ordinary actions rendered as decorative pills.
- Duplicate page/document headings or two competing sidebars.
- Three-item bottom navigation stretched unevenly across the viewport.
- Floating mode buttons detached from the form's content edge.
- Fixed widths that clip Arabic glyphs, labels, or fields.
- Code presented as the primary item/customer/supplier identity.
- Blank full-screen transitions for drawers, preview, saving, or loading.
- A permanent empty transaction row treated as business data.
- Disabled controls after an error with no recovery.
- Client role checks used as authorization.
- Dashboard numbers without a permission-filtered drill-down and reconciliation.

## 14. Acceptance and change control

`quality/v1-acceptance-manifest.json` declares representative surfaces, personas,
languages, widths, themes, lifecycle states, required contracts, and structural/live
gates. `node tools/v1-acceptance-manifest.mjs` validates that declaration only; it
never claims the gates ran.

A grammar change must:

1. update this document and the executable manifest when scope changes;
2. use shared tokens/components rather than route-specific imitation;
3. add or update focused structural tests;
4. add live bilingual/responsive/role/state evidence for the affected surface;
5. reconcile affected business data and negative permissions;
6. update the execution ledger with the exact evidence state; and
7. rerun the full release gate before any production promotion.

Existing narrower evidence remains valid only for its named surface and candidate.
The manifest's target matrix is deliberately larger than current proof.
