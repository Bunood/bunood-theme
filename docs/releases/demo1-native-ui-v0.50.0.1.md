# Demo1 native ERP UI: v0.50.0.1

Publication date: 2026-10-07.

| Identity | Value |
| --- | --- |
| Repository | `Bunood/bunood-theme` |
| Branch | `demo1/native-erp-ui` |
| Annotated version tag | `demo1/native-ui-v0.50.0.1` |
| Source snapshot | `1eaa6a9b9263ba870e419d051525cb79f7d1465c` |
| Existing source branch | `release/2026-10-03-as-is` |
| Application version retained | `0.50.0` |

## What is being versioned

This is an independent native Frappe/ERPNext theme source snapshot, including
the native Sales/Purchase Invoice workbench and simplified Journal Entry form
shown in the owner's screenshots. It contains the supporting native theme,
controllers, Python services, styles, Arabic catalogue, and existing compiled
native assets. It is not the complete later Golden Merge integration and is
not a new deployed release.

The two screenshot controllers are byte-identical Git blobs to the local demo1
source checkpoint `f071001b44388cc671a81e27f07e46c75b10b39a`:

| Implementation | Source | Git blob |
| --- | --- | --- |
| Native invoice workbench | [sales_bill.js](../../bunood_theme/public/js/sales_bill.js) | `5a427b431d10f6bd02b89fae25db2ed7bbc7410f` |
| Native simplified forms, including Journal Entry | [simple_forms.js](../../bunood_theme/public/js/simple_forms.js) | `8f28b17e1a074862f9dc0f68391a014a016941a4` |

The compared invoice/journal surface styles also match that local checkpoint:
`_sales_bill.scss`, `_journal_compact.scss`, `_journal_field_contrast.scss`,
`_editorial_pilot.scss`, and `_invoice_action_alignment.scss`.

## Rejected frontend exclusion

This branch starts with a new root commit. It does not inherit the mixed demo1
checkpoint or the retracted publication's history. The checkpoint identifier
above is documentation provenance only, not a Git parent.

Checks before publication found no standalone application source/compiled tree,
standalone route/controller/asset modules, specialist standalone modules,
feature-app builder, bundled custom CRM app, or Ops variant in this snapshot.
Native `hooks.py` does not bind the standalone frontend interceptor. The native
theme's build and compiled assets were checked for the rejected frontend's
distinctive application/sidebar identifiers and route references: no matches.

No source code was copied from the mixed checkpoint. The original native
snapshot's runtime files and compiled assets are preserved without alteration;
only publication documentation was added. This versions the existing native
implementation, not completion of the planned unified Home and module design.

## Verification and known failures

- Both screenshot controllers pass JavaScript syntax checks.
- Existing focused tests: **141 total, 138 passed, 3 failed** across
  `sales_bill.test.cjs`, `simple_forms.test.cjs`, and
  `journal-workbench.test.cjs`.
- Failed checks, retained without changing tests or runtime code:
  1. `invoice context shows the native default warehouse without bypassing field permission`
  2. `Save, Submit and Print waits for successful submission before opening native print`
  3. `the item sheet ends with a concise native invoice calculation`
- Publication scans found no sensitive configuration/key filenames and no
  matches for the checked private-key and token signatures.

These are existing source-baseline failures, not waived acceptance criteria.
They must be investigated before promoting this snapshot for deployment.
No fresh browser acceptance, full frontend rebuild, native database validation,
migration, or live deployment is claimed by this publication.

The Git version identifies this source snapshot separately from the unchanged
Frappe app version. Further verified changes require a new version tag; do not
move this baseline tag.
