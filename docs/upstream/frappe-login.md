# Upstream: the login page — what cannot be fixed from an app

Written 2026-08-21, during item 32's census (slice 0). Platform measured:
**frappe 16.27.0**, erpnext 16.28.0, site `demo.bunood.test`, seed `#4d8756`.

> **A correction to this repo's other documents while we are here.** `ROADMAP.md`,
> `HANDOVER.md` and `surfaces/_filters.scss` all record item 31's platform as
> "frappe 16.28.0". `apps/frappe/frappe/__init__.py` reads **16.27.0**;
> `apps/erpnext/erpnext/__init__.py` reads 16.28.0. The number that travelled into
> three documents is **erpnext's**. Nothing downstream depends on it, but a
> platform version quoted in a filing has to be the platform's.

Everything below was measured on a running site in a **guest browser context** —
no `sid` cookie — because `www/login.py:38-46` redirects any authenticated
session to `/desk`, so an admin cannot see this page at all. Colours are
`getComputedStyle` values; ratios are `bunood_theme.contrast.ratio`.

Siblings: `frappe-is-rtl.md` (item 7), `frappe-datatable-rtl.md` (item 26),
`frappe-gantt-geometry.md` (item 27), `frappe-overlays.md` (item 28),
`frappe-empty-states.md` (items 29 and 30), `frappe-filters.md` (item 31).

---

## 0. The shape of the surface, because it is not obvious

`/login` is **one page holding four `<section>`s**, routed by `location.hash`
(`templates/includes/login/login.js`). Three of the four are `display: none` at
any moment:

| section | reached by | present on a stock site |
|---|---|---|
| `.for-login` | default / `#login` | yes |
| `.for-signup` | `#signup` | rendered but `.signup-disabled` when Website Settings disables signup |
| `.for-forgot` | `#forgot` | yes |
| `.for-login-with-email-link` | `#login-with-email-link` | only when the system setting is on |
| `.for-email-login` | — | only when a social login provider is configured |

`/update-password` is a **fifth** section, `.for-reset-password`, on the *same*
`login.bundle.css`. It is its own route with its own template.

**Consequence for anyone measuring this page:** `.page-card` matches **four**
nodes on `/login` and **one** on `/update-password`. A bare
`document.querySelector(".page-card")` happens to return the login one only
because `.for-login` is written first. Scope every query to its section.

---

## 1. No control on this page shows keyboard focus

**The headline defect.** Tabbing through the sign-in form and reading
`getComputedStyle` on `document.activeElement` at each stop, every stop matching
`:focus-visible`:

| tab stop | outline | box-shadow | border change |
|---|---|---|---|
| `#login_password` | `none 0px` | `none` | — |
| `<a href="#forgot">` | `auto 1px rgb(16,16,16)` | `none` | — |
| `.btn-login` (**Continue**) | `none 0px` | `none` | — |
| `.btn-login-option` | `none 0px` | `none` | — |
| `#login_email` | `none 0px` | `none` | — |

The bare `<a>` keeps the user agent's own outline because nothing styles it. **Every
element Frappe *does* style loses its focus indicator**, from two independent
directions:

- `public/scss/login.bundle.scss:85, 96, 113, 128, 143` — `box-shadow: none` inside
  the `&:hover, &:focus, &:active` block of `.btn-login`, `.btn-ldap-login`,
  `.btn-signup` and `.btn-login-option`.
- Bootstrap's `.form-control:focus` sets `box-shadow: none` **and** `outline: 0`
  for the inputs.

Neither leaves a carrier: the computed border does not change on focus either
(`1px rgb(226,226,226)` at rest and focused). This is **WCAG 2.4.7 Focus Visible,
Level AA**, failing on the form a keyboard user must cross before they can reach
any part of the product.

*It is fixable from an app* — the selectors are beatable on specificity — and
item 32 does so. It is filed because the fix belongs upstream: every Frappe
site without a theme has this.

**Note the shape.** `login.bundle.scss` zeroes the shadow to remove Bootstrap's
focus glow *as a decoration*, without putting anything in its place. That is the
same defect item 31 found in its own anchor, arrived at from the opposite
direction.

---

## 2. Three colours are literals paired with tokens that flip

The pattern, three times: one half of a contrast pair follows the theme and the
other does not. Item 31 filed `.btn-primary-light` for exactly this; these are
four more.

### 2a · The enabled submit button is white on near-white in dark

`login.bundle.scss:119-120`:

```scss
.btn-signup {
	background: var(--surface-gray-2);
	color: var(--ink-gray-4);
	&:not(:disabled) {
		background: var(--surface-gray-7);
		color: white;          // <- a literal
	}
}
```

`--surface-gray-7` is `#171717` in light and **`#f8f8f8` in dark**. So:

| state | mode | measured | ratio |
|---|---|---|---|
| enabled | light | `#ffffff` on `#171717` | 17.93:1 |
| enabled | **dark** | `#ffffff` on **`#f8f8f8`** | **1.06:1** |
| disabled | light | `#999999` on `#f3f3f3` | 2.57:1 |
| disabled | dark | `#717171` on `#2b2b2b` | 2.90:1 |

The enabled row is **the Send Link button on the Forgot Password screen** — the
only action on that screen — and the Sign Up submit. Unreadable in dark. The two
disabled rows are exempt from 1.4.3, but they are also the resting appearance of
the same control.

### 2b · The error banner keeps a light-mode fill in dark

`login.bundle.scss:266` — `background-color: var(--red-50)`, which is `#fff7f7`
and is **not redefined under `[data-theme="dark"]`**, while its ink
`var(--ink-red-4)` is (`#cc2929` → `#fc7474`).

| mode | ink on fill | ratio |
|---|---|---|
| light | `#cc2929` on `#fff7f7` | 5.08:1 |
| **dark** | `#fc7474` on `#fff7f7` | **2.52:1** |

And the banner itself becomes a **white box at 16.99:1 against a `#171717`
card** — the loudest thing on a dark page is the error surface's *background*.

### 2c · The primary action has no shape in dark

`login.bundle.scss:83` — `background: var(--gray-900)`. `--gray-900` is
`#171717` and is **not redefined in dark**; but `--bg-color` in dark resolves to
`var(--gray-900)`. So the Continue button's fill and the page's fill are the
same colour, measured **1.00:1**. Only the white label survives; the control has
no edges.

### 2d · `.btn-login-option` is a near-white slab in dark

`login.bundle.scss:142` — `background: var(--gray-100)` (`#f3f3f3`, no dark
redefinition), `color: var(--gray-800)`. In dark that is a `#f3f3f3` slab at
16.16:1 against the page. Its own label clears AA (13.99:1), so this is a visual
defect rather than a contrast one — but it is the same literal-vs-token split.

---

## 3. The card is the same colour as the page, with no border and no shadow

`login.bundle.scss:4` sets `body { background-color: var(--bg-color) }` and
`:34` sets `.page-card { background-color: var(--bg-color) }` — **the same
variable** — with no `border` and no `box-shadow`. Measured **1.00:1 in both
modes**, `border-top-width: 0px`, `box-shadow: none`.

The one object on the page is not drawn as an object. That the authors expected
a border is visible three lines later: the `media-breakpoint-down(xs)` block at
`:43` sets `border: none`, which is a no-op over nothing.

Same on `/update-password`: card `#ffffff` / body `#ffffff` in light, both
`#171717` in dark.

---

## 4. The inputs are not identifiable at rest either

`login.bundle.scss:225` — `border: 1px solid var(--outline-gray-2)` on
`background-color: var(--surface-white)`:

| mode | border vs card | fill vs card |
|---|---|---|
| light | `#e2e2e2` on `#ffffff` — **1.30:1** | `#ffffff` on `#ffffff` — 1.00:1 |
| dark | `#343434` on `#0f0f0f` — **1.54:1** | `#0f0f0f` on `#171717` — 1.07:1 |

Neither arm of "a control is identifiable at rest by a ≥3:1 border **or** a
visible fill delta" is satisfied, in either mode. On a page whose entire content
is two text fields.

---

## 5. `--ink-gray-5` is used for a label *and* for a link, and fails as both

`login.bundle.scss:297` (the field label) and `:310` (the **"Forgot password?"**
link) both take `color: var(--ink-gray-5)` — `#7c7c7c` in light, on a `#ffffff`
card: **4.17:1**, against the 4.5:1 floor of WCAG 1.4.3. Dark passes (4.54:1).

`/update-password`'s `.password-hint` (`:441`) and `.password-strength-message`
(`:464`) take the same token and the same 4.17:1.

A link at the same weight and the same ink as a label is also a
use-of-colour question, but the ratio is the filing.

---

## 6. Three structural gaps no stylesheet can close

These are the ones item 32 **cannot** fix, because they need DOM the theme does
not own.

| what | measured | rule |
|---|---|---|
| **No `<h1>`.** Four `<h4>` elements, one per section (`www/login.html:96, 98`), rendered by the `logo_section` macro. | `document.querySelectorAll("h1").length === 0` | heading structure; axe `page-has-heading-one` |
| **No live region.** `.login-error-banner` (`www/login.html:10`) and every `.field-error` (`:28, :45, :179, :214`) are revealed by `login.js` toggling `display`. Nothing carries `role="alert"`, `aria-live` or `aria-describedby`. A failed sign-in is announced to nobody. | `[aria-live],[role=alert],[role=status]` → **0** on both routes | **WCAG 4.1.3 Status Messages, AA** |
| **The password toggle is not a control.** `www/login.html:41` is a bare `<svg class="toggle-password">` with no `tabindex`, no `role`, no accessible name. It is reachable by mouse only. | — | **WCAG 2.1.1 Keyboard, A** |

Suggested fixes, all one line each: `<h4>` → `<h1>` in `logo_section` (the macro
already takes the title); `role="alert"` on the banner and `aria-live="polite"`
on `.field-error`; `<button type="button" class="toggle-password"
aria-label="{{ _('Show password') }}">` wrapping the svg.

---

## 7. The template offers no seam for a subtitle or a tagline

`www/login.html:91-104`'s `logo_section` macro takes `title` and `subtitle`, and
every call site passes **literals**:

```jinja
{{ logo_section(_('Sign In'), _('Welcome! Please sign in to continue.')) }}
```

`www/login.py::get_context` publishes `logo`, `app_name`, `login_label`,
`disable_signup`, `signup_form_template` and `provider_logins` — but nothing the
title or subtitle reads. So a site cannot say anything of its own on its own
sign-in screen without forking the template.

**`logo` is the exception, and it is the whole reason item 32 can put a customer's
mark on this page**: `www/login.py:53` and `www/update_password.py:12` both set
`context.logo = get_app_logo()`, and `update_website_context` runs *after*
`get_context` (`website/page_renderers/base_template_page.py:32`), so a hook can
override it. Requested upstream: the same treatment for a `subtitle` /
`tagline` context key.

---

## 8. 220px of the viewport is reserved for a footer that is hidden

`login.bundle.scss:6` and `:14`:

```scss
.page-content-wrapper { min-height: calc(100vh - 220px); padding-top: 60px; }
.web-footer { display: none; }
```

Measured at 1440×812: the wrapper is 592px tall, the card is 394px, and the card
is pinned 60px from the top with 358px of empty space below it. The 220px is
allowance for a footer the same file hides.

`show_footer_on_login` (a Website Setting, read at `www/login.py:47`) can bring
the footer back — so the reserve is not simply dead. But the default is off, and
the default composition is what every site sees.

---

## 9. The mobile collapse is at 576px, not where the code reads

`login.bundle.scss:9` and `:43` use `@include media-breakpoint-down(xs)`, which
in Bootstrap 4 means **`max-width: 575.98px`** — i.e. *below the `sm`
breakpoint*, not "extra small". Bisected live:

| viewport | `max-width` | radius | `min-height` | padding |
|---|---|---|---|---|
| 576 | `371px` | 12px | 0 | 24px |
| **575** | `100%` | 0 | 812px | `60px 32px 32px` |

Recorded because the name reads like 450-ish and is 576, and because any theme
adding a second layout has to change at the same number or the two disagree for
125px. 576 is already in this theme's `_breakpoints.scss` vocabulary (it is
Frappe's own `$grid-breakpoints.sm`), so no new breakpoint is needed.

---

## 10. The card's inherited ink does not follow the theme

`.page-card`'s computed `color` is `rgb(82,82,82)` — `#525252` — in **both**
modes. On a `#171717` card that is **2.29:1**.

Nothing on the stock `/login` visibly inherits it: every text node inside the
card sets its own colour. It is filed rather than repaired because it is a
loaded gun — any element added to the card without an explicit `color`, by
Frappe or by an app's `signup_form_template`, renders at 2.29:1 in dark and
passes review in light.

---

## Not filed, and why

- **The physical properties.** `.forgot-password-message { text-align: right }`,
  `.field-icon { left: 8px }`, `.toggle-password { right: 9px }`, and the
  inputs' `padding-left: 38px` / `padding-right: 38px` are all physical. They
  are **not** a defect: Frappe flips them with a build-time rtlcss pass, and it
  works. Measured on the same page with `preferred_language=ar`:

  | | LTR | RTL |
  |---|---|---|
  | sheets served | `dist/css/…` ×3 | **`dist/css-rtl/…` ×3** |
  | `.field-icon` | `left: 8px` | `right: 8px` |
  | `.toggle-password` | `right: 9px` | `left: 9px` |
  | `#login_email` padding | `38px` / `8px` | `8px` / `38px` |
  | `.forgot-password-message` | `text-align: right` | `text-align: left` |
  | `.page-card-head` | `text-align: left` | `text-align: right` |

  **This is the constraint on us, not on them** (`GUIDELINES.md` §1.3): a logical
  rule of ours over one of these compounds with the flipped copy and pins the
  element on both sides. Corrects an assumption made while planning item 32 —
  `sites/assets/assets.json` carries zero `rtl_` keys, which by
  `ARCHITECTURE.md` §6's reasoning should have made `include_style` emit a dead
  `rtl_login.bundle.css`; it does not, and the RTL variant resolves correctly.

- **`login.bundle.css` ships the whole desk variable set and `desk/dark.scss`.**
  57 KB for a page with two inputs, including
  `[data-theme=dark] .modal, [data-theme=dark] .form-in-grid` and every
  `.indicator` rule. Wasteful, not broken, and not a theme's business.

- **`<html>` carries no `data-theme` on any website page.** `templates/base.html`
  renders `lang` and `dir` only, so every `[data-theme="dark"]` rule in
  `login.bundle.css` — including the correct ones — is unreachable. This is
  arguably the single largest finding, but it is a **design** decision (website
  pages are public and a guest has no `User.desk_theme`), not a defect, so it is
  recorded rather than filed. It is why item 32 paints in a media query and
  never activates their dark branch.

---

## A measurement trap, recorded for the next person

`getComputedStyle` served a **stale value** when an attribute was mutated and
re-read inside a single `page.evaluate`, even with `void el.offsetWidth` between
them: removing `disabled` from the Send Link button reported the disabled
colours, and a rule scan in the same tick correctly showed
`.btn-signup:not(:disabled)` matching. Two readings of the same DOM disagreed.

Splitting the mutation and the read into **separate `page.evaluate` calls with a
real frame between them** gave the true value — and the true value was the
severe one (§2a, 1.06:1). Item 31's lesson in a new costume: a correct rule can
be failed by a wrong check, and the check is what to distrust first.
