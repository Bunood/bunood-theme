# Local repository integration — 2026-08-31

Reviewed Bunood Setup v0.7.1 against the running verify.bunood.test package.
All 15 package files matched after line-ending normalization except __init__.py:
the Arabic font-chain repair was already deployed under a stale v0.7.0 label.
Promoted the approved package and refreshed native Installed Applications metadata.
The compatibility pin now records 0.7.1. No Frappe or ERPNext pins were changed.

Theme build and deployment preflight passed. All five asset hashes are unchanged,
including desk CSS bunood.a6e3ad55.css, JS bunood.3cc83240.js, and print CSS
bunood-print.a9155886.css. The existing Arabic home screen and 27 visible sidebar
labels were checked after deployment. Nine business-table fingerprints and the
enabled app set, account language and SAR symbol matched before and after.

Related integration: infrastructure main 878bec5 was pulled; real estate v1.3.0
(90e3a12) passed 2,924 pure and 1,222 clean-site integration tests and was updated
as an available package only. It remains uninstalled on verify.bunood.test.
Unreleased money-out changes and the unmerged restore-drill branch were held
back after an independent review found accounting and restore-safety defects.

The source theme's prior uncommitted UI work was preserved. Only this note and
the setup-version line are staged for this integration commit. Full evidence:
C:/Users/abdul/Documents/Codex/2026-08-31/how-x20/outputs/repository-updates/.

Local source mirrors preserve these updates, but the old Docker base image was
not rebuilt. Recreating the local stack requires the retained promotion script
at the task's work/repository-updates/promote-local.sh. No remote push or
production deployment was performed.
