# Upstream draft — three alternate-view gaps a theme cannot reach from CSS

**Target:** `frappe/frappe` (and its vendored `frappe-gantt` / `sortablejs`) ·
**Not filed yet.** Filing is an outward action; this draft exists so doing it is
a paste, not a reconstruction. Found while building item 27 (the alternate-views
surface kit — kanban, calendar, gantt, gallery). The kit themes all four views
through attributes, tokens and logical properties, and repairs everything it can
reach. These three it cannot: each is a **JS geometry option** or an **inline /
`!important` physical value**, and this theme sanctions `!important` in exactly
two places, neither of them a view override. They are recorded here, with the
theme's own honest workaround where one exists, so the reason is not
rediscovered.

---

## 1. `frappe-gantt` bar geometry is a JS construction option, so `density: compact` cannot reach it

**Body:** Every other surface in the desk shortens its rows when the user picks
`compact` density — the theme drives it from `--bnd-row-h` / `--bnd-control-h`
tokens (`_tokens.scss`). A gantt bar cannot follow, because its height, corner
radius and handle size are passed to the `Gantt` constructor as options, not
rendered from CSS:

`frappe/public/js/frappe/views/gantt/gantt_view.js` (measured):

```js
this.gantt = new Gantt(this.$result.get(0), this.tasks, {
    bar_height: 35,
    bar_corner_radius: 4,
    resize_handle_width: 8,
    // ...
});
```

`window.Gantt` is **not defined at desk boot** — `gantt_view.js` `frappe.require`s
the library lazily at route time — so unlike `frappe.Chart` (item 25) or
`frappe.views.Calendar.prototype.prepare_colors` (item 27), there is no boot-time
funnel a theme could wrap to inject a density-aware `bar_height`. A surface kit
mounts and injects nothing by definition, so it does not hook a lazily-loaded
constructor.

**Suggested fix:** read `bar_height` (and the handle sizes) from a CSS custom
property at construction — e.g. `getComputedStyle(document.documentElement)
.getPropertyValue("--gantt-bar-height")` with the current literal as the
fallback — so a theme can set the row rhythm the same way it sets every other
surface's.

**Workaround in this theme:** none. The gantt keeps its 35px bar in every
density. Recorded, not closed.

---

## 2. `sortablejs`'s drag animation is a JS literal, deaf to `prefers-reduced-motion`

**Body:** The theme's motion contract is that **nothing hardcodes a duration** —
every transition reads `--bnd-dur-fast|base|slow`, which
`@media (prefers-reduced-motion: reduce)` zeroes, disabling all theme motion at
once. A build guard (`assertMotionPrimitive`) enforces it on compiled CSS. But
the kanban board's drag animation is a JS option inside Frappe's own bundle:

`frappe/public/js/frappe/views/kanban/kanban_board.bundle.js` (measured):

```js
new Sortable(this.$kanban_board.get(0), { group: "columns", animation: 150, /* ... */ });
Sortable.create(this.$kanban_cards.get(0), { group: "cards", animation: 150, /* ... */ });
```

`animation: 150` is a 150 ms tween Sortable runs in JS (transform on the moving
element), invisible to a CSS `prefers-reduced-motion` rule and to the theme's
guard. A user who has asked the OS for reduced motion still gets the 150 ms card
slide.

**Suggested fix:** gate the `animation` option on
`window.matchMedia("(prefers-reduced-motion: reduce)").matches` (0 when set), or
read it from a CSS custom property, so the reduced-motion preference reaches the
one desk animation that lives in JS.

**Workaround in this theme:** none — it is Frappe's own construction. Every
animation the theme itself writes honours the preference; this one it cannot.

---

## 3. `frappe-gantt` positions its SVG with physical `x` / `width`, so a gantt is wrong in RTL

**Body:** The same class as the datatable's RTL defect (see the sibling
`frappe-datatable-rtl.md`). frappe-gantt lays out its grid, bars and date axis
with physical SVG `x` and `width` attributes computed left-to-right in JS
(`node_modules/frappe-gantt/dist/frappe-gantt.js`), so on a `dir="rtl"` desk the
timeline still runs left-to-right and the whole chart reads against the page
direction. SVG attribute geometry is not reachable by CSS logical properties at
all — there is no `inset-inline-start` for an SVG `<rect x>`.

The other three views flip correctly: kanban is flexbox + logical properties,
the gallery is a CSS grid, and FullCalendar ships `.fc-direction-rtl` natively.
Only the gantt is physical.

**Suggested fix:** have frappe-gantt honour a `rtl` option (mirroring the x-axis
and the date scale), and have `gantt_view.js` pass it from `frappe.utils.is_rtl()`.

**Workaround in this theme:** none — it is the vendor's SVG geometry. Verified in
all four light/dark × LTR/RTL combinations per `GUIDELINES.md` §1.6: the gantt is
the one combination that does not flip, and it is upstream's to fix.
