# Upstream: the website and portal — what cannot be fixed from an app

Written 2026-08-22 during item 33's census (slice 0). Platform measured:
**frappe 16.27.0**, erpnext 16.28.0, site `demo.bunood.test`, seed `#4d8756`,
against commit `54f8348` (`v0.32.1`).

Measured in **three** browser contexts, because this surface is the first with
more than two and the difference between them is load-bearing:

| context | how | reaches |
|---|---|---|
| guest | no `sid` cookie | `/`, `/404`, `/message`, `/support`, guest Web Forms |
| portal user | `sid` for a **Website User holding only `Customer`** | the twelve erpnext portal lists, `/me`, login-required Web Forms |
| Administrator | the suite's usual session | all of the above, **by a different code path** |

That last row is why `tools/portal-fixtures.mjs` exists. `get_customers_suppliers`
(`erpnext/controllers/website_list_for_contact.py:238-243`) branches on the
session user's roles: a Customer sees their own documents through
`get_parents_for_user`, and **anyone with read permission sees every Customer on
the site**. An Administrator therefore renders a full, correct-looking portal list
while exercising none of the code a customer takes. Every measurement below that
says "portal user" was taken as one.

Siblings: `frappe-is-rtl.md` (item 7), `frappe-datatable-rtl.md` (item 26),
`frappe-gantt-geometry.md` (item 27), `frappe-overlays.md` (item 28),
`frappe-empty-states.md` (items 29 and 30), `frappe-filters.md` (item 31),
`frappe-login.md` (item 32).

---

## 0. The shape of the surface, because it is not one page

Item 32's surface was one template on two routes. This one is roughly twenty
routes on **six** templates, and the mapping is not what the URLs suggest.

| template | reached by | furniture |
|---|---|---|
| `www/portal.html` | **all twelve** erpnext portal lists (`/orders`, `/quotations`, `/invoices`, `/timesheets`, `/shipments`, `/purchase-orders`, `/purchase-invoices`, `/supplier-quotations`, `/material-requests`, `/project`, `/rfq`, `/boms`) | navbar, sidebar, **no footer** |
| `www/me.html` | `/me`, and `/` for any authenticated session | **no navbar, no sidebar, no footer** |
| `www/404.html` | every unresolved path | none |
| `www/message.html` | `/message`, and every 403 | none |
| `templates/web_form.html` | `/request-data/new`, `/issues/list`, … | navbar, footer |
| erpnext `www/*` | `/support`, `/banking` | navbar, footer |

`ListPage.render()` calls `set_standard_path("portal")`
(`website/page_renderers/list_renderer.py:28-30`), which is why twelve routes
collapse to one template. **The furniture is not a property of the route**, and a
theme that assumes a navbar exists is wrong on five of the six templates.

---

## 1. `context.path` and `context.route` are empty for a whole renderer family

`update_website_context` is the only hook that can dress a website page without
forking a template. It sees a different context depending on which renderer got
there, and this is not documented anywhere.

`TemplatePage.update_context()` calls `set_page_properties()`
(`website/page_renderers/template_page.py:178-185`), which sets `template`,
`path`, `route`, `name`, `basename` and `basepath` before
`post_process_context()` reaches the hook. So on a `TemplatePage` — and on
`ListPage` and `NotPermittedPage`, both subclasses — all of them are populated.

**`DocumentPage.update_context()` (`document_page.py:54-72`) never calls it.** It
sets `doc`, `doc.as_dict()` and `doc.get_page_info()` and nothing else. And
`WebFormPage(DocumentPage)` (`web_form.py:6`) inherits the hole. So on every
**Web Page, Help Article and Web Form**, `context.path` and `context.route` are
empty at hook time, while `context.template` survives because
`get_page_info()` supplies it.

`BaseTemplatePage.set_missing_values()` fills `context.path` in afterwards
(`base_template_page.py:66`, called at `:36`, after the hook at `:32`) — which is
why the rendered HTML carries a correct `data-path` on exactly the pages where
the hook could not read one. **Reading the attribute back looks like
confirmation and is not.** Verified live: `/request-data/new` renders
`data-path="request-data/new"`.

*Filing:* `set_page_properties()` should run for the `DocumentPage` family too,
or the hook's contract should state which keys are renderer-dependent.

---

## 2. The website HTML cache is keyed on `(path, lang)` and nothing else

**This is an anonymous information disclosure and it reproduces in three
requests.**

`cache_html` builds `cache_key = f"website_page::{args[0].path}"`
(`website/utils.py:532`), varied only by `frappe.local.lang`. `can_cache()`
(`:49-58`) consults `force_website_cache`, `disable_website_cache`,
`developer_mode`, `frappe.local.no_cache` and *whether the request carries a
query string* — **never the session user, never their roles**.

Measured, after `delete_page_cache("attribution")`:

| step | request | result |
|---|---|---|
| 1 | guest, cache cold | **403**, 9,194 B, `frappe-session-status="logged-out"` |
| 2 | Administrator | 200, 96,777 B, `logged-in` |
| 3 | **guest again** | **200**, 96,725 B, **`logged-in`**, containing the installed-app inventory |

`www/attribution.py::get_context` raises `PermissionError` unless
`is_system_user()`, and an anonymous request receives the system user's rendered
page anyway. A second, independent data point: `/404` fetched **with a valid
`sid`** returns `frappe-session-status="logged-out"` — the guest render served to
an authenticated session.

Two aggravations worth filing with it:

- **The write path ignores the client's `no-cache`.** `no_cache` gates the
  *read*; the *write* is `if can_cache(context.no_cache)`. So an Administrator
  browsing with devtools "Disable cache" checked **populates the guest cache with
  their own render on every page they visit** — a workflow every developer uses.
- `www/attribution.py` carries no module-level `no_cache = 1`. That is the narrow
  fix; the cache key is the real one.

*Filing:* two issues — the missing flag, and the key that omits the user.

**Consequence for any theme, recorded because it constrains us too:** a
`body_class` set from `update_website_context` on a cacheable route is shared by
every visitor for the TTL. It may encode **site** state only — never user state,
never role state, never `User.desk_theme`. `body[frappe-session-status]` is
rendered for free at `base.html:57` and is *provably stale* on those routes, so
it cannot be used as a styling discriminator either.

Measured `Cache-Control` on this site: `/orders`, `/me`, `/message`,
`/issues/list`, `/request-data/new`, `/support` are `no-store`; **`/404` and
`/attribution` are `private,max-age=300,stale-while-revalidate=10800`.**

---

## 3. `/addresses` returns HTTP 500 for every user, including Administrator

A shipped, enabled Portal Menu Item (`title: "Addresses"`, `role: "Customer"`) —
one of the thirteen erpnext puts in `Portal Settings` on a fresh site. Measured
500 for a zero-role Website User, for the portal fixture user, and for
Administrator.

It serves `www/error.html` (`data-path="error"`, `#page-error`) reading "Server
Error / 500: There was an error building this page", the "Show Error" panel is
**empty** (`<pre><code></code></pre>`), and **no `Error Log` row is written**. A
customer clicking a link erpnext put in their sidebar gets a 500 with no
diagnostic on either side.

*Filing:* one issue for the 500, one for the empty error panel with no log row —
the second is the reason the first is hard to report.

---

## 4. `/tasks` 404s because an erpnext route rule shadows a shipped frappe Web Form

Measured: `/tasks` → **404** for guest and authenticated alike; `/tasks/new` →
200; `/tasks/list` → 301. Frappe ships a published Web Form named `tasks`
(`login_required=1`).

`resolve_path` (`website/router.py`, `path_resolver.py:181-195`) applies
`website_route_rules` **before** the renderer chain, so `/tasks` is rewritten to
the endpoint `Task` — a doctype with no web view and no `get_list_context` — and
`ListPage.can_render()` returns False. The Web Form is never consulted for its
own bare route.

*Filing:* a route rule from one app makes another app's shipped Web Form
unreachable at its documented address, with no warning at install or migrate.

---

## 5. Keyboard focus: the fields have no indicator, the buttons have an invisible one

Driven with a real `page.keyboard.press("Tab")`, then confirmed by a rule scan
that tests each selector against the element **in each state** rather than at
rest — the method item 32's release review had to invent after a rest-only scan
missed four defects.

**Fields — no indicator at all:**

```
(0,2,0)  :focus   website.bundle   .form-control:focus
         { outline-width: 0px; box-shadow: none;
           color: rgb(82,82,82); background-color: rgb(237,237,237) }
```

The only competing rule is `.frappe-control…has-error input:focus` at (0,5,1),
which paints an *error* ring and applies only in that state. So a focused text
field is distinguished from an unfocused one by a 6-channel background shift and
nothing else.

**Buttons — an indicator exists and fails 1.4.11:**

```
(0,2,0)  :focus   .btn:focus          { outline-width: 0px;
                                        box-shadow: rgba(23,23,23,.25) 0 0 0 .2rem }
(0,2,0)  :focus   .btn-default:focus  { box-shadow: rgba(210,210,210,.5) 0 0 0 .2rem }
(0,2,0)  :focus   .btn-primary:focus  { box-shadow: rgba(58,58,58,.5) 0 0 0 .2rem }
```

`.btn-default:focus` is a 50%-alpha `rgb(210,210,210)` halo on white. The later
rule wins at equal specificity, so the more visible `.btn:focus` value is
overridden by the paler one on exactly the buttons that need it most.

*Filing:* `outline: 0` with no accessible replacement on `.form-control:focus`
(2.4.7), and a focus halo below 3:1 on `.btn-default` / `.btn-light` (1.4.11).
This is the same `outline: 0` family already filed for `/login`; this is a second
surface and a second data point.

**Not a defect, recorded so nobody else chases it:** `* { box-shadow: none
!important }` in `website.bundle` looks like it would defeat every focus ring on
the site. It is inside `@media print`. A scan that records the rule without its
`conditionText` reports a catastrophe that does not exist.

---

## 6. `--text-muted` is 4.17:1 on white, and it carries load-bearing text

`rgb(124,124,124)` on `rgb(255,255,255)` measures **4.17:1** against a 4.5
requirement. It is not decorative anywhere it appears:

| page | element | ratio |
|---|---|---|
| `/me` | the three primary actions (`Edit Profile`, `Reset Password`, `Manage 3rd party apps`) | 4.17 ×3 |
| `/me` | `Home` / `Desktop` / `Logout` on `rgb(243,243,243)` | 3.76 ×3 |
| `/me` | the avatar initial | **2.57** |
| every footered page | "Powered by" and the `ERPNext` link | 4.17 ×2 |
| `/404` | `Back to Home` — the page's **only** link | 3.93 |
| Web Form | `.control-value.like-disabled-input` | 3.93 ×3 |
| `/support` | the hero subtitle, 20px/400 | 4.17 |

`/me` fails **seven of its nine** text-bearing elements. For comparison, the same
page's `h3.my-account-header` measures 17.93 and its body copy 7.81 — the
failures are specifically the muted token, not the page.

*Filing:* a framework token used for primary navigation and sole-link text should
clear 4.5:1. A theme can repair it locally; every un-themed Frappe site cannot.

---

## 7. Controls are not identifiable at rest

Item 22's rule, applied here: a control must be distinguishable from its host by
a border clearing 3:1 **or** a visible fill delta. Fill delta measured in
channels against the ancestor-resolved background.

| element | own bg | host | delta | border |
|---|---|---|---|---|
| `input.form-control` | `rgb(243,243,243)` | white | **1.11** | `0px none` |
| `button.discard-btn.btn-default` | `rgb(243,243,243)` | white | **1.11** | `0px none` |
| `select.form-control.input-xs` | `rgb(243,243,243)` | white | **1.11** | `0px none` |
| `a.edit-button.btn-default` | `rgb(243,243,243)` | white | **1.11** | `0px none` |
| `button.navbar-toggler` | transparent | white | **1.00** | `1px solid rgba(0,0,0,0)` |

No border reaches 3:1 anywhere on the surface. The `navbar-toggler`'s border is
1px of **fully transparent** colour — it occupies the box model and paints
nothing, which is worse than no border because it silently changes layout.

---

## 8. A Web Form ships no `<input>` in its server-rendered HTML

Measured on `/request-data/new`: **zero** matches for `<input` in the raw
response, while `.web-form`, `.discard-btn` and `.page-breadcrumbs` are all
present. Frappe's control library builds every field client-side after load.

Not a defect — but it is a fact that silently invalidates measurement. A scan at
`domcontentloaded` finds the buttons, finds no fields, and reports "no such
control" for the most important element on the page. Recorded because it cost a
probe run here, and because any accessibility audit of a Frappe Web Form that
does not wait for the controls is measuring an empty form.

---

## 9. Untranslated status labels, unisolated, in Arabic

`/issues/list?_lang=ar` renders:

```
المشكلات New فتح Replied On Hold Closed
```

Four English status labels interleaved with Arabic body text, with no bidi
isolation. This is item 7's known open gap with a portal data point attached;
filed with the existing i18n material rather than separately.

**A measurement caveat that applies to every RTL number in this file:** `?_lang=ar`
carries a query string, and `can_cache()` returns False when one is present. Every
Arabic measurement here is therefore taken on the **uncached** branch, while a
real Arabic visitor receives a cached render keyed by lang. The two have not been
compared.

---

## 10. The four branding seams, and the one that is not a fallback

Not a defect list — a map of what a theme can change from `update_website_context`
without forking a template. All four are ordinary context keys, all four were
proved by writing Website Settings directly and watching the page change, and all
four are resolved **before** our hook runs, which is what makes them assignable.

| seam | rendered at | stock here | note |
|---|---|---|---|
| `favicon` | `base.html:16-22` | `erpnext-favicon.svg` | the only seam that is universal — `/404` and `/message` have no navbar and no footer |
| `banner_image` | `navbar.html:8` | absent | Frappe's own seam for an **image** brand; renders `<img src>` |
| `brand_html` | `navbar.html:5` | absent → `_("Home")` | a **Code** field, and it WINS over `banner_image` |
| `footer_powered` | `footer_info.html` | erpnext's include | there is no way to render *nothing*: `""` is falsy and brings the include back |

**The favicon is not a fallback chain you can read off the context.**
`get_website_settings()` resolves it in three steps before we see it
(`website_settings.py:251-255`): Frappe's default, then any app's
`website_context` hook — erpnext ships one at `hooks.py:119` — then the Website
Settings field. So `context.favicon` cannot distinguish "the administrator chose
this" from "an app we happen to be installed beside chose this", and reading it
back looks exactly like confirmation. The field has to be read **directly**. This
is §1's `data-path` trap in a second place.

**`brand_html` beating `banner_image` is a live hazard, not a curiosity.** A
tenant who has ever typed into Website Settings' Brand HTML and later attaches a
logo gets their old text rendered over the image, silently, because the template's
`if` never reaches the `elif`. Anything setting `banner_image` must clear
`brand_html` in the same breath.

---

## 11. Frappe's Jinja has no autoescaping, anywhere

`_get_jenv()` builds `FrappeSandboxedEnvironment(loader=get_jloader(),
undefined=DebugUndefined, cache_size=32)` (`frappe/utils/jinja.py`) — no
`autoescape` argument, and the string does not appear anywhere in the framework.
Jinja's default is `False`, so **every `{{ }}` in every website template renders
raw HTML**.

That is correct for the fields it was chosen for: `brand_html` is documented as
the place to put an `<img />` tag, and `footer_powered` is a Small Text that
customers put links in. It is why the framework's own templates escape by hand
where it matters — `base.html` writes `{{ path | e }}`, `me.html` writes
`{{ current_user.full_name | e }}`.

Measured rather than inferred: setting `footer_powered` to `ACME <i>Ltd</i>`
rendered an italic *Ltd* on `/support`. **Anything a theme derives from a Data
field and pushes through one of these keys must be escaped on the way out** —
`frappe.utils.escape_html`. Not filed: this is a deliberate design choice of the
framework, and the burden is correctly on the caller. It is recorded because the
burden is easy to miss when the seam looks like plain text.

---

## Not filed, and why

- **RTL geometry works.** `?_lang=ar` on `/orders` swaps to
  `dist/css-rtl/website.bundle.*.css` and `dist/css-rtl/erpnext-web.bundle.*.css`;
  `.web-sidebar` moves from x=99 to x=1159, `main` from 311..1341 to 99..1129,
  `text-align` flips, and there is no horizontal overflow. Frappe flips this
  surface itself via its build-time rtlcss pass. That is not a defect — it is a
  **prohibition on us**, and GUIDELINES §1.3 carries the argument: their flipped
  physical rules and our logical ones do not compose.
- **375px is structurally clean.** `scrollWidth === clientWidth === 375` on
  `/orders` and `/issues/list`, zero overflowing elements, the navbar collapses
  correctly. The smallest targets (`a.navbar-brand` 50×40, `button.navbar-toggler`
  50×34) clear SC 2.5.8's 24×24, though both sit under the 44px comfort figure.
- **Breadcrumbs render as an empty div** (`innerHTML: ""`, `height: 0`) on every
  portal list, because only the *detail* route rules carry `defaults.parents`.
  Cosmetically invisible and arguably correct; not worth a filing.
- **The portal empty state** ("Nothing to show" in a bare `div.mt-4`, left-aligned
  under a generic file glyph) is ours to dress, not theirs to fix.

---

## A measurement trap, recorded for the next person

**Splitting a selector list on `,` tears `:is()` apart.** A rule scan that does
`selectorText.split(",")` turns

```css
body.bnd-auth :is(.btn, .form-control, a, [tabindex]):focus-visible
```

into four fragments, one of which is the bare string `a`. That fragment matches
every anchor on the page, and the scan reports **our own correctly-scoped rule as
an unscoped (0,0,1) leak in our own stylesheet**. It did, here, for one run — and
the report was convincing enough to act on.

What caught it was auditing the compiled sheet directly: all 38 top-level
selector groups are scoped, and none of them is `a`. Split on top-level commas
only — track parenthesis and bracket depth. The sibling of item 32's lesson that
a rule scan must guard recursion on `!r.selectorText` rather than on
`r.cssRules`, which under CSS nesting is an empty list on every style rule.
