# Team edition with the original CRM and Real Estate updates

This independent edition starts from the team's published theme commit
`1eaa6a9` and keeps its visual, financial and migration behavior.

The owner approved adding Bunood Comms on 2026-10-04 after native CRM tests
demonstrated that phone duplicate detection requires it on the site.
The reviewed source is `8b2d32ee9d7b3a2c2d043e62dc82b40181cd8e09`, whose
actual application version is `0.0.0`.

Only that application version is added to the upstream fingerprint. The
framework versions, 51 file hashes, workspace hashes, field-order hashes and
the migration rejection mechanism remain unchanged. Missing or unreviewed
Comms versions are rejected, as for every other application in this edition.

The independent CRM and Real Estate branches preserve their team versions
`0.1.0` and `1.7.0`, respectively, with source commits recorded by the
infrastructure candidate inventory. No main branch or production deployment
is changed by this edition.

Validation: the upstream gate tests failed with the missing Comms pin before
the change. The complete eight-test gate is rerun after the pin is added.
Runtime migration and combined application acceptance are recorded in the
infrastructure edition report.
