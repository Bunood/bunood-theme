# The zerONE brand in bunood_theme — report

The owner renamed the product **Zero One** («زيرو ون», zerone-erp.com) on 2026-10-15 and asked
for an icon of our own design. This branch (`feat/zerone-brand`, from v0.59.0 `e58eda4`) changes
what a user sees that names the product, and nothing else: no identifier, DocType, `bnd_` field,
CSS class, translation context, font family, header, copyright line, shipped patch, GitHub URL
or stored record name is renamed. Not pushed, not tagged, version not bumped.

The repo keeps no `docs/dev/`, so this report lives beside the other integration notes in `docs/`.

## Commits

| Commit | Subject |
| --- | --- |
| `8008282` | feat(brand): the Zero One tile is the vendor mark |
| `6e7dcc3` | feat(brand): Zero One is the shipped name, and the old default moves |
| `262ecd5` | feat(brand): the page header shows the Zero One icon |
| `8d0fae3` | feat(brand): the bill header's seal and wordmark come from boot |
| `ca55fe2` | feat(brand): the visible text says Zero One |
| `641a88b` | feat(brand): custom-field labels say Zero One, and existing ones follow |
| `a9e3626` | feat(brand,i18n): record names keep their key and read «زيرو ون» in Arabic |
| `8cb27fe` | chore(brand): a shorter brand_mark note, inside the desk JS budget |
| `0a6e1d2` | build: the zerONE brand's bundles, asset map and Arabic |

## What changed, file by file

**The icon**
- `public/images/zerone-mark.svg` (new): the approved tile, drawing byte-identical to
  `scratchpad/brand/zerone-icon.svg` (checked after stripping the comment), plus this repo's
  comment block: the vendor mark; one file for the tab favicon, desk splash, sign-in logo and
  the desk's brand tile; the identity's literal colours, not the tenant palette; pure paths
  because a favicon has no fonts. `width`/`height` 100 keep the old mark's intrinsic size.
- `context.py`: `VENDOR_MARK` → `/assets/bunood_theme/images/zerone-mark.svg` (a new name
  busts cached favicons); its note lists the new uses.
- `public/images/bunood-mark.svg`: **kept**, marked retired. Nothing in this repo or in
  dining-shift, biz-owner-review, bunood_real_estate, bunood_engineering or bunood_setup uses
  its path, but `bunood_crm/docs/dev/theme-contract.md:158` still names it; delete it once that
  page names the new file.
- `email.py`: the comment that named the mark.

**The name**
- `presets.py`: `SITE_DEFAULTS["company_name"]` = "Zero One". No other shipped default names
  the product (the tagline ships empty); the rest are record names (below).
- `patches/v0_60_0/zerone_brand.py` + `patches.txt` (before `heal_unknown_placements`, which
  stays last): Theme Settings `company_name` → "Zero One" only where the stored value, stripped,
  is "Bunood" or «بنود»; and the custom-field texts whose installers only insert when missing
  (Payment Entry `custom_bunood_payment_origin` label, Sales/POS Invoice `custom_bunood_is_held`
  label, Sales Invoice Payment `custom_bunood_reference_no` description), only where they still
  read the old shipped text exactly.

**The page header**
- `boot.py`: `bnd_logo` = the Theme Settings logo, else `VENDOR_MARK`; `bnd_company` = the
  field, else `_vendor_name()`. Neither is ever empty now.
- `public/js/bunood.js`: no "B" / "Bunood" literal; `brand_mark()` serves the pane's brand row,
  the page head's pill, the start pill and now the dock chip.
- `public/scss/chrome/_dock.scss`: the chip paints no fill; the mark fills it, contained, under
  the chip's radius (the icon carries its own tile). `_sidebar.scss`: a note on why the tile
  must stay fill-less.
- `api.py` + `theme_settings.js`: the Branding specimen's sidebar cell draws the vendor mark when
  no logo is set and says "the Zero One mark".

**The bill header** — `public/js/sales_bill.js`: the seal is an `<img alt="">` of
`frappe.boot.bnd_logo`, the wordmark is `frappe.boot.bnd_company`. `_sales_bill.scss`: the seal
paints no fill and contains its image. `_invoice_team_design.scss:8` still hides both.

**Text**
- `hooks.py`: `app_title` "Zero One Theme", `app_publisher` "Zero One".
- Help texts: `theme_settings.json` (favicon field; the QR picker's "Zero One formats"),
  `theme_settings.js` (splash/tab notes, "the Zero One mark", "Needs the Zero One panel").
- Titles: "Zero One Home" (`home.js`, `bnd_home.js`, `bnd_home.json`, `home.py` link label and
  the sidebar's unused `title`) and "Zero One POS" (`bnd_pos.json`, `bnd_pos.js`, the eight
  dialog/page titles in `pos_workbench.js`, `home.js`). Both Page JSONs carry a new `modified`
  so migrate syncs the title (Pages sync by timestamp, DocTypes by hash).
- Copy: `banking_workbench.js`, `finance_close.js`, `simple_forms.js`, `bnd_inbox.js`,
  `readiness_review.py` (×2), `readiness_work.py` (guard; new projects "Zero One readiness —
  {0}"), `migration_reconciliation.py`, the rehearsal doctype's import note, `setup.py`'s install
  message; `i18n/providers.py` glossary keeps "Zero One" Latin.
- Custom-field labels: `payments.py`, `pos.py` (label + description), `readiness_work.py` (×3),
  `migration_scope.py` (×2).
- `locale/ar.po`: every changed msgid's Arabic moved to the new msgid with «بنود» → «زيرو ون»
  («لبنود» → «لزيرو ون»); the counter's `msgctxt "Bunood POS"` stays. "Bunood POS" and "Bunood
  Home" keep a row too (a stored Page title or link can still show them). Record-name rows keep
  their msgid and read «زيرو ون» (list below). Every other «بنود» in the catalogue is the word
  for items/lines and was left; two dead rows naming "the Bunood formats" were not touched.
  `translations/ar.csv` regenerated with `node tools/i18n_po.mjs emit` (3,864 rows; every
  removed row is a brand row).

**Tests** — `tests/test_zerone_brand.py` (new, site-free, 9 tests), `tests/sales_bill.test.cjs`
(+1), `tests/test_home_contract.py`, `tests/pos-workbench.test.cjs`, `tests/smoke.mjs` (identity
specimen and reset-chip checks; not run here, it needs the deployed stack).

**Build** — six bundles moved (desk CSS and JS, Home, Banking, Finance Close, POS) and
`assets.py`. No payload ceiling raised: desk JS 27 gzip bytes free, desk CSS 64, POS JS 126.

## What was proved, and how

- **Baseline**: `node build.mjs` at v0.59.0 in the lab container was byte-identical (clean tree)
  before any change; the final rebuild at HEAD is also byte-identical to what is committed.
- **Gates** (lab container, Node 24, main checkout's `node_modules` mounted read-only):
  `node tools/i18n_po.mjs emit`; `node tools/i18n.mjs check` → 3,432 strings, 8 exempt, coverage
  complete; `npm run interface:test` → 308/308; `node build.mjs` (all build-enforced guards,
  including the plural guard and coverage) → green; `node tools/payload.mjs --check` → within
  budget.
- **Targeted tests**: `node --test tests/{banking-workbench,finance-close,simple_forms,
  home-navigation,pos-workbench,sales_bill}.test.cjs` → 213/213. Python (`python -m unittest
  discover -s tests -p <file>`): test_zerone_brand 9, test_auth_context 12, test_home_contract 14,
  test_readiness_work 5, test_readiness_review 6, test_migration_scope 21, test_pos_workbench 36,
  test_pos_register 6, test_payment_setup_contract 6, test_banking_workbench 5,
  test_finance_close 4, test_custom_fields 3, test_letterhead 10 — all OK.
  `test_official_screen_boundaries.py` needs pytest, which the bench env lacks (not run).
- **Fail first**: run against v0.59.0's sources, all 9 brand tests fail and the bill test fails
  on "the seal holds no letter".
- **Lab** (`bunood-zerone-lab`: the team-rc bench volume with this worktree bind-mounted as
  `apps/bunood_theme`, own redis `bunood-zerone-redis`, port 127.0.0.1:8202, site
  `bnb.localhost`): `bench --site bnb.localhost execute bunood_theme.patches.v0_60_0.zerone_brand.execute`
  moved `company_name: Bunood -> Zero One` and the four insert-only field texts; a second run
  printed "nothing to rename". The readiness/data-import labels followed by running their
  installers (`ensure_readiness_work_fields`, `ensure_migration_data_import_fields`).
  `extend_bootinfo` served `bnd_company` "Zero One" and `bnd_logo` the vendor mark (45 `bnd_*`
  keys, so the boot `try` did not swallow anything). `/login` serves
  `<link rel="shortcut icon" href="/assets/bunood_theme/images/zerone-mark.svg">`, the sign-in
  logo `zerone-mark.svg`, `og:site_name` "Zero One", title «دخول · Zero One»; the asset is 200
  `image/svg+xml`.
- **Screenshots** (`scratchpad/brand/shots/`): `00-desk-as-configured-team-design-rtl.png`,
  `01-sign-in-ar.png`, `01-sign-in-en.png`, `02-desk-pane-light-rtl.png` (+ `02z` zoom),
  `03-desk-pane-dark-rtl.png` (+ `03z`), `04-favicon-tab.png`, `05-desk-pane-light-ltr.png`,
  `06-desk-pane-dark-ltr.png`, `08-start-pill-bottombar-rtl.png` (+ `08z`), `09-dock-rtl.png`
  (+ `09z`), `10-sales-bill-header-rtl.png`. The zooms show one tile, not boxed twice, not
  cropped, in light and dark, LTR and RTL. To shoot the theme's own pane, Theme Settings'
  container fields and Administrator's language/theme were changed for the shots and then
  restored from a snapshot ("identical to snapshot: True").

## Record names users still see raw

Not renamed in this wave (`rename_doc` + link migrations, their own wave):

| Name | Where it is seen | Arabic now |
| --- | --- | --- |
| Roles "Bunood Cashier", "Bunood Owner", "Bunood POS Operator" | User roles, Role list, permission screens | raw (no row in this catalogue) |
| Roles "Bunood Migration Manager", "Bunood Readiness Reviewer" | same | «مدير ترحيل زيرو ون», «مراجع جاهزية زيرو ون» (English raw) |
| Print Formats «بونود - فاتورة ضريبية (A4)», «بونود - سند قبض-صرف», «بنود - عرض سعر (A4)», «بنود - كشف حساب عميل», «بنود - فاتورة ضريبية مبسطة (A4)», «بنود - فاتورة ضريبية (حراري 80مم)», «بنود - فاتورة مبسطة (حراري 80مم)», «بنود - فاتورة (نقطي)», «بنود - سند قيد» | print view's format picker; the simple bill's «شكل الطباعة» field (10-sales-bill-header shows «بونود - فاتورة ضريبية (A4)») | Arabic names, raw |
| Print Formats "Bunood Sales Invoice (A4)", "Bunood Purchase Invoice (A4)", "Bunood POS Invoice (A4)" | print format picker | raw |
| Print Style "Bunood", Letter Head "Bunood" | Print Settings, print view style, Letter Head picker | raw |
| Looks "Bunood Console", "Bunood Night", "Bunood Day"; sidebar look "Bunood Light"; "Bunood Palette"; "Bunood Inbox" | Theme Settings pickers | «زيرو ون …» (English raw) |
| Palette "Bunood" | Theme Settings palette picker | raw (no catalogue row) |
| Sidebar identity "Bunood Home" (boot-injected; native routing matches its label) | the home sidebar's header on an English desk | «الرئيسية — زيرو ون» |
| Workspaces "Bunood Selling", "Bunood Buying" (team Home scopes) | sidebar, where they exist | «مبيعات / مشتريات زيرو ون» |
| DocTypes "Bunood Translation Settings/Scan/Proposal", "Bunood Migration Run/Dataset/Rehearsal (+ Result)/Reconciliation/Control Result", "Bunood Readiness Review" | list titles, breadcrumbs, links | «… زيرو ون» (English raw) |
| Module "Bunood Theme" | module filters, DocType lists | raw (code identifier) |
| Readiness Projects already named "Bunood readiness — {company}" | Project list | stored data; looked up by `custom_bunood_readiness_identity`, never by name, so new ones read "Zero One readiness — {0}" |
| Page titles "Bunood Home" / "Bunood POS" | until `bench migrate` syncs the bumped Page JSONs | rows kept, «… زيرو ون» |
| The readiness review's authority note "The Bunood reviewer role alone…" | Readiness Review form | names the role, so it waits with the role; Arabic «… زيرو ون» |

## Anything left, or doubtful

- **The lab sites run the team design with the theme's pane OFF** (`sidebar_enabled`,
  `bottombar_enabled` 0 on every team-rc site). There the desk shows Frappe's native sidebar
  header, which reads the Business app's own title ("Bunood Business" / «زيرو ون للأعمال» by
  the time of the bill shot) and its own icon — not `brand_mark()`. If production is configured
  the same way, the owner sees the Zero One icon in the page header only once the Business app's
  header icon changes (verticals) or the theme's pane is switched on. Worth confirming before
  deploy.
- The bill's seal and wordmark are built from boot but stay hidden by the team design, as asked.
- The page head's pill (pane Hidden) was not captured: setting `sidebar_pane_state` to Hidden
  left the pane open on the Business pages of this lab site; not investigated (no code changed
  there; the pill uses the same `brand_mark()`).
- `company_name` is one stored value, so Arabic desks show "Zero One" in Latin in the tab title,
  the sign-in title and the pane's brand name (as "Bunood" was before).
- `bnb.localhost` is shared with other labs; it now holds `company_name` "Zero One" and the new
  field labels (the patch's intended effect). The lab container and its redis are left running
  (`docker stop bunood-zerone-lab bunood-zerone-redis` to stop them); `bunood-team-rc-db` was
  started for it.
