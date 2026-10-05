# Official edition: simplified business screens

The release is based on official 8a6ff1e plus the reviewed integration ancestry 4ef671d. It adds the team business screen controllers, not the team tenant/bootstrap platform. Prepared release metadata is 0.50.0; release tags require completed acceptance and verified main history.

## Coverage

| Team source | Official destination | Integration |
| --- | --- | --- |
| sales_bill.js / _sales_bill.scss | /desk/sales-invoice/new and /desk/purchase-invoice/new; existing invoice forms | Full native-field composer, items, customer/supplier, totals, native save/submit, payment checkout and delivery controls; Advanced restores native form. |
| simple_forms.js | Native Quotation, Sales Order, Delivery Note, Purchase Order, Purchase Receipt, Material Request forms | Task panels and actions over original native fields, with reversible Advanced mode. |
| simple_forms.js / _journal_compact.scss | /desk/journal-entry/new and /desk/payment-entry/new | Simplified transaction panels retain native posting and document permissions. Customer, Supplier and Item masters receive related task forms. |
| journal_workbench.js + journal_workbench.py | /desk/bnd-journal-workbench | Reviewed integration provides the journal review and draft operations. |
| accounting_desk.py | /desk/bnd-accounting-home | Team read-only accounting queues and bank evidence, wrapped in an explicit company and Accounts role check. Linked from Reports landing and its native Workspace. |
| report_landing.js | /desk/reports | Searchable permission-filtered entry to all custom finance/report Pages. |
| report_studio.js | /desk/bnd-report-studio | Reviewed sales, purchasing and accounting catalogue and custom results; retains newer official permission and null guards. |
| report_workbench.js / _report.scss | Native /desk/query-report routes | Filter scope, numeric presentation and retry recovery, preserving native query execution and export. |
| finance_close.js, banking_workbench.js, asset_workbench.js | /desk/bnd-finance-close, /desk/bnd-banking, /desk/bnd-asset-workbench | Reviewed custom close, bank and asset desks. |
| invoice_delivery.py, zatca/delivery.py | Invoice email/PDF/XML actions | Narrow permission-checked delivery dependencies, using the site's native PDF renderer. |

Bunood Selling and Bunood Buying stage Workspaces are supplied by the setup application; native Selling and Buying remain available. Accounting navigation is owned here.

## Preserved behavior

Owner Q7 font and inline public/private logo behavior are retained from 1db2a8d, with native File read permission and resolved-path containment added before any local byte read. Missing, denied and oversized images fall back to no image. Existing print layout and site renderer remain intact. Invoice controllers do not force `disable_rounded_total`; no team finance validation hooks, ZATCA enqueue API, tenant seeds, readiness gates, onboarding replacement or Home overwrite are imported. Installation only adds absent invoice settlement/payment-origin metadata and preserves existing definitions. Original real estate, engineering and manufacturing forms do not opt into Simple mode. Original login and public pages are unchanged by this screen import. Detached Fast Sale invoice controllers cannot mount invoice presentation: a connected native Form route is required.

## Validation

The first CSS7f7c2fbc complete attempt was canceled after a genuine Socket.IO
namespace authentication failure; it has no full-suite verdict. Its original
136 mutable settings were independently verified restored. Local Node DNS with
ADDRCONFIG blocked in the kernel's rtnl_dumpit; the test-only proxies now send
native authentication through their own numeric internal HTTP endpoints while
retaining native cookie, Host/Origin equality and exact site namespace checks.
Both isolated browsers connected as Administrator to their exact namespaces
with zero console errors. Independent polling probes rejected port80 and
accepted port8080 on both sites, closing their own sessions. The actual complete
container switch/placement matrix and console budget then passed2/2 filtered
checks. No console allowlist or historical baseline was weakened. A fresh
unfiltered run passed564/564 on2026-10-05, exited0 with no cleanup warnings and
cleared its process wakefulness request. All136 original fields and both language
values matched the independently recorded state after cleanup (SHA256
`a0fca810504b7e58f202815ea65ab62c1f45d88233d3ca765c63704fa9175f99`).
The40709-byte full log SHA256 is
`48a8a43c74d393f1dbce813155ab0b67d8d0df276cf5449dd9f09e5ad28bbc5e`.
Final-image acceptance remains pending.

- Build and payload gate pass on the sidebar and gallery corrections: Desk CSS 39,266 gzip bytes (`bunood.7f7c2fbc.css`), Desk JS 187,678 (`bunood.1347875d.js`); caps 39,500 / 188,000 leave 234 / 322 bytes respectively. Both local acceptance servers served byte-identical final CSS/JS.
- 149 invoice, simple-form, Reports landing, Report Studio and routing Node tests pass; 21 finance/bank/journal/asset Node tests pass.
- 31 site-free Python tests pass, covering company/role boundaries, source availability, owner logo behavior, Page permission navigation and finance/print regressions.
- Arabic coverage passes: 2,557 source strings, eight existing exemptions. The imported screens include Arabic dictionary entries and the two payment decisions Mixed Payment/On Credit; the owner's existing translations remain preserved.
- Delivery runtime checks passed: 11 invoice-delivery and 9 ZATCA-delivery tests. The adapter's separate 10 tests cover native permissions and response projection.
- The full unfiltered live browser run passed564/564, including native print ownership/logo checks; original settings and both language values were independently verified restored. Final-image acceptance remains pending. Interrupted earlier runs are not passes. Source checks alone do not establish runtime acceptance.

## Local runtime runner

Set `BND_URL=http://127.0.0.1:8187`, `BND_SITE=team-rc.localhost`, `BND_BACKEND=bunood-team-rc-bench`, and optionally `BND_BROWSER_EXECUTABLE` to an installed Chromium/Edge executable. Windows host Edge was found at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; the override is also supported by `tools/session.mjs`.

After root synchronizes/migrates the local runtime, create the isolated fixtures with `node tools/portal-fixtures.mjs --create` and `node tools/desk-fixture.mjs --create`, then run `node tools/verify.mjs --quiet --log artifacts/official-full-smoke.log` with those environment variables. The runner uses Docker to mint its Administrator session, prune its stale sessions, and snapshot/reset/restore Theme Settings and language; run only on the disposable acceptance site. It needs one Company for the portal fixture. No production site is targeted.

Windows acceptance uses `127.0.0.1` for the HTTP host: Chromium resolves `*.localhost` internally, but Node API requests may use OS DNS and fail to resolve it. Keep `BND_SITE=team-rc.localhost` for bench operations. The native form assertions additionally require an Item named `BND-TEST-001`; `tools/fixtures-views.mjs` only creates `BND-VIEW-*`, so those gallery records do not satisfy this prerequisite. Preserve any existing canonical item and create a non-stock test Item only in the disposable site before the full run.

## Business-screen acceptance selectors

Journal Entry deliberately uses the compact `.bnd-journal-actions` toolbar and `.bnd-task-workbench` in its default Simple mode; its redundant `.bnd-simple-form-head` is hidden, with the Simple/Advanced switch moved into the toolbar. Payment Entry keeps its header visible. Verify the active mode button and native account grid, and switch to Advanced to verify restoration, rather than asserting that every document has the same header geometry.

RE billing fixtures in a KSA-enabled acceptance site must classify their own synthetic Item Tax Templates (`custom_zatca_item_tax_category`) and Tax Categories (`custom_zatca_category`). A standard taxable synthetic treatment uses the exact option `Standard rate`; exemption options and any required `custom_category_reason` must match installed KSA metadata. Item-level classification overrides invoice-level category. Theme adds no server tax validation hooks and production guards remain enabled.

The full smoke's native-layout checks explicitly select Advanced before inspecting native Item sections or the pinned document foot. Advert/deprecation checks wait for their intentionally hidden subject to be attached, then retain their own hide/room/edit-mode geometry assertions. The flyout keyboard matrix establishes LTR before its first arm and separately exercises RTL; palette navigation checks Frappe's semantic List/Item route rather than assuming the URL ends in `/item`. These are source-level test corrections; only a subsequent complete runtime run can establish the full-suite verdict.

Invoice ZATCA status now calls `zatca.status.get_invoice_status`, a GET-only, native-permission-checked adapter. Saved invoices bind company to the invoice; new forms require invoice read/create plus Company read; missing named invoices never fall back to setup lookup. The response omits XML, validation logs and credentials, and only exposes connector navigation when readable. The workspace helper and transport behavior remain unchanged. Ten adapter tests cover these boundaries. The synced runtime passed five Arabic business-screen probes, with native controllers and no visible errors.

Every accessibility scan has a 120-second hard deadline. A timeout attempts browser shutdown and joining the canceled evaluation within a bounded cleanup, while preserving the fatal suite error so the outer settings/language restoration runs. No later test runs after this error. Five isolated tests cover findings, normal errors, cancellation, rejected close and unsettled cleanup.

### Accessibility stall diagnosis

Paired read-only probes on the same local settings page established the cause: Axe entered the print `about:srcdoc` frame (`sandbox="allow-same-origin"`, scripts forbidden) and its partial-result collection exceeded 60 seconds. Excluding that frame alone completed in 5.1–7.3 seconds with zero picker violations. The scan now audits the exact generated print HTML separately via an intercepted same-origin page whose CSP also forbids document scripts; the original iframe sandbox is unchanged. Its violations are included both in the settings hard gate and the shared baseline scan, without rebanking the baseline.

The standalone scan exposed a real missing document title. The preview wrapper now supplies an escaped localized title, with a regression test. The controlled captured-document experiment with that title correction passed seven Axe checks with zero violations; settings passed eighteen checks with zero violations (one incomplete). Runtime must be synchronized and the complete suite rerun before claiming release acceptance. Six site-free print-preview tests pass.

## Native domain and PDF evidence

The separate fresh native acceptance site installed the exact thirteen-app native profile and migrated twice. Engineering passed82/82 at04650f6 (installments41, financial journey14, client portal27); Real Estate passed183/183 at e6903f3 (home16, native operations3, billing55, receive-payment47, independent Claim recovery1, occupancy17, rent roll27, fixture inventory17). Exact tracked archives were selected through process-local PYTHONPATH; MariaDB snapshot isolation stayed ON/REPEATABLE READ. CRM privacy8 and leads28 also passed. These are local runtime results; final-image acceptance remains a separate release requirement.

Native draft Sales/Purchase Invoice records rendered with their managed A4 formats, explicit Bunood style and no test letterhead. Both PDFs are one page; Chromium/Skia metadata confirms the actual engine, and rendered PNGs were reviewed. Explicit style selection preserves the site's selected stock style. This does not establish submitted-invoice ZATCA clearance, legal readiness or owner letterhead output. Engineering's client-portal PDF path uses native wkhtmltopdf independently of the Chromium invoice path.

The actual simplified quantity input and invoice-tools buttons saved and submitted one native Sales Invoice and one Purchase Invoice on the isolated site. Read-only GL verification found five and ten native rows respectively, balanced within fixture tolerance. Both ZATCA phases were disabled in the fixture company. This proves these two quantity-edit flows, not all payment methods or locked native fields.

All four targeted financial UI flows have clean local acceptance: Sales Invoice (five GL rows), Purchase Invoice (ten), Journal Entry (two) and Payment Entry (two), each balanced. The Journal and Payment receipt `finance-final-acceptance.json` records one uninterrupted run against served `bunood.1347875d.js`, without merging earlier evidence: both expanded native Journal controls were edited to 475, and the actual Payment amount was changed to 125 followed by Tab to the native Get Outstanding Invoices button. Both drafts had zero GL before native Simple submission, both submitted successfully, and the browser reported no errors. Native readonly controls were not bypassed. This targeted evidence does not replace full-suite or final-image acceptance.

## Deterministic browser acceptance

The new Setup workspace `Bunood Selling` precedes `Selling` in the native module list. The hover test now names Selling exactly, matching its keyboard arm. A filtered live check passed LTR keyboard/hover, RTL keyboard and restricted Desk User permissions. Three filtered native-layout checks passed density, Hairline Panels and Compact13. Native form mode is shared by baseline capture and enforcement through the real Advanced switch, including the two empty-grid contrast checks. These filtered results do not establish a full-suite verdict.

Item-row count changed the historical Axe label count14 to20. A paired same-record scan with Theme assets blocked found the identical20 unlabeled native row checkboxes. The strict helper requires matching nonempty unique Item inventories and failure identities, confirms the stock runtime is absent and assets were actually blocked, and rejects every unknown or Theme-owned label target. Its16 negative/cleanup source tests and the actual20-node pair passed. Historical baseline data and every other route/rule remain unchanged.

The native Selling dashboard had no previous-period records, so Frappe omitted all percentage-stat nodes. The contrast test now creates its own native Dashboard, Number Card, required Chart and two marker-filtered ToDos. Only the newly created owned historical ToDo receives fixture creation metadata eight days earlier; native get_result and percentage APIs must prove current2/previous1/100 before commit. Native browser rendering must show100% before the original light/dark and three-state contrast assertions. Ownership of all five parent documents is verified before the first cleanup deletion. The helper permits exactly the three documented test sites and requires allow_tests plus Administrator;13 safety tests and the filtered actual contrast check passed, with cleanup. No existing dashboard, financial record or accounting guard is changed.

Native Version history deliberately renders old/new field values verbatim. The i18n helper accepts only matching same-record Version entries and exact native formatted bold value leaves; accessibility attributes stay checked. Its six positive and seven negative browser cases and the two actual filtered i18n checks passed. Native Item image/attachment accessibility failures also require a strict same-record stock pair with Theme assets blocked. Exact attachment metadata, inventories and qualified failures must match. Unrelated stock-only improvements are allowed, while every outside Theme target must also exist in the stock scan and remains unsubtracted from the historical gate. A new Theme target cannot be hidden by another target disappearing at the same rule count. Twenty-six safety tests passed, including the actual DOM classifier's rejection of ownership markers on the sidebar root and descendants. Both the stock-only logo case and the root ownership case failed before their corrections. Historical baselines were not increased.

Arabic screenshots of all five simplified business screens passed with aligned visible sidebars and no browser errors. Visual review found a real native-show regression: jQuery writes inline block when it shows the CSS-hidden sidebar, placing its absolute child below the full-height placeholder. The scoped CSS correction restores the native flex layout only for visible inline block on a non-narrow Theme Desk. Native inline none and the single Theme ownership hide remain effective. The new native-method regression failed on block before correction and passed afterwards. Open, native collapsed, Rail, hovered Rail and Hidden screenshots were reviewed; measurements proved all five states and exact restoration of the disposable site's settings, defaults and language. The earlier Arabic-language helper's lost original snapshot remains explicitly unverified; the final captures left its current state unchanged.

The complete run against CSS4906d457/JS1347875d passed560/563: the attachment comparison included an unrelated stock header logo, a width test waited for a native layout hidden by Simple mode, and the console budget caught Windows network suspension. The comparison is now scoped as above; only the width test's form row switches through the real Advanced control, retaining every edge measurement. Actual focused width and console checks subsequently passed with process-scoped wakefulness, without changing the machine power plan or the console error allowlist. Personal-restoration cleanup remains fatal on uncertainty. The subsequent complete unfiltered run against CSS7f7c2fbc/JS1347875d passed564/564; its final cleanup and original state were independently verified as recorded above.

The focused accessibility scan then reached a gallery defect that the earlier failure had masked. Native metadata gray and missing-image initials did not meet contrast requirements on themed tiles. The scoped gallery rules now use the existing mode-aware muted ink token. A new actual native-gallery contrast test failed before correction and passed after correction in light and dark modes. Original has no views anchor, so its presentation is unchanged. Label growth from14 to20 came from the first-page Item inventory; a separate stock context rendered the same20 Item identities with the same20 native label failures and no Theme runtime. The label helper now validates the measured Item/Image route, native header structure, checkbox/title/body identities and exact cur_list metadata before comparison. Twenty-two safety tests pass; missing encoded attributes cannot coerce to the valid Item name `null`, and root or descendant Theme ownership rejects the exception. Historical contrast and other baselines remain unchanged.

The shared scan excludes the existing script-forbidden email preview iframe as well as the print preview iframe, matching the settings hard gate. Parent controls remain scanned, the exact print specimen remains audited separately, and existing rendered-email checks retain child coverage. This resolves the measured settings scan stall without increasing its deadline or accessibility baseline.

## Expanded native editors and print ownership

The original Simple-mode CSS hid every descendant `.form-layout`, including a
native Journal Entry row editor. The corrected selector hides only the root
native form layout; native grid sections and tabs keep their own visibility and
readonly rules. The compiled-CSS regression failed before the correction and
passed afterwards for journal, stock and delivery wrappers. Native field edits
also exposed an independent mount bug: selecting the first descendant layout
could select the expanded grid editor and insert its workbench ancestor inside
itself. `ensureMounted` now anchors at `.std-form-layout > .form-layout`.
The browser regression reproduced the original `HierarchyRequestError` before
the correction and verifies the nested editor survives refresh and root replacement.

Payment's Simple profile had omitted the native Get Outstanding Invoices and
Get Outstanding Orders controls. In a paired same-draft probe, amount 125 plus
Tab entered the empty references grid under Theme and exposed a native delayed
row-focus race; stock moved to Get Outstanding Invoices without error. Both
existing native controls now precede references in the allocation panel, retaining
their native handlers, visibility, dependencies and permissions. The 28 relevant
source/browser tests pass, including native node/event identity, keyboard order,
hidden-control behavior and readonly preservation. The final native UI run above
confirms the corrected served JS `bunood.1347875d.js`; final sidebar/gallery CSS is `bunood.7f7c2fbc.css`.

Print checks exercise the one-time stock-style claim separately from ongoing
sync preserving a later owner choice. Temporary changes are rolled back and the
original print default is verified. Logo composition uses unique native File
attachments with actual PNG bytes, rather than fabricated file URLs; native
File permissions and binary resolver behavior are preserved. The fixture passes
binary content directly to native File insertion and explicitly rolls back its
transaction so native upload cleanup callbacks run. Seven safety tests and both
exact native print test bodies passed; eight earlier byte-verified owned residues
were removed, leaving none. Both current filtered smoke print checks passed;
both also pass in the final564/564 unfiltered run recorded above.
