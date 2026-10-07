# Bunood V1 production operations and support contract

**Document date:** 2026-09-20  
**Scope:** WO-00, WO-01 and FND-05  
**Machine register:** `quality/v1-production-operations-control-register.json`  
**Status:** approved planning authority; production acceptance remains open

> This is not a security certification, business-continuity or zero-data-loss
> guarantee, completed disaster-recovery exercise, or release receipt. The customer,
> hosting provider and named security/operations/business owners must approve measured
> production targets and candidate-bound evidence.

## 1. Decision

Bunood V1 is not “finished” when a page works locally. It is a supported financial
product only when the exact source, app versions, assets, schema, configuration and
deployed candidate are bound; the site is recoverable; monitoring catches business and
technical failure; deployment and rollback preserve post-deploy business data; and a
second authorised operator can execute the runbooks.

The production chain is:

`approved change → version/config/migration manifest → build gates → isolated staging
acceptance → verified restore point and rollback trigger → authorised deploy → observe
technical and business health → accept or rollback → reconcile and hand off → incident,
recovery and prevention`.

Frappe/Bench native site, app, migration, backup, restore, worker and scheduler
lifecycle remains authoritative. Direct database/ledger edits are not an incident or
deployment strategy.

## 2. Research translated into controls

Frappe's official Bench documentation shows that an update can combine backup, source
pull, dependencies, assets, patches and restart; `bench migrate` runs hooks, patches,
schema/background-job/fixture/dashboard/translation/index synchronization. These are
material transitions, not a single opaque “update” button. V1 records and validates
each boundary and never uses skip-failing migration as normal production success.

Official backup/restore guidance covers the database plus public/private files and site
configuration. A backup timestamp is not proof of recoverability. V1 restores complete,
version-compatible sets into isolated targets and validates permissions, attachments,
documents, ledgers and critical business flows before any recovery claim.

Official Frappe Cloud monitoring exposes requests, duration, uptime, background jobs
and CPU. Bunood additionally requires queue/scheduler/database/cache/socket/storage/
certificate/provider and synthetic critical-business-flow visibility. A green web
worker with failed scheduler, ZATCA queue or payment callback is not healthy ERP.

Primary sources:

- [Frappe Bench commands](https://docs.frappe.io/framework/user/en/bench/bench-commands)
- [Frappe commands: backup, restore and migrate](https://docs.frappe.io/framework/user/en/bench/frappe-commands)
- [Frappe `bench migrate`](https://docs.frappe.io/framework/user/en/bench/reference/migrate)
- [Frappe production setup](https://docs.frappe.io/framework/user/en/production-setup)
- [Frappe Cloud restore/migrate](https://docs.frappe.io/cloud/sites/migrate-an-existing-site)
- [Frappe Cloud backups](https://docs.frappe.io/cloud/sites/backups)
- [Frappe Cloud monitoring](https://docs.frappe.io/cloud/sites/monitoring)

## 3. Environment and release identity

Development, staging, production and backup destinations are isolated with named
owners. Each environment records host/provider/region, site/app versions, source commit
or tag, dependency/image identity, asset hashes, schema/migration state, non-secret
configuration, domain/certificate, queues/workers/scheduler, storage/database/cache,
external providers and monitoring/support ownership.

Configuration drift, manual hotfix and uncommitted production changes are detected and
resolved through versioned change or rollback. Secrets are inventoried by owner,
location, scope and rotation/expiry—not copied into the release manifest.

The twelve release states keep planned, reviewed, built, staged, accepted, production
authorised/deploying/observing/accepted, rollback and supersession distinct. A successful
command is not business acceptance.

## 4. Backup, restore and recovery

One restore set binds database, public files, private files, site configuration,
encryption/key-recovery requirements and compatible app/source version. Policy names
frequency, retention, encryption, offsite/independent copy, access, failure alert,
immutability where selected, legal hold/disposition and owner. Actual RPO/RTO targets
come from approved customer risk and measured rehearsal—not generic promises.

At least two candidate-bound isolated restore drills are required. They validate:

- counts and hashes for representative documents/attachments;
- users, roles, permissions, company/tenant boundaries and secrets reconnect path;
- submitted invoices, payments, stock, VAT/ZATCA evidence, GL/Payment/Stock ledgers;
- workers, scheduler, queues, reports, print files and integrations;
- critical Arabic/English cashier, owner and accountant flows; and
- measured backup age, restore duration, data gap, differences and sign-off.

Restore completion stays in recovery-validation until the business owner confirms the
agreed flows and reconciliations. Production cutover from a restore requires a separate
authorised decision.

## 5. Deploy checklist and rollback

Each release records scope, risk, owner, window, affected customers, migrations,
configuration/secret/feature-flag changes, compatibility, known issues and rollback
boundary. Pre-deploy gates cover code review, tests, security checks, build, migration
rehearsal, backup compatibility, staging deploy, critical role/language/viewport flows,
performance and product/customer approval.

Before production, the team confirms current verified backup/restore point, on-call,
status communications and explicit rollback triggers for error/latency, worker backlog,
data integrity, security and critical business-flow failure. Each trigger has threshold,
owner, command/procedure and validation.

Rollback is not automatically safe after users create production data. The plan names
whether code/assets can roll back against the migrated schema, whether schema rollback
exists, how post-deploy documents are preserved, and when restore/data recovery needs
customer approval. No rollback may silently discard orders, invoices, payments, stock
or audit evidence.

## 6. Monitoring, incident and support

Service state distinguishes healthy, degraded, partial/full outage, maintenance,
backup failure, restoring/recovery validation, security event, data-integrity review and
unknown monitoring gap. Health covers web/socket workers, queues, scheduler, database,
cache, storage, certificate, integrations and synthetic critical flows.

Alerts have threshold, window, owner, routing, suppression, escalation and runbook.
Exercises prove stopped scheduler/worker, queue growth, failed backup, storage pressure,
certificate expiry, provider outage, elevated error/latency and broken invoice/payment/
print flow produce actionable alerts.

Incidents use the ten machine-enforced states from new through customer validation,
root-cause review and closure. Every incident records severity, impact, start/detection,
owner, hypothesis/evidence, mitigation, recovery, data integrity, customer updates,
next-update time, decisions, root cause, prevention action/owner/due date and retained
evidence. Resolved technically is not closed until applicable customer/data validation.

Support policy names hours, severity/response/update targets, escalation, channels,
language, data needed, safe remote access and customer communication. Privileged,
support and break-glass access uses MFA, least privilege, approval/time limit, audit,
revocation and periodic review. Logs, dumps, backups, screenshots and tickets are
redacted and retained under approved security/privacy policy.

## 7. Acceptance gate

Structural validation is not production readiness. Promotion requires all twelve
evidence groups, normal and failed deployment rehearsals, two isolated restores,
migration/rollback with explicit post-deploy data boundary, monitored incident/on-call/
customer-communication exercises, access/privacy negative tests, candidate identity and
reconciliation, measured performance/capacity/RPO/RTO/support evidence, and a second
authorised operator executing the runbooks.

Final acceptance names the exact candidate, environment, company, commit/tag, app
versions, asset hashes, schema/migration state, evidence locations, known risks, owner
decisions and release outcome. Until that receipt exists, the status remains
implemented/planned with acceptance incomplete—not production verified.
