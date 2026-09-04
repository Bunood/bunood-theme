# Colored sidebar persistence

The local site already selects `Mini-Cards`, `Colored Chips`, `Rich` section
colors, `Match Theme`, and `Always Expanded`. Administrator follows the site
with no personal sidebar preset. Keep these values; a plain sidebar with no
Bunood badge is a missing-decoration bug, not a requested alternate theme.

The old observer attached once to `.sidebar-items`. Replacing the native pane
left it watching a detached list, and mounting before the list existed left it
watching nothing. The route callback restored only the width. Colors belong to
the section wrappers, so losing those wrappers also made the icons look grey.

The sidebar kit now has one observer for the current pane and a shallow body
observer that notices native pane replacement. It disconnects the old pane and
rail listeners, rebinds to the new pane, and coalesces decoration before paint.
Its own DOM writes run with observation disconnected, preventing perpetual
rebuilds and accumulating listeners. Late rows are regrouped without changing
native link order. Navigation also schedules the complete decoration pass.

The native `data-mode="edit"` state temporarily releases section wrappers for
sorting; leaving edit mode restores them. Explicit Plain/other style selections
are still respected. No global light/dark setting, account preference, navigation
record or business record is rewritten by this repair.

Regression checks in `tests/smoke.mjs` cover native shell replacement, route
changes, edit start/stop, delayed rows, idle stability, alternate styles, reload,
English/Arabic and light/dark rendering. The baseline failed because the native
replacement had zero brand blocks instead of one. Run with the normal local
stack environment variables:

```sh
node tools/verify.mjs --only 'sidebar consistency'
node tools/verify.mjs --only 're:^(preset:|rail:|live preview: pane color|responsive: the side pane collapses)'
```

Set `BND_SIDEBAR_SCREENSHOTS` to an existing output directory for the rebuild
capture and English/Arabic light/dark sidebar screenshots. These focused runs
do not replace the complete release suite. After deployment, existing browser
tabs must reload to load the new content-hashed JavaScript.
