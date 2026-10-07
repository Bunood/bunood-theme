# Upstream: overlays — what cannot be fixed from an app

Written 2026-08-19, during item 28. Platform measured: **frappe 16.27.0**
(`frappe/__init__.py`) — note the stack's image tag is `frappe/erpnext:v16.28.0`,
which is the *erpnext* release, not frappe's. Everything below was measured on a
running desk, not read off a changelog.

Siblings: `frappe-is-rtl.md` (item 7), `frappe-datatable-rtl.md` (item 26),
`frappe-gantt-geometry.md` (item 27).

---

## 1. Four toast status glyphs are literal `fill=` attributes — no CSS route

`frappe.show_alert` renders its indicator as `<use href="#icon-solid-error">`
into the inlined sprite, and the sprite's `<path>` carries a **presentation
attribute**:

| symbol | literal |
|---|---|
| `#icon-solid-success` | `fill="#68D391"` |
| `#icon-solid-error` | `fill="#F56B6B"` |
| `#icon-solid-info` | `fill="#318AD8"` (plus `opacity="0.8"`) |
| `#icon-solid-warning` | `fill="#D6932E"` |

Source: `frappe/public/icons/timeless/icons.svg:774,778,782,786`.

**Five CSS routes were tried and all five leave the rendered pixels
byte-identical** — `#icon-solid-error path`, `#icon-solid-error`, the outer
`svg.icon`, `svg.icon use`, each with `!important`. Only `filter` and `opacity`
on the outer `<svg>` change anything, and neither is a way to set a colour.

**Why it matters:** these four are the only colours in the toast a theme cannot
reach, so a re-hued palette leaves four vendor-coloured glyphs behind.

**The upstream fix:** paint them with `fill="currentColor"` (or a CSS custom
property) as the rest of the sprite does. Every other icon in the same file is
already `currentColor`-driven, which is why `--icon-stroke`/`--icon-fill` work
(item 23) — these four are the exception.

---

## 2. Two inline hex borders inside dialog bodies survive into dark

- `#d1d8dd` — `frappe/public/js/frappe/form/multi_select_dialog.js:147`
- `#bbb` — `frappe/public/js/frappe/request.js:567` (the error-report composer)

Both are written as inline `style` on the element, so they beat every
stylesheet rule; beating them needs `!important`, which this theme reserves for
two sanctioned places. Both are light greys and both are visibly wrong on a dark
dialog.

**The upstream fix:** move them into the stylesheet and read `--border-color`,
which those dialogs already inherit correctly.

---

## 3. The toast is physically positioned and does not mirror

`frappe/public/scss/desk/toast.scss` positions and decorates the alert entirely
with PHYSICAL PROPERTIES — the side is hardcoded even where the distance is a
variable, which is the part that matters — and frappe ships a **build-time rtlcss pass** rather
than logical properties, so the mirrored bundle only flips what rtlcss can see:

| rule | line | measured under `dir=rtl` |
|---|---|---|
| `#alert-container { right: 20px }` | 1-9 | **did not move** |
| `.desk-alert .close { right: var(--padding-md) }` | 73-76 | did not move |
| `.alert-message-container { padding-right: var(--padding-2xl) }` | 49-50 | did not move |
| `.alert-subtitle { padding-left: 34px }` | 68 | indent ends up on the wrong side |
| `.icon { margin-right: var(--margin-sm) }` | 53 | did not move |
| `@keyframes backInRight` / `backOutRight` | 120-150 | **animation-name unchanged in RTL**; translates +2000px on X, so the toast flies in from and out to the physical right in both directions |

The theme repairs the *container's* inset (item 28, `_overlays.scss`) by setting
**both** logical sides — one to a value, one to `auto` — because a rule that sets
only one lands on the same physical side as the vendor's flipped rule in one
direction and the opposite in the other, and physical and logical declarations
do not overwrite each other. The internals and the keyframes are left alone:
re-authoring a vendor's animation from an app is not a repair, it is a fork.

**The upstream fix:** logical properties throughout `toast.scss`, and a
direction-aware entry animation (or a `translateX` driven by a custom property
the RTL pass can flip).

---

## 4. `[data-theme="dark"] .modal, .form-in-grid` shadows any app's border token

`frappe/public/scss/desk/dark.scss:189-193`:

```scss
[data-theme="dark"] {
  .modal, .form-in-grid { --control-bg: var(--gray-800); --border-color: var(--gray-800); }
}
```

That selector is **(0,2,0)**. An app that maps Frappe's variables the documented
way — inside `html[data-theme="dark"]`, which is **(0,1,1)** — loses inside every
dialog and every grid-row editor. Measured: `--border-color` resolves `#232323`
where `<html>` says `#2A3B35`, so the dialog header draws a **1.02:1** line (i.e.
none) and every control inside loses its fill delta.

This is not a bug in the values; it is that a *theming hook* is overridden at a
higher specificity than the hook itself. Any app themeing the desk has to
discover this and out-specify it.

**The upstream fix:** set those two variables at the same level the rest of dark
mode sets them (`[data-theme="dark"]` on the root), or drop the block — the
values it writes are the same ones the root already provides.

---

## 5. Status dots in dark are the pill wash, not an ink

`dark.scss:264-270` re-points every `--indicator-dot-*` to the matching
`--bg-*` — the dark background a pill is filled with. Measured on a real
msgprint, **ten of the twelve hues fail the 3:1 non-text floor** and eight are
effectively invisible (red 6.31:1 in light → **1.02:1** in dark). The
`.indicator-pill` variant flips correctly; only the bare `::before` dot is wrong.

Item 28 repairs this **by fitting the hues rather than borrowing them**, and the
two-step is worth recording because the first step looked finished and was not.

*First attempt:* point the dot back at `--text-on-*`, the var the light-mode base
rule already uses. That cleared the floor everywhere — all twelve ≥ 3:1, worst
5.59. But four hues (`cyan`, `yellow`, `pink`, `purple`) resolve in dark to
near-whites (`#e0f8ff`, `#fffcef`, `#feeef8`, `#f9f0ff`), and the worst pairwise
CIEDE2000 across the whole set measured **0.83** — below the ~2.3
just-noticeable difference. Twelve dots that are all visible and several
indistinguishable is not a status palette.

*Shipped:* `palette.status_ramp()` re-tones each of Frappe's own twelve hues for
the dark ground, fitted to 3:1 against the worst surface a dot lands on, with the
two "lighter sibling" names (`darkgrey`, `light-blue`) lifted to a second stop so
they stay tellable from `gray` and `blue`. Worst pairwise separation **3.58** in
dark, **4.28** in light, gated by `npm run contrast` — which now measures the
dots' contrast on three grounds *and* their mutual separation against a floor of
3.0. That floor was set from the two measurements, not from taste: it fails the
borrowed set at 0.83 and passes the fitted one, and the guard was negative-tested
against both.

**What is still upstream's to fix:** none of this should be an app's job. Frappe
ships twelve status names with fixed meanings and a dark mode that re-points them
to fills; the app can only re-tone what it is given.

**The upstream fix:** a dark-mode status ramp fitted for legibility *and* mutual
separation, the way a categorical palette is fitted — which is what
`palette.status_ramp()` does, and could be lifted almost verbatim.

---

## 6. Recorded so it is not rediscovered: the two cascade surprises

Item 27 recorded the PhotoSwipe cascade fact in a **plan file outside the
repo**, and item 28 duly rediscovered it at the cost of a verification pass. So
both facts live here, in a file that ships:

- **PhotoSwipe (5.4.3) loads at route time and lands AFTER the app's sheet.**
  `image_view.js:181` returns it from `required_libs`, and `assets.js:39-46`
  `document.head.appendChild`s the `<link>`. Measured on `/desk/item/view/image`:
  photoswipe's sheet at index 12, ours at 3. So its rules must be beaten on
  **specificity, never order**. It declares its whole `--pswp-*` palette on a
  bare `.pswp` (0,1,0), so `html[data-theme] .pswp` (0,2,1) wins.
  Also measured: frappe's own eight `.pswp*` rules are **all inert** — five need
  a `.pswp--svg` ancestor that v5 never emits, and `.pswp__more-item(s)` are
  frappe's own invented classes that no code ever creates.
- **FullCalendar inserts its `<style>` FIRST, not last.** `registerStylesRoot()`
  in `@fullcalendar/core/internal-common.js` `insertBefore`s the first
  `script`/`link`/`style` in `<head>`. So "runtime-injected therefore last" is
  **false** for this vendor and true for PhotoSwipe — the two cannot be reasoned
  about together.

---

## Not filed, and why

**The lightbox chrome is reachable and deliberately left alone.** PhotoSwipe's
`--pswp-bg: #000` and its white icons are correct on both light and dark desks —
a full-screen media viewer wants a black ground regardless of theme. Measured,
not assumed; recorded here so the next reader knows it was considered.

**Popper's inline geometry is not a defect.** `transform`/`top`/`left` written
inline on an open dropdown or popover is how a positioning engine works. Paint is
reachable; position is not ours.
