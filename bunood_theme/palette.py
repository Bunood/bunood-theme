# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The complete seed-dependent token set, derived once and consumed twice.

WHAT
    :func:`derive` takes the two colour seeds and a mode, and returns every token
    whose value depends on them: the six surfaces, the inks fitted to stay legible
    on those surfaces, and the fill/ink pairs for anything that puts text on a
    coloured background.

WHY THIS IS A SEPARATE MODULE FROM brand.py
    Two callers need identical answers and one of them cannot import Frappe:

    * ``brand.py`` formats the result into the per-site stylesheet, at runtime, on
      a server.
    * ``tools/contrast_gate.py`` measures the result in CI, on a machine with no
      site, no database and no Frappe.

    If the gate re-derived the tokens itself it would be validating its own copy
    of the design rather than the one that ships — a green check on code nobody
    runs. So the derivation lives here, importing nothing but :mod:`contrast`.

WHY THE INKS ARE DERIVED AND NOT JUST RE-STEPPED ONCE
    Every surface is a mix of the seed into white or into a dark base, so the
    surface's luminance moves with a colour the CUSTOMER picks. A fixed
    ``--bnd-ink-subtle`` therefore has no fixed contrast ratio; measured across
    eight plausible seeds it failed 4.5:1 in 96 of 96 placements, and
    ``--bnd-ink-muted`` failed in 21. No single hand-chosen value can fix that,
    because the thing it is measured against is not known until a tenant saves a
    form. Deriving is not gold-plating here — it is the only thing that can work.

WHY THE SEED IS NEVER REJECTED
    A tenant's brand colour is their identity, not a preference, and a settings
    form that refuses it produces a support ticket rather than an accessible desk.
    Mature systems all resolve this the same way: the seed contributes hue, the
    system controls lightness. Material 3 pins role pairs to fixed tones; Radix
    generates 12-step scales where the solid step and the text step are
    guaranteed against each other; Adobe Spectrum and IBM Carbon make you choose a
    ramp rather than a colour; Salesforce Lightning accepts anything and quietly
    corrects. We accept anything, correct, and say so on the form.
"""

from __future__ import annotations

from bunood_theme.contrast import (
    AA_NON_TEXT,
    AA_TEXT,
    fill_pair,
    fit_ink,
    parse_color,
    to_hex,
)

#: Design floor for the SECONDARY text ink, deliberately above the WCAG minimum.
#:
#: Fitting ``--bnd-ink-muted`` and ``--bnd-ink-subtle`` to the same 4.5:1 target
#: would land them within a few percent of each other and collapse a three-level
#: type hierarchy into two. 7:1 keeps muted clearly stronger than subtle while
#: leaving subtle at the accessible floor, so the ramp reads as
#: primary / secondary / tertiary and all three are legible. This number is a
#: design decision, NOT a WCAG requirement — 4.5 is the requirement.
INK_MUTED_TARGET = 7.0

#: How each surface is mixed. ``(token, seed_percent, base)``.
#:
#: These percentages are the theme's visual identity — the amount of brand that
#: bleeds into the chrome — and they are stated here ONCE. ``_tokens.scss``
#: declares the same ramp as static CSS for the case where the per-site sheet is
#: missing, and ``contrast_gate.py`` asserts the two agree for the shipped seed,
#: so the copy cannot drift unnoticed.
SURFACES_LIGHT = [
    ("--bnd-page", 4, "#ffffff"),
    ("--bnd-surface", 0, "#ffffff"),
    ("--bnd-raised", 2, "#ffffff"),
    ("--bnd-pane", 8, "#ffffff"),
    ("--bnd-hover", 7, "#ffffff"),
    ("--bnd-active", 14, "#ffffff"),
]
SURFACES_DARK = [
    ("--bnd-page", 6, "#101317"),
    ("--bnd-surface", 8, "#171a20"),
    ("--bnd-raised", 10, "#1b1f25"),
    ("--bnd-pane", 16, "#14171b"),
    ("--bnd-hover", 14, "#21252b"),
    ("--bnd-active", 22, "#181c21"),
]

#: The designed ink and signal values, before fitting. A seed that needs no
#: correction leaves every one of these exactly as authored.
BASE_LIGHT = {
    "--bnd-ink-muted": "#6b7280",
    "--bnd-ink-subtle": "#9aa1ab",
    "--bnd-good": "#1a7f45",
    "--bnd-warn": "#b06f00",
    "--bnd-serious": "#c2410c",
    "--bnd-critical": "#b42318",
}
BASE_DARK = {
    "--bnd-ink-muted": "#9aa1ab",
    "--bnd-ink-subtle": "#6b7280",
    "--bnd-good": "#4ac07d",
    "--bnd-warn": "#e0a33a",
    "--bnd-serious": "#f08a5d",
    "--bnd-critical": "#f2736a",
}

#: What each fitted token has to clear, and against what.
#:
#: The split is the WCAG one and nothing else: a token the stylesheet writes text
#: with needs 1.4.3's 4.5:1; a token it draws a dot, a badge fill or a focus ring
#: with needs 1.4.11's 3:1. Each entry was classified by reading the rules that
#: consume it, not by guessing from the name — ``--bnd-good`` looks like a text
#: colour and is only ever a 6px dot.
FITTED = [
    ("--bnd-ink-muted", INK_MUTED_TARGET, "secondary text"),
    ("--bnd-ink-subtle", AA_TEXT, "tertiary text"),
    ("--bnd-warn", AA_TEXT, "status segment text"),
    ("--bnd-critical", AA_TEXT, "status segment text, and the unread badge fill"),
    ("--bnd-good", AA_NON_TEXT, "connection dot"),
    ("--bnd-serious", AA_NON_TEXT, "sidebar badge fill"),
    ("--bnd-accent", AA_NON_TEXT, "focus ring"),
]


def mix(seed: str, percent: float, base: str) -> str:
    """``color-mix(in srgb, seed percent%, base)``, resolved to a concrete hex.

    Resolved rather than emitted as a live ``color-mix()`` so that what the gate
    measured and what the browser paints are the same string. A modelled function
    and a browser implementation agreeing today is not the same as them being the
    same value, and this removes the question.
    """
    a = parse_color(seed)
    b = parse_color(base)
    w = percent / 100.0
    return to_hex(tuple(a[i] * w + b[i] * (1 - w) for i in range(3)))


def derive(brand: str, accent: str, mode: str) -> dict[str, str]:
    """Every seed-dependent token for one mode.

    Args:
        brand: the brand seed, any form :func:`contrast.parse_color` accepts.
        accent: the accent seed.
        mode: ``"light"`` or ``"dark"``.

    Returns:
        Token name to concrete hex. Includes ``--bnd-brand``/``--bnd-accent``
        unchanged — the customer's exact colours, still used for washes and tints
        where nothing is read on top of them — plus the derived
        ``--bnd-brand-solid`` / ``--bnd-on-brand`` pair for the places where
        something is.
    """
    ramp = SURFACES_LIGHT if mode == "light" else SURFACES_DARK
    base = BASE_LIGHT if mode == "light" else BASE_DARK

    out: dict[str, str] = {"--bnd-brand": brand, "--bnd-accent": accent}
    for token, pct, white_or_dark in ramp:
        out[token] = mix(brand, pct, white_or_dark)

    surfaces = [out[t] for t, _, _ in ramp]

    # ── The brand fill ───────────────────────────────────────────────────────
    #
    # `--bnd-brand` itself is NOT re-toned. It stays the customer's exact colour
    # for the alpha washes and hue tints, which carry no text and sit under
    # nothing — a tenant who inspects the CSS finds the hex they pasted in.
    #
    # `--bnd-brand-solid` is the value used wherever the brand is painted as an
    # opaque fill: the dock's active tab, the sidebar's active item, the inbox
    # unread dot. It has to satisfy TWO constraints at once:
    #
    #   1. visible AGAINST the chrome (1.4.11, 3:1) — otherwise a brand-coloured
    #      dot on a brand-tinted pane is a dot nobody can see, which is precisely
    #      the failure mode of tinting every surface with the same seed;
    #   2. legible UNDER its label (1.4.3, 4.5:1) with `--bnd-on-brand`.
    #
    # Solved jointly, not one after the other — see fill_pair's docstring. In
    # dark mode the two constraints pull in opposite directions and no ordering
    # of two independent fits converges.
    out["--bnd-brand-solid"], out["--bnd-on-brand"], _ = fill_pair(
        brand, surfaces=surfaces
    )

    # `--bnd-brand-ink` is the third role, and it is NOT the same value as either
    # of the two above. The brand is written as TEXT in seven places — the
    # breadcrumb's current crumb, the dock's active label, the inbox's filter tab
    # and unread count, three sidebar rules — and text needs 4.5:1 against the
    # surface, where a fill only needs 3:1. Deriving one token for both roles
    # would force every brand-coloured chip to be as dark as brand-coloured text,
    # which is a visible cost for no benefit; deriving neither was the state
    # before this item, at 4.27:1 on white with the shipped seed.
    out["--bnd-brand-ink"], _ = fit_ink(brand, surfaces, target=AA_TEXT)

    for token, target, _why in FITTED:
        start = base.get(token, out.get(token, ""))
        out[token], _ = fit_ink(start, surfaces, target=target)

    # The badge's ink follows its fill, which the loop above may have moved. No
    # `surfaces` constraint is passed: `--bnd-critical` is fitted to 4.5:1
    # against every surface a line earlier, which already exceeds the 3:1 the
    # fill would need to be seen. Passing it again would be a second, weaker
    # constraint that can only be redundant.
    _, out["--bnd-on-critical"], _ = fill_pair(out["--bnd-critical"])
    return out


def adjustments(brand: str, accent: str) -> list[str]:
    """Human-readable notes on what had to move, for the settings form to show.

    Empty means the seeds were used exactly as chosen. Non-empty is not an error
    and must never be phrased as one: it is the theme reporting what it did so an
    administrator is not surprised by a colour that is one shade off the swatch
    they pasted in.

    Reported per mode, because a seed can be fine in light and need correction in
    dark — the surfaces differ, so the same colour is measured against different
    backgrounds.
    """
    notes = []
    for mode in ("light", "dark"):
        d = derive(brand, accent, mode)
        solid, ink = d["--bnd-brand-solid"], d["--bnd-on-brand"]
        where = "" if mode == "light" else " in dark mode"
        if solid.lower() != brand.lower():
            notes.append(
                f"Brand fills{where} use {solid} rather than {brand}, so their labels "
                f"stay readable and the fill stays visible against the chrome."
            )
        if ink.lower() != "#ffffff":
            notes.append(f"Labels on brand fills{where} are dark rather than white.")
        if d["--bnd-accent"].lower() != accent.lower():
            notes.append(
                f"The focus ring{where} uses {d['--bnd-accent']} rather than {accent}, "
                f"to stay visible on every surface."
            )
    return notes
