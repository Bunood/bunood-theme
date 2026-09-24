# Bunood V1 Performance and Reliability Contract

**Document date:** 2026-09-20  
**Plan authority:** `BUNOOD-V1-MEGA-PLAN-2026-09-20.md`  
**Work-order owner:** FND-05  
**Scope:** Arabic and English, desktop and supported compact/mobile widths, all
promoted V1 role journeys  
**Status:** release target, not a benchmark receipt, capacity promise, or customer
service-level agreement

**Machine-readable budget:** `quality/v1-performance-budget.json`  
**Empty receipt template:** `quality/templates/v1-performance-receipt.template.json`

## 1. Outcome

Bunood must feel immediate during ordinary work, remain truthful when work is slow,
and preserve accounting, stock, tax, permission, and audit correctness under load.
This contract turns “fast and reliable” into measurable release gates across the
browser, Frappe web workers, MariaDB, Redis, RQ workers, external integrations,
backup, and recovery.

The existing `payload-budget.json` remains the build-size ceiling. It does not prove
route, query, queue, report, or recovery performance. This document supplies those
missing runtime targets.

## 2. Non-negotiable rules

1. Performance work cannot bypass native validation, permissions, workflows,
   posting, stock ledgers, tax calculation, or immutable audit history.
2. A timeout, queued job, or delayed external provider is never shown as success.
   The UI shows `Processing`, `Queued`, `Needs attention`, or `Failed`, with a stable
   identifier and a safe, idempotent retry path.
3. Every accepted transaction has exactly one durable business result. Retries must
   not duplicate an invoice, payment, stock movement, payroll posting, or ZATCA
   submission.
4. Cache use cannot make balances, permissions, inventory availability, document
   status, or tax data stale beyond the declared invalidation contract.
5. Results are reported separately for Arabic and English, desktop and phone, cold
   and warm cache, and each data tier. A fast average cannot hide a slow tail.
6. Recorder and profiler durations are diagnostic, not benchmark evidence. Frappe
   notes that Recorder adds material overhead; benchmark timing must come from an
   external load driver and browser telemetry.

## 3. Reference data and load profiles

These are repeatable test profiles, not maximum supported customer sizes. Every
release candidate must pass **Starter** and **Standard**. High-volume is a capacity
characterization gate; any published capacity claim requires its own signed report.

| Profile | Active sessions | Companies | Items | Customers + suppliers | Submitted invoices | GL Entries | Stock Ledger Entries |
|---|---:|---:|---:|---:|---:|---:|---:|
| Starter | 20 | 1 | 2,000 | 2,000 | 10,000 | 250,000 | 100,000 |
| Standard V1 gate | 100 | 3 | 25,000 | 25,000 | 100,000 | 2,000,000 | 1,000,000 |
| High-volume characterization | 300 | 10 | 100,000 | 100,000 | 1,000,000 | 10,000,000 | 5,000,000 |

The fixture spans at least two fiscal years, open and closed periods, inclusive and
exclusive VAT, returns, partial allocations, multiple warehouses, batches or serial
numbers where applicable, Arabic and Latin business names, attachments, and common
permission scopes. The generator, seed, anonymisation method, and reconciliation
totals are versioned with the run.

The Standard workload mix is based on observed design-partner traffic before final
ratification. Until that evidence exists, use this conservative starting mix:

| Journey family | Share of active work |
|---|---:|
| POS search, cart, quantity, payment | 30% |
| Transaction form open, edit, save, submit | 25% |
| Lists, filters, global search, navigation | 20% |
| Reports, dashboards, export, print | 15% |
| Imports, integrations, scheduler and background work | 10% |

Load must include ramp-up, a 60-minute steady state, a 15-minute peak at 150% of the
profile's session count, and recovery after the peak. Think time and task sequences
must resemble real cashiers, accountants, buyers, warehouse staff, and owners; a
single hot endpoint loop is not a product benchmark.

## 4. User-experience budgets

All browser targets are measured at the 75th percentile separately for mobile and
desktop, matching the Core Web Vitals evaluation method. Field telemetry and a
controlled lab run are both required.

| Measure | V1 target | Scope |
|---|---:|---|
| Largest Contentful Paint (LCP) | <= 2.5 s | Role home and representative cold route entry |
| Interaction to Next Paint (INP) | <= 200 ms | At least 75% of real visits, mobile and desktop separately |
| Cumulative Layout Shift (CLS) | <= 0.10 | No late shell, form, table, drawer, or total jumps |
| Local interaction acknowledgement | <= 100 ms | Button/row/field visibly reacts, even if work continues |
| Main-thread long task | no task > 200 ms during routine entry | Typing, barcode scan, quantity edit, menu, dialog |
| Route-ready, warm | p50 <= 1.0 s; p95 <= 2.0 s; p99 <= 3.5 s | Shell plus task-critical controls usable |
| Route-ready, cold | p95 <= 3.0 s; p99 <= 5.0 s | First authenticated entry on reference network |

The controlled mobile profile uses a supported lower-mid-range device or equivalent
CPU throttling and a measured 4G profile. The report records device, browser, network,
cache state, locale, viewport, data profile, and server topology. No single synthetic
desktop result can stand in for field performance.

## 5. Journey and server budgets

Server duration is measured at the reverse proxy or load driver and excludes browser
rendering. Journey duration includes the UI. Percentiles are calculated per route or
operation, never by pooling unrelated endpoints.

| Operation | p50 | p95 | p99 | Acceptance note |
|---|---:|---:|---:|---|
| Common read API, warm | <= 250 ms | <= 750 ms | <= 1.5 s | Customer/item lookup, metadata already cached |
| First-page list/filter | <= 600 ms | <= 1.5 s | <= 2.5 s | Standard profile, role filters applied |
| Global search result | <= 500 ms | <= 1.2 s | <= 2.0 s | Names primary, code searchable |
| POS item search result | <= 150 ms | <= 300 ms | <= 600 ms | Cached catalogue path; barcode and name/code query |
| POS add/edit cart line | <= 100 ms | <= 300 ms | <= 600 ms | Correct price, UOM, discount and VAT visible |
| Save draft | <= 700 ms | <= 2.0 s | <= 4.0 s | Representative 10-line transaction |
| Submit native transaction | <= 1.2 s | <= 3.0 s | <= 6.0 s | Excludes separately tracked external-provider wait |
| Complete local POS sale | <= 2.0 s | <= 4.0 s | <= 7.0 s | From payment confirmation to durable receipt state |
| Role dashboard ready | <= 800 ms | <= 2.0 s | <= 4.0 s | Cards and primary actions usable |
| Standard interactive report | <= 2.0 s | <= 5.0 s | <= 10.0 s | Named filter window and Standard data profile |
| Print preview | <= 1.5 s | <= 3.0 s | <= 6.0 s | Layout visible; image assets already reachable |
| PDF generation | <= 4.0 s | <= 10.0 s | <= 20.0 s | Representative two-page bilingual invoice |

Reports or imports expected to exceed ten seconds move to an appropriate background
queue. The request acknowledges the queued job within two seconds, exposes progress
and ownership, permits safe navigation, and provides an accessible completion or
failure notice. It does not hold a web worker or freeze the entire screen.

External providers such as ZATCA, banks, payment gateways, Qiwa, Mudad, or GOSI have
their own latency and availability series. Bunood must establish the local durable
state and return an honest `Queued` or `Processing` response within two seconds when
the provider cannot complete inside the interactive budget.

## 6. Queue budgets

Frappe supplies `short`, `default`, and `long` RQ queues. Job runtime and **queue age**
are measured separately; a fast job that waited too long is still a user failure.

| Queue class | Enqueue acknowledgement | p95 start age | p99 start age | Required behavior |
|---|---:|---:|---:|---|
| User-blocking short | <= 500 ms | <= 5 s | <= 15 s | Status visible; cannot starve behind bulk work |
| Normal default | <= 500 ms | <= 30 s | <= 2 min | Retry is bounded and idempotent |
| Bulk/long | <= 500 ms | <= 5 min | <= 15 min | Progress, owner, deadline, cancel/retry policy |

Scheduled compliance, backup, reconciliation, and integration jobs also carry a
business deadline. A job within queue-age limits but past its deadline pages the
named owner. Worker count is sized from measured CPU, memory, arrival rate, and
service time—not copied from a generic configuration.

## 7. Reliability and recovery targets

These are V1 reference-operation targets. They become contractual only after the
hosting owner defines exclusions, support hours, measurement source, maintenance
policy, and remedies.

| Measure | V1 reference target |
|---|---|
| Monthly service availability | >= 99.9% for Bunood-controlled application paths |
| Unexpected 5xx rate | < 0.1% of Bunood-controlled requests over 5 minutes and < 0.05% monthly |
| Financial, stock, VAT, permission, and duplicate-result errors | zero accepted occurrences |
| Unacknowledged critical alert | zero; page acknowledgement <= 15 minutes |
| Backup job success | 100% daily, with encryption and off-host retention evidence |
| Managed reference RPO | <= 15 minutes, proven by the selected backup/binlog design |
| Managed reference RTO | <= 4 hours, proven by a clean-environment restore drill |
| Restore drill | before release and at least quarterly thereafter |

Self-hosted and customer-managed deployments must declare their own RPO, RTO,
availability source, backup interval, retention, and owner. They cannot inherit the
managed reference numbers by documentation alone.

A restore receipt includes the exact release/app versions, encrypted backup IDs,
encryption-key recovery, start/end times, RPO/RTO achieved, login, file access,
scheduler/worker health, representative document opens, permission checks, and GL,
Payment Ledger, Stock Ledger, receivable/payable, and tax reconciliation.

## 8. Observability contract

The production owner must be able to answer “what is slow, for whom, since when, and
why?” without enabling an expensive profiler for normal traffic.

Minimum signals:

- Browser: LCP, INP, CLS, route-ready duration, long tasks, locale, viewport, route
  family, release hash, and failure state; never field values or personal data.
- HTTP: request count, p50/p95/p99 duration, status, timeout, response size, route
  template, company/role class only when safely aggregated, and release hash.
- MariaDB: connection saturation, lock waits/deadlocks, buffer-pool pressure, slow
  query fingerprints, query count and query time for critical journeys, and storage.
- Redis: memory, evictions, hit ratio, blocked clients, latency, and queue depth.
- RQ/scheduler: queue age, runtime, success/failure/retry, worker availability,
  scheduler lag, business deadline, and poison/repeated jobs.
- External integrations: provider, local correlation ID, state, attempt count,
  provider latency, rejection category, and oldest pending age.
- Host: CPU, memory, disk space/latency, process restarts, certificate expiry, backup
  freshness, and clock synchronization.

Alerts must be actionable, deduplicated, and routed to a named owner. The System
Health Report, RQ Worker/RQ Job views, Frappe Monitor, application logs, and hosting
metrics are evidence inputs; none alone is sufficient.

## 9. Diagnostic and tuning discipline

1. Reproduce against the named fixture, release hash, and topology.
2. Separate browser, network, web-worker, SQL, cache, queue, and provider time.
3. Use Frappe Recorder or `bench --profile` only to locate costly calls and SQL;
   record their overhead and benchmark again without the profiler.
4. Capture query count, total SQL time, slow-query fingerprints, and `EXPLAIN` output.
   Reject query growth proportional to row count when the user request should be
   bounded; this is the N+1 gate.
5. Size MariaDB buffers, connections, Redis memory/eviction policy, Gunicorn workers,
   and RQ workers from measured capacity and available RAM/CPU. Configuration that
   fixes one layer by saturating another is a failure.
6. Prefer bounded fields, indexed filters, pagination, cached immutable metadata,
   and queued heavy work. Do not use `SELECT *`, broad cache clears, unlimited Redis,
   or extra workers as a substitute for diagnosis.
7. Repeat the exact run and attach before/after evidence plus correctness
   reconciliation.

## 10. Acceptance matrix and regression policy

Every critical journey is exercised across:

- Arabic RTL and English LTR;
- desktop, phone, keyboard-only, touch, and barcode where applicable;
- light and dark themes for rendering regressions;
- cold and warm browser/cache state;
- Starter and Standard data/load profiles;
- normal and impaired 4G network profiles;
- normal background load and peak background/import/report load;
- happy path, validation error, permission denial, provider delay/rejection, retry,
  worker restart, and recovery;
- allowed and forbidden company/warehouse/POS scopes.

Release fails if any critical path breaches its p95 or p99 budget, produces a
correctness or duplicate-result error, freezes input, leaks data, loses focus/state,
or regresses p95 by more than 10% from the accepted baseline without a documented
and owner-approved budget change. A faster result does not compensate for a failed
Arabic, phone, permission, recovery, or reconciliation case.

The bundle ceilings in `payload-budget.json` remain hard. A budget increase requires
a named feature, before/after compressed sizes, runtime evidence, alternatives
considered, expiry or removal plan, and product/engineering approval.

## 11. Required release evidence packet

FND-05 cannot move to **Verified** until one immutable packet contains:

1. candidate commit, app/framework versions, build hashes, configuration diff, host
   topology, device/browser versions, and test clock;
2. fixture generator/hash and reconciled opening/closing business totals;
3. raw browser, load-driver, request, SQL, Redis, queue, external-provider, and host
   metrics plus percentile calculation method;
4. route/journey table against every budget, separated by required dimensions;
5. profiler captures for breached paths, with sensitive values removed;
6. soak, peak, worker-loss, dependency-delay, backup, and restore results;
7. zero-duplicate and ledger/tax/stock/permission reconciliation;
8. regression comparison to the last accepted release and every approved exception;
9. alert delivery proof and named operational owner;
10. production capacity statement limited to the profiles actually demonstrated.

Missing runtime infrastructure means **Not run**, never **Pass**.

### Executable gate

- `npm run v1:performance:plan` validates that the machine-readable budget still
  matches the complete profile/language/device/cache, operation, queue, correctness,
  reliability, regression, and evidence contract. It validates a target only.
- `npm run v1:performance:gate -- --receipt <immutable-receipt.json>` evaluates an
  actual receipt. Without `--receipt`, the command deliberately returns `HOLD`.
- The committed template is empty and deliberately fails the evidence gate. Copy it
  into a run-owned evidence directory, fill it from the external browser/load/host
  collectors, and retain raw immutable references rather than editing the template.
- The gate requires 16 slices across Starter and Standard before counting repeated
  scenarios: Arabic/English × desktop/mobile × cold/warm. It also requires queue,
  zero-tolerance correctness, load/peak/recovery, 30-day reliability, backup/restore,
  regression, and candidate-identity evidence.

## 12. Primary references

- Frappe Framework, [Profiling and Monitoring](https://docs.frappe.io/framework/user/en/profiling):
  Recorder SQL/query diagnostics, Monitor request/job metadata, RQ monitoring, and
  System Health Report; it also warns that Recorder duration is not representative.
- Frappe Framework, [Background Jobs](https://docs.frappe.io/framework/user/en/api/background_jobs):
  short/default/long queues, worker configuration, timeouts, and scheduling.
- Frappe Cloud, [Monitoring](https://docs.frappe.io/cloud/sites/monitoring): request,
  job, CPU, uptime, slow endpoint, and slow-query signals.
- web.dev, [Web Vitals](https://web.dev/articles/vitals): LCP <= 2.5 s, INP <= 200 ms,
  CLS <= 0.1, evaluated at the 75th percentile separately for mobile and desktop.
