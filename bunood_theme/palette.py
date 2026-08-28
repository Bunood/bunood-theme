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
    luminance,
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


#: The chart SERIES palette — a categorical ramp, and deliberately NOT the
#: ``--bnd-cat-*`` hues.
#:
#: WHY A SEPARATE FAMILY. The categorical hues carry a hard contract
#: (``_tokens.scss``): assign once per entity, NEVER cycle by index — a module
#: keeps its hue however the list is sorted or filtered. A chart series index is
#: exactly an index cycle: filter one series out and every later series would
#: shift hue. Reusing ``--bnd-cat-*`` would break the one rule they exist to keep.
#: Measured, they do not qualify as a series ramp anyway — three of the seven fail
#: 3:1 on a white chart card, and their worst-pair colour-vision separation is
#: ~4.6, below the floor the gate enforces on this ramp.
#:
#: WHY THESE HUES. Paul Tol's "muted" qualitative scheme — designed for data
#: visualisation and published colour-vision-safe. We keep his hue relationships,
#: which are the CVD-safe part, and fit only LIGHTNESS per mode (below). Chosen
#: over a from-scratch optimiser because a proven, harmonious scheme is a better
#: default than a set of numbers no designer signed off, and it survives the
#: separation gate with margin in both modes.
#:
#: BRAND-INDEPENDENT ON PURPOSE. Unlike the inks, this does not move with the
#: seed: series 1 is the same colour on every site, so screenshots, docs and
#: muscle memory transfer. The fit therefore targets the worst-case chart surface
#: across ALL seeds — see :func:`_chart_binding_bg`.
SERIES_HUES = ["#CC6677", "#332288", "#DDCC77", "#117733", "#88CCEE", "#882255", "#44AA99"]

#: The surfaces a chart mark actually sits on: the tile (``--bnd-surface``), a
#: raised tile (Soft Tiles → ``--bnd-raised``) or the canvas (Open Board's
#: transparent tiles → ``--bnd-page``). Never the hover/active states.
_CHART_SURFACE_TOKENS = ("--bnd-page", "--bnd-surface", "--bnd-raised")


def _chart_binding_bg(mode: str) -> str:
    """The single hardest chart surface for a mark's 3:1, across every seed.

    A light mark is dark-on-light, so the binding surface is the DARKEST a chart
    sits on — which occurs at the darkest possible seed; clear 3:1 there and every
    lighter surface passes too. A dark mark is light-on-dark, so it is the
    LIGHTEST, at the brightest seed. Computed straight from the surface mix
    formulas at the extreme seed, because :func:`series_ramp` is called from
    :func:`derive` and must not recurse into it.
    """
    ramp = SURFACES_LIGHT if mode == "light" else SURFACES_DARK
    extreme = "#000000" if mode == "light" else "#ffffff"
    cands = [mix(extreme, pct, base) for tok, pct, base in ramp if tok in _CHART_SURFACE_TOKENS]
    key = lambda hx: luminance(parse_color(hx))
    return min(cands, key=key) if mode == "light" else max(cands, key=key)


def series_ramp(mode: str) -> dict[str, str]:
    """The chart series palette for one mode: ``--bnd-series-1..7`` plus ``-other``.

    Each hue is fit for 3:1 (1.4.11) against the worst-case chart surface; the
    ``-other`` overflow/"Rest" slot is a fitted neutral grey, distinct from the
    seven by having no chroma at all. Brand-independent — see :data:`SERIES_HUES`.
    """
    bg = _chart_binding_bg(mode)
    out: dict[str, str] = {}
    for i, hue in enumerate(SERIES_HUES, 1):
        out[f"--bnd-series-{i}"], _ = fit_ink(hue, [bg], target=AA_NON_TEXT)
    out["--bnd-series-other"], _ = fit_ink("#808080", [bg], target=AA_NON_TEXT)
    return out


#: Frappe's twelve indicator names, and the hue each one MEANS.
#:
#: The values are Frappe's own light-mode dot colours, read off a rendered
#: `.indicator` (`common/indicator.scss` resolves `--indicator-dot-<c>` to
#: `--text-on-<c>`). They are the designed hues; this table does not invent a
#: palette, it re-tones the existing one for a dark ground.
#:
#: WHY A RAMP AT ALL. `desk/dark.scss:264` re-points every dot to the matching
#: `--bg-*` — the dark wash a PILL is filled with, not an ink — and ten of the
#: twelve then fail the 3:1 non-text floor, eight of them invisibly. Item 28
#: first repaired that by pointing the dot back at `--text-on-*`, which cleared
#: the floor everywhere (worst 5.59) but left four hues resolving to
#: near-whites: legible, and no longer telling the reader WHICH status it is.
#: A status mark that cannot be identified has lost the thing it exists for, so
#: the hue is fitted instead of borrowed.
#:
#: BRAND-INDEPENDENT, exactly like SERIES_HUES: a red dot is the same red on
#: every site. That is what lets one static block in `_tokens.scss` satisfy
#: `check_defaults_agree` for all eleven gate seeds.
STATUS_HUES = {
    "green": "#16794c",
    "cyan": "#267a94",
    "blue": "#0070cc",
    "orange": "#bd3e0c",
    "yellow": "#ab6e05",
    "gray": "#525252",
    "grey": "#525252",
    "red": "#b52a2a",
    "pink": "#9c2671",
    "darkgrey": "#383838",
    "purple": "#6e399d",
    "light-blue": "#007be0",
}

#: The names that are deliberately a LIGHTER sibling of another name rather than
#: a hue of their own, and the floor that separates them.
#:
#: `gray`/`grey` are the same colour under two spellings and must stay identical.
#: `darkgrey` and `light-blue` are different: Frappe offers them ALONGSIDE
#: `gray` and `blue`, so they have to be tellable apart — but on a dark ground a
#: "darkgrey" dot cannot be darker, it has to be lighter to be seen at all. So
#: the sibling is fitted to a higher target, which separates it in the only
#: direction available. 7:1 is the AAA text ratio, used here purely as a
#: convenient second stop well clear of 3:1.
STATUS_SIBLING_TARGET = 7.0
STATUS_SIBLINGS = ("darkgrey", "light-blue")


def _status_binding_bg(mode: str) -> str:
    """The single hardest surface an indicator dot sits on, across every seed.

    NOT ``_chart_binding_bg``. That one deliberately covers three surfaces and
    says so — "never the hover/active states" — because a chart mark lives on a
    tile. A status dot does not: it sits in a LIST ROW, which hovers; in a
    sidebar card on ``--bnd-pane``; and in a selected row on ``--bnd-active``.
    The item-28 release review measured ten of the twelve dots below 3:1 on
    those three grounds in dark while the gate reported green, because the ramp
    had borrowed the chart's narrower set. So this walks all six.

    Same extreme-seed reasoning as the chart version: a dark mark is
    light-on-dark, so the binding surface is the LIGHTEST it ever lands on,
    which occurs at the brightest seed. Computed from the surface formulas
    directly, because :func:`status_ramp` is called from :func:`derive` and must
    not recurse into it.
    """
    ramp = SURFACES_LIGHT if mode == "light" else SURFACES_DARK
    extreme = "#000000" if mode == "light" else "#ffffff"
    cands = [mix(extreme, pct, base) for _tok, pct, base in ramp]
    key = lambda hx: luminance(parse_color(hx))
    return min(cands, key=key) if mode == "light" else max(cands, key=key)


def status_ramp(mode: str) -> dict[str, str]:
    """The indicator-dot palette for one mode: ``--bnd-status-<name>`` x 12.

    Each hue is fitted for 3:1 (SC 1.4.11) against the worst surface a dot sits
    on, keeping its identity — a fitted red is still red, where a borrowed
    near-white is not. Brand-independent; see :data:`STATUS_HUES`.
    """
    bg = _status_binding_bg(mode)
    out: dict[str, str] = {}
    for name, hue in STATUS_HUES.items():
        # THE SIBLING LIFT IS DARK-ONLY, and that is not a shortcut. In light the
        # fit moves a colour DARKER, which is the direction the sibling names
        # already point (`darkgrey` #383838 is darker than `gray` #525252), so
        # they separate on their own and every one of the twelve already clears
        # the floor unchanged. Applying it in light instead did the opposite of
        # what the name says — it fitted `light-blue` to #00549a, DARKER than
        # `blue`. A rule that inverts a colour's own name is worse than no rule.
        sibling = mode == "dark" and name in STATUS_SIBLINGS
        target = STATUS_SIBLING_TARGET if sibling else AA_NON_TEXT
        out[f"--bnd-status-{name}"], _ = fit_ink(hue, [bg], target=target)
    return out


def derive(brand: str, accent: str, mode: str, ground: str | None = None) -> dict[str, str]:
    """Every seed-dependent token for one mode.

    Args:
        brand: the brand seed, any form :func:`contrast.parse_color` accepts.
        accent: the accent seed.
        mode: ``"light"`` or ``"dark"``.
        ground: what the SURFACES are mixed from. ``None`` means the brand, which is
            the behaviour every caller had before item 37 and what ``_tokens.scss`` is
            a static copy of — so the default must stay bit-exact.

            IT IS A COLOUR AND NOT AN AMOUNT, and that is the whole design. The
            obvious axis ("how much brand bleeds in") has a neutral pole at 0%, which
            collapses page, surface, raised, pane and active onto ``#ffffff``: one flat
            white with no delta anywhere. Item 31's rule — *a pole may not take the
            slot's fill away* — refuses that. Mixing a NEUTRAL hue at the same
            percentages keeps every separation (measured 5-6 channels light, 10-11
            dark) while taking the brand out of the chrome, which is what a tenant
            asking for "a grey desk with a green brand" actually wants.

            Only the surfaces move. ``--bnd-brand`` stays the customer's exact colour,
            and the fill / ink / ring are still fitted for the BRAND against whatever
            surfaces the ground produced — so legibility is re-solved, not assumed.

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
    # The surfaces mix the GROUND; everything read on top of them still fits the BRAND.
    surface_seed = ground or brand
    for token, pct, white_or_dark in ramp:
        out[token] = mix(surface_seed, pct, white_or_dark)

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

    # The chart series palette. Brand-independent, so its values are identical for
    # every seed — which is exactly why one static block in `_tokens.scss` can
    # satisfy `check_defaults_agree` for all of them.
    out.update(series_ramp(mode))
    # The indicator-dot ramp (item 28). Emitted from derive() for the same reason
    # the series ramp is: that is what makes `check_defaults_agree` gate it, so
    # the static block in _tokens.scss and this function can never drift apart.
    out.update(status_ramp(mode))
    return out


def adjustments(brand: str, accent: str) -> list[dict]:
    """What had to move, as FACTS rather than prose.

    Empty means the seeds were used exactly as chosen. Non-empty is not an error
    and must never be phrased as one: it is the theme reporting what it did so an
    administrator is not surprised by a colour that is one shade off the swatch
    they pasted in.

    Reported per mode, because a seed can be fine in light and need correction in
    dark — the surfaces differ, so the same colour is measured against different
    backgrounds.

    WHY THIS RETURNS DICTS AND NOT SENTENCES
        It used to build English f-strings here, and the caller glued them to a
        translated prefix. That was broken twice over. An f-string is invisible
        to every message extractor — Frappe's needs a literal — so the notes
        could never be translated at all, while the translated prefix made the
        message LOOK covered to any gate that checked. And the sentences were
        assembled from a fragment (`" in dark mode"` spliced mid-clause), which
        no language with different word order can render correctly even once
        someone does translate it.

        So this module reports what it measured and stops. The wording, and the
        `_()` calls that make it translatable, belong to the surface that shows
        it — see ``theme_settings.report_contrast_adjustments``. Colour maths
        here, prose there; ``brand.py`` and ``tools/contrast_gate.py`` already
        consume this module without wanting a word of English from it.
    """
    notes = []
    for mode in ("light", "dark"):
        d = derive(brand, accent, mode)
        solid, ink = d["--bnd-brand-solid"], d["--bnd-on-brand"]
        if solid.lower() != brand.lower():
            notes.append({"kind": "brand_fill", "mode": mode, "used": solid, "chosen": brand})
        if ink.lower() != "#ffffff":
            notes.append({"kind": "brand_ink", "mode": mode})
        if d["--bnd-accent"].lower() != accent.lower():
            notes.append(
                {"kind": "focus_ring", "mode": mode, "used": d["--bnd-accent"], "chosen": accent}
            )
    return notes
