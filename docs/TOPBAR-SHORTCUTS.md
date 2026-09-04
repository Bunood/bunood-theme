# Home and language shortcuts

The local site places the existing Home component in **Top Bar Start**, using
`home_placement`; it still routes to the Bunood Home workspace. This is a site
configuration change, not a new global default or a duplicate sidebar control.
The sidebar's brand button remains another route Home.

The top bar carries a compact language button beside its trailing controls.
It displays the target language's own name: العربية or English. The same action
is available in the profile menu when the responsive layout removes the top bar.
Only the target-name span has its own language/direction; the accessible label
uses the current UI language. Existing focus treatment and brand tokens apply.

Switching saves `language` on the signed-in User through native
`frappe.client.set_value`, with native permissions, locale updates and user-cache
invalidation. It reloads the current URL to obtain the matching translations and
RTL/LTR bundle. System Settings and other accounts are not changed. Unsaved
documents, including cached forms, block the action. A request failure leaves the
page in place, reports the problem and enables retry.

The language control belongs to the top bar and has no independent placement
setting. Its registered identity is `language` in `CHROME_ACTIONS`. Existing
search, notifications, profile and Home placement logic is unchanged.

Focused browser regressions cover real persistence/reload in both directions,
Home navigation, unsaved-edit safety, request failure, non-overlap and pointer
reachability at 800/1024/1440 pixels, keyboard focus, both themes and the mobile
profile-menu fallback. A transaction-only server probe additionally verifies that
a regular user can change their own language but cannot change Administrator.

The JS gzip ceiling increases from 108,000 to 109,000 bytes to accommodate this
requested action, native save/error handling and draft protection. No dependency
was added, and other payload ceilings and contrast thresholds are unchanged.
