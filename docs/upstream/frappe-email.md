# Upstream: outgoing email — what cannot be fixed from an app

> Measured 2026-08-25 on `demo.bunood.test`, **frappe 16.27.0**, erpnext image
> v16.28.0, brand seed `#4d8756`, against this repo at `f2602de` (item 34 slice 0).
> Every figure below was produced by rendering through the real funnel —
> `frappe.email.email_body.get_formatted_html` — not by reading the source.

**Method, because this surface has no route.** An email cannot be navigated to, so
nothing here was measured in a page. The census renders server-side via `benchPy`,
loads the resulting HTML into Chromium with `page.setContent`, walks it, and computes
every ratio in `bunood_theme.contrast` — the same implementation `brand.py` formats and
`tools/contrast_gate.py` measures. **The honest limit: this measures the CSS that was
authored, not what a mail client supports.** Colour transfers; layout does not.

Four render shapes were used throughout, because they behave differently:

| shape | call | what sends it |
|---|---|---|
| `plain` | no `header`, no `with_container` | **Notification alerts** — the commonest email a site sends |
| `container` | `with_container=True` | document share, most system mail |
| `header` | `+ header=[title, colour]` | anything calling `get_header` |
| `nocss` | `add_css=False` | the opt-out path |

Siblings: `frappe-is-rtl.md` (item 7) · `frappe-datatable-rtl.md` (26) ·
`frappe-gantt-geometry.md` (27) · `frappe-overlays.md` (28) · `frappe-empty-states.md`
(29+30) · `frappe-filters.md` (31) · `frappe-login.md` (32) · `frappe-website.md` (33).

---

## 0. The shape of the surface

Every outgoing email converges on **one function**, which is what makes this surface
tractable at all:

```
frappe.sendmail()  →  QueueBuilder.process()  →  .as_dict()
                   →  prepare_email_content()  →  email_html_content()
                   →  get_formatted_html()          email_body.py:406
                   →  templates/emails/standard.html
                   →  scrub_urls()  →  inline_style_in_html()  →  Premailer
```

26 templates ship: one wrapper, `email_header.html`, `email_footer.html`, and 23 body
fragments. Rendering all 23 (22 succeed on a permissive arg bag; only
`security_txt_expiry_alert` needs real values), their complete class vocabulary is
fifteen names — `body-content` `body-table` `btn` `btn-primary` `btn-sm` `email-body`
`email-container` `email-header-title` `more-info` `primary-action` `report-title`
`text-color` `text-muted` `text-small` `with-container`.

Two escape hatches exist and both are opt-in: `raw_html=True` (renders the message as a
standalone document, skipping the wrapper) and `add_css=False` (skips `external_styles`
only — an in-document `<style>` is still inlined).

---

## 1. ERPNext's email stylesheet has never applied, on any site, and nothing says so

`erpnext/hooks.py:28` declares `email_css = "email_erpnext.bundle.css"`. The built file
is **`erpnext_email.bundle.css`** — the two words are transposed.

`inline_style_in_html` (`frappe/email/email_body.py:462-481`) resolves each hooked path
through `bundled_asset()` and then filters:

```python
css_files = [css_file for css_file in css_files if os.path.exists(os.path.abspath(css_file))]
```

A path that does not resolve is dropped **silently, with no log and no warning**.
Reproduced exactly:

| hook value | `bundled_asset()` | exists |
|---|---|---|
| `email.bundle.css` | `/assets/frappe/dist/css/email.bundle.UKAXOKIT.css` | yes |
| `email_erpnext.bundle.css` | `/email_erpnext.bundle.css` | **no** |

So the only sheet reaching outgoing mail on any ERPNext site is frappe's own.

***Filing:*** correct the hook value, **and** make the filter observable — a hooked
stylesheet that cannot be found is a configuration error, not a no-op. One
`frappe.log_error` in that comprehension would have surfaced this years ago.

---

## 2. The filter is CWD-relative, so the same site sends two different-looking emails

`os.path.abspath` resolves against the **calling process's** working directory.
`frappe.sendmail` is called from web requests (the backend) and from background jobs
(the queue and scheduler workers), and on a standard container split those processes do
not have identical `sites/assets` trees. Measured here:

| container | `sites/assets/bunood_theme` |
|---|---|
| backend | present (symlink into the app) |
| queue-short · queue-long · scheduler | **absent** |
| frontend | present |

An app whose `email_css` resolves in the backend and not in a worker therefore styles
desk-triggered mail and silently loses the sheet for scheduler-triggered mail — same
site, same template, two appearances, no error in either.

***Filing:*** resolve hooked asset paths against the bench root rather than the process
CWD, and log a miss. Until then, an app cannot use this hook safely; this theme delivers
its email CSS inside its own template instead (`bunood_theme/email.py` carries the
argument).

---

## 3. A Notification email has no background of its own

`templates/emails/standard.html:11` puts the ground behind a condition:

```jinja
class="body-table {% if header or with_container %} with-container {% endif %}"
```

and `email.bundle.scss:127` paints `background-color` only on `.body-table.with-container`.
`Notification.send_an_email()` (`frappe/email/doctype/notification/notification.py:510`)
calls `frappe.sendmail` with neither `header` nor `with_container`.

Measured in the `plain` shape: **five of five text-bearing elements have no opaque
ancestor anywhere above them.** The ink is `#171717` from `body { color: $text-color }`,
and the ground is whatever the mail client supplies — which in a dark-mode client is
dark, under near-black text.

This is not a colour bug. There is no author-controlled ground at all, so the result is
unpredictable by construction and no palette change can fix it.

***Filing:*** paint a background on `.body-table` unconditionally, or declare
`color-scheme` so the client's substitution is at least a known one. A message whose
legibility depends on the reader's client settings is a defect regardless of which
colours are chosen.

---

## 4. Every link in every Frappe email fails WCAG 1.4.3 AA

`email.bundle.scss:36`:

```scss
a { color: $blue-500; }   // #2d95f0
```

| ink | ground | ratio | needs |
|---|---|---|---|
| `#2d95f0` | `#ffffff` (the card) | **3.15:1** | 4.5 |
| `#2d95f0` | `#f8faf8` (a tinted ground) | **3.00:1** | 4.5 |

***Filing:*** darken `$blue-500` for the email sheet, or introduce a link token fitted
against the card. `#1c6fb8` clears 4.5:1 on white while staying recognisably the same
hue.

**Recorded because it is a lesson about censuses, not about Frappe:** this was missed on
the first pass because the fixture body carried a `.btn-primary` and no bare `<a>`. It
surfaced only while tracing an unrelated ancestor chain. The same blind spot was then
reproduced *inside the regression test written to catch it* — that check passed with the
repair deleted, because its own fixture had no link either. A census is only as wide as
the body it renders.

---

## 5. `.text-muted` is a literal with `!important`, and it fails AA

`email.bundle.scss:248`:

```scss
.text-muted { color: $text-muted !important; }   // #7c7c7c
```

`#7c7c7c` on `#ffffff` measures **4.17:1** against AA's 4.5. It is applied to
`.email-footer-container` by `email_footer.html:1`, so **every email's footer fails**.

This is the third surface on which this exact literal has been measured failing: item 33
found the same `#7c7c7c` on the same class carrying 4.17:1 onto `/404`'s only link and
every portal row (`frappe-website.md` §5).

***Filing:*** `$text-muted` needs to be fitted against the surfaces it is used on, in
the web bundle and the email bundle alike. The `!important` should go with it — a
utility class does not need to beat everything, and it is what makes the value
unrepairable downstream.

---

## 6. The default email header title is the last installed app

`get_header()` (`email_body.py:655-678`) falls back to:

```python
frappe.get_hooks("app_title")[-1]
```

Measured on this site, where `app_title` resolves to
`['Frappe Framework', 'ERPNext', 'Bunood Theme', 'Telephony']`:

```
get_header([None, "blue"])  →  …<h1 class="email-header-title">…<span>Telephony</span></h1>…
```

The branding of these emails therefore changes whenever an app is installed, to the name
of whichever one sorts last. Callers that reach this path include
`notification_log.py:145`, `backups.py:113` and `twofactor.py:366`.

***Filing:*** resolve the site's own name — Website Settings' `app_name`, then System
Settings' — before falling back to a hook, and prefer `[0]` over `[-1]` if a hook value
is used at all.

---

## 7. `get_formatted_html` crashed when a site had no outgoing Email Account — resolved in 16.31

`email_body.py:419`:

```python
email_account = email_account or EmailAccount.find_outgoing(match_by_email=sender)
```

On 16.27, `find_outgoing` returned `None` and `get_brand_logo` then dereferenced it
unconditionally:

```python
"brand_logo": get_brand_logo(email_account) if with_container or header else None,
```

Reproduced on this site (zero accounts with `enable_outgoing`):

```
AttributeError: 'NoneType' object has no attribute 'get'
```

The crash appeared only for emails asking for a container or header. Bunood's preview
temporarily supplied a synthetic account to keep that common setup state usable.

**Rechecked on Frappe 16.31.0 (2026-08-27): fixed.** The stock formatter now returns a
complete message with `with_container=True` and no outgoing Email Account. Bunood removed
its synthetic account and the smoke gate now requires the upstream path to remain safe.

---

## Not filed, and why

- **The unreachable brand-logo fallback.** `standard.html:21` reads
  `src="{{ brand_logo or '/assets/frappe/images/frappe-framework-logo.svg' }}"`, but line
  16 already gates the whole block on `{% if brand_logo %}` — so the fallback can never
  render. Harmless dead code; not worth a filing on its own, and it disappears for anyone
  who overrides the template.
- **`preview_email.js:1-35`** does `html.replace(/embed=/, "src=")` with no `g` flag, so
  only the first occurrence is rewritten. It affects a desk preview dialog, not delivered
  mail, and no caller has been found where the second occurrence matters.
- **Newsletter.** The DocType does not exist in v16 — extracted to a separate app — yet
  `email_queue.py:714-719` still special-cases `reference_doctype == "Newsletter"` and
  `frappe/email/email.md` still documents a `doctype/newsletter` directory. Stale rather
  than broken.

---

## A measurement trap, recorded for the next person

**A string match on rendered email HTML proves less than it appears to.** The check for
whether `raw_html=True` bypasses the wrapper was written as `"body-table" in html` and
`"email-footer-container" in html`, and **returned true for both** — which reads exactly
like "the wrapper reaches raw_html after all". It does not. Both strings occur inside the
`<style>` block Premailer preserves (`.body-table.with-container .body-content`,
`.email-footer-container > div:not(:last-child)`), never as an element.

Anything asking whether an element is present must parse the DOM. The same applies to
colour: a rendered email's `<style>` block contains plenty of hexes that reach nothing.
