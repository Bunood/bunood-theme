# Current Build Audit — 2026-09-17

## Executive finding

The build is much closer to a sellable pilot than the screenshots suggest. Its data
and accounting foundation is ERPNext-native, and the canonical shell, role home,
Simple/Advanced system, invoice workbench, print infrastructure, and ZATCA facade
already exist. The remaining risk is concentrated in the first-customer workflow and
visual/state regressions, not in building an ERP from scratch.

Before this implementation pass, the largest confirmed usability gap was the invoice
item flow: users had to use a separate search and **Add item** action before a line
appeared. That contradicted the source document's spreadsheet-first workflow. This
pass replaces it with an always-ready editable item row.

## Evidence and status

| Area | Status | Evidence / finding | MVP action |
|---|---|---|---|
| Native accounting model | Pass | Invoice workbench edits the active `frm.doc`; native setters, validation, save, submit, taxes, totals, stock, and Payment Entry remain authoritative. | Preserve; regression-test. |
| Canonical sidebar/top bar | Pass with regression risk | Registry-driven standardized shell is present on the live Home and invoice route in Arabic; extensive sidebar/home regression tests exist. | Smoke-test representative routes in RTL/LTR. |
| Action-first home | Pass | Live Home exposes frequent business actions and role-relevant summaries. | Confirm sales-role permissions. |
| Real-estate landing | Partial | Specialized routing and surfaces exist, but route persistence has historically regressed. | Include route-specific smoke test; do not block quote-to-cash pilot unless sold as real-estate MVP. |
| Simple/Advanced forms | Pass | Explicit profiles plus mandatory-field fallback; POS Profile now includes naming and payment rows needed for first save. | Verify Customer, Item, Quotation, Payment Entry. |
| Direct invoice sheet | Gap → implemented in this pass | Previous live form showed separate search/Add Item. Source now renders a native Item link in the blank first row and keeps another blank row available. | Build, deploy, browser-verify. |
| Quotation conversion | Gap → implemented in this pass | ERPNext already supplies `make_sales_invoice`; Simple Quotation now exposes it for submitted valid records with create permission. | Verify against a submitted quotation. |
| Payment method | Pass through native flow | Sales Invoice has no universal pre-submit `mode_of_payment`. The existing Payment action opens native Payment Entry after submit, where method and accounts belong. | Do not add a misleading invoice-only field for launch. |
| Print/PDF | Partial | Custom print infrastructure and tests exist; final output depends on company address, tax setup, print format, and language. | Print one Arabic and one English fixture before sale. |
| ZATCA | Partial / configuration-dependent | Workbench exposes status and a server facade; readiness depends on connector, business settings, onboarding, and CSID. | Treat readiness as a per-site launch checklist item. |
| Bilingual/RTL | Partial | Broad Arabic catalogue exists and automated i18n gates are present. New launch-path strings were added in this pass. | Run catalogue checks and RTL/LTR smoke tests. |
| Automated verification | Strong foundation | Focused tests cover invoice safety, native delegation, form profiles, shell, home routes, accessibility invariants, and build budgets. | Run full test, verify, and production build gates. |
| Operational readiness | Gap | A controlled pilot process, backup check, support ownership, and rollback instructions are not product UI. | Complete before accepting live financial data. |

## Root causes behind the repeated UI failures

1. **Multiple responsive surfaces shared intent but not one acceptance matrix.** A fix
   at one width/direction could regress another route or state.
2. **Presentation was sometimes tested as selectors rather than complete tasks.** The
   sidebar could technically exist while being covered, duplicated, or semantically
   reversed.
3. **The invoice workbench preserved accounting correctly but added a search gate.**
   The extra step made the primary task feel unfinished even though native controls
   were underneath it.
4. **Configuration-dependent features looked like product failures.** Print and ZATCA
   require company/site setup and need explicit readiness states.

## Release blockers for tomorrow

- Any failure in Customer/Item creation, Quotation mapping, invoice save/submit,
  Payment Entry mapping, or print/PDF.
- Missing/covered navigation or an unusable direct item row at the pilot viewport.
- Required fields hidden in Simple mode.
- Permission bypass, a draft posting accounting/stock, or a duplicate document.
- Arabic text or directional controls that prevent task completion.

## Non-blocking after launch

Fine-grained animation, broad module simplification, split live preview, optional
dashboard metrics, and specialist ERP documents may ship after the founding customer
can complete the core revenue path.
