# ERPNext / Frappe upgrade rule

An upstream update is a candidate until Bunood's compatibility checks pass.
Never update the production bench first and treat failures as warnings.

1. Back up the database, site files and current image/ref. Restore a staging copy.
2. Apply the proposed upstream version to staging only. Run `npm run upstream`.
3. A mismatch must be investigated. Read the changed upstream files and form
   definitions; adapt Bunood and add a regression check for the affected behavior.
4. Record reviewed pins with `npm run upstream -- --repin`. Commit the integration,
   tests and pins together, stating what changed. Never re-pin merely to clear red.
5. Deploy on staging, migrate there, and run the full `npm run verify`, contrast,
   icon and translation checks. Include Arabic/English and light/dark where relevant.
6. Promote only the tested image/ref and app revision. Keep the backup for rollback.

The same canonical pins ship in `bunood_theme/data/upstream-pins.json`.
`tools/upstream-preflight.sh` checks the candidate collector before deployment
copies anything; `tools/verify.mjs` checks before the browser suite; the
`before_migrate` hook calls `bunood_theme.upstream.assert_compatible` before
Frappe's schema updates. Missing pins or drift abort the operation.

This does not stop somebody manually pulling a Docker image or replacing a git
checkout, and does not roll those actions back automatically. It blocks deployment
acceptance and migration. The staging-and-promotion rule prevents an incompatible
candidate from reaching production in the first place.

The local verification environment is:

```powershell
$env:BND_DOCKER='wsl docker'
$env:BND_BACKEND='bunoodimg-backend-1'
$env:BND_FRONTEND='bunoodimg-frontend-1'
$env:BND_SITE='verify.bunood.test'
$env:BND_BROWSER_CHANNEL='msedge'
npm.cmd run upstream
npm.cmd run verify
```

The bundled Playwright Chromium is absent on this machine; the existing Edge
installation is used through the repository's supported browser-channel option.

For long verification runs, set `BND_RECOVERY_FILE` to an absolute writable JSON
path outside the repository. The suite writes the pre-run theme preferences and
language there before changing either. Normal completion restores both in
`finally`; the file also permits manual recovery after an OS/process termination.
It contains no session cookie. Run only one suite against a site at a time.
