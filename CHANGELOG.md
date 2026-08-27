# Changelog

Versioning policy: SemVer, pre-1.0. **MINOR = the ROADMAP item number that
ships** — item 29 is 0.29.0, item 30 is 0.30.0. PATCH = fixes and refinements
on top of one. Adopted 2026-08-20; before that MINOR simply incremented, which
had drifted EIGHT behind the roadmap (0.20.0 was item 28) so that a version
number told you nothing about what was in it. Releases before 0.29.0 keep the
numbers they shipped under and are never renumbered: the jump from 0.20.0 to
0.29.0 is this adoption, not eight lost releases. **v1.0.0 is reserved for the
completion of all 38 coverage items.**

Every release is an annotated git tag, and `app_version` in hooks.py matches
the latest tag — with ONE recorded exception. `v0.29.0` is tagged at item 29's
own close commit, because item 30 was already committed when the numbering
decision was made and a tag cut at HEAD would have carried item 30's source
inside a release named for item 29. That commit predates the decision, so its
version files still read 0.20.0. The invariant resumes at v0.30.0. This is
written down rather than left to be rediscovered as a bug.

**Item numbers below are as of the release date.** `ROADMAP.md` items were renumbered
to work order on 2026-08-13; entries here keep the numbers that were current when they
shipped, and are never rewritten to match. See `ROADMAP.md`'s old→new table to resolve
an "item N" cited below against today's numbering.

## [Unreleased]

### Settings singleton (item 36) — code complete, NOT yet released

Deliberately still under `[Unreleased]`: the heading, the version bump, the
payload record row and the tag arrive together with the gates, which is the
lesson the half-released 0.33.0 taught. Nothing here is a promise that it
shipped.

The settings surface's own closure — the one page every other item shipped its
controls through. The ROADMAP entry that opened this item ("brand, logo,
favicon exist; being restructured by phase 0 and effectively completed by it")
was two lines written before items 32–35 hung six consuming surfaces, a
sanitisation layer and two substitution pipelines off the identity fields.

**The Identity page.** Branding and Colours were the only two panes in the
shell that never got the picker treatment — bare native controls, no preview,
no reset, no specimen. They are now ONE Identity page in its own group (name,
logo, favicon, tagline and the four seeds together), with Language & Fonts
moved out beside Translations. The page adds a read-only layer over the native
controls, which stay the only write surface: a five-miniature specimen strip
(sidebar block, browser tab, email header, bilingual letterhead, a sign-in
drawing) composed from what the identity actually RESOLVES to per surface, and
a seed console showing the three roles a brand is — wash, fill+ink, text — for
both modes. `api.effective_identity` computes all of it server-side from the
same functions the real surfaces use, so the pane renders facts it did not
author and cannot drift from reality.

**Things the pipeline enforced silently, now said out loud.** An SVG logo falls
back to the wordmark on email and paper (raster only): the field description
says so, the email miniature demonstrates it with a badge, and `validate()`
raises a non-blocking note on the save that introduces it. The splash derives
from the *logo*; the favicon follows Website Settings then the vendor mark;
printed documents use the *Company record's* name, not this one. The
contrast-adjustment report — which the server has always computed and thrown
away as a save toast — is now resident in the pane, with "your colours are used
as entered" where it used to say nothing at all.

**Identity reaches the tab and the link preview.** Measured: with a company
name AND logo set, a guest `/` still served `<title>Login</title>`, no
`og:site_name` and no `og:image`. `_identity_meta` composes `<page> · <name>`
and emits the preview tags on the auth and website branches. Error pages get
the preview half only — their visible title is a hardcoded template block no
context value reaches, and shadowing Frappe's error templates was refused as a
fork that drifts.

**The change dots stopped lying by omission.** They compare against the served
shipped map, which had no entry for logo, favicon, tagline or the dark seeds —
so a site with a logo read "Default" forever. `SHIPPED_EMPTY` gives them a
served `""` to compare against without ever entering the seeder. `arabic_font`
gained an owner (it was the only visible user-editable Select no entry
answered for); `brand_css_url` stays deliberately unowned.

**A theme travels whole.** Export and import each carried a private copy of the
key list and both were wrong twice at once. One shared list now, carrying the
kit fields, the seeds, `arabic_font`, the container toggles, `desk_order`,
every placement and the identity TEXT; `logo`/`favicon` never travel (site-local
file URLs) and the export toast says so.

**Phase 0's own leftovers, closed on their own charter.** `SHIPPED_CONTAINERS`
deleted (its docstring said it "is deleted with the last one"); the two renames
`build.mjs` had promised to "the component rework's patch" executed with a data
patch carrying each site's stored values (`enable_command_palette` →
`palette_enabled`, `default_density` → `density_default`), emptying the KNOWN
VIOLATIONS block; `desk_layout` hidden — the derived label has said what the
desk IS since the last container landed, and the Layout entry now owns the
container toggles it writes rather than a stored name. The field is not deleted
yet, and the reason is written down: boot still stamps `data-bnd-layout` from
it and a dozen rules position panels by that, so a CUSTOM desk would silently
lose its styling; re-keying those rules to container outcomes comes first.

**The honest-picker audit** (the unnumbered thread, run bounded here): 34
findings across four dimensions, 13 refuted adversarially, the live ones fixed.
The headline — **a layout wrote half of itself**. Every card's blurb names
where search, the bell and the profile will sit; the click wrote only the five
container toggles, so picking "Bottom Bar" switched the top bar off and left
the bell pointing at a region that no longer existed, which the runtime
resolves to "absent". `registry.layout_settings` composed both halves all
along and the suite applied it, so every existing layout check drove a state no
gesture could reach. Also fixed: a placement click that did not move its own
selection (the user and links pickers repainted the *inbox* picker), a reset
chip labelled "Reset to default" that wrote the one value guaranteed to light
the change dot, and an import toast asking for a Save that does not exist.

**The identity test matrix.** Every identity field is now exercised with a real
value on every surface that consumes it, through one `withBranding` helper
(snapshot → `doc.save` → restore → read-back verified), plus a `site data:`
hygiene preamble that runs first and makes any crash leftover the next run's
first failure instead of a fixture string on the public sign-in page.

Payload: `css_gzip` ceiling 21000 → 21500 for the specimen strip's layout rules
(the dynamic colours are inline, not rules).

## [0.35.0] — 2026-08-26 — Print formats / PDF (item 35)

**Released together with v0.34.0, one gate for both**: the adversarial release
review ran over the combined never-reviewed diff — 29 confirmed defects, every
one fixed in `2567d59` (its message is the register) — and the full browser
suite ran TWICE over the combined tree. The first sweep (389/390) caught what
no targeted family could: the print preview's `sandbox=""` frame has a `null`
origin, so the print sheet's own Cairo/Amiri @font-face fetches CORS-failed —
a console error per render and Arabic previewed in a fallback face. Fixed in
`ede1d26` (`allow-same-origin`, nothing else granted) and verified absent in
the second sweep; that sweep's three failures were one backend transient
episode (a 502 on a stock Frappe API mid-run) and pass isolated. Two more
post-review fixes rode the merge: `11f2e1e` (a dangling company name renders
an empty letterhead identity, never a crashed document — found by the suite's
specimen doc). Families at the close: `print:` 13, `direction:` 4, `email:`
14, settings/shell/bands 21, list 10.

**The thirteenth surface kit, and the first delivered as a DATABASE RECORD.**
The compiled `scss/print/print.scss` is substituted per site from
`palette.derive()` (`printing/sheet.py` — the item-34 mechanism's fourth
consumer) and written into the Print Style "Bunood" at install, migrate and
every Theme Settings save. Twelve fields in `presets.PRINT_FIELDS`; the anchor
is a **preset over four section axes** (`print_header_style` / `_table_` /
`_totals_` / `_heading_`): the twelve named styles in `presets.PRINT_PRESETS`
write those values and stop existing, the picker's label derives by comparison
("Custom" the moment an axis differs), and selection reaches the document at
GENERATION via `/*BND axis=slug*/` marker blocks `sheet.py::_assemble` keeps or
drops — an unknown value stands the whole sheet down. `Side Column` was drawn
and died to measurement (grid on Qt-WebKit 534); recorded, not shipped.

**Fixed — the style that never applied.** v16 defaults `print_style` to
"Redesign", a name the installer's vacancy tuple never carried, so the Bunood
Print Style had been installed everywhere and applied NOWHERE since 0.13.0 (the
exact shape of ERPNext's never-loading email CSS). `STOCK_STYLES` is v16-aware
and the one-time `v0_35_0.claim_print_style` patch claims existing sites; its
honest cost (an admin who chose Redesign is indistinguishable from the default)
is in its docstring.

**Fixed — the hand-mirror.** `printing/bunood_print_style.css` and both
letterhead files hardcoded five hexes of an ABANDONED palette against a
`design-tokens.md` that never existed. Deleted/tokenised; the letterhead now
also composes per `print_letterhead` (Bilingual Split default · Centered Mark ·
Hairline Minimal · Frappe's own = a true stand-down proved by a sentinel) and
takes the theme's raster logo over the Company's.

**Fixed — AA on the most-printed documents.** ERPNext's nine transaction
formats inline `.text-muted #7c7c7c` (4.17:1) and a `#7c7c7c`-on-`#f8f8f8`
table head (3.93:1); contracts in the substituted sheet clear both at (0,2,0)+
specificity, outside every pole including Original. Plus the keep-together
contract Frappe never had (headings/rows/figures at page folds), every rule in
BOTH break spellings — `assertPrintSafeCss` enforces the pairing mechanically.

**Fixed — the RTL print gap, structurally.** The item-7 "accepted gap" was an
import-order ACCIDENT (rtl_patch reached printview/pdf only when apps loaded
first; any app-level `import frappe.utils.pdf` flips it — the suite now forces
that hostile order via `benchPyHostileImport`). Closed by a printview branch in
`context.py` (the PDF body inherits it through `get_print`) and last-wins
`pdf_header_html`/`pdf_footer_html` hooks (`printing/pdf_direction.py`).
Upstream-only remainder: WeasyPrint, and the four-code list itself.

**Fixed — Ctrl+P residue.** Item 8's hide-list predated v16: `.page-form`
filter ghosts, 21 selection checkboxes and 40 like/comment icons printed on
every list (census-quantified). Hidden at the scope level — `.list-row-activity`
as a cluster, because frappe stamps `d-flex !important` on `.comment-count` and
the honest fix is the interactive parent, not escalation. First suite coverage
the desk print sheet has ever had.

**Added — the per-section switches**, read AT RENDER by the macros (no sync,
no second copy): title language (Both/Arabic/English), QR show/place/size —
with the COMPLIANCE GUARD: `Hide` is ignored where a format declares
`required=True`, because a togglable legal mandate is a defect — amount-in-
words, and signatures (an explicit labels argument outranks the setting).

**Added — the third honest live preview.** `api.print_preview` renders a
SPECIMEN (the `?doc=` inline-dict path; no tenant record is ever read) through
the real funnel with the real record, into a sandboxed iframe with SHAPE chips
(Invoice/Document) and LANGUAGE chips (the same specimen re-rendered in
Arabic — the direction closure, live in the picker).

**Environment fact, filed not fixed:** PDF download of a real document has
NEVER worked on this local stack — `get_url()` = `http://demo.bunood.test`
does not resolve inside the backend container (wkhtmltopdf `HostNotFoundError`;
bare-HTML `get_pdf` works). Compose-level `extra_hosts` errand.

**Deferred, stated:** the wireframe round's remaining candidates —
`print_watermark`, logo place/size/name-language fine-grain (the letterhead
COMPOSITIONS cover the coarse need), `print_meta`, `print_contact`,
`print_density`, `print_receipt`, footer pages/privacy toggles — plus the
`arabic_font`-follows-paper wiring and the pane's "Download sample PDF" button
(blocked on the environment fact above). Payload: fifth bucket
`print_css_gzip` (ceiling 4000, at 2305); desk css 20868/21000 after the
preview chrome. The 118 `ar.po` rows were drafted `#, fuzzy` and APPROVED by the user 2026-08-26 (`23ab02f`).

## [0.34.0] — 2026-08-26 — Email templates (item 34)

**Released together with v0.35.0, one gate for both** — the discipline the
paragraph that used to sit here demanded: the heading, the bump, the row and
the tag arrive only now, WITH the passed suite and the clean review. **The tag
is RETROACTIVE at `c622924`** — item 34's last commit before item 35 began —
so a release named for email carries no print source, the v0.29.0 precedent
exactly. Its payload row is measured FROM THAT TREE by the validated
git-cat-file method, never from a later dist. The costs, recorded: the version
files at that commit still read 0.33.0, and the review-driven test hardening
(the E2 fixture) lives in later commits; the review confirmed ZERO defects in
item 34's shipped code.

**Your brand reaches an inbox.** Every email your site sends — notifications,
invitations, password resets, anything an app mails out — now carries your
colours, your name and your logo. Before this, it could not: Frappe delivers
email styling through a mechanism that cannot see a customer's settings at all,
so every ERPNext site on earth sent the same grey email. (ERPNext's own attempt
at styling its mail has never worked on any site, for a reason we found and have
filed upstream.)

**The framework's name is off your mail.** Three places carried it, all measured:
the heading of system emails showed whichever app was installed last — on this
site, the word "Telephony", and it would have changed again with the next
install; every footer read "Sent via ERPNext"; and an unbranded logo linked to
the framework's own marketing site. All three now carry your name, or nothing.
A footer belonging to an app that has something useful to say is kept.

**Notification emails had no background at all.** Not a wrong colour — none. The
message sat on whatever the reader's mail app decided to put behind it, which in
a dark-mode client meant near-black text on a dark ground. This is the commonest
kind of email a site sends. Every email now has a floor of its own, under every
style including Original, because that is a repair rather than a decoration.

**Two pieces of text failed accessibility standards in every email ever sent.**
The footer, and *every link*. Both are repaired, and the repair is checked
against eleven brand colours in both light and dark so it holds at your seed and
not only at ours.

**Four new settings**, under Email. *Style* — Original leaves the message as
Frappe composes it; **Card** (the default) puts it on a framed plate; Letter
drops the plate for a typographic letter; Masthead adds a band of your brand
colour. *Identity* — **logo and name together** by default, because that is the
only form that still says who sent the message when a mail app blocks images,
which most do by default. *Button* — **your brand colour** rather than the stock
near-black. *Theme* — **follow each reader's device** by default; one message is
read by many people on many devices, so nothing else can answer per reader.
Mail-client support for dark mode is uneven, and the setting says so.

**A live preview**, showing the real message rather than a drawing of one — the
first in this product to do that. It renders exactly what would be sent.

**One honest limit, stated rather than buried.** An email is checked here in a
browser, and read in a mail client. That gap cannot be closed by testing, so it
is closed by construction instead: the stylesheet may only use properties that
either work across mail clients or degrade harmlessly when ignored, and the
build refuses anything else.

## [0.33.0] — 2026-08-25 — Website and portal (item 33)

**Three security fixes are in this release, found by reviewing it rather than by
anything failing.** Your company name, logo and favicon are fields you type
into, and all three reached pages without being made safe first — so a name or
a file path containing markup could put working script into your own staff's
desk and onto your public site. One of them ran on every desk load. None of
this was reachable by a customer or a portal user: it needed someone who can
already edit Theme Settings, which on a Frappe site is a System Manager. But
that is a lower bar than the framework sets for the same settings elsewhere,
and it should never have been possible at all. All three are closed, and the
theme now strips markup out of those values rather than trying to encode it —
encoding turned out not to survive the round trip through the browser.

Also fixed before release: the Website Theme setting could put unreadable text
on your pages when "Always Dark" was chosen together with the "Original" page
style, because that combination cannot actually produce a dark page; the
picker now says so. Menus in the navigation bar were unreadable in dark mode.
Pages written in Markdown were skipped by the whole kit, so they kept the
framework's branding. And the "reset to default" buttons in the Website and
Status settings did nothing when clicked.

Everything a customer of yours sees without signing in — and everything your
own staff see after they do — now belongs to the theme. Before this release the
public pages, the customer portal, the order and invoice lists, the account
page and the 404 were plain Frappe: a different design language from the desk,
a different one again from the sign-in page, and three of them on the same
site.

**Your brand colours reach the portal.** They stopped at the sign-in page. On
every portal and website page the theme fell back to the colours it ships with,
so a customer with a blue brand had a green portal and nothing anywhere said
so. It was invisible on our own site because our seed happens to be the shipped
one, which is exactly why it survived this long.

**Three new settings**, under Website. *Page style* — Original leaves the pages
as Frappe draws them; **Panel** (the default) puts the content on a card over a
tinted ground, which is the language your account page already used and now
every route uses; Plate washes the ground in your brand colour. *Header* —
Neutral, or **Branded**, which takes the navigation bar in your colour and
composes with any page style. *Theme* — **Follow the visitor's device** by
default, or force light or dark. Following the device is the default because
these pages are cached and shared between visitors, so a stored per-visitor
choice would leak from one to the next.

**Nothing on these pages showed keyboard focus.** Not the search box, not the
buttons, not the links — driven with a real Tab key, every stop was invisible.
That is WCAG 2.4.7 and it applied to every public page on the site. Every
control that takes focus now draws a visible ring.

**Nineteen pieces of text were too faint to meet AA**, including seven of the
nine text elements on the account page. All nineteen are repaired, and the
repair is gated over eleven brand colours in both light and dark so it holds at
your seed and not only at ours.

**Your name instead of the framework's.** The browser tab showed ERPNext's
icon, the navigation bar read the literal word "Home", and every footer said
"Powered by ERPNext" — on your public site, to your customers. The tab icon,
the navigation brand and the footer now carry your company name and logo from
Theme Settings, and where you have not set one they carry ours, never the
framework's. The same substitution reaches the desk your staff use, where the
splash screen and the page title were also ERPNext's and "Frappe", and the
sign-in page, where an unbranded site showed ERPNext's logo.

Right-to-left needed no work here and deliberately got none: Frappe flips the
website surface itself, and restating those rules in logical properties would
have fought its own flipping.

## [0.32.1] — 2026-08-22 — Sign-in fixes (item 32)

A patch on top of 0.32.0, all of it found by reviewing that release rather
than by anything failing. Nothing here changes what the sign-in page looks
like; it changes what is true about it.

**Five defects were live in 0.32.0 and the worst one hid behind its own tests.**
The theming was attached by matching the address `/login` — but a visitor who
types your bare domain is served the sign-in page at `/`, and so is anyone
signed out who follows a link into the app. Both got plain Frappe: no brand,
no dark mode, not even the focus ring. All twenty-two checks passed, because
all twenty-two asked for `/login` by name. It now attaches to the page being
rendered rather than to the address that reached it. The other four were
states nobody had measured: the Continue button turned grey the moment you
clicked it and stayed there with no focus marker; it turned near-black the
moment it was disabled, which is one gesture away; holding it down made it
vanish in dark mode; and the password-strength meter's track stayed a
near-white bar on a dark card because the rule meant to fix it had never
applied.

**Your brand stylesheet gets a stable address.** Its filename is meant to be a
fingerprint of its contents, so a browser can cache it forever and still pick
up a colour change immediately. It was actually random, so every save and every
upgrade handed returning visitors a new address for a file they already had —
and the framework call behind it disappears in the next major Frappe release,
where the failure would have been silent and sites would simply stop getting
their brand stylesheet. It is a real fingerprint now.

**And the repair that ran while serving a page no longer writes to the
database.** When the brand stylesheet's file goes missing — which a
database-only restore can cause — the theme regenerates it on the next page
load. That repair was trying to record itself mid-request, where the write is
always discarded, so it re-ran on every request afterwards and took a write
lock each time to save something immediately thrown away.

Under the hood: two new build guards that refuse a `var(--bnd-*)` naming a
property nothing declares, and a fallback on a token that is always there.
Between them they found six more places where the theme was quietly painted by
Frappe's variables while the source read as though it were not — including the
whole layout-builder preview in Theme Settings, which is now on the theme's own
colours in both modes.

## [0.32.0] — 2026-08-22 — Sign-in (item 32)

### The first screen now carries your brand (item 32)

Nine surfaces have been themed and the sign-in page was not one of them.
Measured before any of this was written, `/login` loaded three stylesheets and
none of them was ours: no brand colour, no dark mode, no typography — the only
screen in the product that looked like stock Frappe, and the first one anybody
sees.

It is a *website* page, which is why it had been skipped: none of the machinery
the desk kits ride reaches it. There is no theme stylesheet, no settings payload
and no script on a logged-out page, and the browser is never told which theme to
paint. So this ships a second, much smaller stylesheet of its own, and the page
is told what to be by the server, before anything is drawn.

**Nobody could see where they were typing.** Tabbing through the sign-in form
with a keyboard produced no visible marker on any field or button — the outline
is switched off in two separate places upstream and nothing replaces it. That is
a plain WCAG AA failure on the one page a person cannot skip, and it is fixed
for every style, including "Original".

Six more things the page got wrong, all measured on a running site:

- The **label and the "Forgot password?" link** were 4.17:1 on white, under the
  4.5 floor. So were the password hints on the reset screen.
- The **card had no edges at all** — the same colour as the page, no border, no
  shadow — and neither did the **text fields**, whose 1.30:1 hairline is not a
  boundary anyone can see.
- In dark mode the **"Send Link" button on the forgot-password screen was white
  text on a near-white fill**, 1.06:1: the only action on that screen,
  unreadable.
- The **error banner** kept a light-mode background under dark-mode red — 2.52:1,
  and it read as a white box shouting on a dark page.
- The **primary button had the same fill as the page** in dark, so the control
  had no shape; only its label survived.
- An **email address inside an Arabic form** could reorder against the paragraph.

Independently: axe over both routes went from 3 and 4 contrast violations to
**zero**. The one finding left needs an attribute in Frappe's own template and
is filed upstream with a one-line fix, along with the missing page heading, the
absent live region on the error banner (a failed sign-in is announced to nobody)
and a show-password control that cannot be reached by keyboard.

**Four compositions, and the default gives your brand the room.** *Split* puts
the form in a column beside a full-height brand panel; *Panel* draws the card as
a real object and centres it; *Plate* washes the page in your brand with the card
floating on it; *Original* keeps Frappe's layout and takes the repairs only. The
primary button can carry your brand colour, and does by default. And because a
signed-out visitor has no stored preference, the page follows their device by
default — or you can pin it light or dark.

Two promises the settings page had already made are finally kept: **your logo**
now appears on the sign-in screen rather than the framework's, and the
**tagline** field — whose description has read "Shown on the login page" since
the beginning while nothing displayed it — is displayed.

**A per-site defect this surfaced, which would only ever have shown on a
customer's site.** Your brand colours are generated into a small stylesheet of
their own, and its dark half was written for a scope a website page can never
match. So a signed-out visitor in dark mode saw the *shipped* green rather than
your colour — on a sign-in page whose whole point is that it is yours. Fixed, and
now checked in a way that works whatever colour you have chosen.

**Five defects the pre-release review caught, and one of them would have been the
worst bug in this release.** An adversarial review before the tag is a standing step
here. This time it changed the release rather than confirming it.

- **The front door got none of it.** The theming was attached by matching the address
  `/login` — but on a stock site a visitor who types your bare domain is served the
  sign-in page at `/`, and so is anyone signed out who follows a link into the app.
  Both got plain Frappe: no brand, no dark mode, not even the focus ring. Every one of
  the twenty-two checks written for this item passed, because every one of them asked
  for `/login` by name. It now attaches to the *page being rendered* rather than to the
  address that reached it.
- **The Continue button turned grey the moment you clicked it** and stayed grey, with
  no focus marker — 1.36:1 against the column. Clicking a button leaves it focused, and
  the focused state had been missed.
- **It turned near-black the moment it was disabled**, 1.12:1 — which is one gesture
  away, because "Send login link" disables it and the forgot-password screen ships its
  button disabled.
- **Holding the primary button down made it vanish in dark mode**, 1.09:1 where stock
  Frappe managed 10.57:1 — and that one was introduced by this release. Frappe forces
  both the text and the fill of a pressed button, and only the text follows the theme;
  changing one without the other was worse than changing neither.
- **The password-strength meter's track stayed a near-white bar on a dark card**,
  14.42:1 — the loudest thing on the reset screen. The rule meant to fix it had never
  applied at all.

Six new checks cover the states rather than the resting page, and each was verified by
putting the defect back and watching the check turn red.

**And one older bug the review turned up, which was quietly counting down.** Your brand
colours are generated into a small stylesheet whose filename is supposed to be a
fingerprint of its contents — that is what lets a browser cache it forever and still
pick up a colour change immediately. The filename was actually **random**, so every save
and every upgrade handed each returning visitor a new address for a file they already
had. Worse, the framework call being used for it is deprecated and **disappears in the
next major Frappe release**, where the failure would have been swallowed silently and
sites would simply stop getting their brand stylesheet at all. It is a real content
fingerprint now: save without changing anything and the address stays put, change a
colour and it moves, change it back and it returns to exactly what it was.

## [0.31.0] — 2026-08-21 — Filters (item 31)

### A filtered list says so (item 31)

Every list, report, gallery and query-report screen has a strip of controls
across the top — the Filter button, the clear-all beside it, the standard
filters, sort, group-by. Twelve controls, and not one of them was drawn as a
control: each was painted four units away from the surface behind it with no
border at all, which is the theme's own "you can tell this is a control" rule
failing on the busiest row of the desk. They now sit on a fill that reads
against the bar in both modes, and answer the pointer when you reach for them.

**The setting that says "this list is filtered" was illegible in light and
invisible in dark, and it was not only ours to fix.** Frappe has exactly one
"this control is active" button style, and its two halves disagree about whether
they follow the theme: the text colour is a variable that tracks the palette,
the background is a fixed grey that does not. Measured on a real filtered list,
the label came out at 4.12:1 in light — below the AA floor — and **1.02:1 in
dark**, which is to say invisible. Its three users are the Filter button, the
report view's Add Group button, and **the skip link** — the control a keyboard
user hits first. All three are repaired, and the repair holds under "Original",
because whether you can read a control is not a style choice. Frappe's own
source carries the comment "not happy with this" above the rule.

One setting decides how loudly a filtered list announces itself: quietly, with a
count chip in the brand, or with the whole control recoloured (the default). The
loud option is not decoration — on a phone Frappe hides the count entirely, so
the control's own colour is the only signal left.

A second decides how the filter editor and the saved-filter menu are drawn, as
one object in three places: an outline on each control (the default), a recessed
bar, fully rounded pills, or a single rule under the bar. And a third gives the
saved-filter menu row spacing, truncation for long names, a hover state and a
Save row separated from the saved ones — that menu had **no styling at all** in
Frappe, not one rule.

**Two choices would have rendered as nothing, and arithmetic caught both before
they were written.** The recessed bar was going to use the page colour, which is
mixed from your brand — so on a pale brand it collapses to a one-unit difference
and on white to none at all. And the default outline style was going to drop the
control's fill and rely on its border, which would have re-opened the very defect
the repair exists to fix, while looking like a style choice. Both are now built
on a value mixed from ink rather than brand, which holds identically at every
one of the eleven brands the contrast gate tests.

**The item is smaller than its name, and the census is why.** "Saved views" in
the sense other products mean it — a named bundle of filters, columns and sort,
switchable from a rail — does not exist in Frappe; there are three unrelated
mechanisms and no single object. And the list-view sidebar that a "filters" item
obviously targets **is dead in v16**: it is switched off unconditionally, and
around twenty stylesheet rules point at a container that is never rendered. Those
rules were measured before being blamed — they cause no visible defect, because
other rules cover the same ground — so they are filed upstream as dead code
rather than repaired here.

**What this could not do, stated rather than skipped:** it does not mark which
saved filter you are currently in. Every reference product marks the selected row
somehow, and Frappe's own newer apps use a check mark — but the desk records the
active filter only by rewriting a button's text, with nothing in the page a
stylesheet can see, and it forgets on reload. Filed upstream with eleven other
findings, including a filter button whose accessible name is hardcoded English
with a hand-rolled plural, and a stylesheet line that has never applied because
`-var(--x)` is not valid CSS.

Also in this item: filter values and saved-view names are now isolated for
mixed-direction text — the one thing both RTL-shipping reference products left
unsolved on this exact surface — and the report view's Add Group control is
dressed with the rest of the strip, which closes a piece of work deferred out of
the report view.


## [0.30.0] — 2026-08-20 — Skeletons (item 30)

### Loading states stop guessing (item 30)

A loading screen now looks like one. Stock's own skeletons were painted a grey
that resolves to exactly the same colour as a card and a subtle panel in dark
mode — three names, one value — so a loading bar was indistinguishable from
content that had already arrived. The theme gives them a bone colour fitted
against everything they sit on, and that repair holds even under "Original",
because it is about whether a loading state is legible rather than how it looks.

One setting decides how it moves: not at all, a pulse, or a band travelling
across the bones (the default). "Still" is not "off" — it is the full bone
treatment without motion, which is exactly what the other two render for anyone
who has asked their system for reduced motion. Shipping it as a choice makes
that state something you can look at instead of something you have to trust.

**Bones sweep; text pulses.** Most of what the desk calls a loading state is the
word "Loading…", not a grey box, and a gradient travelling across a sentence is
noise rather than information. That split is why the setting is one choice and
not three — and the vendor's "Loading…" text is never hidden to make room for a
prettier bar, because it is the only thing a screen reader has to go on.

Two things the desk had never done: **the reduced-motion setting is now
honoured** — `prefers-reduced-motion` appears nowhere in Frappe's own
stylesheets, and the one animation it does run (the print preview's) ignored it
until now — and **a workspace no longer jumps** when its skeleton is replaced,
because the placeholder reserves exactly what the editor will occupy.

Both releases' Arabic is reviewed rather than proposed. The 34 rows written for
items 29 and 30 carried `#, fuzzy` markers until a human read them, and those
markers are now cleared. Nothing about the running desk changes — the emitter
never filtered on the flag, so these strings were already being served — but an
unread translation is not a translation, and the marker was what said so.

## [0.29.0] — 2026-08-20 — Empty states (item 29)

### Empty states get a hand (item 29)

Every "there is nothing here yet" screen on the desk is now drawn by the same
hand — the list's no-result, the report's box, the dashboard's, the inbox
view's and the 404 page. One setting decides how that block separates itself
from the surface around it: by nothing, by air (the default), by a hairline, or
by tone. Two more decide the mark above the message and how much the button
below it asks to be pressed.

The seventh surface kit, and like the sixth it began as a repair. The child
table's "No rows" was pinned to #999999 by a global `!important` — 2.85:1 on a
white surface, in the one empty state that sits inside a form you are actively
editing. That is fixed for everyone, including under "Original", because it is
a contract rather than a style.

**The call to action is the item's whole argument, and it was measured.** Stock
renders the create button on an empty list as a small grey `btn-default`:
background `rgb(251,253,252)` with no border, on a page ground of
`rgb(248,250,248)`. A three-unit difference and no boundary — the primary
action of an otherwise empty screen was the least visible thing on it.
"Primary" gives it the brand.

Two decisions were reversed by measurement rather than taste, and both would
have shipped as nothing:

- **"Filled" paints `--bnd-surface`, not `--bnd-raised`.** The block sits on
  `--bnd-page`, and in light mode `--bnd-raised` is three units away from it —
  a fill nobody could see.
- **"Framed" draws a ring, not a border.** The class the kit keys on is
  Frappe's own `.no-border`, and the desk also ships
  `.no-border { border: none !important }` as a global utility, so a border
  computed to zero. A box-shadow ring competes with nothing and costs no
  layout.

Two of the census's three planned repairs turned out not to exist once the
**compiled** bundle was read instead of the source: the datatable's no-data
message is already `max-content` upstream, and the list sidebar's empty state
already follows the theme (its Sass variable aliases the CSS one). Write
contracts against what the bundle serves.

**Not done, and stated rather than quietly dropped:** Frappe's six
`null-state` illustrations carry hardcoded hex — `#171717` computes 1.11:1 on
a dark surface — and CSS cannot recolour an `<img>`. They are unreachable in
every state this stack can drive (measured at 0×0 with no offset parent), and
styling what cannot be measured is how a rule ships broken. Filed upstream with
eleven other findings, including that `form/save.js` comments out its own
"Saving" message, so every document save shows a blank blocking overlay.

Also in this release: six near-identical surface-kit blocks in `bunood.js`
became one table (~1.1 KB of JavaScript freed, and the seventh kit cost eight
lines), and a new build guard refuses any stylesheet that writes prose with
`content:` — CSS-authored copy bypasses translation coverage entirely and would
ship English into an Arabic desk.

### Fixed

- **The dialog scrim was invisible on every document save.** `overlay_scrim`
  was built to govern all three of the desk's scrims at once, and on the third —
  `#freeze`, the blocking overlay behind every save — it painted correctly and
  was then covered by stock's own child: `.freeze-message-container` is
  `inset: 0` with an opaque ground. Dim, Tinted and Blurred therefore rendered
  identically there, which is to say the setting did nothing on the loading
  state users see most. The container's *paint* now stands down while its box
  stays (it is the click target and the centring grid), and the message becomes
  a finite card in the anchor's own shape. Frappe passes no message on save
  (`form/save.js:91` comments out its own `freeze_message`), so the blank case
  draws nothing rather than an empty card. `Original` leaves stock alone.
- **Arabic stopped depending on apps we do not ship.** Eighteen strings —
  Actions, All, Search, Home, Refresh and the rest — were inherited from other
  installed apps rather than translated here, so trimming a site to ERPNext core
  rendered them in English. They are ours now, with two corrected on the way in:
  "Action" was inheriting حدث (an *event*) and "Apply" تقديم (*submitting an
  application*). Four more are kept deliberately over upstream's, including
  "Filter", whose upstream Arabic منقي means *purifier*.
- **An inheritance we could never receive.** Frappe's only "You" is
  `msgctxt`-qualified, and a contextual translation is keyed `context:msgid` —
  it cannot answer a bare `__("You")`. The detector ignored `msgctxt`, so the
  ledger claimed the inheritance, and because it claimed it we shipped no row of
  our own: the desk rendered "You" in English. The parser skips contextual
  entries now.


## [0.20.0] — 2026-08-19 — Overlays (item 28)

### Overlays get a hand (item 28 — dialogs, dropdowns, toasts)

Everything that floats above the desk is dressed by the same tailor now — the
dialog, the menu, the autocomplete, the toast, the popover, the datepicker, the
report column list and the calendar's "+N more" card. One style setting decides
how a floating thing separates itself from the page beneath: a hairline, a soft
shadow, a lifted card (the default) or a raised panel that separates by tone.
The scrim behind a dialog becomes the theme's own tint rather than a flat grey,
optionally frosted, and menu rows agree with each other for the first time.

The sixth surface kit, and the first that is on every page rather than on one
route — which is why it began as a repair. Nine things were measurably wrong in
stock, in the dark theme, before any of it was styled:

- Inside every dialog and every grid-row editor, borders and control fills fell
  back to a grey the theme had already replaced, so a control had no visible
  edge and no visible fill — the two things that make it findable at rest.
- Ten of the twelve status dots failed the contrast floor in dark, and eight of
  them were simply invisible.
- Toasts painted over this theme's own status bar, and never moved when the desk
  was in Arabic.
- Tooltips were a hardcoded black chip that ignored the theme in both modes.
- The toast's second line and every menu's keyboard shortcut failed AA.
- The datepicker's out-of-month days were indistinguishable from in-month ones.
- The calendar's popover rendered a white card on a dark desk whenever the
  alternate-views styling was turned off.

**Those repairs are not part of the style.** Choosing "Original" stands the
styling down and keeps every one of them, because they are about whether the
desk works, not how it looks — and unlike a single view, a dialog is on the page
where that choice is made.


## [0.19.0] — 2026-08-18 — Alternate views (item 27)

### Four views, one hand (item 27 — alternate views)

The desk's four alternate views — kanban, calendar, gantt and gallery — are dressed
by the same tailor now, the fifth surface kit and the first to reach across four
separate vendors at once. One style setting decides how a record becomes an object:
a kanban card, a gallery tile and a calendar event are the same shape drawn three
ways, from a hairline boundary through soft tiles to floating cards (the default) and
solid panels. Splitting them was never on the table — that is how you end up with
rounded floating cards beside flat square tiles.

Each view hides its colour somewhere different, and two of them hide it where no
stylesheet can reach. A kanban column's status tint and a calendar event's colour are
both written inline, in the page or in JavaScript, so the theme meets each on its own
terms: it re-points the variables the column reads (so "Plain" columns lose their
tint), it re-points FullCalendar's own thirty variables for the calendar's grid and
buttons, and — the same move the charts needed — it wraps the one function every
calendar event passes through, so a plain event takes the brand accent while a colour
an admin set is left exactly as they set it. A calendar event can be a filled chip, a
coloured dot, or an outline; flip to dark mode and every event re-colours itself,
which stock Frappe does not do.

**The gantt was broken, and now it is not.** In dark mode stock Frappe drew white
bars and white grid lines on a near-black page — invisible. Every colour is themed
now, in both modes, and a task an admin gave its own colour keeps it.

Smaller things that ride along: a gallery can crop its images or fit them whole, and
its tile controls rest quiet until you hover or tab to them. The kanban board stopped
leaving a stray scrollbar under the top bar. And behind the scenes, a new build check
makes the "silently dropped field" bug that bit the last two kits impossible to ship
again. Everything is a setting; the shipped values are Floating Cards, a tinted kanban
column, chip calendar events, cropped gallery images, and controls that reveal on
hover. "Original" turns the whole kit off, every view back to stock.

## [0.18.1] — 2026-08-17 — Report kit review fixes (item 26)

Three defects the multi-agent adversarial release review found in v0.18.0, all
confirmed and each now pinned by a test that catches it. All three were missed by
the green suite because they live where the default state never goes.

- **Select-all masked the datatable's own selection fill.** During a select-all,
  frappe-datatable paints the opaque `.dt-cell__content`, but the kit had resolved
  the row fill on the `.dt-cell` beneath it — so a Bold Bar selection showed the
  light vendor wash (with the kit's on-brand ink on it at ~1.06:1), and a row
  de-selected mid-select-all still read as selected. The kit now clears the content
  box during select-all so its own per-row fill shows; the test was reading the
  wrong layer and now reads the effective one.
- **The report live-preview was missing from the discard-revert and import paths.**
  Every other surface kit re-applies its saved values when the settings form is
  discarded or a theme is imported; report was silently absent, so a discard left a
  stale preview and an import never took effect on the desk.
- **The keyboard focus ring was invisible on a Bold Bar selection.** `--bnd-accent`
  on the brand-solid selection fill measures ~1.07:1 (a WCAG 2.2 Focus-Appearance
  failure, worse than stock's grey). The ring is now two-tone — the accent plus an
  on-brand companion, gated to clear AA against the brand fill — so it stays legible
  on any row background.

## [0.18.0] — 2026-08-17 — The report view / datatable (item 26)

### Item 26 — the report view / datatable kit

The fourth surface kit, over `frappe-datatable`, in six gated slices. Measuring the
surface changed what its three named goals meant.

**"Sticky headers" was already solved; the boundary was not.** `.dt-header` is a
sibling of the scroll box, so it never scrolls away — but stock draws no boundary of
any kind (the scrollable's top border is nulled with `!important`) and the header fill
sits ~1.5% off the body: the pinned header is invisible *as* a header. So the work was
a boundary + fill statement, not a positioning one. `report_style` ships five styles —
Original, Ruled Grid, Ledger Rows, Open Sheet, and the default **Pinned Slab** (a
filled, softly elevated header slab with a real border). The header fill turned out to
be painted three ways at three specificities (the vendor's `--dt-header-cell-bg`, plus
`.dt-row-header` and `.dt-cell--header .dt-cell__content` hardcoded to `--subtle-fg` at
(0,3,0) and (0,4,0)); the kit re-points the variable and beats both hardcoded rules,
the content-box selector reaching (0,4,1) — measure the selector you override.

**Tabular numerals were a defect fix, not a choice.** Frappe enables `tnum` on body
cells only, and in the legacy `font-feature-settings` form that `getComputedStyle`
reports as `"normal"` — so the header and total rows, exactly where money lands, were
excluded, and any test would have missed it. One `font-variant-numeric` rule on every
`.dt-cell__content` fixes coverage and property together. It rides the style anchor, so
`Original` still renders as stock; the focus ring, by contrast, is lifted *out* of the
anchor as an accessibility contract that survives `Original` (a new rule in
`GUIDELINES.md`: a contract survives Original, a style does not).

**Grouping had nothing to bind to** — Frappe's group-by is a query control that renders
a different flat set, with no group key in the DOM — so the band is deferred (to the
alternate-views and filters items) and what ships instead is `report_grain` (Row
Stripes), which does for the eye what grouping would. Because the rows are virtualised
(HyperList), `:nth-child` zebra would look correct at the default page length of 20 and
silently break at 100; the grain keys on the parity of each row's inline `top` instead,
and is tested at page length 100 against real virtualisation.

Also: `report_rows` fuses hover and selection into one axis (both paint the same opaque
cell, so splitting them would let a hover read louder than a select); a checkbox reveal
route-gated to the report surfaces (never a selection dialog); a live `100vh` reserve
collision fixed where the report's own panes, sized from the raw viewport, put the
paging row under the bottom bar (slice 1, correcting a stale `ARCHITECTURE.md` claim);
and the query-report summary strip taken from the workspace kit, which had owned it
through an un-route-gated global attribute. No payload ceiling was raised — the CSS
partial fit, and the picker is a doctype client script, outside the bundle.
`docs/upstream/frappe-datatable-rtl.md` drafts the datatable's physical-positioning RTL
bugs, which no app-level CSS can reach.

## [0.17.0] — 2026-08-16 — The workspace and dashboard landing: tiles, number cards, and charts (item 25)

### Item 25 — the workspace and dashboard landing: tiles, number cards, and charts

The last of the big content surfaces, and the first to reach for JavaScript and
colour science rather than a stylesheet alone. It ships as five gated slices: the
chart series palette, the runtime that feeds it, the chart frame, the workspace
tile kit, and the number card.

**Charts stopped painting the vendor's own colours.** frappe-charts takes series
colours as a JS array it writes as inline SVG styles — unreachable from CSS — and a
chart that supplies none falls back to the library's palette, whose first colour
measures **2.4:1** on a white card. The theme supplies them instead: a
contrast-validated, colour-vision-safe ramp derived in `palette.series_ramp` (Paul
Tol's "muted" scheme, lightness-fitted per mode) and shipped as `--bnd-series-*`.
The ramp is **brand-independent** — series 1 is the same colour on every site — and
a separate token family from `--bnd-cat-*`, because a chart series index is exactly
the assign-once-never-cycle rule the categorical hues forbid.

**The palette is derived and gated, not eyeballed.** `contrast.py` gained CIELAB,
CIEDE2000 (pinned to the Sharma-Wu-Dalal reference pairs every run) and a Machado
2009 colour-vision simulation; the gate enforces each mark at **3:1** (WCAG 1.4.11)
against the two surfaces a chart lands on, across 11 seeds, and a new
`check_series_separation` holds the worst pair **≥ 6.0** under normal, protan and
deutan vision (tritan advisory). Measured separation: **light 9.16, dark 6.90** —
where frappe-charts' own default scores 4.1 and is rejected. 2,160 gated pairs now,
up from 1,656.

**Every chart is themed through one constructor wrap.** `frappe.Chart` is wrapped
once (the single funnel all seven v16 call sites go through); an admin's per-chart
colour is kept, a hole takes the ramp, heatmaps are left alone. A `MutationObserver`
repaints live charts in place on a theme flip. And the chart frame is themed through
frappe-charts' own `--charts-*` variables — recessive gridlines, a themed tooltip,
and the 5px-in-dark / 2px-in-light stroke discontinuity removed — with one axis,
`chart_grid`, choosing where the weight sits (**Filled Area** default).

**The workspace is a surface now.** `workspace_style` styles the tile grid on both
the workspace and Dashboard routes — **Hairline Grid** default (a gapless contact
sheet built from a shadow ring, not a border, so adjacent edges land on one pixel),
over Open Board, Soft Tiles, Headed Panel, Floating Cards and Mixed Weights (which
treats a tile by what the block IS: charts lift, links recede). The gapless board's
`overflow: hidden` stands down inside `.edit-mode`, where a probe showed it would
clip editor.js's own gutter controls. Rows inside a card get `workspace_rows`
(**Edge Rail** default), and the tile ⋯ menus rest hidden (`workspace_menu_reveal`).

**Number cards got their figure back.** `workspace_metric` (**Display** default)
gives the number card an eyebrow label over a value that steps up with the card's
OWN width via a container query, and every number the kit sizes turns tabular — the
value was `font-variant-numeric: normal`, so it jittered sideways on Frappe's live
refresh. The delta is re-tokenised to the theme's own good/critical inks, and a
card an admin gave a `background_color` keeps its own ink: `:not([style*="background"])`
means our tokens never land on a surface we did not choose.

Two cascade defects surfaced and were caught by their own tests — the item-16
lesson twice: Mixed Weights first keyed on `.widget.chart`, the bare type class the
block toolbox implies but the rendered widget does not carry (it is
`.dashboard-widget-box`); and the number value first lost to Frappe's own
`.widget.number-widget-box .widget-body .widget-content .number` (0,5,0). Both are
now measured against the real DOM.

## [0.16.0] — 2026-08-16 — Responsive, and a mobile navigation mode (item 24)

### Item 24 — Responsive, and a mobile navigation mode

The desk works on a phone now. Below Frappe's own mobile boundary — 768px, where
`frappe.is_mobile()` flips — the desktop chrome collapses to a single full-width bottom
bar carrying the controls Frappe otherwise buries, and the content fills the screen
instead of the 150px strip it used to.

**The known defect was not what the roadmap said.** The top bar was recorded as vanishing
"below ~480px because Frappe renders no `.main-section > header`". Measured against v16.27,
both halves are wrong: Frappe renders the empty `<header>` at every width, then
`toolbar.js` REPLACES it — below 768, or on read_only / impersonation / an announcement
widget, three of which fire on a full-size desk. So `mount_topbar`'s query misses because
the element was swapped, and the boundary is 768, not 480. Corrected in the three places
that carried the phantom.

**One breakpoint vocabulary, guarded.** Nine literals in two ad-hoc schemes became
`_breakpoints.scss` — a viewport scale that IS Frappe's `$grid-breakpoints` (a value of
ours that disagreed would carve a band where the desk contradicts itself) and a separate
named container scale. `assertBreakpointVocabulary` fails the build on any
`@media`/`@container` width outside them, the two checked separately, the sets parsed from
the SCSS so guard and vocabulary cannot drift.

**The mobile nav is derived, not a new layout — applied, never persisted.**
`registry.NARROW_CHROME` / `NARROW_PLACEMENT` are the catalogue of what every layout
collapses to below 768; `container_on` / `active_placement` return those values while
narrow, the stored fields untouched (a resize is not a gesture, so a phone visit never
rewrites a monitor-configured desk). `matchMedia` remounts on the threshold — the other
half of the defect, since nothing re-evaluated on resize. The bar carries search (an icon
that opens the palette), alerts, you and All Apps; workspaces stay on Frappe's own
top-left menu, not duplicated. Three toggles (Alerts / You / Apps) choose the contents;
search has no toggle, being the only search on a phone.

**The side pane collapses to Frappe's drawer.** Our kit had pinned the container to an
inline width that beat every stylesheet rule, squeezing the desk into a strip; it drops
that width when narrow and the resting container leaves the flow, so the content fills and
the drawer still overlays on demand.

**Pinch-zoom restored.** Frappe's viewport meta locks zoom (`user-scalable=no`);
`repair_viewport_meta` unlocks it — the one sanctioned touch of Frappe's DOM, since a
`<head>` meta is neither layout nor styling and there is no hook to reach it. The axe
baseline's `meta-viewport` violation drops to zero on every Desk route.

**Touch targets** clear WCAG 2.5.8's 24px on a coarse pointer (`data-bnd-touch`, a
separate axis from width), and the mobile nav's own controls are 44px. The suite gained a
`responsive:` family (the 768 boundary, tenant reachability, the both-ways remount, the
drawer collapse, the toggles) and a scoped axe scan of the mobile nav at 390.

Payload: the CSS gzip ceiling moved 14700 → 15400 for the mobile styles.

Two decisions recorded rather than built: `100vh` kept over `dvh` (Frappe's own page math
is `calc(100vh - …)` and the bottom reserve is already measured from the dynamic viewport,
so the dvh gain is unverifiable headless), and `bnd_region_blocker`'s below-768 case left
moot (the settings form is a desktop tool, and placements fall into the mobile bar anyway).

## [0.15.0] — 2026-08-14 — Icon system and accessibility, with RTL and translation fixes (items 22, 23)

### Item 23 — the icon system, reframed around what the desk actually needed

The item assumed the theme had to ship an SVG sprite for coverage. It does not:
the desk already loads five sprites, 2,085 symbols, no id collisions. So the
work went where the real problems were.

Three defects were live in v0.14.0 and are fixed. Every workspace-link icon in
the side pane rendered squashed to about half width (8×15 px) — a chip rule that
lost a specificity contest to Frappe and set no `flex: none`; the sidebar had
passing tests because not one of them measured a rendered box, only the cascade's
declared value, so the new check reads `getBoundingClientRect`. Icons were the
last part of the desk still coloured by Frappe's own greys, outside the token
pipeline and the contrast gate — `--icon-stroke` now maps to the theme's muted
ink. And `sprite_icon` stamped the wrong class on the espresso fill set, so the
inbox's "open in a new tab" arrow rendered as a hollow outline.

Then the substance. Icon inference — giving a link with no icon of its own a
sensible one — moved from the browser to the SERVER. The old engine matched
English keywords against the visible label, which Frappe has already translated
by the time the sidebar renders, so an Arabic desk drew zero inferred icons
against thirty-five in English. Inference now runs in `extend_bootinfo` off
`link_to`, which is never translated, so the same link resolves the same icon in
every language; a live smoke test asserts the parity. Every id it can emit is
verified against a shipped manifest of the symbols the loaded sets actually
contain, because a wrong id renders an empty box.

And the settings consolidated. The icon controls were scattered across the side
pane and breadcrumb kits, and a sidebar preset reached across and changed your
icons whenever you changed the pane's look. They are now one Icons section — an
axis, beside Colours and Density — reached by a card picker with a live glyph
specimen. Four fields were renamed in through a migration that carries each
existing site's choice across; the presets let go of icons entirely. One new
axis lands with it: icon weight, the glyph stroke, which the mixed sprite grids
had made neither consistent nor adjustable.

Deferred by an explicit scope decision: an icon-set switcher (Lucide↔Tabler) and
an outline↔filled control. Both need a Tabler subset sprite shipped through
`app_include_icons` — which is where the item's original sprite-interface idea
finally belongs, as its closing slice.

### A known upstream defect gets a local fix, without touching Frappe core

`is_rtl()` — Frappe's own RTL detector — exact-matches four language codes
with no parent-language resolution, and duplicates that same mistake a
second time in client JS, independently. Every language bunood_theme already
listed as RTL but Frappe didn't recognize (Urdu, Sindhi, Sorani Kurdish,
Uyghur, Yiddish, Dhivehi, Kashmiri) rendered left-to-right with right-to-left
translations. The theme used to only detect and warn about this, deliberately
never correcting it: the same broken check also decides which CSS bundle
Frappe serves, so fixing the `dir` attribute alone would have shipped RTL
markup styled by an LTR stylesheet — worse than doing nothing.

The fix closes both sides together. A single corrected function
(`bunood_theme/i18n/rtl_patch.py`) replaces the relevant module attribute
once, at app load — safe specifically because the CSS-bundle-selection
code resolves that name fresh on every call, unlike the desk shell's own
`dir` attribute, which Python binds at import time and no hook can reach;
that gets corrected separately, by overwriting it in the theme's existing
context hook after Frappe has already computed the wrong value. Client-side
JS gets its own matching correction, fed by the same language list via boot
rather than a second hand-copied one. Proven with the fix deliberately
disabled first: the desk rendered `dir="rtl"` styled by left-to-right
Frappe-core CSS — exactly the half-flipped failure this design exists to
prevent — before the real fix went back in and every check passed.

The one thing this cannot reach: print preview and PDF generation, which
bind Frappe's own broken check in code this app doesn't own, with no
documented way in. Not worse than before, just not improved — and itself
the argument for still filing the upstream fix this local patch was always
meant to make unnecessary someday.

### Accessibility closes as an item — and reclaims an undocumented batch

Two batches land here together, because the second exists to fix a gap the first
left in the record. `ce6995d` / `50373ff` / `e2a4926` / `8678e2a` shipped inside
v0.14.0 — the sidebar kit's own palette ink-fitted per pane and gated (28 rows,
every global `--bnd-cat-N` hue had failed AA on at least one pane), `axe` scoped
honestly (a hard gate on `OURS`, a baseline-diff over Desk pages so only *new*
violations fail), Escape-consumption fixes for the palette and inbox, the bell's
accessible name handled by identity once it became state-dependent — and
`CHANGELOG.md` never said so.

Verifying "what's left" for that batch found a live WCAG failure on the SHIPPED
DEFAULT: the sidebar's active-item pill painted a category hue as a *fill under a
label*, when every one of those hues had only ever been fitted as ink on a pane.
Match Theme + Solid Pill at seed `#7f7f7f` measured 2.08:1; Dark Contrast + Solid
Pill measured 2.17–2.40:1 across every hue; the brand pane with the wash off
measured 1.00:1 — the raw seed under its own brand-solid fill, the same colour
twice. Eleven commits closed it as item 22 (was 34 + 34a):

- **The hue keeps one role.** The pill is always the brand pair
  (`--bnd-brand-solid` / `--bnd-on-brand`); a hue only ever marks (the accent
  rail, the dot, the glow ring, the outline) or tints (Soft Pill). New gate rows
  enforce the pill fill against every pane, each hue as a mark, and the brand
  pane's fixed-value stand-down — 1,656 pairs now, up from 1,080.
- **The avatar menu keeps its own promises.** `role="menu"` moved from a bare
  claim to a real contract: focus enters on open and returns on close, arrow
  keys move and wrap, Home/End jump, Tab leaves it (it's a popup, not the
  palette's deliberate trap), Escape consumes the keypress before Frappe's own
  handling can react to it too. Exported as `bunood.menu` so the placement
  board's keyboard route reuses one implementation instead of growing a second.
- **The placement board splits by fact.** Which zone and what order were always
  two different questions answered by one gesture. Zones dropped
  `role="button"` (whose *Children Presentational: True* was flattening the
  chips that ARE the components out of the accessibility tree) for
  `role="group"`; which zone is now an honest "Move to…" menu built from the
  field's own legal options, reachable by click or Enter; what order is still
  the nudge arrows. A `role="status"` region announces every pick, move and
  refusal — previously silent, so a refusal read as success. Fixed along the
  way: clicking a different chip while one was armed used to re-arm silently
  and lose the first pick with nothing to show for it.
- **Landmarks, `aria-current` and `aria-haspopup` are asserted**, not just
  emitted — including the negative case (the dock/rail's `[aria-current]`
  clears on navigating away, which `update_dock_active` already did and
  nothing checked). `.bnd-statusbar` changed `role="navigation"` to
  `role="region"`, honest about carrying a clock and job counts, not a nav.
- **Breadcrumbs and the inbox's filter row join the audited surface.**
  Decorating a crumb no longer risks renaming it (an injected icon carries no
  `<title>`); the copy-link button's focus reveal is asserted, not assumed.
  The inbox's `role="tablist"` downgraded to a labelled `role="group"` of
  `aria-pressed` toggles — what it controls is a listbox with its own arrow-key
  contract, and a tablist promises a second one over the same rows.
- **The settings surface joins the axe hard gate.** `OURS` held no settings
  selector, so the gate's fourth pass re-scanned whatever chrome was already
  on the route. `walkSettingsPanes()` scans all seventeen, catching two real
  findings — the sidebar icon-source picker's preview thumbnails and the
  placement board's unavailable-region text, both degraded below AA by a raw
  Frappe variable or a blanket `opacity`. Include-coverage tracking (a
  selector that never matches is otherwise silently tolerated) now applies to
  the original chrome scan too, and found two more gaps: `.bnd-dock` only
  exists in the Dock layout, `.bnd-apps-rail` needed its own setting turned on
  rather than an ambient site value.
- **`assertMotionPrimitive` and `assertRingCoverage` join `build.mjs`.**
  `_tokens.scss` had claimed since item 7 that zeroing its duration tokens
  disables every transition at once "because nothing hardcodes a duration" —
  false in three places, now a build-time guard. `assertRingCoverage` parses
  every control bunood.js or theme_settings.js constructs and fails the build
  if none of its classes carries a `:focus-visible` rule; red on unmodified
  code for 21 controls across four items. A rendered-ring suite test walks the
  real tab order and found one more: the skip link's own rule set no outline
  at all, relying on the browser default.
- **The payload guard joins `build.mjs` too** — `tools/payload.mjs --check`
  now fails the build instead of failing 25 minutes into a suite run.

### Two silent data-loss defects in the cross-app translations import

Found filling all ten apps' translation gaps at scale (`484b814`), both in
`bunood_theme/i18n/apply.py`:

- **Whitespace-bearing sources were silently corrupted.** `import_translations_csv`
  called `.strip()` on both CSV columns before storing — a source of
  `" App Name"` (a real msgid; Frappe's dictionary is exact-match) landed under
  the different key `"App Name"` and rendered English forever, no error
  anywhere. 55 rows, mostly multi-line HTML help text. Fixed: the row is now
  stored exactly as it carries; `.strip()` only tests for an empty cell.
- **MariaDB's case-insensitive collation silently merged translations across
  case.** `upsert_translation`'s lookup matched "Amber" against an existing row
  storing "amber", and updating THAT row left `source_text` lowercase while
  Frappe's dictionary is a case-sensitive Python dict — the correctly-cased
  lookup never found it again. 65 rows vanished this way, each looking like a
  clean "updated" at the time. Fixed: the row the database hands back is
  re-checked byte-for-byte in Python before being trusted as a match, which is
  also portable to Postgres.

## [0.14.0] — 2026-08-10 — Surface kits, Arabic & RTL, operable translations (items 7, 16, 18)

### The list and the form are dressed by the same tailor

Two surface kits landed, and a surface kit is a different animal from the
chrome around it: it mounts nothing and injects nothing. It is a handful of
attributes on `<html>` and a stylesheet over Frappe's own DOM — so there is
no node to stand down and no native affordance to release, and "Original"
is a pure clearing rather than a mode. Absent attributes *are* the
stand-down. Everything is a setting; the shipped values are the chosen ones.

**The list view** (item 16) dresses rows, hover, selection and the bulk
header: five row styles from hairline to Floating Cards, hover as a soft
wash or an edge rail, and one treatment covering checked rows *and* the
bulk header — deliberately one, because splitting them is how a solid brand
bar ends up sitting over neutral rows. Checkboxes rest hidden and appear on
hover, keyboard focus, or while anything is selected.

**The form view** (item 18) dresses sections, tabs, child grids and the
record sidebar: four container styles from hairline panels to Odoo-style
paper sheet, three ways for the active tab to announce itself, three
sidebar treatments. Sections, the child grid's frame and the connections
dashboard take *one* statement, so a style can never ship a floating
section beside a naked flat grid. The sidebar has no "off" — attachments
and assignments have to stay reachable, and hiding chrome is a container's
business, not a surface's.

Both kits are honest about what they *are not* doing. Frappe's own inks
inside the sidebar are never repainted brand-solid, because painting a
brand fill under someone else's muted text is exactly how the list kit's
one real bug happened: a bulk header that looked plausible at rest and
measured 1.79:1. Style on the user's signal — a checked box — never on a
node's mere existence.

Density stopped being a file and became a contract. `_density.scss` had
promised since item 4 that its rules would migrate into surface partials as
those shipped; with the form kit consuming the last token it had been
holding, the file retired, and the stylesheet came out byte-for-byte
identical.

### The desk speaks Arabic, and the build can prove it

Item 7 had reopened because "done" once meant direction only. It closes as
a mechanism: nothing lists the translatable strings — `tools/i18n.mjs`
derives the catalogue every build from the places strings actually live
(DocType JSON through a port of Frappe's own extractor; `__()`/`_()` calls
through self-checking regexes that refuse on under-extraction, because a
hand-rolled scanner once lost 152 of 308 call sites in silence, and
under-extraction reads exactly like full coverage).

The decisions live in `locale/ar.po` — 649 rows, machine-proposed, then
approved — and `translations/ar.csv` is generated from it. 48 strings ship
no row at all: the runtime dictionary is one flat map shared by every
installed app, so a string frappe or crm already translates is inherited
by omission (a generated ledger, with a REJECT map for false friends —
upstream's "Operator" is a machine operator, which is why ours became
Workbench). Eight are exempt with recorded reasons, and the gate fails
when an exemption names a string that no longer exists, so that list can
only shrink.

Five build gates hold it: coverage in both directions; placeholder
token-set equality (Arabic legitimately reorders, so the *set* is compared,
never the order); a plural guard that refuses count-governed strings
outright — the dictionary has no plural forms and Arabic has six
categories, so the fix is `Errors: {0}` by design, never translation;
cursive safety (no letter-spacing survives to compiled CSS, because
tracking breaks Arabic joining); and typography sync.

Typography is a setting now: `arabic_font` — four self-hosted faces plus
System, applied through unicode-range `@font-face` so Latin text never
changes. Direction is detected and refused, never corrected: Frappe's
`is_rtl` exact-matches four languages, and correcting `dir` alone would
half-flip the desk, since the `rtl_` stylesheet keys off the same check.
The suite cross-checks the refusal list against CLDR — which is what kept
Kurmanji (Latin-script) out of it.

### Translations are an operable surface, not a one-time fill

Theme Settings grew a Translations pane: scan every installed app for
strings the merged dictionary cannot answer (22,433 sources, 6,983 missing
on the first scan), ledger the result per app, and close gaps three ways —
a manual row, CSV export/import, or a provider run (Claude, DeepL, Google,
Microsoft) that writes spend-capped PROPOSALS for a human to accept or
reject. Nothing writes a live translation except a person's decision, and
identity overrides from later apps are detected and defended automatically.

## [0.13.0] — 2026-08-10 — Business documents: the print suite (port phase A1)

### The business documents arrive — ported from the sibling repo

Two theme repos had grown in parallel: this one (the desk engine, what
`apps.json` deploys) and `Bunood/bunood_theme`, whose PR #1 (`77a33da`)
shipped a business-document layer this repo never had. The reconciliation
verdict — recorded in `bunood_erpnext/docs/comparison-theme-repos.md` —
kept this repo canonical and ports that layer here. This is phase A1: the
print suite and the Letter Head, verbatim from the source commit.

**What lands.** `printing/`: seven managed Jinja Print Formats (ZATCA
tax/simplified invoices A4 + 80mm thermal + dot-matrix, payment and
journal vouchers), a global Print Style "Bunood", shared macros in
`templates/bunood_print_macros.html`, and three whitelisted Jinja helpers
— ZATCA QR resolution (which knows ksa_compliance ≥ 0.18 keeps the QR on
"Sales Invoice Additional Fields", not on the invoice), VAT-only totals
(freight and 'Actual' rows never pollute the figure), and a per-line VAT
map. `letterhead/`: the bilingual Letter Head (Arabic legal name right,
logo centre, English left — a deliberate physical convention, not RTL),
fully dynamic: every value is read from `Company` fields at render time,
so tenant branding lives in data and the managed HTML carries none of it.

**The sync contract.** `sync_print_theme` runs from `setup.py`'s existing
lifecycle (install + every migrate). Files are the source of truth: managed
records self-heal on drift, and every step is individually guarded — a
failure logs to Error Log and never blocks a migrate. Defaults are claimed
only from vacancy: the Print Style displaces stock styles (`Modern`/
`Classic`/`Standard`) and nothing else; the Letter Head takes `is_default`
only on a site that has none. An admin's deliberate choice survives every
upgrade.

**Why TTF fonts join the woff2.** The PDF engine (wkhtmltopdf, WebKit 534)
cannot read woff2, drops `display:flex` silently, and renders the letter
head in isolation — no theme CSS, no tokens reach it. So the print layer
carries its own rules: inline styles in the letter head, tables never flex,
and Cairo/Amiri as TTF under `public/fonts/`, referenced by absolute
`/assets/` path. The desk bundle is untouched — the payload budget does
not move (dist CSS/JS unchanged; fonts are fetched by the PDF engine, not
the first paint).

**Out of scope here, by decision.** The sibling's hand-rolled desk skin is
NOT ported (this repo's token/bridge pipeline owns the chrome); the command
center and the silent de-ERPNext whitelabel follow as phases A2/A3.

## [0.11.0 – 0.12.0] — 2026-08-08 / 2026-08-09 — sections pending attribution

> NOTE (2026-08-10): everything from here down to [0.10.0] shipped in
> v0.11.0/v0.12.0 — both tags were cut without moving their entries out of
> [Unreleased]. Splitting them per tag is pending housekeeping.

### A click can no longer be swallowed by a concurrent write

Saving a Frappe **Single** writes the whole document:
`Document.update_single` deletes every `tabSingles` row and re-inserts
them. So one click on Theme Settings rewrote every field — and anything
else that had written the Single since the form loaded was either
overwritten silently, or collided: MySQL 1020, *"Record has changed since
last read... try restarting transaction"*, which Frappe returns as a 417
and the click disappeared with nothing on screen to say so.

Autosave turned that from theoretical into routine, because every click is
a write. A migration, a second admin or a background job could take your
change with it.

**The form keeps a clean-state snapshot** — refreshed after every
successful save and every reload, the moments the document and the server
agree. On a refused save it reloads, lays **only the fields this edit
changed** on top, and saves once. Last-write-wins per FIELD, not per
document: the other writer's work survives, and the click still lands.

**`frm.save()` resolves even when the save was refused** — measured: the
promise settled, the value never reached the database, the form stayed
dirty. So the failure signal is `modified`, which a successful save brings
back changed and a refused one leaves alone. A retry hung off `.catch()`
never ran at all.

An earlier attempt re-applied every field the app owns and was worse — it
turned a lost click into a lost document. That is why the diff matters,
and it is recorded next to the code.

### Exactly one of each control, wherever it was placed

Every container built its own bell and avatar, which was safe while one
container mounted per layout and stopped being safe when containers became
independent. Asking for the bell in the Top Bar produced **three** — top
bar, page header and dock — with `inbox_placement` overruled by all of
them, and "Off" left one behind while revealing Frappe's own.

Containers reserve an empty slot now; `mount_placed_tenants` is the only
thing that places a tenant, so "exactly one, where you asked" holds by
construction. Two subtleties it had to learn: Frappe caches pages, so
"exactly one" is scoped per PAGE for the page header, and `HOSTS.pagehead`
was returning the first page head in the document — usually the one you
had just left.

### Two recurring suite flakes retired

`get_status_signals` takes **~4,400ms on its first call after a restart
and ~10ms warm** (measured three times). That cold call has been failing
the first test and the container-query test for weeks — HANDOVER carried
it as "environmental, recurring, not yet mechanised away". The suite now
warms the stack before anything is measured, and the container-query test
waits for the poller instead of sampling at a fixed delay.

Autosave made every fixed-pause assumption in the suite fragile at once;
four tests now wait for a condition rather than sampling for it.

### Honest pickers: every control tells the truth about itself

`bnd_component_blocker` is the counterpart to `bnd_region_blocker`. That
one answers "can a tenant go HERE"; nothing answered "does any of this
matter right now". Switch the side pane off and all 22 sidebar style
options are inert; switch the bottom bar off and every status option is.
Both kept offering themselves as live. Warns, never blocks — the value is
still stored and still correct the moment the container returns.

**The status picker had a reason for exactly this, and it had gone dead.**
It tested `status_style === "Off"`, an option removed when the bottom bar
became a container, so the condition could never be true again. A control
that explains itself only in a state that can no longer occur is worse
than one that never did: it reads as covered.

Three of the five findings were runtime lies, not silent pickers:

* **`"Dock"` did something else.** `home_placement` / `apps_placement`
  offer it and `registry.py` permits it, but `sb_mount_utils` named Top
  Bar and Bottom Bar and let everything else fall through to the sidebar.
  Choosing Dock moved the link to the side pane and said nothing.
* **A link placed in a bar needed the side pane.** `sb_mount_utils` was
  reachable only through `mount_sidebar_kit`, which returns early on a
  hidden pane — so Home in the top bar mounted nowhere at all when the
  pane was off. One setting silently requiring another.
* **`registry.py` named the wrong elements for both link components.**
  `home` was `.bnd-sb-item`, the sidebar form only, so three of its four
  regions read as absent. `apps` was `.bnd-apps-rail` — a different
  component entirely, the sidebar's app-icon rail. Both now identify by
  `data-bnd-part`. Nothing caught it because neither is `critical`, so the
  invariant matrix never asks: "not critical" means unwatched, not
  harmless.

There were **no tests at all** for Home and All Apps placement, which is
how "Dock" survived. The new check walks every region the field offers.

### Switching a container applies to the desk, instead of waiting for a reload

Reported as "the settings save but nothing is applied in reality", and it
was exactly that. The value reached the database, the form went clean, and
the desk kept its top bar through a route change — losing it only on a
hard reload.

**The cause.** Every style kit re-applies to the live desk on click; the
sidebar, breadcrumb, palette and inbox kits have done so since they
shipped. The five containers never did: they were read once from
`frappe.boot` at page load and nothing re-mounted them. That was
survivable while saving meant pressing Save (and usually reloading
afterwards anyway). Autosave removed the last gesture that would ever
refresh the desk, so a container setting did nothing visible at all.

**`bunood.chrome_apply`** mounts what is newly on, tears down what is
newly off, then re-places the tenants. Picking a LAYOUT goes through the
same path, because a preset writes five containers and the placements at
once and would otherwise leave the old layout's chrome on screen.

**Ownership is released before the containers move.** Tearing a container
down takes its tenants with it, and a token left claimed on `<html>` would
hide Frappe's own bell or avatar with nothing in its place — the failure
this project has already paid for twice. `mount_placed_tenants` re-claims
only what it really mounts, which is the same release-then-look bargain it
already strikes internally for "Off".

**Why the suite was green through all of it.** Every container test writes
settings SERVER-side and then navigates, which jumps straight over the gap
between the click and the desk. The new check drives the control itself,
and asserts the ownership contract in both directions: claimed implies
ours is visible, released implies the native is.

### The bottom bar becomes a container, and `desk_layout` stops deciding

The last of the five, and the end of the container split. `mount_chrome`
is five lines — one per container, each asking its own setting — and not
one of them reads the layout. A layout is a preset that writes values and
then has no further say.

**`status_style` lost its "Off".** That option answered two questions at
once, and inconsistently: it meant *no bar* in four layouts and nothing at
all in the Bottom Bar layout, where the strip mounted regardless because
it was that layout's only chrome. That disagreement is the defect this
whole rework began with — in 0.10.0 it deleted a Bottom Bar desk's bell,
badge and avatar, leaving no way to log out. Existence is
`bottombar_enabled`; the style is only ever about content.

**`global_variant` and `.bnd-bottombar` are gone with it.** The bar's size
now follows what it CONTAINS, generalising a rule that already sat one
block below for search alone. That fixes two states nobody had noticed: a
Top Bar desk with the bell placed at the foot crammed controls into a
text-height strip, and a Bottom Bar desk with everything placed elsewhere
got a tall bar holding a clock.

**A layout writes where the controls live, not just which bars exist.**
`desk_layout`'s own description promises "where global search,
notifications and your profile live" and the preset wrote none of it. That
was invisible while the bottom bar built a bell and avatar unconditionally
— a freshly picked "Bottom Bar" looked right by accident.

**Classic reaches stock by not claiming anything.** Its placements are
"Off", not "Side Pane": the latter mounts OUR bell into Frappe's sidebar
and stamps `data-bnd-own`, which hides Frappe's own. A themed control
standing in a native place is not the escape hatch.

**The derived label finally exists.** `bnd_match_layout` reads the
layout's name by comparing the container values against the catalogue, and
says "Custom" the moment one differs. It cannot read `desk_layout` back,
because the stored name is only what was last APPLIED — a desk can carry
the label "Dock" while showing a top bar and a side pane. This is what
`LAYOUT_CHROME` was authored for in the first slice.

Every layout keeps the ambient strip, Classic included. Writing 0 there
would have reversed the 2026-08-06 decision that made the status bar a
component, one day after it was made — and a user picking Classic cannot
tell a preset that removes their status bar from a layout that decides it.

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
