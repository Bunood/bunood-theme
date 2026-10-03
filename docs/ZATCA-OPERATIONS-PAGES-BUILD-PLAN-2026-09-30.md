# ZATCA operations pages — build plan

**Date:** 2026-09-30  
**Status:** first client-monitor slice in source; not deployed, compliance evidence, or production approval  
**Implementation baseline:** Bunood Theme pilot integration branch, installed `ksa_compliance` connector, ERPNext/Frappe invoices  
**Controlling specification:** [Bunood V1 Saudi ZATCA and VAT Operations Contract](./BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md)

## 1. Outcome and boundaries

Deliver two usable views of the **same native connector state**:

1. A **client ZATCA workspace**, inside the client's Frappe site, for guided connection and company-scoped invoice monitoring.
2. A **Bunood operations console**, accessible only to Bunood staff, for onboarding progress and health across clients.

The client view extends the existing `/app/bnd-zatca` Page; it is not a replacement for `ZATCA Business Settings`, `ZATCA EGS`, `Sales Invoice Additional Fields`, `ZATCA Integration Log`, the connector's dashboard, or its reports. The operations console aggregates safe summaries; it is not another ZATCA API client. `ksa_compliance` continues to own OTP/CSID onboarding, signing, XML, QR, invoice counters, reporting, clearance, and transport. ERPNext remains the invoice/accounting source of truth.

No manually uploaded invoice, parallel invoice table, second retry engine, custom XML generator, custom certificate vault, arbitrary sync-frequency selector, or silent Sandbox-to-Production switch is in scope. A queued or HTTP-successful invoice must never be labelled as ZATCA accepted.

## 2. Current baseline to reuse

- `bunood_theme/bunood_theme/page/bnd_zatca/` and `public/js/zatca_workspace.js` already render a read-first, permission-filtered Sandbox setup view. It currently shows a bounded recent sample rather than a complete filterable monitor.
- `bunood_theme/zatca/status.py` already provides a credential-free `get_workspace`, company-specific `get_status`, Sales/POS invoice status, and a guarded `queue_invoice` action that calls the connector's native submission method.
- The connector ships `ZATCA Business Settings`, `ZATCA EGS`, `Sales Invoice Additional Fields`, `ZATCA Integration Log`, `e-invoicing-sync`, a dashboard, and integration reports. Its modes are `Live` and `Batches`; the installed release schedules its batch sync with `hourly_long`. **There is no proven per-client interval setting.**
- The existing Bunood link currently sits under Reports. The connector already owns a ZATCA workspace, so the client view should be discoverable **there**, not presented as a second competing ZATCA module. Bunood keeps ownership of its Page files.
- The older `work/repositories/bunood-theme` checkout does not contain the live `/app/bnd-zatca` Page. Before coding, pin/reconcile the pilot integration source into the chosen canonical branch; do not implement the plan on the older branch and overwrite the pilot Page.

## 3. Architecture and source-of-truth map

```text
Client browser -> Bunood client Page -> permission-checked Bunood read API
                                      -> ERPNext Sales/POS Invoice
                                      -> ksa_compliance settings, EGS, evidence, log
                -> native settings/action links (native connector performs writes)

Bunood staff browser -> internal operations Page -> internal summary cache/registry
                                               <- signed, read-only health response from each tenant site
```

Identify a monitored unit as `(tenant site, company, environment)`, with EGS/device as a child dimension. Never assume one client equals one Company or that two clients share a database. If deployment is single-site, the same permissions and company boundary still apply. The internal console stores only a tenant/site registry and short-lived **non-secret** health summaries. It must never connect directly to tenant databases, proxy OTPs/CSIDs, or cache signed XML, QR payloads, customer details, or full ZATCA responses.

The client API reads native DocTypes at request time. Use indexed, cursor-paginated reads; no replicated invoice/status table. If a native field or record is unavailable, return `unknown` with a reason rather than manufacture a healthy state.

## 4. Client page and workflow

**Navigation.** Keep `/app/bnd-zatca` as the canonical URL. Add one Arabic-labelled shortcut, “الفوترة الإلكترونية (زاتكا)”, inside the existing ZATCA workspace/sidebar. Remove the duplicate Reports shortcut only after the new route is visible to every intended role. Preserve direct links and browser history. If the connector is absent, show an installation explanation rather than a broken module entry.

Add the navigation through a tested, Bunood-owned migration/extension that appends only the missing link; do not edit `ksa_compliance`'s shipped Workspace JSON or replace a customer's customised workspace. Include an idempotency test and a rollback for the navigation change.

**Top of page.** Compact company selector, environment label (Sandbox/Simulation/Production), enablement state, actual sync mode, last confirmed success, oldest unresolved item, and one next action. Never colour a merely configured Sandbox state as Production-ready. Show who can perform the next step.

**Connection path.** A visual checklist for seller identity/address, native settings, EGS/OTP, compliance checks, CSID, test documents, and reviewed Production activation. Each step links to the corresponding **native** form or action; the Bunood Page does not collect OTP/secret values. Distinguish “field present”, “test passed”, and “approved” instead of collapsing them into one checkmark. A production step requires explicit authorised review, not an automatic toggle.

**Invoice monitor.** One paginated table for Sales Invoice and POS Invoice, including supported credit/debit notes. Filters: company, document type, invoice type (standard/simplified), environment, date, and status. Columns: invoice link, issue time, type, amount/currency from the ERP document, operational ZATCA result, last attempt, elapsed age/deadline, and next action. Statuses must distinguish preparing, ready for batch, in flight/unknown, accepted, accepted with warnings, rejected, duplicate response, and clearance switched off. An invoice detail drawer shows sanitised validation messages, attempt/log references, UUID and permitted evidence links, with deep links to native records for full authorised inspection. Do not expose signed XML or customer PII in a broad list response.

**Actions.** Open native settings/EGS/log/report/invoice. Show “Send/retry” only when the existing guarded `queue_invoice` contract permits that exact submitted invoice and connector state; never make rejected or accepted records broadly resendable. Correction goes through native invoice return/amendment and accounting review. The UI must state clearly whether a standard document has been cleared and can be delivered, or a simplified document is awaiting reporting.

## 5. Bunood staff operations console

Host this on a Bunood-controlled operations site/module, **not** in the client's regular sidebar. If a control-plane product/tenant registry already exists at implementation time, reuse it; otherwise create the smallest registry needed: tenant identifier, site URL, allowed company identifiers, client owner/contact reference, and permitted health endpoint identity. Do not create another CRM or ZATCA settings store.

The main table shows client/company, environment, onboarding stage, Live/Batches mode, last successful result, oldest unresolved invoice, pending/rejected/warning counts, last health observation, responsible Bunood owner, and a drill-down link into the tenant site. Filters prioritise “needs onboarding”, “failed”, “late”, and “not reporting”. A detail view displays the checklist, EGS count/state where available, scheduler/worker visibility, recent incident timestamps, and safe action links. Cross-client metrics are aggregates only; individual invoice evidence remains on the tenant site behind its permissions.

Start with **read-only monitoring and deep links**. Staff do not gain an automatic right to change a client's tax configuration or see invoice content. Any future remote mutation would need a separate, signed, tenant-scoped, auditable command design and explicit authorisation; it is not part of this build.

## 6. Minimal backend contracts

Keep existing `get_workspace`, `get_status`, and `queue_invoice` stable. Add only read APIs needed by the two views:

| Contract | Source | Response boundary |
|---|---|---|
| Client summary (`GET`) | Existing connector settings/EGS, native invoice evidence/logs, Frappe scheduler observation | Company-scoped state, non-secret identifiers, verified timestamps, `unknown` where not observable |
| Client invoice page (`GET`) | `Sales Invoice`, `POS Invoice`, `Sales Invoice Additional Fields` and related connector log | Max 50 rows, cursor, server-side filters, permission-checked status and native links |
| Client invoice detail (`GET`) | One permitted invoice plus its latest evidence and logs | Sanitised errors, native evidence references, no credentials or full XML by default |
| Tenant health (`GET`, server-to-server only) | The same client summary, computed on that tenant site | Versioned aggregate schema; site/company/environment key, freshness, counters, oldest unresolved age; no PII/secrets |

Use native Frappe permission-aware queries and verify **both** Company membership and each invoice/evidence permission. A role name alone is insufficient. Client readers: the existing workspace roles, restricted further by native DocType and company permissions. Native settings edit/onboarding stays with existing connector permissions. Submission stays restricted to its existing manager/system-manager action plus record-level checks. The staff operations endpoint uses a separate minimal service identity; allowlist the caller, authenticate each request, rotate its credential, rate-limit it, and log access. Keep support access to a tenant's full records time-bound and auditable.

The operations poller records a non-secret summary and `observed_at`; a stale or unreachable tenant becomes `unknown/unreachable`, never green. Cache freshness and failure reasons appear in the UI. At scale, poll asynchronously with bounded concurrency and backoff, not in the browser request. Never let one unavailable tenant block the whole page.

| Actor | Client overview | Native settings/onboarding | Invoice detail | Submission action | Fleet console |
|---|---|---|---|---|---|
| Client accounts reader/auditor | Own permitted companies | No, unless native permission allows | Own permitted records | No | No |
| Client accounts manager | Own permitted companies | Only with native connector permission | Own permitted records | Existing guarded action only | No |
| Bunood support viewer | No standing tenant-document access | No | No standing access | No | Aggregate health only |
| Bunood authorised support session | Time-limited, audited tenant access | Explicit client approval and native permission | Explicit client approval and native permission | Never implicit | Aggregate health |

## 7. Sync, timing, and alerts

Display the **actual** connector mode. For Batches, describe the installed hourly scheduler and show last observed attempt and queue age. Do not promise an exact “next sync” time unless a reliable scheduler run record exists. A stale scheduler/worker is an operational exception. Do not add a per-client sync interval unless the connector genuinely supports it and it is separately reviewed.

For standard invoices, clearance status controls whether buyer delivery is allowed. For simplified invoices, the monitor calculates age from the actual issuance time and warns well before the ZATCA reporting deadline; it must not wait until the deadline to retry. ZATCA's current resolution says standard tax invoices are cleared before sharing, and simplified tax invoices are reported within 24 hours of generation: [implementation resolution](https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Documents/20230519_E-Invoicing%20Implementation%20Resolution%20English.pdf). Alert on rejected/unknown/ageing documents, stalled worker, and loss of connection; only display credential expiry if the connector exposes verified expiry metadata. Use the existing Frappe notification mechanism and one assigned owner, not a new generic notification product.

## 8. UI and accessibility acceptance

Arabic-first RTL with English parity and Latin `123` numerals, using Bunood's existing typography, green/neutral tokens, spacing and SAR symbol. A restrained status strip, short guided checklist, and dense exception table are preferable to a large decorative hero. Use green only for confirmed success, amber for warnings/delays, red for rejection; text and icon must communicate status without colour alone. Buttons have consistent heights, centred labels/icons, clear hover/focus/disabled states and sufficient contrast. Company/environment/sync fields align on a responsive grid. At narrow widths, the table becomes readable cards or scrolls with a labelled container.

All controls work with Tab, Enter/Space and Escape as appropriate; filter changes do not steal focus. Loading, empty, permission-denied, connector-absent, stale and error states are explicit and translated. Test Arabic/English, RTL/LTR, 200% zoom, keyboard-only and screen-reader announcements. The internal page must never show a client link or action the staff member cannot open.

## 9. Build sequence and acceptance gates

| Slice | Work | Done when |
|---|---|---|
| 0. Freeze baseline | Pick canonical Theme source; compare pilot `/app/bnd-zatca` and connector versions; inventory roles, company model, scheduler fields; snapshot pilot before deployment | No live-only Page code is lost; existing invoice/print/POS tests remain green |
| 1. Read contracts | Add permission-tested, cursor-paginated client summary/list/detail APIs; keep secrets and full artefacts out of broad responses | Sales and POS, two companies, two roles, every native status, and 1,000+ records paginate correctly; cross-company probes return denial |
| 2. Client UI | Expand existing Page; add guided native links, filterable exception/history view, detail drawer; move navigation into ZATCA workspace/sidebar | A client can find the Page, see the exact next setup action, trace a rejected invoice, and open its native evidence without another data store |
| 3. Staff console | Add Bunood-only module/page, minimal tenant registry, read-only tenant health API, async aggregation and stale/unreachable state | Staff can see at least two isolated tenants; no client can open staff route/API; one site outage does not blank the fleet view |
| 4. Operations | Add scoped alerts and owner handoff for rejection, overdue simplified reporting, clearance block, and stalled queue | Alert links identify the affected tenant/company and native invoice; acknowledgement does not change ZATCA state |
| 5. Release | Run contract tests, security review, visual/accessibility tests and connector compatibility checks on a restored staging copy; document rollback; deploy behind feature flags | No Production secrets are copied to staging; no Production enablement occurs; rollback restores previous Page/navigation without altering native invoices |

**Likely code ownership:** extend `bunood_theme/zatca/status.py` only where its existing contract fits; place paginated read queries in a small adjacent `monitor.py`; revise the existing `bnd_zatca` Page, `public/js/zatca_workspace.js`, and `public/scss/zatca_workspace.scss`; add a Bunood-owned guarded navigation patch; and expand `tests/test_zatca.py` plus browser/accessibility acceptance tests. The staff console and tenant registry belong to the Bunood-controlled operations deployment, not the client app. Do not modify the connector's signing, submission, scheduler, or DocType source to build these pages.

**Required scenario matrix:** connector absent; settings absent/disabled; Sandbox configured but unapproved; Production configured; Live/Batches; scheduler stopped; standard clearance success/failure; simplified reporting success/near-deadline/late; Sales/POS; credit/debit notes; warnings; duplicate; timeout/unknown; corrected document; inaccessible company; unavailable tenant; expired staff credential; pagination/filtering; and no-secret-leak checks. Reconcile list counts and drill-downs with native connector records and the connector's reports. A green dashboard alone is not acceptance.

## 10. Decisions before coding

1. **Resolved:** support both separate Frappe sites and multiple companies per site. The monitored key is `(site, company, environment)`. The internal registry and authentication must still be pinned before Slice 3.
2. **Resolved for this slice:** implement from `integration/pilot-upstream-20260929-theme`, which contains the pilot `/app/bnd-zatca` Page. Verify the installed connector version again on restored staging before release.
3. Agree who may view a client's ZATCA records and who may perform native onboarding/retry, including any time-limited Bunood support access.
4. Confirm alert recipients and operational response target. The ZATCA deadline is a legal maximum, not a safe batch target.

The first release should be a **trustworthy monitor and guided navigation layer**. Any additional controls must be justified by a demonstrated connector gap and reviewed against the controlling operations contract before implementation.

## 12. Implementation checkpoint — 2026-10-01 (supersedes section 11 status)

- The separate Bunood-only `bunood_ops` Frappe app and isolated local site now exist at `http://127.0.0.1:8110/app/bnd-zatca-fleet`. This site has its own database and an empty tenant registry; it is not a deployment to the 8100 pilot or 8102 accounting UAT.
- The client Theme branch now contains the dedicated, token-authenticated and company-allowlisted health feed. It returns bounded non-secret Sales/POS aggregates, native connector state, and observation of the **existing** Frappe ZATCA batch job. It does not send/retry invoices or create another sync scheduler.
- The staff app has an Arabic-first Page and Workspace, an HTTPS/hostname-pinned tenant registry, bounded background polling with backoff, stale/unreachable classification, and a native owner ToDo for critical exceptions. A stopped/missing/delayed native batch job marks Batches mode for attention. No invoice payload or ZATCA secret is stored in the fleet summary.
- Pure client contracts, operations unit/integration tests, asset build, Arabic source coverage, and a synthetic Arabic desktop/mobile smoke have passed locally. The synthetic rows are **not** real client monitoring.
- **Open release gate:** the newest Theme work is not installed on 8100 or 8102. Do not deploy it wholesale over those divergent local sites. Rehearse on a restored, sanitised client-site copy, validate actual connector status/permissions/EGS and Sales/POS records, then deploy with a backup and rollback. Configure real HTTPS, separate service identities, host/company allowlists, operator owners, and at least two isolated test tenants before calling the fleet integration operational. A green local empty registry does not establish ZATCA compliance.

## 11. Implementation checkpoint — 2026-10-01

- The client Page now has a read-only, server-filtered Sales/POS invoice table with a permission-checked detail dialog and native-record links. It uses a bounded cursor rather than loading all invoices. Accepted, warning, rejected, duplicate, pending and missing-record results stay distinct. No submission or connector write was added.
- A Page shortcut is decorated into the existing permission-filtered ZATCA sidebar boot payload. The prior Reports shortcut remains as a fallback until the new location is verified on an installed site; the connector's Workspace record is not rewritten.
- Pure tests cover company/evidence/invoice access, cursor ties, status filtering and absence of signed XML/credentials in the detail projection. Arabic source coverage and route-scoped asset build pass. This does **not** replace a restored-site functional and visual check.
- The Bunood-only cross-site operations console is **not yet built**. Its host, tenant registry, service identity, poll credential and owner assignments need a concrete Bunood-controlled deployment before exposing a server-to-server health endpoint. Do not put this view in an ordinary client's sidebar or use one client's database as a fleet registry.
- The existing Windows smoke runner cannot start because its `docker` executable is not on that shell's PATH. Treat the full smoke and restored-site matrix as open acceptance work, not as passing tests.
