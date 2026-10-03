# Upstream issue draft — the datatable has physical, RTL-hostile positioning that no app can reach

**Target:** `frappe/frappe` (and its vendored `frappe-datatable`) · **Not filed
yet.** Filing is an outward action; this draft exists so doing it is a paste, not
a reconstruction. Unlike the `is_rtl()` defect (see `frappe-datatable-rtl`'s
sibling `frappe-is-rtl.md`), `bunood_theme` carries **no local fix** for these:
every one is either an `!important` physical override (and `!important` is
sanctioned in exactly two places in this theme, neither of them a datatable
override) or a JS-set **inline** physical style, which only `!important` could
reach. Item 26 (the report/datatable kit) styles the datatable through logical
properties and tokens, but it cannot correct positioning it is forbidden to
out-specify. So these render on the wrong edge in every RTL desk, and the fix
belongs upstream.

---

**Title:** `frappe-datatable` positions the resize handle, the column dropdown
and the tree indent with PHYSICAL left/right — wrong edge in RTL, and one rule
overrides the library's own correct RTL handling

**Body:**

Three concrete cases, all on the same datatable, all measured on a `dir="rtl"`
desk (Arabic):

**1. The resize handle is forced to the physical right, defeating the library's
own RTL rule.** `frappe/public/scss/desk/frappe_datatable.scss:108-111`:

```scss
.dt-cell__resize-handle {
	right: -3px !important;
	left: unset !important;
}
```

`frappe-datatable` itself sets the handle on the correct **trailing** edge and
flips it under `[dir=rtl]`; this Frappe override pins it to the physical right
with `!important`, so in RTL the column-resize grab sits on the *leading* edge of
the next column instead of the trailing edge of its own. The fix is to drop the
override, or express it logically: `inset-inline-end: -3px; inset-inline-start:
unset;` (no `!important` needed once it is not fighting the library).

**2. The column dropdown and the inline field affordances use physical `right`.**
Same file: the datatable's Select control parks its icon at `right: 10px`
(`:43`), the filter input pads `padding-left: 8px` (`:130`), the tree toggle
spaces its label with `margin-left: 4px` (`:145`), and the row-action checkbox
with `margin-left: 10px` (`:180`). Each is a physical property that does not
mirror; the logical forms (`inset-inline-end`, `padding-inline-start`,
`margin-inline-start`) mirror for free.

**3. The tree indent is an INLINE, physical `padding-left`, set by JS.** On a
tree report (`/app/query-report/Trial Balance`) the node span renders as:

```html
<span class="dt-tree-node" style="padding-left: 0px">
```

The indent that expresses hierarchy is written inline by the datatable's
tree-node renderer as `padding-left`, so it (a) cannot be reached by any
stylesheet without `!important`, and (b) indents from the physical left in RTL,
where the tree should indent from the right. The renderer should write
`padding-inline-start` instead.

**Why an app cannot fix this:** case 1 is `!important`; cases 2 are out-specified
by the library's own selectors only with more `!important`; case 3 is inline.
A desk theme that refuses `!important` outside its two sanctioned uses, and
refuses to fork vendor DOM, has no lever here. This is upstream's to correct,
and correcting it is mechanical — physical → logical, one property at a time.
