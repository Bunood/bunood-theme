# Bunood V1 Bilingual Terminology Governance

**Document date:** 2026-09-20  
**Authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Applies to:** owned interface copy, navigation, states, validation, help, reports,
print, notifications, and support content  
**Source of runtime truth:** Frappe/ERPNext translation APIs plus Bunood's reviewed
`ar.po`/`ar.csv`; this document governs meaning and review, not runtime lookup.

## 1. Product rule

Arabic and English are equal products. A route is not complete when its strings are
merely present; each language must communicate the same task, consequence, state,
recovery, permission boundary, accounting meaning, and print result.

Static interface copy follows the selected language. Customer, supplier, company,
item, account, tax, employee, project, and other business data remain exactly as
stored and may legitimately contain either language. Codes and database identifiers
are never translated for logic.

## 2. Ownership and precedence

| Layer | Responsibility |
|---|---|
| ERPNext/Frappe source labels | Reuse when the meaning and Saudi business context are correct; never rename a DocType or field identifier in database/API logic |
| Bunood product glossary | Select stable task-facing terms for owned navigation, composition, help, and state copy |
| Saudi accounting/compliance reviewer | Approve tax, ZATCA, financial-statement, debit/credit, posting, payroll, and legally consequential terminology |
| Arabic product editor | Approve natural Saudi business Arabic, grammar, punctuation, readability, and consistency |
| User research | Confirm actual cashiers, operators, owners, and accountants understand the term in its task context |
| Site Translation DocType | Highest-priority customer override; must be exportable, auditable, reviewed after upgrades, and cannot silently redefine legal/accounting meaning |

Frappe runtime priority is site `Translation` override, compiled MO, CSV, then parent
language fallback. Bunood currently carries PO and CSV Arabic catalogues; a release
must detect conflicting duplicate source/context entries and compile PO to MO before
runtime acceptance.

## 3. Approved core navigation lexicon

These terms are approved for Bunood-owned top-level navigation and mode controls.
They do not mutate upstream route, DocType, workspace, or field identifiers.

| English display | Arabic display | Usage rule |
|---|---|---|
| Home | الصفحة الرئيسية | Stable product home; do not alternate with “الرئيسية” on owned chrome |
| Sales | المبيعات | Sales workspace/family |
| Purchases | المشتريات | User-facing buying workspace; keep upstream `Buying` identifier internally |
| Inventory | المخزون | Inventory/stock work family; “المستودع” is a physical warehouse, not the module |
| Accounting | المحاسبة | Accounting work family |
| People | الموظفون | Employee-facing work family; do not use the literal “الأشخاص” |
| Reports | التقارير | Curated report catalogue |
| Settings | الإعدادات | Configuration entry point |
| Invoicing | الفوترة | Never leave `Invoicing` in an Arabic workspace |
| Point of Sale | نقطة البيع | Use for POS workspace/product; retain `POS` only as a secondary known abbreviation |
| Search | البحث | Global and local search action |
| Apps | التطبيقات | Native application/workspace chooser |
| Account | الحساب | Signed-in user/account destination, not a ledger account |
| Simple | مبسط | Task-focused presentation of the same native document |
| Advanced | متقدم | Full native document presentation; never imply a different database record |

Any change to this table requires an Arabic/English navigation acceptance rerun and
an upgrade review against upstream names.

## 4. Approved routine transaction lexicon

| English display | Arabic display | Usage rule |
|---|---|---|
| Sales Invoice | فاتورة مبيعات | Document label |
| Purchase Invoice | فاتورة مشتريات | Document label |
| Quotation | عرض سعر | Customer quotation |
| Sales Order | أمر بيع | Confirmed customer order |
| Customer | العميل | Field/party label; source data is not translated |
| Supplier | المورد | Field/party label; source data is not translated |
| Company | الشركة | Legal/accounting company context |
| Warehouse | المستودع | Physical/logical warehouse record |
| Item | الصنف | Product/service item record; item name is primary and code secondary |
| Invoice Number | رقم الفاتورة | Do not expose only an internal series/code label |
| Posting Date | تاريخ الترحيل | Accounting-effective posting date |
| Due Date | تاريخ استحقاق السداد | Payment due date |
| Payment Method | طريقة السداد | Tender/settlement method selected by user |
| Quantity | الكمية | Numeric quantity |
| Unit Price | سعر الوحدة | Price per selected UOM |
| VAT | ضريبة القيمة المضافة | Use the configured tax facts; never hard-code a rate in prose |
| Total | الإجمالي | Context total; label and source must remain identifiable |
| Grand Total | المجموع الإجمالي | Final document total before any separately stated settlement context |
| Draft | مسودة | Native draft state |
| Save Draft | حفظ كمسودة | Saves without submitting |
| Save and Submit | حفظ واعتماد | Native save then submit; not a ZATCA submission label |
| Cancel | إلغاء | Native document cancellation; destructive confirmation names the consequence |
| Remove | إزالة | Remove an editable row/control; do not use for native document cancellation |

## 5. Terms that require context

The following English words must not receive one global Arabic replacement:

| Source concept | Required disambiguation |
|---|---|
| Account | User account (`الحساب`) versus ledger account (`حساب محاسبي`) versus bank account (`حساب بنكي`) |
| Entry | Journal entry (`قيد يومية`), payment entry (`سند دفع أو قبض`), and stock entry (`حركة مخزون`) are different business objects |
| Submit | Native document approval/submit (`اعتماد`) versus submit/send to an external authority (`إرسال`) |
| Return | Sales/purchase return (`مرتجع`), return action (`إرجاع`), and navigation back (`رجوع`) |
| Posting | Accounting-effective posting (`ترحيل`) versus sending data to an API; never use one for the other |
| Outstanding | Amount still due; wording must identify receivable/payable and sign instead of a literal ambiguous adjective |
| Debit / Credit | Must be reviewed in accounting context; customer credit note, bank credit, and ledger credit are not interchangeable labels |
| Stock / Inventory / Warehouse | Stock quantity (`مخزون`), inventory discipline (`إدارة المخزون`), and warehouse (`مستودع`) remain distinct |
| Clear / Report | ZATCA clearance and reporting are regulated lifecycles, not generic success synonyms |
| Approved | Workflow approval, document submission, provider certification, and regulatory compliance are separate claims |

Use Frappe translation context where the same source literal has distinct meanings:
Python `_("Change", context="Coins")`; JavaScript
`__("Change", null, "Coins")`. When context is unavailable, use a complete,
unambiguous source phrase rather than a fragment.

## 6. Writing and implementation rules

1. Write a complete extractable source literal. Python uses
   `_("Created {0} records").format(count)`; JavaScript uses
   `__("Created {0} records", [count])`.
2. Never put f-strings, JavaScript template literals, concatenation, variables,
   conditionals, HTML, or leading/trailing whitespace inside translation calls.
3. Translate user-facing errors, dialog titles, breadcrumbs, help, notifications,
   empty states, recovery actions, report labels, print labels, and accessible names.
4. Do not translate DocType names, field names, statuses, routes, codes, or API values
   when they are used as identifiers. Translate only their display label.
5. Keep placeholders intact and reorder them where Arabic grammar requires.
6. Use logical CSS properties and explicit bidi isolation for mixed Arabic/Latin
   names, identifiers, numbers, dates, currency, phone, email, and hashes.
7. Never machine-translate customer/business data to create a monolingual screen.
8. Do not add an app translation that duplicates a correct inherited string. Add an
   override only for a reviewed semantic or product-context reason.
9. Clear the site cache after catalogue/override changes; compile PO to MO for the
   deployed v15/v16 runtime before live verification.
10. Translation changes and the matching Arabic/English acceptance ship together.

## 7. Review workflow

Every new or changed owned string follows:

1. product owner supplies task, persona, screen/state, source literal, and consequence;
2. domain owner confirms business/accounting meaning;
3. Arabic editor supplies natural contextual Arabic and flags ambiguous source copy;
4. implementation uses an extractable literal and optional translation context;
5. automated extraction/catalogue/conflict checks run;
6. reviewer checks Arabic and English in the rendered state, including error and
   recovery, long text, mixed data, and narrow width;
7. a representative user validates terminology during the relevant research task;
8. the glossary decision records owner, date, context, superseded term, and reason.

Tax, ZATCA, legal identity, financial statements, payroll, GOSI/WPS/Qiwa, privacy,
and employment terms additionally require the named Saudi domain reviewer.

## 8. Release gates

- Owned-source catalogue coverage is complete with an explicit, reviewed exemption
  list; coverage percentage cannot prove semantic correctness by itself.
- No English owned label appears in an Arabic surface and no Arabic owned label
  appears in an English surface.
- PO/CSV conflicts, duplicate context keys, placeholder mismatch, unextractable
  construction, and stale site overrides fail the release check.
- Navigation, actions, status, validation, help, print, notification, and recovery
  parity pass for every promoted route.
- Arabic glyphs, punctuation, wrapping, line height, bidi order, numbers, and currency
  remain readable at every supported width and print size.
- User testing meets the language-parity threshold in
  `BUNOOD-V1-USER-RESEARCH-AND-USABILITY-PROTOCOL-2026-09-20.md`.

## 9. Runtime workflow reference

For the pinned Frappe v16 line:

1. use `_()` in Python, `__()` in JavaScript, and `{{ _() }}` in Jinja;
2. generate/extract catalogues through the supported Bench translation commands;
3. compile PO to MO;
4. clear site cache; and
5. verify exact rendered routes and outputs in both languages.

The repository's `npm run i18n:check` remains a fast owned-source gate. It does not
replace Bench extraction, MO compilation, runtime cache refresh, or contextual human
review on the configured candidate.
