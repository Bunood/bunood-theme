# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Per-site brand stylesheet generation.

WHAT
    Renders the customer's brand colours into a small CSS file, writes it atomically
    to the site's own ``public/files`` with a content-hashed filename, reaps older
    copies, and records the URL on Theme Settings for :mod:`bunood_theme.context` to
    inject.

WHY A FILE AND NOT A DYNAMIC ROUTE
    The stylesheet is render-blocking in ``<head>``. A dynamic route would make every
    desk page load wait on a synchronous Python request through gunicorn, and would
    return a 500 *on a stylesheet* whenever anything upstream failed. A static file is
    served by nginx with no Python involved and keeps working even if the database is
    down. This mirrors Frappe's own ``Website Theme``
    (``website/doctype/website_theme/website_theme.py:92-121``), which generates
    per-site CSS to the same location with the same hash-suffix strategy.

WHY THE FILENAME IS HASHED
    nginx in this deployment sets no ``Cache-Control`` on ``/files`` — only
    ``Last-Modified`` and ``ETag`` (verified by curl through the frontend). Browsers
    then apply RFC 9111 heuristic freshness, roughly ``(now - Last-Modified) / 10``.
    With a stable URL, a colour change would stay invisible to returning users for
    hours or days, with no revalidation request at all. A content hash makes the URL
    immutable, which turns the missing header from a hazard into a non-issue — and
    removes any need for the ``?v=N`` suffixes the previous version maintained by hand.

WHY ONLY ``--bnd-*`` TOKENS
    Frappe implements dark mode by remapping its OWN variable names under
    ``[data-theme="dark"]``. Both that and ``:root`` have specificity (0,1,0), so a
    later sheet setting e.g. ``--bg-color`` at ``:root`` wins in BOTH modes and
    silently kills dark mode. This file therefore emits only our namespaced tokens;
    ``_bridge.scss`` in the compiled bundle maps them onto Frappe's names inside
    correctly scoped blocks. See ARCHITECTURE.md sections 1 and 5.
"""

import os

import frappe

from bunood_theme import palette

#: Subdirectory under the site's ``public/files``. Kept in its own folder so reaping
#: can glob safely without touching user uploads.
BRAND_DIR = "bunood"

#: Filename stem; the content hash and ``.css`` are appended.
BRAND_STEM = "brand_"


def render_brand_css(settings=None) -> str:
    """Build the CSS text for the current Theme Settings.

    Emits four blocks, and the split matters:

    * ``:root`` — mode-independent tokens (the raw seeds, spacing, radii).
    * ``html[data-theme="light"]`` / ``html[data-theme="dark"]`` — the light and dark
      *derived* steps. Dark is SELECTED, not computed by lightening light: the
      customer may supply explicit dark seeds, and where they do not we derive from a
      dark surface rather than flipping the light values.
    * ``@media (prefers-color-scheme: dark) html[data-theme="automatic"]`` — the
      same dark values, for the mode Frappe accepts but ships no rules for.

    One seed produces a coherent scale for whatever colour a customer picks — the
    alternative, hand-authoring 12 steps per tenant, does not scale for a
    white-label product.

    CONTRAST IS GUARANTEED HERE, NOT HOPED FOR (checklist item 32). Before this,
    every surface was re-derived from the seed and nothing validated the result:
    a yellow seed measured 1.62:1 for white-on-brand, and the SHIPPED default was
    already failing at 4.27:1. :mod:`bunood_theme.palette` now fits each ink and
    fill to the surfaces the seed actually produces, so the ratios hold for any
    colour a tenant enters. Values are emitted as concrete hex rather than live
    ``color-mix()`` for exactly that reason: what CI measured and what the browser
    paints are then the same string.

    Args:
        settings: an optional pre-fetched Theme Settings document, to avoid a second
            read when the caller already has it (e.g. from ``on_update``).

    Returns:
        The stylesheet as a string. Never raises; falls back to shipped defaults.
    """
    s = settings or frappe.get_single("Theme Settings")

    brand = (getattr(s, "brand_color", None) or "#4d8756").strip()
    accent = (getattr(s, "accent_color", None) or "#4463f0").strip()
    # Empty dark seeds fall back to the light ones. That is deliberate: a customer who
    # has not thought about dark mode still gets a coherent (if less tuned) result,
    # rather than an unthemed one.
    brand_dark = (getattr(s, "brand_color_dark", None) or brand).strip()
    accent_dark = (getattr(s, "accent_color_dark", None) or accent).strip()

    # Site-default density (decision "G with C"). Emitted at :root, which the
    # per-user attribute blocks in _tokens.scss deliberately outrank at (0,1,1)
    # vs (0,1,0) — so this sets the default without ever fighting a user's own
    # choice. Only the Compact values are emitted: Comfortable is already the
    # compiled bundle's :root default, and re-stating it here would only add
    # bytes to every site's brand sheet. NO font tokens belong here, ever —
    # compact changes geometry, not readability.
    density = ""
    if (getattr(s, "default_density", None) or "").strip().lower() == "compact":
        density = """
  --bnd-row-h: 24px;
  --bnd-control-h: 26px;
  --bnd-pad-y: 3px;"""

    # Every seed-dependent value comes from palette.derive — the SAME function
    # tools/contrast_gate.py measures in CI. This file formats; it does not
    # decide. A colour computed here and merely checked there would be a check on
    # a copy, and the copy is what would drift.
    #
    # A bad seed degrades to the compiled bundle's defaults rather than to an
    # illegible desk: derive() raises only when no fill can satisfy both
    # constraints, write_brand_css catches, and context.py appends nothing.
    try:
        light = palette.derive(brand, accent, "light")
        dark = palette.derive(brand_dark, accent_dark, "dark")
    except ValueError:
        frappe.log_error("bunood_theme.brand: seed rejected by palette.derive")
        raise

    def block(tokens: dict, indent: str = "  ") -> str:
        # Sorted, so a colour change produces a diff of the values that changed
        # rather than a reshuffle. The file is regenerated wholesale on every
        # save; stable ordering is what makes it readable when debugging one.
        return "\n".join(f"{indent}{k}: {v};" for k, v in sorted(tokens.items()))

    # The whole sheet is @media screen — deliberately. This file loads AFTER the
    # compiled bundle and its mode blocks tie the bundle's selectors at (0,1,1),
    # so later-sheet-wins would let a dark brand value beat the bundle's
    # @media print force-light override (measured live 2026-07-30: --bg-color
    # stayed dark in print emulation until this wrapper existed). Brand colour
    # is a screen concern; on paper the bundle's print block owns every token
    # unopposed, with no !important anywhere.
    #
    # The `automatic` block is emitted too, and that is not decoration. Frappe
    # accepts "Automatic" for User.desk_theme and ships no prefers-color-scheme
    # rules at all; _tokens.scss supplies the fallback, but without this block a
    # tenant's own colours would stop at the mode boundary and an Automatic user
    # on a dark OS would see the SHIPPED green rather than theirs.
    return f"""@media screen {{
:root {{
  --bnd-brand:  {brand};
  --bnd-accent: {accent};{density}
}}
html[data-theme="light"], html:not([data-theme]) {{
{block(light)}
}}
html[data-theme="dark"] {{
{block(dark)}
}}
@media (prefers-color-scheme: dark) {{
  html[data-theme="automatic"] {{
{block(dark, "    ")}
  }}
}}
}}
"""


def write_brand_css(settings=None) -> str | None:
    """Generate, write and register the brand stylesheet. Returns its URL or ``None``.

    Called from ``Theme Settings.on_update`` (so a save takes effect immediately) and
    from ``after_migrate`` (so a database-only restore, which leaves a stale or absent
    file, self-heals).

    The write is atomic — temp file plus :func:`os.replace` — because the file is being
    served by nginx while we rewrite it, and a partially written stylesheet would be
    handed to a live browser.

    Returns:
        The public URL (``/files/bunood/brand_<hash>.css``), or ``None`` if generation
        failed. A ``None`` result is safe: :mod:`bunood_theme.context` simply appends
        nothing and the compiled bundle's own defaults apply, which is why that bundle
        must always declare the complete token set.
    """
    try:
        css = render_brand_css(settings)

        # Hash the CONTENT, so an unchanged save keeps the same URL and warm caches
        # stay warm. 8 hex chars is what Frappe's own Website Theme uses.
        digest = frappe.generate_hash(css, 8)
        filename = f"{BRAND_STEM}{digest}.css"

        folder = os.path.join(frappe.get_site_path("public", "files"), BRAND_DIR)
        os.makedirs(folder, exist_ok=True)
        target = os.path.join(folder, filename)

        if not os.path.exists(target):
            tmp = target + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(css)
            os.replace(tmp, target)  # atomic on the same filesystem

        _reap_old(folder, keep=filename)

        url = f"/files/{BRAND_DIR}/{filename}"
        # set_value, not doc.save(): saving inside on_update would recurse, and this
        # field is derived state the user never edits.
        #
        # update_modified=False is LOAD-BEARING: this runs inside on_update,
        # AFTER the save stamped `modified` — letting this write bump it again
        # leaves every open form instantly stale, and the user's next save
        # dies with TimestampMismatchError ("modified after you have opened
        # it" — reported live 2026-07-30). Skipping the unchanged case also
        # spares a pointless write on every save.
        if frappe.db.get_single_value("Theme Settings", "brand_css_url") != url:
            frappe.db.set_single_value(
                "Theme Settings", "brand_css_url", url, update_modified=False
            )
        return url

    except Exception:
        frappe.log_error("bunood_theme.brand.write_brand_css failed")
        return None


#: How many superseded brand files to keep. Generous on purpose: a file is a
#: couple of KB, and every file deleted too early is a desk that loses its
#: colours mid-session.
REAP_KEEP = 8


def _reap_old(folder: str, keep: str) -> None:
    """Delete old brand files, keeping ``keep`` plus the ``REAP_KEEP`` newest.

    Old hashed files are left behind by every colour change. They are unbounded,
    so they are pruned here rather than by a scheduled job — but NOT to one.
    Keeping only the current file guaranteed a 404 for every holder of an older
    URL, and both holders are real, measured 2026-08-08:

    * An OPEN TAB. Its ``<link>`` was rendered before the colour change; the
      desk is an SPA, so that head element lives for the whole session, and its
      next revalidation answered 404-as-HTML — "Refused to apply style ...
      MIME type ('text/html')", and a desk with no brand colours. This was
      HANDOVER's "open tab loses brand colours" item.
    * A DATABASE-ONLY RESTORE. The smoke suite and the settings sweep snapshot
      ``tabSingles`` and write it back raw, which restores ``brand_css_url``
      pointing at a hash whose file the sweep's own saves had reaped. The
      stored URL and the disk then disagree until something calls
      :func:`write_brand_css` again — found as a stale-brand-CSS console error
      the suite had been allowlisting rather than explaining.

    A window of eight outlives both: tabs get a working stylesheet for the
    last several changes, and a restore lands on a URL whose file still
    exists. Deliberately tolerant: a failure to delete must never fail the
    save.
    """
    try:
        candidates = []
        for name in os.listdir(folder):
            if name.startswith(BRAND_STEM) and name.endswith(".css") and name != keep:
                path = os.path.join(folder, name)
                try:
                    candidates.append((os.path.getmtime(path), path))
                except OSError:
                    pass
        candidates.sort(reverse=True)
        for _, path in candidates[REAP_KEEP:]:
            try:
                os.remove(path)
            except OSError:
                pass
    except OSError:
        pass
