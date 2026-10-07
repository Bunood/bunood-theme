# Bunood form and dashboard handoff

The document summary sits beneath the native form tabs, before comments and
activity. It highlights parties, dates and amounts, repeats visible grid columns,
and puts the remaining entered fields under **All entered details**. ERPNext
still owns calculations, validation, saving and permissions. This is a review
view, not a second editor or a replacement print format. Unsaved edits are marked.

The summary follows the form style setting. **Original** leaves the native form
alone; the themed form styles show the summary. Passwords, hidden fields and
restricted controls are excluded. Conditional or privileged grid columns are
not copied. Rich text is reduced to inert text. Empty and unchecked values are
omitted. Very wide grids scroll inside the summary on a phone.

## Navigation and language

- **Home** returns to the Home workspace. The stock Home sidebar is reordered
  once so Home comes before Item; customized sidebar orders are preserved.
- **All Apps** opens Frappe's desktop app grid.
- **Website**, in the user menu, opens the public site (`/index`) in a new tab.
  It is separate from the ERP desk and does not change the active language.
- Public sign-in pages follow **System Settings → Language**. This branch
  intentionally ignores a visitor's preferred-language cookie on those pages.
- To change your language, open **User menu → My Profile → User Details →
  Language**, select Arabic or English, save, and reload. This is a per-user
  preference. The administrator can set the site default in **System Settings →
  Language**; explicit user preferences take precedence.
- **Theme Settings → Language & Fonts** selects the Arabic typeface; it does
  not switch the desk language. Newly supplied Arabic translations remain
  marked for editorial review in the PO catalogue.

## Defaults and native controls

The Sales Invoice due-date default is **Today** only when no existing default or
Property Setter owns the field. ERPNext can still recalculate it from customer
payment terms. The invoice sidebar remains accessible through the native
**Toggle Sidebar** action for attachments, assignments and sharing.

Riyal amounts use the site's currency record and the existing vector font glyph.
The dashboard now follows the same symbol and placement as forms and reports.
For this site, a riyal sign follows the amount. A custom currency symbol is left
alone; explicitly returning this exact glyph to the leading position will be
normalized on the next migration.

Tree selection, the uploader, timeline cards, POS containers and onboarding
panels use the shared theme tokens. The local POS page requires an Opening Entry
before exposing the sale screen; no accounting entry was created for styling
verification. Test POS transactions on a configured staging profile before
production use. Onboarding styling was checked against the installed source,
not a complete first-run onboarding flow.

The Split sign-in layout keeps at least 320px for its form at intermediate
screen widths. Styled filter controls also retain their hover feedback.

See [UPSTREAM-UPGRADES.md](UPSTREAM-UPGRADES.md) for the enforced compatibility
checks and the staging procedure for ERPNext/Frappe upgrades.
