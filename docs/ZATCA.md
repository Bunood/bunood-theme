# ZATCA sandbox setup and Bunood invoice workflow

Bunood presents ZATCA readiness and invoice status inside the **Simple Sales
Invoice** form. It delegates UBL generation, signing, invoice counters, QR data,
reporting, clearance, retries, and validation records to the maintained
`ksa_compliance` app. Bunood never sends CSID tokens or secrets to the browser.

ZATCA applies to invoices issued by the company. The panel therefore appears on
Sales Invoices, not ordinary Purchase Invoices received from suppliers.

## Local test-site status

The `verify.bunood.test` site uses `ksa_compliance` 0.61.7. The app supports
Frappe 15 and 16. Its installation and the Bunood facade are separate steps:

1. Install and migrate `ksa_compliance` on the site.
2. Create one active **ZATCA Business Settings** document per company.
3. Onboard the EGS device and complete the connector's compliance checks.
4. Obtain a CSID for the selected ZATCA server.
5. Enable the integration and choose Live or Batches.

The local Bunood Demo company still needs a complete ZATCA address before step
2. Its test data currently has no building number, district, or company category.
Do not invent those legal identity fields: enter values that match the entity's
Saudi National Address and registration.

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

## Test from the Simple Sales Invoice

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
6. Confirm the final state is accepted, accepted with warnings, or rejected.
   Correct rejected documents through ERPNext's amendment/credit-note rules;
   do not edit a submitted invoice in place.

## Production boundary

Passing the sandbox workflow proves software connectivity and document
generation. It does not certify the company's tax configuration, legal identity
data, invoice classification, or operational procedures. Production activation
requires the entity's real Fatoora credentials and an accounting/compliance
review. Never copy sandbox credentials into Production or log CSID secrets.
