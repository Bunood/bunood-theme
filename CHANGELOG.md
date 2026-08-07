# Changelog

Versioning policy: SemVer, pre-1.0. MINOR = a coverage-checklist item (or a
feature set) ships; PATCH = fixes and refinements. **v1.0.0 is reserved for
the completion of all 38 coverage items.** Every release is an annotated git
tag, and `app_version` in hooks.py always matches the latest tag.

## [Unreleased]

### Theme Settings applies as you click — there is nothing to save

Every control persists the moment it is touched. The desk already
previewed each choice live; the Save button was the last place a user
could see their change and still not have made it.

**It hooks `frm.dirty`, not the controls.** There are a dozen
`set_value` call sites across seven pickers, the desk diagram, the layout
preset and the toggles, and more arrive with every component. Wiring each
one is a list to keep in step with the form — the duplication this rework
exists to remove. `frm.dirty()` is the single choke point Frappe routes
every change through, so a control added tomorrow is covered without
anyone remembering.

**Serialised, and that is the whole design.** Two saves in flight is not a
performance problem, it is a correctness one: the second carries the
first's stale `modified` and dies with the TimestampMismatchError this
release just fixed at the seeding end. Autosave would have multiplied that
by every click. So a burst of clicks is one write, one save runs at a
time, and the form re-arms if a click landed while a save was in flight —
the last click is what ends up stored, which is the only answer a user
would call correct.

**The in-flight flag is Frappe's, not ours**, and that distinction cost a
suite run. `frappe.ui.form.is_saving` is a module-level global shared by
every form and set by paths this file does not own. Worse, `_call` reacts
to it with `throw "saving"` — synchronous, and a bare string — so
`frm.save()` never returns a promise and `.catch()` never sees it. It
surfaced as two unexplained console errors rather than a failed save.

**A failed save stays dirty and stops.** Frappe has already shown what
went wrong, the Save button lights up as the manual fallback, and
retrying a failure that is not going away would spin forever. A form that
quietly reports itself saved when it is not is the one failure mode worse
than the Save button.

"live preview: discard reverts" is now "live preview: and stays" — the
old premise is gone on purpose, and the replacement reloads from the
server rather than from memory, which is the stronger claim.

### Saving Theme Settings no longer dies with "modified after you have opened it"

Reported repeatedly and never reproduced until now, because the test that
was supposed to cover it worked around the bug: it calls `reload_doc()`
first — literally what the error message tells you to do — and runs on
`?shell=0` rather than the shell people use. Green throughout.

**The cause.** `frappe.db.set_single_value` bumps `modified` unless told
not to, and `setup._seed_defaults` runs on **every** `after_migrate`,
writing any field that is empty and any Check whose row is absent. So any
upgrade that ADDS a field gave the document a new timestamp, every open
Theme Settings form went stale, and the admin's next save died. The
container split added four fields in one session and produced it four
times.

**The fix.** Seeding and every migration patch now write with
`update_modified=False`. The values still land; the claim that a human
made them does not. `modified` means "when a user last changed this", and
it is what Frappe's optimistic-concurrency check compares — recording
housekeeping as the user's edit was both untrue and the thing that broke
their form. `write_brand_css` has done this since 2026-07-30; it was the
only place that did.

**The error message misleads, which cost time.** It prints
`(previous.modified, self.modified)`, but `self.modified` has already been
reset to *now* by `set_user_and_timestamp()`. The second number is never
what the form sent — the comparison is against `_original_modified`, which
is never shown. Read literally it says the client is ahead of the
database, which is the opposite of what is happening.

Reproduced before fixing (form open, one seeding-shaped write, save →
the exact error), and the same reproduction now runs a full
`after_migrate` with the form open and saves cleanly.

The new check drives the real seeder rather than an imitation, on the real
shell, with no reload. Inserting it also exposed that `live preview` never
navigated — it inherited whichever page ran before it — so that test now
states what it needs instead of depending on its neighbour.

### The dock and the side pane become containers (rework slice 2c, 3 and 5)

`dock_enabled` and `sidebar_enabled`. **Containers are independent** — turn
both on and you get both. "Dock" used to mean *dock, and therefore no side
pane*: one layout, two facts, welded together by a CSS rule keyed on
`data-bnd-layout="dock"`.

**These two had to land together.** The moment the dock stops hiding the
pane, something else has to say whether the pane is shown — and if nothing
does, every Dock site grows a side pane on upgrade. Splitting them across
two slices would have shipped that regression in between. Same lesson as
slice 2c-1, where "a container has a setting" and "the layout *writes*
that setting" turned out to be one change; caught this time before it
shipped rather than after.

**Every container off is now a reachable configuration, and it is
refused.** `guard_critical_reach` runs last — after every container has
mounted and both placement passes have run, because "is there still a
route to this" cannot be answered from settings — and gives the side pane
back when nothing else can reach search, notifications or Log Out. It
reads `registry.CRITICAL` through boot rather than becoming a fourth
hand-written copy of those three selectors. Tested in both directions: a
guard that always fires is not a guard.

**The pane's hide is a declaration, and says so.** Our own chrome is not
in the document before it mounts, so an outcome-keyed rule has nothing to
flash; the side pane is Frappe's, on screen from the first paint, so
keying it on anything JS stamps later means 150ms of visible pane and then
a vanish. The attribute therefore lists what is **off**, not what is on —
a list of what is on would have to be read as `:not(…)`, which matches
when the attribute is absent, and a failed boot would hide the pane and
every affordance inside it.

`mount_sidebar_kit` and the avatar menu's Desktop item now ask the DOM
whether the pane is reachable instead of asking which layout is active —
both gave the wrong answer the moment a dock could sit beside a pane.

### The page header becomes its own container (rework slice 2c, 2 of 5)

`pagehead_enabled` decides whether the global controls ride in each page's
own title row. Compact's one distinguishing act stops being a branch in
`mount_chrome` and becomes a setting, so the merged strip is available on
any layout and Compact can be had without it.

**It is the only container that remounts on every route change.** Page
heads are built per page and Frappe swaps the element out from under us,
so `inject_compact_cluster` runs again on every navigation — which makes
that one line the place an "off" would quietly undo itself on the next
click. It asks the setting now, and the test navigates rather than
checking first paint, because an off that lasts until you click something
is not off. The stamp is re-asserted when returning to a cached page that
still has its cluster: the attribute is per-document, the mount is
per-route, and without that the stylesheet would believe there was no
cluster after a navigation away and back.

**The patch guards on row-absence, and here that is the whole patch.**
The shipped default is 0, so "the value is falsy" is true both for a site
that has never had the field and for an admin who deliberately switched
the cluster off — testing the value would hand a Compact site back chrome
it had chosen to remove. And unlike the top bar, the danger runs the other
way: without the patch a Compact site would *lose* the only chrome its
layout exists to provide, leaving the title row empty on upgrade.

### The top bar becomes its own container (rework slice 2c, 1 of 5)

The first of the five containers to stop being a consequence of
`desk_layout`. `topbar_enabled` decides whether the strip mounts; a layout
is becoming a preset that *writes* that setting rather than standing in
for it. So a top bar can sit on a Classic desk, and a Top Bar desk can
have none — configurations that did not exist before, and that the
invariant matrix now walks.

**The catalogue exists at last.** `registry.LAYOUT_CHROME` states what
each of the five layouts writes to each of the five containers. Until now
*no table anywhere* said this: the 0.11.0 migration patch records what
0.10.0 **rendered**, which is a one-shot artefact, and the settings form
gave that as its reason for refusing to derive a "Custom" label for the
layout at all. Authoring it is what makes that label possible — it
arrives with the last container, when the table reaches the client. The
catalogue is complete from the start; consuming it one column per slice
is what "one container at a time" means.

**The stylesheet stops believing a promise.** Three rules keyed on
`data-bnd-layout="topbar"` now key on `data-bnd-topbar`, stamped only
once the bar is really in the document. That is not bookkeeping for the
split — it was wrong before it. `mount_topbar` returns early whenever
Frappe renders no `<header>`, which is **every viewport under ~480px**,
and those desks were getting a page head pushed down by the bar's height
with no bar above it. Same polarity as `data-bnd-own` and
`data-bnd-statusbar`, for the same reason: key on the outcome and there
is no failure mode left to handle.

**Switching a container off cannot take a control away.** A container
that is off mounts nothing and stamps nothing, so its region resolves to
absent — and absent already means *leave what is there*, never delete.
Search proves it in the matrix: asked for a top bar that is switched off,
it lands in the status bar instead of vanishing.

**A patch per container, not one for all five.** `container_topbar`
writes what each site's layout renders today — 1 for Top Bar, 0 for
everything else — and nothing more. Without it, the field's shipped
default of 1 would give every Compact, Classic, Bottom Bar and Dock site
a top bar it never had, on upgrade, without being asked.

Two smaller things fixed in passing, both the same shape as the slice:
the Home & All Apps diagrams were not repainted when the desk's shape
changed, so they could show "not available" over a slot that worked; and
the Overview's caption read "Layout: X" as though that described the
picture above it, which a container contradicting its layout makes
false — it names the preset now.

### The status bar stops being a property of the layout (rework slice 2)

`status_in_classic` is gone. The bar used to be a consequence of the
desk layout — four layouts mounted it and Classic did not, so Classic
needed an opt-in to have one. It is a component now, so `status_style`
decides and the layout has no opinion. That is a single call correct for
all five layouts, because `mount_statusbar` already returns early when
the style is Off.

A per-layout override was the second place the same fact lived, which is
the defect class this rework exists to remove.

**A patch preserves what every site currently sees**, not what it stored:
a Classic site that had not opted in gets `status_style: "Off"`, which is
the desk it has today expressed in the vocabulary that survives. Proven
against all three cases — Classic opted out, Classic opted in, and a
non-Classic layout the field never governed.

The cost is written down rather than glossed: `status_style` is global,
so such a site that later switches to Top Bar will find the bar off and
have to turn it on. That is what deleting a per-layout override means,
and it is better than silently showing a bar to someone who switched it
off.


### Theme Settings no longer offers to "Submit" itself

The primary button on Theme Settings read **Submit** — wrong on a
settings Single, and every obvious explanation was a dead end:
`is_submittable` is 0 in the JSON, `docstatus` is 0, and there is no
Workflow, Client Script or Property Setter on the doctype.

**The label comes from a permission, and the defect is upstream.**
`frappe/public/js/frappe/model/perm.js` grants Administrator *every*
right unconditionally, `submit` included, without reference to whether
the doctype is submittable. `toolbar.js` `can_submit()` then reads that
right and never checks `is_submittable` — the word appears once in the
file, in `add_discard()`, never there — and `get_action_status()` tests
`can_submit()` before `can_save()`. Confirmed desk-wide: a stock ERPNext
**Item**, which this theme does not touch, shows "Submit" too.

Corrected for this doctype only, by clearing the three rights that are
meaningless on something non-submittable. A theme has no business
rewriting the desk's permission model, and a global patch would surprise
anyone later debugging a genuinely submittable form — so Item still shows
what stock Frappe shows, and a test fails if that ever stops being true.
The other test asserts the *label*, not our patch, so it keeps passing if
Frappe fixes this upstream and our correction becomes a no-op.

### The shared desk diagram (component rework, slice 1c step 3)

Placement is now chosen on a picture of the desk: click where the thing
should live.

**One desk, not thirty thumbnails.** Placement used to be drawn as a
miniature per choice — six hand-authored SVGs for search alone, and the
bell, user menu, home and all-apps would each have needed their own set.
Around thirty little pictures of the same desk, every one of which has to
stay truthful as the chrome changes. They would not have. There is now
one frame drawn from one geometry table, and a component contributes only
the slots it can occupy, so a region cannot move in the picture without
its hit area moving with it. `search_picker` went from 63 nodes and six
SVGs to 23 nodes and one.

**The bell and the user menu have a placement control at all.**
`inbox_placement` and `user_placement` have existed since slice 1a and
appeared nowhere in the settings form — settings with no way to set them.
The user menu also gets its own section and its own entry in the list,
matching what `registry.py` has always said: it is a separate component,
and the one marked *critical*, since losing every route to it means no
log out and no theme switch.

**Availability is one function, keyed by region.** A slot the current
layout cannot honour is marked and says why — "Top Bar has no dock",
"Dock hides the sidebar", "the status bar is switched off". It warns and
never blocks, because the runtime falls back either way and naming the
obstacle beats greying a choice out. Those rules used to live in search's
own vocabulary; the bell and the user menu would have restated them.

**The Overview** shows every placed component on one desk, with each mark
a route to its control. Read-only on purpose: two ways to set the same
value is the duplication this rework exists to remove.

### Master & detail settings shell (component rework, slice 1c step 2)

Theme Settings is ~70 fields in nine stacked sections. This adds the
grouped list beside a detail pane that the wireframes settled on — Bars
& panes / Controls / Appearance, ten entries, one component's settings
shown at a time.

**It moves the form Frappe already built rather than drawing a second
one.** The obvious implementation renders every picker into the new
surface, which leaves two sets of cards bound to the same fields, each
blind to the other's clicks — the same-fact-in-two-places defect the
rework exists to remove, reintroduced by the thing meant to fix it. The
shell relocates the existing DOM instead, so there is exactly one node
per field and every Frappe control keeps working untouched.

It shipped gated behind `?shell=1` while it was half-built — a
half-finished navigation being worse than a long form — and **the default
flipped once it was finished**: `/app/theme-settings` opens on the
component layout now, and `?shell=0` still reaches the stacked form for
any field the shell has not placed.

Two defects found while building it, both now covered by tests: the
container-query breakpoint collapsed the list into a wrapped row of chips
at normal form width (the form's column is ~870px, the threshold was
900), and two entries claimed the same section — `default_density` and
`enable_command_palette` share `section_features` — which silently
emptied whichever pane lost. A section can now only be claimed once, and
a later claim takes just its own field.

**Change dots and a derived note.** Each entry shows a dot when that
component differs from what a fresh install writes, and a note saying
what state it is in. The defaults come from the server —
`api.get_shipped_defaults` over a newly named `setup.SHIPPED`, which the
smoke suite and the fingerprint tool now read too instead of each
recomposing `{**DEFAULTS, **CHECK_DEFAULTS}` for themselves. Which fields
an entry owns is expressed as a **prefix**, the rule `build.mjs` already
enforces, so no sixth list of fieldnames had to be written down.

**The note refuses to invent presets.** Only the side pane has a preset
catalogue, so only the side pane shows a preset name (via the existing
comparison of all 22 values — pinning the name still pins nothing). Two
independent fetches race to supply the marks — the shipped defaults and
that catalogue — and whichever landed second left the other's work stale,
so the one entry with a real preset to name intermittently read
"Default". Both now repaint; the marks are idempotent, so the redundant
pass costs nothing. Caught by the suite, not by looking: a manual check
had happened to give the catalogue time to win.
`crumb_style`, `palette_style`, `inbox_style` and `status_style` are
top-level style choices that compose with their extras, and nothing
anywhere records what `desk_layout` writes to the component fields. Those
entries get the honest two-state **Default / Changed**, computed by the
same function the dot uses — one comparison, two renderings.

**A doctype repair, found by measuring the shell rather than reading it.**
`default_density` shared `section_features` with `enable_command_palette`,
so two shell entries claimed one section: the palette pane carried a
stranded "Features" heading over nothing, and the density control rendered
at 636px against every other Select's 273px, having lost the
`.form-column > form >` chain Frappe caps input width with. Density now
has its own section and the palette gate sits with its seven siblings.

**The zone split.** Each picker now divides into labelled bands —
Placement / Style / Extras, and for the side pane also Pane surface,
Links & icons and Rail.

The bands live **inside the picker output**, not at the form-section
layer, because 59 of the 92 fields are hidden and every component section
holds exactly one visible field: its picker. The controls a user touches
are not Frappe field wrappers at all, so zoning the form layer would have
zoned almost nothing — and per-zone Section Breaks would have been
permanently empty sections, since Frappe only marks a section empty when
its parent is a tab-pane or form-page, which a shell pane is not.

Each row declares its band on the row that already exists, so no new
table was written. **A heading appears only where a picker has more than
one populated band**, computed from what actually rendered — so Search
(placement only) and Layout preset are untouched, and a picker that grows
a second band starts showing headings on its own. The two hand-rolled
`Extras` group titles are gone; that idea is the mechanism now.

The side pane earns the longer vocabulary because one "Style" band over
its twenty option groups would be the wall the split exists to remove.
Its settings filter also hides a band once every group in it is filtered
out — previously the heading stood over nothing, which reads as a broken
filter rather than as no matches.

### Contrast validation (item 32)

A white-label theme re-derives every surface from a colour the customer
picks, and nothing was checking the result. The shipped default was
already failing — white-on-brand at **4.27:1** — and a bright yellow seed
measured **1.62:1**. Twenty distinct pairs failed at the shipped seed;
across eight plausible seeds, 153.

**The target is now stated: WCAG 2.2 AA.** 4.5:1 for text, 3:1 for UI
components, meaningful graphics and the focus ring.

**Nothing is rejected.** A tenant's brand colour is their identity, not a
preference; refusing it produces a support ticket, not an accessible
desk. So the seed contributes hue and the system controls lightness — the
approach Material 3, Radix, Spectrum and Carbon all converge on. The
brand now has three roles instead of one:

- `--bnd-brand` — washes and hue tints, exactly the seed, unconstrained
- `--bnd-brand-solid` + `--bnd-on-brand` — opaque fills and their labels,
  guaranteed 3:1 against every surface *and* 4.5:1 under the label
- `--bnd-brand-ink` — the brand written as text, 4.5:1 against every surface

A yellow seed keeps its yellow and gets dark labels. A seed in the narrow
band where neither white nor dark ink can reach 4.5:1 — where the shipped
default sits — gets a fill shifted by a few percent. Theme Settings
reports which, on save; it never blocks a colour.

**`--bnd-ink-subtle` moved rather than being documented away.** At 2.61:1
it was a text token that never passed as text, on 14 real text rules. It
is now fitted to 4.5:1, and `--bnd-ink-muted` to 7:1 so the ramp still
reads as three levels. `--bnd-warn` (4.01:1 as status text) and the
dark-mode focus ring were fitted too.

Because the surfaces are seed-tinted, a fixed value cannot solve this:
measured across eight seeds, `ink-subtle` failed in 96 of 96 placements.
The inks are therefore derived per tenant, by the same `palette.derive()`
that CI measures — so the gate is not checking a copy of the design.

**Mechanized:** `npm run contrast` (and a CI step) recomputes 1,080 pairs
over 11 seeds × 2 modes plus the no-brand-stylesheet fallback — plausible
brand colours plus pure white, pure black and mid grey — parses the
values out of `_tokens.scss` rather than restating them, and asserts the
static defaults equal the derivation. The smoke suite feeds live
`getComputedStyle` values to the same implementation, so the enforced
numbers stay tied to pixels.

Two pairs are measured and deliberately not enforced, with their ratios
published: `--bnd-border` (1.22:1, a separator) and `--bnd-border-strong`
(1.45:1, a hover accent that always accompanies a background change).
Whether a control needs a 3:1 resting boundary is a per-component
question for item 34. The sidebar style kit's own 8-preset palette is
also outside the gate — fixed values, so no per-tenant risk, but
unmeasured; also item 34.

Visible changes: muted and subtle text are darker in light mode and
lighter in dark; the brand green shifts by about one shade where it is
painted as a fill or written as text; the dark-mode unread badge takes a
neutral near-black ink instead of the hand-tuned `#2b0f0c`.

## [0.10.0] — 2026-08-01 — Status bar kit + search placement (item 14)

Two settings, deliberately separate — because the previous arrangement
made them one.

### Search placement is now its own setting

Search used to be welded into whichever bar the layout mounted, so
picking a layout also picked where search lived, and in Bottom Bar it
fought the status segments for a single strip. It is now six slots of
its own — Top Bar Center (default) / Top Bar Edge / Sidebar Top /
Sidebar Bottom / Bottom Bar Center / Bottom Bar Edge — chosen from
thumbnails, independent of the layout.

Two mechanisms, on purpose: **sidebar slots reveal Frappe's own search
row** and order it (injecting a second search there would be a
duplicate, not a placement), while **bar slots inject our field**, since
those bars are ours. A slot the active layout does not offer falls back
to the nearest one that exists rather than vanishing, and the picker
says so on the card — naming the actual blocker (no top bar, sidebar
hidden, status bar switched off) instead of greying the choice out.

### Status bar

**Quiet** is the default and the argument: a healthy desk shows almost
nothing, and a signal appears only once it needs a person. **Operator**
puts every count on screen with a freshness stamp and manual refresh;
**Minimal** keeps connection, density and clock with no server calls at
all; **Off** renders no bar. Every extra is an independent switch —
five segments, freshness stamp, bar recolouring on a failure, and an
opt-in for Classic — plus refresh interval and clock format.

**Quiet never says "all clear."** A signal that cannot be read — no
permission, failed poll — is absent, not reassuring: `null` renders as
nothing, never as zero. The bar also states how old its numbers are,
because Frappe publishes no event for background jobs and the counts
are therefore polled, not live.

`api.get_status_signals` answers all three signals in one round trip and
guards each independently, so one failing source degrades to "no data"
rather than taking the strip down. Job counting is System Manager only,
gated on the ROLE rather than on catching a permission error, and always
filtered: `get_matching_job_ids` with a status filter runs in 1-12ms,
where the same call unfiltered measured **4,463ms**.

Responsive by declared rank, not by flexbox accident: every optional
item carries `data-bnd-prio` and narrow viewports drop the least
actionable first, so "3 failed jobs" outlives the clock. Logical
properties throughout, so the strip mirrors in Arabic with no second
ruleset.

### Hardening from testing and the release review

- **Bottom Bar layout sat search-less for 3.1 seconds on its own default
  placement.** The mount waited out a 20-try retry budget for a top bar
  that layout never mounts. Our bars are mounted synchronously moments
  before that call, so a missing bar host is missing forever; only
  Frappe's late-rendering sidebar row is worth waiting for, and the two
  are now told apart.
- **Dock could place search where no one could see it.** Dock leaves
  `.body-sidebar` in the DOM and hides its container, so an
  existence check happily resolved a sidebar slot into `display: none`
  and search disappeared with no error anywhere. Visibility, not
  presence, is the condition.
- **Minimal built what it refuses to feed** — three hidden segments and
  a freshness stamp wired to a poll that returns early, i.e. a stamp
  reading "No data" forever above a dead refresh button. The poll-driven
  half of the bar is no longer built in that style, and the test now
  counts requests to the endpoint rather than trusting the DOM.
- **The boot payload's server-decided `privileged` flag was never read
  by the client**, so an ordinary user got a jobs segment the server
  will always refuse and a "Scheduler paused" warning they have no power
  to act on. Admin-only signals are now dropped for them, and not asked
  for. Error Log stays ungated on purpose: that permission is grantable
  beyond System Manager, and the server already self-gates by omitting
  the count.
- **A repaint interval leaked on every restart** — `status_start` cleared
  the poll timer but not the ageing timer it also created.
- **"Bottom Bar Center" was not centred.** The field was appended when
  search mounted, which is after the bar has built everything else, so it
  landed hard against the trailing group. Both bars now RESERVE a centre
  slot between two flexing spacers, making the position a property of the
  bar rather than of the order two mount functions happened to run.
- **The connection segment said "Offline" on a desk that plainly
  worked.** It watches the realtime socket, not the network: what stops
  without it is live updates, and that is what it now says. It also no
  longer accuses at boot — socket.io is normally mid-handshake when the
  bar mounts, so good news paints immediately while bad news waits out a
  grace period. Under Quiet, a working socket says nothing at all.
- **Style "Off" still reserved a strip of empty space** at the foot of
  every page: the clearance for the fixed bar is a CSS rule, and the kit
  was the only one shipping no `data-bnd-*` attribute for CSS to read.
  It now sets `data-bnd-status`, and the reservation also grows when the
  slim strip grows to carry search — which it previously did not, leaving
  the last list row behind the search field.
- **`_count_jobs` logged API drift from inside a poller.** A rename
  upstream would have written an Error Log row every 60 seconds per
  admin — and the error segment counts Error Log rows, so the bar would
  have reported its own noise as a fault. Throttled to once an hour.

### Caught by the release review, after the suite was green

The adversarial review gate found a critical defect and two majors that
52 passing browser tests did not. All are fixed, each with a regression
test — several of them geometric, because the old assertions passed
while the layout underneath them was wrong.

- **Style "Off" deleted the Bottom Bar layout's only chrome.** The early
  return skipped the strip whichever bar it was, but in that layout the
  strip IS the layout — it carries the bell, the unread badge and the
  avatar menu, while the CSS hides the sidebar's copies of all three
  keyed on the layout. Bottom Bar + Off gave every user a desk with no
  notifications and no way to log out. Off now empties the strip of
  status content; it never deletes a layout's chrome.
- **The centred search slot dragged the top bar's cluster to the wrong
  end.** Flexbox resolves flexible lengths before auto margins, so the
  flexing spacers introduced for centring cancelled the cluster's own
  `margin-inline-start: auto` and moved the bell and avatar to the
  leading edge. The slot is now positioned against the bar, which also
  centres it on the BAR rather than between whatever sits either side.
- **The dock and the status bar occupied the same band.** Dock gained a
  status bar this release; both are fixed to the bottom edge with the
  same z-index, and the dock — appended later — painted over the bar and
  swallowed its clicks, including the search field that falls back into
  it under the default placement. They stack.
- **Nothing hidden was ever hidden.** `[hidden]` is the lowest-weight
  rule there is and `.bnd-status-item` sets `display`, so Quiet's whole
  premise was decorative.
- **Two search fields at once.** Compact and Classic keep Frappe's own
  sidebar row, so a bar placement added a second field beside it.
- **The clearance rule outranked the Desktop-page stand-down guard** on
  specificity. Clearance is now keyed on `data-bnd-statusbar` — whether a
  bar actually mounted — rather than re-derived from layout and style,
  which also gives Classic's opt-in bar the clearance no layout rule
  ever covered.
- **The errors segment lost its warn tone in Operator**, the one style
  meant for people watching for trouble, so escalation could never fire
  for errors at all.
- **The freshness stamp was built for users with nothing pollable**,
  leaving a permanent "No data" over a refresh button that could not
  refresh anything.

### Fix: page content no longer hides under the fixed bottom chrome

Pre-existing since the desk-layout kit (item 9), found while sweeping
item 14 and fixed before this tag rather than after it.

The status bar and the dock have been `position: fixed` since the desk-layout
kit (item 9), and the space reserved for them never actually worked. On every
list view the paging row — the "20 100 500 2500" buttons — sat under the bar:
26px in Top Bar/Compact with a slim strip, 40px once the strip carried search
or the layout was Bottom Bar, 62px in Dock. Workspaces stayed under it even
scrolled to the end, and at narrow widths nothing scrolled at all, so the
overlap was permanent.

**Why the existing reservation could not have worked.** `_layouts.scss` padded
`.main-section`'s block-end by the bar's height, but Frappe sizes the list from
that element's *border box* — `base_list.js:452` reads
`$(".main-section").getBoundingClientRect().height`, which padding does not
change. Measured: padding on `.main-section`, padding on `.page-body`, a margin
on `.list-paging-area` and a sticky bar all left the paging row at `y=900`
exactly. The fix takes the reserve off `.main-section`'s **height** instead, so
Frappe's own arithmetic — the list JS and the `calc(100vh - …)` rules in report,
form-sidebar and kanban CSS — resolves against a viewport that ends where the
bar starts. Scrolling distance is unchanged: on a border-box scroll container,
bottom padding adds equally to `scrollHeight` and `clientHeight`.
See ARCHITECTURE.md §11.

**The reserve is now measured, not declared.** `--bnd-bottom-reserve` is written
by `bunood.js` from the chrome that actually rendered, the same contract as
`--bnd-sidebar-live-w`. A static per-layout matrix was written first and was
wrong in three states: Dock over-reserved by 14px (it mounts a floating pill
*and* a status bar, and the pill renders 50px, not its 56px token); Classic's
opt-in status bar reserved nothing at all, because every reservation selector
named a layout and Classic was not one of them; and Bottom Bar with the status
bar switched Off reserved 40px of dead space. Measuring also fixes the failure
mode — no bar in the DOM means no reserve, so a half-failed boot degrades to
stock geometry instead of to a strip of viewport nobody can use.

**Measuring happens off the critical path.** Reading the chrome's geometry
forces a synchronous layout, so doing it inside the router's `change` handler
made every listener registered after ours — Frappe's own re-render among them —
pay for it mid-render. The route-change re-measure now runs on the next frame.
Caught by the smoke suite, which failed one unrelated timing-sensitive test per
run (three runs, three different tests, twice with Playwright's "promise was
garbage collected") until the measurement moved off the handler.

**One box needed the reserve spelled out.** A shorter scroll container fixes
everything that can scroll; the form's sidebar is `position: sticky`, so it
cannot — anything past the container's foot is unreachable at every scroll
position. Frappe sizes it `calc(100vh - var(--page-head-height))`, which left
41px of it (tags, share, assignments) permanently out of reach: behind the bar
before this fix, past the container foot after. It now subtracts the reserve
too. The report view's pane uses the same viewport arithmetic but is static, so
it simply scrolls and was left alone — verified, not assumed.

Also fixed, found while measuring the same defect: the theme's fixed chrome was
never hidden for print, so the top bar, status bar, dock and apps rail stamped
themselves over the same strip of **every** printed sheet, and `.main-section`
kept a one-viewport height on paper. Both now stand down under `@media print`.

Verified on list, form, report and workspace views across all five layouts and
status style Off, in LTR and Arabic, at 1440×900 and 430×900. `tests/smoke.mjs`
gains `reserve:` checks asserting both directions of the defect: the paging row
must not pass under the bar, and must not stop short of it either.

## [0.9.0] — 2026-08-01 — Notification centre kit (item 13)

Four styles picked visually (hidden fields -> boot dict ->
`data-bnd-inbox` -> CSS + a lazily-built panel):

- **Inbox + Page** (default): our panel over Frappe's own Notification
  Log — filter tabs (Unread / Approvals / Mentions / Shared / All),
  rollup by document, reason chips, hover row actions, keyboard triage
  (j/k, Enter, `e` marks read and auto-advances) — PLUS a full-page
  split-pane surface at `bnd-inbox` with a detail pane, reached from the
  panel's footer.
- **Bunood Inbox**: the same panel without the page.
- **Refined**: ERPNext's own panel restyled through the tokens.
- **Original**: the stock panel, untouched — badge included.

**The unread badge is the headline fix.** ERPNext renders no unread
indicator at all in this version: `toggle_notification_icon` flips
`.notifications-icon` / `.notifications-unseen`, and neither exists in
any template — verified live with two unread rows and `seen: 0`. The
theme owns the affordance outright: Count, Action Count (assignments and
mentions only), Dot, or Off; seeded from boot so it is correct at first
paint, kept live on Frappe's own realtime event.

Sources and actions stay Frappe's. `api.get_inbox` pages the log
properly — `get_notification_logs` takes no offset, caps at 20 and is
`@http_cache(60)`, so a burst can render the same row twice — while
mark-read and mark-all-read call Frappe's whitelisted endpoints. "Done"
is ours in `frappe.defaults`: role All has no write permission on
Notification Log, there is no mark-as-unread endpoint, and a custom
field on a core doctype would outlive this theme.

Arrival tiering defaults to approvals-only: an approval blocking a
document earns an interruption, a share notification does not.

### Hardening from the release review and the visual sweep
- **The kit was inert in Classic**, which mounts no themed bell: no
  badge node, the stock panel opening under the Bunood styles, and
  Refined's skin gated on a class only JS applied — so it rendered
  identically to Original, silently. The skin is now pure CSS keyed on
  the boot attribute, and a capture-phase listener routes Frappe's own
  bell into our panel (the counterpart the palette kit already had).
- **With the shipped defaults** (Classic + the Rail preset) that bell was
  still unreachable: the rail fades `.standard-items-sections` to
  opacity 0 with `pointer-events: none`, and a child cannot escape an
  opacity-0 ancestor. The container is restored and its other children
  faded individually.
- **Compact** re-injects its cluster per route, so every new page
  arrived with a fresh unpainted badge; badges are ensured and repainted
  on route change.
- **"Action Count" could never render a count** — the typed count was
  declared and never assigned, degrading the mode to a dot that lit up
  for shares too. It now comes from the server, seeded at boot.
- Under **Original** the badge still unhid itself (the CSS is
  attribute-scoped, so it showed as a bare number on the bell).
- `comment_when()` returns Frappe's live timestamp MARKUP, not a string:
  assigned as text it printed tag source into every row.
- Contrast: group headers, timestamps, chips, the avatar initial and the
  footer hints measured 2.3–3.4:1 against a 4.5:1 floor; all moved to
  the muted ink token, and the badge gained a mode-aware
  `--bnd-on-critical` because its fill flips lightness between modes.
- `icon-link-url` draws a paperclip in this icon set — the wrong verb
  for "open in a new tab".

Smoke suite grew to 51 checks, including the kit exercised under Classic
specifically (every earlier inbox test ran under one layout, which is
why none could see the blind spot). NOTE: the suite mutates Theme
Settings and is not safe to run concurrently with itself.

## [0.8.0] — 2026-08-01 — Command palette kit (item 12)

Ctrl+K grows up. Four styles picked visually (hidden fields -> boot dict ->
data-bnd-palette -> CSS + a lazily-built shell):

- **Bunood Palette** (default): our shell over Frappe's OWN search — every
  result sourced from `frappe.search.utils.*`, executed with the stock
  select semantics, rendered as grouped sections (Frequent / Recent /
  Actions / Navigate / Reports / Pages) with species badges, match
  highlighting via background tint (per-character bolding breaks Arabic
  contextual shaping), pinned fallback rows ("Search all documents" can
  never be pushed out — the stock bar's worst measured weakness), a
  calculator behind a strict arithmetic whitelist instead of a raw eval,
  and a footer keycap legend. If any sourced API is missing after an
  upgrade, invocation falls back to opening the native modal.
- **Palette Pro**: adds mode sigils (`>` actions, `#` documents, `/`
  reports) and a debounced record-search stage over Frappe's global-search
  endpoint — actual documents by name, permission-checked server-side.
- **Refined**: Frappe's own modal, tagged on first open and restyled
  through the tokens. The flat list stays flat — no new behavior.
- **Original**: the stock Ctrl+K modal, untouched. The legacy visible
  "Enable Command Palette" check is now the kit's hidden master gate
  (0 forces Original).

**Frecency, finally real**: per-user, SERVER-side (frappe.defaults via two
new whitelisted endpoints), decayed with a 14-day half-life, capped at 100
entries, merged into ranking on every open, with a "Reset my ranking"
valve in the picker. Fixes what upstream cannot: the fork's `user_recent`
store has no writer, and Route History deliberately never persists Form
visits — so Frappe's own "frequently visited" can never contain a
document. Ours can.

**Keyboard**: wrap-around arrows, two-stage Esc (clear, then close),
Ctrl+Enter opens in a new tab. The Ctrl+K takeover is registered only when
boot delivers the kit — `add_shortcut` REPLACES every handler on a combo,
so the action itself covers all styles (our shell or the native modal),
and a boot failure leaves the stock binding untouched.

**Hardening from the release review** (three rounds; each fix
adversarially re-verified, the last with a revert-control run):
- The capture-phase click interceptor no longer defeats the kit's own
  fail-open — a missing `frappe.search.utils` lets Frappe's native
  handler through instead of killing every search entry point.
- Frecency writes are batched (90s throttle + tail flush on tab hide):
  `frappe.defaults.set_default` clears the user's whole cache per write,
  so per-execution writes rebuilt boot on every navigation.
- Ctrl+K on Original/Refined calls Frappe's OWN shortcut function, so
  the Global Search hand-off and keyword carry survive; the shell does
  the same hand-off through the Dialog object so `is_visible` clears.
- With focus in a Frappe control, `base_input`'s own Ctrl+K handler
  opens the native modal via jQuery-simulated handlers before ours sees
  the event; the shell now closes it, and the z-lift asks the DOM for a
  surviving `.modal.show` rather than `body.modal-open` — Bootstrap
  strips that class without reference counting, which had dropped the
  palette *under* the user's dialog.
- Row typing uses Frappe's untranslated `opt.type`, never a regex on a
  translated label: on Arabic, "{0} List" renders as "قائمة {0}" with an
  untranslated doctype name, so the core Report doctype's *list* row was
  badged as a report.
- The palette master gate moved to None-aware seeding (an explicit 0 no
  longer flips back on migrate), and empty-state suggestions dedupe
  within each group as well as across.

Smoke suite grew to 40 checks (style attribute matrix, shell open with
suggestions, grouped results + pinned fallback + the Actions split,
execution routing + server-side frecency write, Original/Refined native
behaviour, live preview, duplicate-suggestion regression, Ctrl+K over an
open dialog, Global Search hand-off).

## [0.7.0] — 2026-07-31 — Breadcrumb kit (item 11)

The full trail treatment, as a kit of composable Theme Settings options
picked visually (same architecture as the sidebar: hidden fields -> boot
dict -> `data-bnd-crumb*` attributes -> one CSS matrix). The 0.4.0
unconditional module chip was retired first; the chip is now one option of
the kit. Everything is DECORATION of v16's own trail — Frappe's renderer
is wrapped (`frappe.breadcrumbs.update`), never forked, so decoration
survives its full-rebuild-on-save and every unknown value fails open.

### Styles (the picker's cards)
- **Quiet Trail** (default): muted small ancestors, strong last crumb —
  typography carries the hierarchy.
- **Title Fusion**: the last crumb IS the page title, large, one row.
- **Eyebrow Title**: tiny trail line above a large title on its own row;
  trail and title truncate independently (long Arabic/English names).
- **Crumb Pills**: every crumb a soft pill, current page filled; pills
  draw no separators.
- **Original**: ERPNext's stock trail, untouched — no attributes set.

### Extras (each its own option, any style)
- Separator: slash / chevron / dot / arrow — chevron and arrow mirror
  automatically under `[dir=rtl]` (generated content, not box properties,
  so the RTL build guard stays honest).
- Module icons: off / first crumb / every crumb (inference reuses the
  sidebar's hint table; unmatched crumbs stay text-only).
- Hover: soft pill / underline / darken (ancestors only).
- Copy link: hover-revealed button on the last crumb; clipboard + toast.
- Status pill: Frappe's own docstatus indicator styled into the trail row.
- Narrow screens (OPT-IN): the trail collapses to a single labeled back
  crumb ("← Parent") under 992px, overriding Frappe's keep-the-last-crumb
  rule. Off by default — on v16 form pages the last crumb IS the page
  heading, so the collapse hides the open document's name on small
  screens (release review reproduced it live); it stays opt-in until the
  collapse design keeps the title visible.

### Facts the implementation is built on (measured)
- Frappe's separator is generated content on the ANCHOR's ::before; all
  separator options move it to the LI so hover backgrounds can never paint
  over the glyph. The last crumb's color is Frappe `!important` — the kit
  restyles only size/weight and inherits the strong ink via the bridge.
- Frappe's mobile sheet hides all but the last crumb at (0,2,1) under
  992px; the kit's alignment rules are fenced to `min-width: 992px` so
  they can never accidentally un-hide crumbs.
- `frappe.db.get_single_value` CASTS a missing Check field to 0, so the
  seeder reads "never written" as row-absence in tabSingles — otherwise
  default-on checks could never be seeded (or worse, an admin's explicit
  off would flip back on).

### Release infrastructure (first shipped in this range)
- **The committed browser smoke suite** (`npm test` → tests/smoke.mjs):
  every behaviour ever verified by hand, now 28 checks incl. the four
  crumb styles' attribute matrix + decoration, Original-applies-nothing,
  Every-Crumb inference, and live-preview flip/revert. Settings are
  snapshotted and restored even on failure.
- **CI gates on every push** (.github/workflows/ci.yaml): SCSS build with
  the RTL guard, dist/assets.py drift detection (via `git status
  --porcelain` — `git diff` is blind to untracked hashed files), JS and
  Python syntax. package-lock.json is committed for reproducible `npm ci`.
- **Deterministic builds across platforms**: build.mjs normalizes CRLF to
  LF before hashing and .gitattributes pins LF repo-wide — a Windows
  checkout and CI's Linux checkout now produce identical dist hashes.
- **The adversarial release-review workflow**
  (tools/release-review.workflow.js), codified in README as the third
  release gate: four independent reviewers over the diff since the last
  tag, every finding adversarially verified. Its findings are fixed in
  this release (copy-link now checks clipboard availability at mount
  time — secure contexts only; the narrow collapse made opt-in).

## [0.6.2] — 2026-07-30 — Fix: Theme Settings save conflict

- `write_brand_css` no longer bumps the document's `modified` timestamp when
  registering the brand stylesheet URL (`update_modified=False`, skip when
  unchanged). It runs in `on_update` AFTER the save stamps `modified`, so the
  bump left every open form stale and the next save failed with
  TimestampMismatchError — hit in production on the first day.

## [0.6.1] — 2026-07-30 — Rail feel, preview coverage, pane width

- Rail timing tuned (80ms open intent, 320ms close grace, in-pane focus
  ignored, soft unpin, Escape closes).
- Live preview covers every option: icon-source switches reprocess, badge
  modes rebuild, and a form reload/discard visually reverts the desk.
- Pane width setting: five stops 200–280px; stop 2 = v16's original 220px,
  the default. Manual Collapse stays Frappe-owned.

## [0.6.0] — 2026-07-30 — Settings experience + branding block

- LIVE PREVIEW: picker clicks restyle the desk instantly (attribute
  re-derivation + structural teardown/remount); Save keeps, leaving reverts.
- Theme export/import as JSON (download + clipboard / paste with validation).
- Settings search + per-group reset chips.
- Per-user personalize: avatar menu ▸ Sidebar Style; whole presets only,
  merged server-side in boot over site values.
- Brand block (Theme Settings logo + company name) pinned at the pane top,
  routing Home; the old Desktop/Workspaces cascade menus retired; module row
  navigates instead of opening a menu; Website moved to the avatar menu.
- Home & All Apps placement setting (Sidebar Top/Bottom, Top/Bottom Bar).

## [0.5.1] — 2026-07-30 — Rail behaviour system + smart icons

- Menu Rail split from its trigger (Always Expanded / Manual / Rail ×
  Hover / Click / Button Only / Hover+Pin); expand button with placement,
  shape and icon options; legacy stored labels still resolve.
- Icon Source: Smart (keep real icons, infer from label against the sprite,
  letter-chip fallback — 46/55 links inferred on Stock), Original, Letters.
- Full-desk render audit fixes: Desktop-page chrome guard, calm resting
  rail, true end-edge bar insets, apps-rail styling, overlay z-order.

## [0.5.0] — 2026-07-30 — Sidebar style kit (item 10; presets, item 30 pulled forward)

The sidebar becomes a KIT of 16 composable Theme Settings options with 8
presets on top. Values are the canon, presets are labels: applying a preset
writes its values into the fields; diverging one option relabels to "Custom".
Delivery: boot dict -> `data-bnd-sb-*` attributes -> one CSS matrix
(`chrome/_sidebar.scss`); every combination is attribute selectors composing,
no per-preset CSS. Missing/unknown values fail open per-option.

### Options
Placement (attached/floating) · Material (solid/glass) + 5-stop glass opacity
+ blur (off/soft/full, honours prefers-reduced-transparency) · Pane color
(match-theme/minimal/dark-contrast/brand) · Icon style (6) · Active link (7,
Folder Tab constrained to attached panes by the picker) · Section layout
(plain/divided/mini-cards/accordion) · Hue wash (off/subtle/rich; actives take
the section hue) · 5-stop surface intensity (bg/border/shadow move together) ·
Menu rail (expanded/manual/hover-expand/hover+pin) · Apps rail (separate
strip, renamed from workspace rail) · Badges (off/dots/counts, batched
`get_sidebar_counts`, zero = silent) · remember sections · scroll fades.

### Presets
Bunood Night (default: dark glass float, hue-washed mini-cards, hover rail),
Bunood Light (same design, daylight), Daylight, Ink, Carbon, Paper, Aurora,
Operator. Catalogue lives in `presets.py`, served by `get_sidebar_presets`.

### Mounted pieces (bunood.js, all reversible / fail-open)
Home + All Apps utility section · module row (current workspace icon + name,
opens the native workspace menu; resolved from route or crumb) · section
wrapping into hue-stamped cards — UNWRAPPED automatically while Frappe's
sidebar edit mode is active, rewrapped after (MutationObserver) · hover-expand
rail as a container-anchored overlay (content never reflows; keyboard
focus-within opens it too) · apps rail · badges.

### Fixed during live verification
- Rail overlay positioned against the viewport (container lacked
  position:relative) — pane painted from the window corner.
- v16 NESTS section children inside the section container: descendant label
  selectors uppercased/hued every link; child combinators now.
- Injected chips rendered sprite icons at intrinsic (huge) size — bounded.
- Badge throttle stamped before the item list existed, throttling away the
  observer's retry; now stamped only when there is something to fetch.
- Native sidebar header ships light-surface styling; restyled for kit panes
  (one inline-style-beating !important, the codebase's second, documented).

## [0.4.0] — 2026-07-30 — Desk layouts (checklist item 9; seeds item 14)

Five switchable chrome layouts, chosen from wireframes: **Top Bar** (default;
global bar + breadcrumb title row + status bar), **Compact** (cluster shares
the title row), **Classic** (stock sidebar chrome), **Bottom Bar** (global
controls on the bottom edge), **Dock** (no sidebar; floating workspace dock).
Selected site-wide on Theme Settings via a visual thumbnail picker; delivered
through boot as `data-bnd-layout`; unknown/missing value fails open to stock.

### Added
- `chrome/_layouts.scss` — the conditional matrix: what each layout hides,
  where the notifications panel opens, space reserved for fixed bars.
- `chrome/_navbar.scss`, `chrome/_statusbar.scss`, `chrome/_dock.scss`,
  `chrome/_cluster.scss`, `chrome/_breadcrumbs.scss` — the mounted pieces.
- `bunood.js` — layout attribute pre-DOMContentLoaded; chrome mounting after
  the shell exists. **Reuse principle throughout**: search/bell proxy-click
  the hidden native controls (icons cloned from them), the avatar menu calls
  only public `frappe.ui.toolbar.*` / `frappe.app.*` APIs; every native
  lookup guarded, so a Frappe rename degrades to a missing button, never a
  broken desk. Sidebar width tracked by ResizeObserver into
  `--bnd-sidebar-live-w` (the sidebar is user-resizable).
- **Menu split** (non-classic layouts): brand menu = places (Desktop /
  Workspaces / Website); avatar menu = personal (Appearance, Toggle Density,
  Session Defaults, Toggle Full Width, Keyboard Shortcuts, Reload, My
  Profile, Log Out — plus Desktop/Website in Dock). Brand-menu personal items
  hidden by icon/onclick selectors, locale-independent.
- **Breadcrumb module chip**: the workspace's own sprite icon prepended to
  v16's existing trail. Slug match on href, TEXT fallback (measured: Frappe
  emitted crumb "Home" with href `/desk/item`).
- **Status bar** (item 14's seed): connection dot + label, Background Jobs
  link, density toggle, clock. Bottom Bar variant adds search + cluster.
- Theme Settings: `desk_layout` Select + `layout_picker` HTML field with five
  clickable SVG thumbnail cards (`theme_settings.js`); `desk_layout` seeded
  "Top Bar" in setup DEFAULTS; boot delivers it; saving Theme Settings now
  clears the site cache (boot is cached per user).

### Fixed
- Bell proxy: the opening click bubbled to Frappe's document-level
  outside-click closer and shut the panel in the same instant —
  `stopPropagation()` on our button.
- Relocated notifications panel rendered 0×0: natively the wrapper is a
  positioning anchor with an absolute child; in bars the child becomes static
  so the wrapper is the panel.
- Dock: Frappe's sidebar JS writes inline `display: block` — the documented
  legitimate `!important` (first in the codebase). Active-workspace highlight
  uses route shape `["Workspaces", name]` (measured), not a slug segment.

### Verified (Playwright, all five layouts live)
- Per-layout structural assertions + interactions: avatar menu (opens down
  from top bar, UP from bottom bar), search modal via proxy, notifications
  panel open/position/close, compact cluster + chip re-injection on route
  change, dock navigation + highlight, picker click→save→boot round-trip.
- Login page console clean after cache clear (stale phantom-asset HTML).
- Known environmental: browsing via `localhost:8080` fails socket.io origin
  validation (frontend pins Host to the site name) → status bar honestly
  shows Offline; realtime works when browsing via the site hostname.

## [0.3.0] — 2026-07-30 — Print (checklist item 8)

Decision "B plus hardening": document-mode printing inside the single bundle.

### Added
- `_print.scss`, last import in the bundle: chrome and interactive elements
  stripped (page title kept), content full width, table headers repeating per
  page, rows/cards/sections never split across breaks, tabular numerals on
  paper, orphan/widow control, ink-friendly links, 14mm margins.
- Status indicators survive printing without the "background graphics" setting:
  outline fallback + `print-color-adjust: exact` when it is on.
- **Force-light through the token pipeline**: `@media print` overrides the
  `--bnd-*` tokens and `_bridge.scss` re-derives every Frappe variable light —
  verified live with a Dark-theme user (attr still `dark`, `--bg-color`
  `#ffffff`, ink `#000000`), zero component rules, zero `!important`.

### Fixed
- **Brand sheet now wraps in `@media screen`.** Measured bug: it loads after
  the bundle and its dark block tied the print override at (0,1,1), so
  later-sheet-wins kept `--bg-color` dark on paper. Brand colour is a screen
  concern; on paper the bundle owns every token unopposed.

### Rejected (recorded)
- Option C's site/date footer: `@page` margin boxes are unsupported in Chrome
  and the `position: fixed` fallback collides with content margins. C's
  report-URL expansion deferred with it.

## [0.2.1] — 2026-07-30 — RTL proven and guarded (checklist item 7)

### Added
- **Build-time RTL guard** in `build.mjs`: the build FAILS if the compiled CSS
  contains any physical property (`margin-left`, `left:`, `float: right`,
  `text-align: left`, ...). Checked on compiled output so nothing slips through a
  mixin; corner-radius longhands are the one documented allowance. Negative-tested:
  a planted `margin-left` kills the build.

### Verified (live Arabic session, Playwright)
- `dir=rtl` desk fully mirrored; density padding intact (`padding-block` is
  direction-agnostic); list sections swap sides correctly.
- **The architecture's central RTL claim held:** our hashed sheets
  (`bunood.<hash>.css`, `brand_<hash>.css`) loaded untouched — no `rtl_` prefix
  rewrite, no second build, zero CSS request failures. Frappe's own core sheets
  resolved via its `assets-rtl.json` (core apps are among its 5 surviving entries;
  the manifest remains stale for every OTHER app on this bench — a deployment
  landmine worth knowing about, though not ours).

## [0.2.0] — 2026-07-30 — Density (checklist item 4)

Decision "G with C": a site default plus a per-user override, where compact
shortens rows, padding and controls but **never text** — no font token appears in
any density block, and that is enforced by grep in the build checks.

### Added
- `Theme Settings.default_density` (Comfortable/Compact) — flows through `brand.py`
  into the per-site stylesheet at `:root`, seeded on install AND migrate because a
  field `default` never reaches an existing Single.
- Per-user override stored in `frappe.defaults` (server-side, cross-device — not
  localStorage), delivered via boot, applied as `data-bnd-density` on `<html>` by
  the theme's first JS file before Frappe renders anything density affects. User
  choice beats site default by specificity — (0,1,1) over (0,1,0) — not by order.
- "Toggle Density" in the user menu via a native Navbar Settings Action item
  (the same mechanism ERPNext uses for "Delete Demo Data"); cycles
  site-default → Comfortable → Compact with a confirmation toast.
- `_density.scss` — the consumption shim. Measured on the live desk: Frappe's
  `.list-row` height is content-driven (`.level-right` padding), so mapping
  `--list-row-height` alone changed rows by 2px. Driving the level paddings gives
  **45px vs 31px rows, fonts byte-identical** (verified via Playwright).
- `build.mjs` now hashes JS entries the same way as CSS.

### Fixed
- Removed phantom asset declarations from `hooks.py` (desk JS, web bundle, icon
  sprite) that 404'd on every page. New rule recorded in the file: never declare
  an asset before the commit that ships it.

## [0.1.0] — 2026-07-29 — Scaffold

First commit of the rewrite. No visual styling yet; this release establishes the
architecture and proves the build.

### Added
- `ARCHITECTURE.md` — ten behaviours verified against the running Frappe v16.27
  source, with file:line references, and the decision each one forces.
- `build.mjs` — dart-sass compile to a **content-hashed** CSS file, plus codegen of
  `bunood_theme/assets.py` so the hash reaches `app_include_css` with no hand-maintained
  version string.
- `_tokens.scss` — the complete `--bnd-*` vocabulary: colour seeds, derived surfaces,
  ink, spacing, type, radii, elevation, motion, density, a validated categorical ramp
  and a reserved status set. Light, dark and `automatic` variants.
- `_bridge.scss` — the only file that touches Frappe's own ~534 variable names, mapping
  ours onto theirs inside mode-scoped blocks.
- `context.py` — `update_website_context` handler that appends the per-site brand
  stylesheet to the desk `<head>`.
- `brand.py` — per-site brand CSS generation: atomic write, content-hashed filename
  under the site's own `public/files`, old files reaped.
- `api.py` — version-proof wrappers for `frappe.desk.*`, the DocType→Workspace ownership
  map, and workspace Card Break sections.
- `boot.py`, `setup.py`, Theme Settings DocType.

### Notably absent
- **No `www/` directory.** v1 shadowed Frappe's 77-line `www/desk.html` to inject brand
  colours before first paint, which pinned the app to one Frappe revision and forced
  shipping a `www/desk.py` whose shim was one refactor away from caching `frappe.boot`
  across users. `update_website_context` removes the need entirely.
- **No `@layer`.** Unlayered author styles beat layered ones, and Frappe's desk CSS is
  unlayered, so layering our overrides would make them lose.
- **No `?v=` cache-busters.** Content hashes make every URL immutable.
- **No physical CSS properties.** Logical properties only, so one sheet serves LTR and
  RTL with no rtlcss build and no `assets-rtl.json` dependency.
- **No parallel `localStorage` theme state.** `User.desk_theme` is already the per-user
  override and Frappe renders it server-side into `data-theme`.
