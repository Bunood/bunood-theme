# Bunood system-state component

`window.bunood_theme.system_state.create(options)` is the single feedback
component for Bunood-owned surfaces. It owns semantic roles, live-region
priority, verified sprite fallbacks, responsive geometry, RTL behavior,
reduced motion and one optional primary recovery action. Controllers continue
to own requests, permissions, routing and contextual copy.

## Variants

| Variant | Use when | Role / announcement | Default icon |
|---|---|---|---|
| `loading` | A bounded request is in progress | `status`, polite, `aria-busy=true` | loader |
| `configured-empty` | Setup is valid but the current scope contains no records | `status`, polite | inbox |
| `setup-incomplete` | Required business configuration is missing | `status`, polite | settings |
| `permission-denied` | The user lacks an explicit required permission | `alert`, assertive | lock |
| `recoverable-error` | A request failed without changing user data | `alert`, assertive | alert circle |
| `offline-delayed-integration` | Core work remains available but realtime or an integration is delayed | `status`, polite | Wi-Fi off |

## API

| Property | Type | Default | Purpose |
|---|---|---|---|
| `kind` | variant string | `recoverable-error` | Selects semantics, tone and icon fallback |
| `title` | string | localized variant title | Short state heading |
| `message` | string | omitted | Context and consequence |
| `compact` | boolean | `false` | Inline state for lists and reports |
| `heading` | boolean | `false` | Uses an `h2` on page-level states |
| `className` | string | omitted | Surface placement hook only |
| `icons` | string array | variant icons | Ordered verified sprite candidates |
| `action` | object | omitted | Exactly one `{label, icon/icons, className, run}` recovery action |

The component disables its action and exposes `aria-busy` while an asynchronous
recovery is running. Rejections are consumed at the event boundary so they do
not create browser-level unhandled promise errors; the owning controller must
render the resulting state.

## Surface mapping

| Surface | State path |
|---|---|
| Role Home | Shared page-level `loading` and `recoverable-error` component |
| Lists | Native configured-empty presentation plus shared compact recoverable error; retry delegates to the exact live native refresh |
| Query reports | Native configured-empty presentation plus shared compact recoverable error; Review Filters and Retry retain native report semantics |
| Sales/Purchase workbench | Existing ZATCA setup, permission and integration states retain their domain controller and use labelled actions |
| Global chrome | Live-update delay carries a verified Wi-Fi-off icon, explicit text and realtime lifecycle state |

## Accessibility and behavior

- Keep titles concise and messages specific about what is still safe.
- Use only one primary recovery action. Put secondary navigation elsewhere.
- Do not show `permission-denied` for an empty result; permission must be known.
- Do not call a websocket delay “offline” when forms and HTTP requests work.
- Every action keeps a visible label; icons supplement rather than replace it.
- The component uses logical properties and stacks at the `sm` breakpoint.
- Loader rotation is removed when the user prefers reduced motion.

## Example

```js
const state = window.bunood_theme.system_state.create({
  kind: "recoverable-error",
  compact: true,
  title: __("Could not refresh this list"),
  message: __("Check your connection and try again."),
  action: { label: __("Retry"), icon: "icon-refresh-cw", run: refresh },
});
```
