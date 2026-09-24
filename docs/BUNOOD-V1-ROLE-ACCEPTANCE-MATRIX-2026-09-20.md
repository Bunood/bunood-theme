# Bunood V1 Role and Permission Acceptance Matrix

**Document date:** 2026-09-20  
**Epic:** V1-UX-01  
**Authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Execution status:** implemented navigation, fixture foundation, and narrow POS
operator authority; live record-scope and end-to-end acceptance incomplete  
**Exclusion:** this document does not authorize applying unreviewed customer-specific
permission or User Permission changes.

## 1. Purpose

Bunood must feel smaller and clearer for each job without weakening ERPNext's server
permission model. A navigation profile answers **what should be easy to find**. Role
Permissions, User Permissions, workflows, and document state answer **what the user
may do**. Neither may substitute for the other.

The current implementation provides:

- focused client navigation for cashier, sales, purchasing, warehouse, accounting,
  finance, and owner personas;
- unrestricted navigation for Administrator/System Manager;
- run-owned test identities for seven non-administrator personas;
- idempotent `Bunood Cashier` and `Bunood Owner` experience-marker roles; and
- no document, workflow, record, or approval grants from either marker role;
- a separate `Bunood POS Operator` authority role with read-only access to assigned
  POS Profiles and customers, narrow receipt/draft/submit rights for both supported
  invoice types, and create/read/write/submit rights for POS Opening Entry and POS
  Closing Entry, with invoices and shift records restricted to their creator; and
- a self-cleaning live effective-permission gate that rejects manager inheritance,
  cancellation, export/share, journal, and system-settings authority.

The POS authority split follows the pinned ERPNext 16.34.1 model: standard opening
and closing permissions are manager-oriented, and both Sales Invoice and POS Invoice
are reserved for Accounts roles. `Sales User` and `Stock User` do not make either
invoice submittable. Bunood therefore supplies the exact cashier lifecycle rights
without assigning broad Sales, Stock, Accounts, or Manager roles.

The pinned closing implementation independently filters candidate invoices by the
selected profile **and** invoice owner. Assigned-profile/company/warehouse User
Permissions remain mandatory because creator-only DocPerm does not scope the shared
POS Profile or Customer masters by itself.

This matrix defines the evidence required before any persona is promoted as a
supported production role.

## 2. Non-negotiable permission rules

1. Use Role Permissions for DocType actions, User Permissions for record scope,
   perm levels for sensitive fields, and workflows for governed approvals.
2. Use `frappe.has_permission` or document permission checks for authorization.
   Client-side role checks may shape presentation only.
3. User-facing queries must use permission-filtered APIs such as
   `frappe.get_list`; `frappe.get_all` is not acceptable for persona-facing data.
4. A marker role never creates or implies `DocPerm`, `Custom DocPerm`, User
   Permission, sharing, workflow authority, or a permission-hook grant.
5. A hidden menu is not a denial. Every forbidden action needs a server-side
   negative test using the persona user.
6. Company, warehouse, territory, sales-person, cost-centre, project, and POS
   Profile scope must be tested with both an allowed and a forbidden record.
7. Submit, cancel, amend, delete, import, export, share, email, and print are
   separate decisions. Read/write access does not imply them.
8. Owner approval must use a named workflow transition or other explicit governed
   action. It must not require broad direct write access.
9. Administrator remains exceptional. It is never used to prove a normal journey.
10. Any configuration that differs by customer is a versioned role template, not
    an undocumented live-site edit.

## 3. Status notation

| Mark | Meaning |
|---|---|
| **T** | Target capability; must be proved on the configured candidate |
| **D** | Explicit deny target; must have a negative server-side test |
| **W** | Workflow-only target; no equivalent unrestricted write grant |
| **S** | Scope-dependent; allowed only inside tested User Permission boundaries |
| **R** | Requires product/accounting/security review before a target is approved |
| **—** | Not part of the persona's default job |

No mark in this document claims that the current site's effective permissions
already match the target.

## 4. Persona contract

| Persona | Experience marker | Provisional native role basis | Default home | Required record scope | Default density/help |
|---|---|---|---|---|---|
| Cashier | `Bunood Cashier` | Managed `Bunood POS Operator` authority; no broad native Sales, Stock, Accounts, or Manager role | POS shift / Selling fallback | Company, POS Profile, assigned warehouse, allowed modes of payment, own shift/receipt records | Large touch targets, minimal fields, step guidance, keyboard/barcode fast path |
| Sales representative | None | `Sales User` | Sales work queue | Company, territory/customer group/sales person where applicable | Task-first, customer history and overdue context, code secondary to name |
| Buyer | None | `Purchase User` | Purchasing work queue | Company, supplier group and buying scope where applicable | Comparison and exception context; delivery and approval status visible |
| Warehouse operator | None | `Stock User` | Warehouse tasks | Company plus allowed source/target warehouses | Scan/keyboard-first, quantity/UOM prominent, financial detail minimized |
| Accountant | None | `Accounts User` | Accounting workbench | Company, cost centre/project/dimensions as designed | Dense but aligned; explanations and source-document drill-down available |
| Finance manager | None | `Accounts Manager` + `Accounts User` | Finance exceptions | Company plus governed approval and reporting scope | Exception-first, reconciliation and sign-off visible |
| Owner | `Bunood Owner` | Separately reviewed read/workflow roles; marker alone grants nothing | Business pulse / Home fallback | Named companies and approved sensitive-data policy | Plain-language summary first; drill-down and approvals without entry clutter |
| Administrator/implementer | None | `System Manager` only when genuinely required | Readiness/system health | Installed site | Full configuration; risky actions remain explicit and auditable |

An employee self-service persona belongs to the HR/payroll workstream and must be
added before that scope is promoted. It is not silently represented by one of the
operational fixtures above.

## 5. Target action matrix by document family

The table is deliberately conservative. A family expands to an exact DocType list in
the live permission workbook before configuration is applied.

| Document family | Cashier | Sales | Buyer | Warehouse | Accountant | Finance manager | Owner | Administrator |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Customer / sales contact | S: read/select; minimal creation requires a separately accepted flow | S: read/create/write | D | D | S: read | S: read | S: read | T |
| Quotation / sales order | S: read only where needed | S: read/create/write/submit | D | S: read fulfilment only | S: read | S: read | S: read | T |
| Delivery / sales fulfilment | S: read | S: create/read | D | S: read/create/write/submit | S: read | S: read | S: read | T |
| POS opening / sale / closing | S: create/read/write/submit; cancel D | S: read where assigned | D | S: stock-facing read only | S: read/reconcile | S: review/approve W | S: summary/read | T |
| Sales invoice / return | S: POS create/submit; cancel D | S: create/read/write/submit; cancel D | D | S: stock-facing read only | S: read/write/submit within policy | S: cancel/amend/approve R/W | S: read/approve W | T |
| Supplier / purchasing request | D | D | S: read/create/write | S: select/read request | S: read | S: read/approve W | S: summary/read | T |
| Supplier quotation / purchase order | D | D | S: read/create/write/submit | S: read inbound | S: read | S: approve/cancel R/W | S: read/approve W | T |
| Purchase receipt | D | D | S: read/create | S: read/create/write/submit | S: read | S: review | S: summary/read | T |
| Purchase invoice / return | D | D | S: create/read before accounting hand-off | S: stock-facing read only | S: read/create/write/submit | S: cancel/amend/approve R/W | S: read/approve W | T |
| Stock entry / transfer | D except POS consequence | D | S: read | S: read/create/write/submit | S: read | S: read/approve exceptions W | S: summary/read | T |
| Stock reconciliation / valuation | D | D | D | S: count entry; valuation/write R | S: read/post policy R | S: approve W | S: summary/read | T |
| Payment entry / receipts | S: tender flow only; general entry D | S: mapped receipt request R | D | D | S: read/create/write/submit | S: cancel/amend/approve R/W | S: read/approve W | T |
| Bank reconciliation | D | D | D | D | S: read/write/reconcile | S: review/approve W | S: summary/read | T |
| Journal entry / period close | D | D | D | D | S: create/read/write/submit per policy | S: cancel/amend/approve W | S: read/approve W | T |
| Tax/ZATCA configuration | D | D | D | D | S: operational read/run R | S: review/approve/configure R | S: status/read | T |
| Financial reports | D | D except own receivables context | D except buying context | D | S: read | S: read/export | S: read/export R | T |
| Master/system configuration | D | D | D | D | D except accounting masters R | D except finance policy R | D | T |
| User, role, permission, integration secrets | D | D | D | D | D | D | D | T |

## 6. Navigation targets

Navigation remains the intersection of this target and the server-provided allowed
workspaces. It can remove clutter but cannot add access.

| Persona | Expected focused workspaces | Must not be presented by default |
|---|---|---|
| Cashier | Home, Selling/POS, required Stock context, Invoicing/receipt context, operational reports | Buying, Financial Reports, ERPNext Settings |
| Sales | Home, Selling, CRM, Invoicing, relevant reports | Buying, Stock administration, Financial Reports, ERPNext Settings |
| Buyer | Home, Buying, required Stock context, Invoicing, relevant reports | Selling, CRM, Financial Reports, ERPNext Settings |
| Warehouse | Home, Stock, required Buying/Manufacturing/Quality context | Selling, Financial Reports, ERPNext Settings |
| Accountant | Home, Invoicing, Financial Reports, reports, ZATCA | Operational Selling/Buying/Stock workspaces unless separately assigned |
| Finance manager | Home, operational summaries, Invoicing, Financial Reports, reports, ZATCA | ERPNext Settings |
| Owner | Home, operational summaries, Financial Reports, reports, ZATCA | ERPNext Settings and routine setup |
| Administrator | All server-allowed workspaces | None hidden by the profile resolver |

## 7. Top-task acceptance journeys

Each journey runs in Arabic and English at desktop and the supported narrow viewport.
The user must start from their default home, complete without Administrator help, and
recover from one injected failure. Timings are recorded for comparison, not used to
hide correctness failures.

### Cashier

1. Open the assigned shift, confirm opening balance, and reach the sell screen.
2. Find or scan items by name/code/barcode, hold/resume where supported, take an
   allowed tender, submit, and produce the correct receipt.
3. Process a governed return and close the shift with an explainable tender
   difference; ledger, stock, invoice, and closing totals reconcile.

### Sales representative

1. Find or create the permitted customer without exposing unrelated customers.
2. Create and submit quotation/order/invoice through native mappings without
   re-keying shared data.
3. Open the overdue queue, contact the customer, record the next action, and see the
   updated state from the same work queue.

### Buyer

1. Create the approved request/RFQ and compare supplier responses.
2. Create and submit the purchase order through the governed path.
3. Follow order, receipt, invoice, and payment status without gaining posting or
   bank authority that belongs to accounting.

### Warehouse operator

1. Receive and put away a purchase into an allowed warehouse.
2. Pick/deliver or transfer between allowed warehouses using scan/keyboard entry.
3. Count inventory, record variance, and hand an exception to the approval owner
   without seeing forbidden margin or financial-report data.

### Accountant

1. Review/post receivable or payable documents and trace every total to its source.
2. Record/reconcile payments and bank activity with exact outstanding balances.
3. Prepare period/tax close, resolve exceptions, and produce the named reports with
   source-document and ledger reconciliation.

### Finance manager

1. Review the cash, ageing, tax, and close exception queues.
2. Approve or reject a governed transaction without acquiring System Manager.
3. Sign off a period only after the reconciliation evidence is complete.

### Owner

1. Understand cash, receivables, payables, sales, purchases, stock risk, tax status,
   and close readiness from plain-language reconciled cards.
2. Drill from every non-zero number to the exact permitted records that compose it.
3. Approve/reject a governed decision without editing the underlying accounting
   document or seeing restricted personal data.

### Administrator/implementer

1. Complete readiness setup and explain every failed prerequisite.
2. Create/disable users and apply an approved versioned role template.
3. Audit permissions, integrations, backups, and system health without being used as
   the acceptance user for any operational journey.

## 8. Live permission evidence workbook

For every persona on the candidate site, capture the following in a versioned JSON
or CSV artifact tied to the commit, site, company, and fixture run ID:

1. exact assigned roles and disabled-role state;
2. exact User Permissions and applicable-for scope;
3. POS Profile, warehouse, company, cost centre, dimensions, territory, and sales
   person assignments where applicable;
4. `frappe.has_permission` result for each required DocType × permission type;
5. document-level permission result for one allowed and one forbidden record;
6. list counts and record identifiers returned through permission-filtered queries;
7. permitted create actions visible in the UI and the matching server result;
8. explicit negative probes for delete, cancel, amend, import, export, share, print,
   email, setup, and cross-company/cross-warehouse access as applicable;
9. workflow transitions offered and successfully enforced; and
10. cleanup proof showing only run-owned fixtures were removed.

Acceptance fails if a UI action is hidden but the server permits it, if an action is
shown but the server rejects it without a clear explanation, or if a query returns a
record outside the persona's tested scope.

## 9. Implementation order

1. Freeze the accepted MVP release baseline before applying role templates.
2. Inspect effective upstream/custom permissions on the configured V1 site and
   export the initial workbook; do not infer them from role names.
3. Review the provisional targets with Saudi accounting, operations, product, and
   security owners.
4. Implement versioned templates with the minimum changes needed; keep marker roles
   authority-free and put reviewed authority in separately named roles such as
   `Bunood POS Operator`.
5. Add run-owned company/warehouse/POS/document fixtures and automated positive and
   negative permission probes.
6. Run the top-task journeys, reconcile native documents/ledgers/stock/reports, and
   record Arabic/English plus viewport evidence.
7. Promote one persona at a time. Mixed-duty users are a separate acceptance case,
   not the union of assumptions.

## 10. Promotion gate

A persona moves from **implemented, acceptance incomplete** to **verified** only when:

- the exact role and record-scope configuration is versioned;
- every target action and explicit deny has server-side evidence;
- all three top-task journeys pass in both languages and supported viewports;
- navigation, search, create actions, forms, print, dashboards, and mobile
  destinations agree with effective permissions;
- totals reconcile to the authoritative native documents and ledgers;
- failure/retry and denied-action copy is usable and translated;
- run-owned fixture cleanup is proven; and
- product, accounting/operations, security, and QA owners sign the persona record.

Until then, the navigation work is a safe presentation foundation—not a production
permission certification.
