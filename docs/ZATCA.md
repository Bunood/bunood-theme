# ZATCA sandbox setup and Bunood invoice workflow

Bunood presents ZATCA readiness and invoice status for **Sales Invoice** and
**POS Invoice**. It delegates UBL generation, signing, invoice counters, QR data,
reporting, clearance, retries, and validation records to the maintained
`ksa_compliance` app. Bunood never sends CSID tokens or secrets to the browser.

The controlling Bunood specification is
[`BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md`](./BUNOOD-V1-SAUDI-ZATCA-OPERATIONS-CONTRACT-2026-09-20.md).
Use that contract for lifecycle states, duplicate handling, evidence,
reconciliation, production approvals, and acceptance criteria. This shorter
page is only the operator-oriented setup guide.

ZATCA applies to invoices issued by the company. The panel therefore appears on
Sales Invoices, not ordinary Purchase Invoices received from suppliers.

## ZATCA workspace

Open **ZATCA workspace** at `/app/bnd-zatca` from Reports. It shows the
permission-filtered company, connector installation, Sandbox configuration,
onboarding/CSID presence, enablement, and a bounded list of recent Sales and POS
validation records. Use **Open native ZATCA settings** for seller identity,
OTP onboarding, compliance checks and CSID; use the native record links for
XML, QR and response details. The workspace is read-only: it does not onboard,
send invoices, switch servers, or activate Production. Its state indicators are
configuration observations, not tax or legal approval.

## Current port 8100 test-site status (2026-09-29)

The `rc20.localhost` pilot uses `ksa_compliance` 0.61.7. An active company
settings record points to **Sandbox**, but `enable_zatca_integration` is off.
Six controlled Sales Invoice compliance-endpoint documents already exist:
standard invoice/credit/debit notes were cleared and simplified
invoice/credit/debit notes were reported. They have XML and QR artefacts. There
is **no POS Invoice Sandbox evidence** and no completed production-mode Sandbox
handoff yet. The six records are not permission to activate Production.

Run the read-only inventory before any new test:

```sh
bench --site rc20.localhost execute bunood_theme.acceptance.zatca_sandbox_verify.run
```

The verifier does not onboard, create documents, change settings, or call
ZATCA. `zatca_sandbox.run` is different: it mutates settings and creates
accounting documents. Run that script only on a backed-up disposable clone,
never as a routine check on port 8100.

The connector installation and the Bunood facade are separate steps:

1. Install and migrate `ksa_compliance` on the site.
2. Create one active **ZATCA Business Settings** document per company.
3. Onboard the EGS device and complete the connector's compliance checks.
4. Obtain a CSID for the selected ZATCA server.
5. Enable the integration and choose Live or Batches.

Do not invent legal identity fields: seller data must match the entity's Saudi
National Address and registration. Synthetic test identifiers must remain
clearly isolated from real customers and production credentials.

## Safe sandbox onboarding

1. Open **ZATCA Business Settings** from the ZATCA panel on a Simple Sales
   Invoice and create a record for the company.
2. Select **Sandbox** as the Fatoora server. Do not use Production credentials
   for local testing.
3. Verify seller name, VAT number, country, currency, company unit, unique EGS
   serial, business category, building number, street, district, city, postal
   code, and the required seller identifier such as the CR number.
4. Keep transaction type at **Let the system decide (both)** if the company
   issues both B2B and B2C invoices. Choose **Live** for immediate test feedback
   or **Batches** when testing the review-and-send queue.
5. Run the connector's automatic ZATCA CLI setup and its setup check.
6. Click **Onboard** and enter the OTP obtained for the target Fatoora test
   environment. OTPs and CSID secrets must stay in the native settings prompt;
   they are never entered in the invoice form.
7. Run **Perform Compliance Checks**, using valid standard and simplified test
   customers, a taxable item, and the correct tax category.
8. Obtain the CSID, enable the integration, and save the settings.

## Production-mode Sandbox rehearsal on a disposable site copy

1. Back up the site and restore it to an isolated test hostname. Verify the
   restore before changing any ZATCA setting. Never copy Production CSIDs into
   this rehearsal.
2. Confirm the current buyer-delivery gate is installed. With integration
   enabled against Sandbox, customer email, WhatsApp handoff, and final print
   must stay blocked; use internal validation records for evidence.
3. Complete Sandbox onboarding and obtain the Sandbox-issued production CSID
   using the connector's native workflow. Keep all credentials in native
   password fields; do not place them in scripts, logs or browser responses.
4. Create synthetic standard and simplified **Sales Invoice and POS Invoice**
   cases, plus linked credit/debit notes. Submit through native ERPNext paths,
   inspect the latest `Sales Invoice Additional Fields` record, and verify the
   UUID, signed XML, QR, invoice type, attempt history and ZATCA response.
5. Standard cases must reach `CLEARED` and return a cleared XML artefact before
   any production buyer handoff can pass. Simplified cases must be locally
   signed with QR and reach `REPORTED`; exercise the reporting queue and its
   deadline monitoring. Test warnings, rejection, timeout/retry and duplicate
   responses without reusing an invoice UUID as an unreviewed shortcut.
6. Check Arabic and English Phase 2 prints, the protected PDF/XML downloads,
   and exact email attachments with a test-only recipient. Review tax and legal
   content with a qualified Saudi reviewer before any Production change.

## Test from the invoice workbench

1. Create a Sales Invoice in Simple mode. The ZATCA panel shows the company
   server, sync mode, and the exact missing setup step.
2. Use a customer with a VAT registration number and required buyer identifiers
   to exercise a standard B2B invoice (clearance).
3. Use an eligible consumer customer to exercise a simplified B2C invoice
   (reporting).
4. Add taxed items, save the draft, then submit it through ERPNext's native
   validation and confirmation flow.
5. Watch the ZATCA panel. It links to the generated **Sales Invoice Additional
   Fields** record for XML validation details, QR presence, UUID, warnings, and
   errors. In Batch mode, **Send to ZATCA** queues the connector's native send
   operation; already accepted invoices are never resent.
6. Confirm the exact final state. **Accepted with warnings** is usable only
   after its warnings are reviewed; it is not a clean acceptance. A
   **duplicate response** is a separate reconcile-first state and must never be
   shown or counted as accepted merely because the API did not reject it.
   Correct rejected documents through ERPNext's amendment/credit-note rules;
   do not edit a submitted invoice in place. Keep delayed simplified invoices
   in the retry queue with their attempt history until reporting is resolved.
7. On a POS Invoice, the same connector record is scoped to `POS Invoice`, not
   a similarly named Sales Invoice. A receipt is printed or offered for
   delivery only when the server says it is ready; managers can open its ZATCA
   record and queue a permitted retry. Sandbox documents remain blocked from
   customer delivery.

## Production boundary

Passing the sandbox workflow proves software connectivity and document
generation. It does not certify the company's tax configuration, legal identity
data, invoice classification, or operational procedures. Production activation
requires the entity's real Fatoora credentials and an accounting/compliance
review. Never copy sandbox credentials into Production or log CSID secrets.

This documentation is operational guidance, not legal or tax advice. Saudi
production activation and any claim of regulatory conformity require review by
the company's qualified Saudi tax/compliance adviser and authorized approver.
