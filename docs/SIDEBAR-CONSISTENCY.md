# Canonical sidebar

The desk has one sidebar component across workspaces, lists, reports and forms.
Routes may supply different workspace names, sections, destinations, badges and
permissions; they do not select different sidebar geometry or styling.

## Visual contract

| Part | Standard |
|---|---|
| Pane | Attached, 264 px, neutral brand-tinted surface |
| Workspace switcher | 48 px raised control with a 32 px icon tile |
| Destination row | 40 px high, 30 px icon box, 19 px glyph |
| Current destination | Soft brand surface with a solid brand icon tile |
| Sections | Plain groups with quiet uppercase dividers; no colored cards |
| Footer | One raised utility dock using 36 px cells |
| Responsive behavior | Same component in Frappe's native mobile drawer |

Hover, current, focus and collapsed states are part of the component and do not
vary by route. Icons use Frappe sprites or validated workspace assets through the
same `smart` icon source. Active icons always use the fitted on-brand color.

## Runtime ownership

`apply_sidebar_attrs()` stamps `data-bnd-sb-standard` and the canonical visual
axes before Frappe renders the pane. Stored historical appearance values are
accepted for migration, but they cannot make a form or workspace render a
different sidebar. Functional preferences such as visibility, filtering and
badges remain independent.

The fixed top bar is the primary Bunood identity owner. The pane mounts a Bunood
fallback only when that top-bar control is not visible. The workspace switcher
then becomes the first normal sidebar control and remains the sole owner of the
workspace menu. As soon as the visible top-bar brand mounts, it claims identity
ownership and suppresses the vendor `workspace / app` row; it does not wait for
the sidebar workspace switcher to finish mounting.

## Accessibility

- The pane is a labelled navigation landmark.
- Current destinations use `aria-current="page"`.
- Workspace switching exposes `aria-haspopup="menu"` and `aria-expanded`.
- All rows retain visible keyboard focus and text labels.
- Reduced-motion users receive no sidebar state transitions.
- RTL uses logical properties; no mirrored physical spacing is maintained.

Regression coverage lives in `tests/sidebar-rebuild.test.cjs`. After deploying a
new content-hashed bundle, reload existing desk tabs before judging the result.
