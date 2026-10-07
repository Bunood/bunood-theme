# Private Theme 0.50.0 release candidate

This release fork derives from the independently source-reviewed clean Theme
candidate. Its existing design, local features, compiled assets, fonts, licenses,
tests and historical acceptance records are preserved. This document records
new release metadata, not a new native acceptance result.

| Release metadata | Previous | Candidate |
| --- | --- | --- |
| Theme app (`__version__`, `app_version`) | 0.46.35 | 0.50.0 |
| Native `crm` compatibility pin | 1.79.0 | removed |
| `bunood_crm` compatibility pin | absent | 0.1.0 |
| `bunood_real_estate` | 1.5.1 | 1.7.0 |
| `bunood_engineering` | 0.8.2 | 0.14.0 |
| `bunood_setup` | 0.7.2 | 0.8.0 |
| `bunood_dining` | 0.0.1 | 0.1.0 |
| `bunood_tenant` | 0.5.1 | 0.6.0 |

Native core pins remain Frappe 16.33.1, ERPNext 16.34.1, Telephony 0.0.1,
HRMS 16.18.1, Payments 0.0.1, Helpdesk 1.27.0 and KSA Compliance 0.61.7.
Every native file, workspace and field-order hash is unchanged. The before-migrate
compatibility guard is unchanged and still rejects missing, changed or extra
version pins; these candidate declarations do not waive that gate.

Release app versions are separate from the private npm build-tool package version.
No feature activation, install requirement or tax/accounting configuration is
changed by these metadata updates.

Native full image/build integration, fresh installation, existing-site upgrade,
runtime compatibility fingerprint, browser/accessibility and accounting/print
acceptance are pending. Source-level tests and private package builds are not
evidence that those native gates have passed. No site or publication action is
part of this candidate preparation.
