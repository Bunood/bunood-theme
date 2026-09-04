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

from typing import NamedTuple

from bunood_theme.contrast import (
    AA_NON_TEXT,
    AA_TEXT,
    fill_pair,
    fit_ink,
    lift_lightness,
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

#: The lightness the DARK brand fill is lifted to before it is fitted.
#:
#: `fill_pair` solves for the MINIMUM correction that clears 3:1 against the surfaces
#: and 4.5:1 under its own label, and measured, that lands every dark seed at L* ~54 —
#: legible, and dimmer than the brand the tenant chose. Radix holds its solid step
#: across modes and Material 3 lifts the resolved role instead; this is the second,
#: done HERE so one stored seed produces it and a palette needs no dark colour of its
#: own. A seed already lighter than this keeps its own value, so it is a floor and
#: never a repaint.
#:
#: Measured at 62: the fills land at 5.8-6.0:1 on both the page and under their label,
#: where the old minima sat nearer the 3:1/4.5:1 floors — brighter AND more legible.
DARK_FILL_TARGET_L = 62.0

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


#: The side pane's own palette (item 40).
#:
#: WHY IT LIVES HERE. `_sidebar.scss` hand-authored 77 declarations across six
#: colour-mode blocks — 60 of them literal — and `tools/contrast_gate.py` kept a
#: second hand-copy of eighteen of those constants with no drift check, its own
#: comment admitting the two had to be edited together. That is the same fact in
#: three places. It lives here once, and the gate measures what this returns.
#:
#: The pane is NOT `derive()`'s business and is deliberately a sibling of it:
#: `derive` returns one flat map for a mode, and the pane has four independent
#: colour worlds that a flat map cannot express.

#: The hue floor 34a fitted to. Above `AA_TEXT` on purpose: these are category
#: marks that must stay identifiable, not merely legible.
SB_TARGET_HUE = 4.6

#: The designed category hues, before fitting, per POLARITY.
SB_HUE_SEEDS_LIGHT = ["#2469bc", "#b94112", "#127753", "#8e6000", "#c62360", "#007a00", "#4a3aa7"]
SB_HUE_SEEDS_DARK = ["#7aabe5", "#f08e66", "#1dbe84", "#eda100", "#eb8aae", "#00c300", "#a9a0de"]

#: The working set every colour mode must declare in full.
#:
#: `_sidebar.scss`'s own header has said "Each mode sets the full set;
#: components below never look elsewhere" since item 10, and nothing checked
#: it. Item 40 measured the cost: dark-minimal declared 12 of these 14, so
#: `--bnd-sb-chip-bg` and `--bnd-sb-chip-ink` fell through to the LIGHT block
#: and painted #6d7570 on #15181a — 3.76:1 against a 4.5 floor. A sentence in
#: a comment is not a contract; this tuple is, and `check_sidebar_coverage`
#: enforces it.
class SidebarPane(NamedTuple):
    """One colour mode's pane: how it is built, and what to call it in a report."""

    #: How the pane is produced. Four kinds, and WHICH SEED a kind names is the
    #: whole of item 40's slice-2 decision:
    #:
    #:   ``("literal", hex)``       a fixed pane. Nothing a tenant sets moves it.
    #:   ``("alias", token)``       the pane IS a global surface; resolve THAT
    #:                              recipe, which mixes ``ground or brand``.
    #:   ``("brand", pct, base)``   ``mix(brand, pct, base)`` — the brand, never
    #:                              the ground, even when a ground is set.
    #:   ``("ground", pct, base)``  ``mix(ground, pct, base)``, and plain ``base``
    #:                              when no ground is set. The pane shows what the
    #:                              tenant ASKED for and never the brand behind it.
    recipe: tuple
    label: str
    #: Whether this mode's block is scoped by ``data-theme``. Match Theme and
    #: Minimal have a light block and a dark one; Dark Contrast and Brand have a
    #: single block that applies in BOTH desk themes. The emitter needs this to
    #: build a selector, and inferring it from the polarity key would be wrong
    #: for exactly the mode filed under "dark" because its PANE is dark — which
    #: is the trap `SB_PANES`'s own comment already warns about, one level up.
    themed: bool


#: Every measurable pane, grouped by POLARITY — and that grouping is the trap.
#:
#: "Dark Contrast" is dark in BOTH desk themes, so it belongs to the dark group
#: even when the desk is light. Measured while writing this: including it in
#: the light walk drags the light binding from #ebebeb to #111713, and all
#: seven light hues then "fit" against a near-black background and move.
#: :func:`~bunood_theme.contrast.fit_ink` cannot catch that — its own docstring
#: says backgrounds straddling the ink return a value on the wrong side of the
#: dip, silently. `tools/contrast_gate.py` has always grouped the panes this
#: way; this table is that grouping, written down once instead of twice.
#:
#: The keys are the `data-bnd-sb-color` values, so a mode added to the
#: stylesheet and not to this table is a coverage failure rather than a pane
#: no hue was ever fitted against.
#:
#: ── MINIMAL, DECIDED 2026-08-29 (item 40, slice 2) ─────────────────────────
#:
#: Minimal was 0 of 14 tokens seed-dependent in both themes: the same pane on
#: every site in the world. The two open questions were what should tint it and
#: by how much. Both were measured against the real derivation before either
#: was answered, and the measurement moved both answers.
#:
#: WHAT: the GROUND, never the brand. `ground or brand` — what `derive` does
#: for every other surface — is bit-identical to this on sixteen of the
#: seventeen shipped palettes, because all but one name a ground. The
#: seventeenth is Bunood, and `presets.py` hands Bunood to exactly one theme
#: that uses Minimal: **Quiet**, whose own preamble calls itself "the honest
#: stand-down" and names the side pane as a kit that can only "take its
#: quietest pole". So `ground or brand`'s entire practical effect would have
#: been to brand-tint the pane of the one look whose promise is that everything
#: which can stand down does. `ground_color` is a free Color field, so this is
#: not "always neutral" — a tenant who wants a warm pane sets a warm ground.
#:
#: HOW MUCH: 5% in dark, and NOTHING in light. Not a preference — the light
#: pane has no margin to spend and nothing to buy with it:
#:
#:   * Minimal's own `--bnd-sb-ink-muted` / `--bnd-sb-chip-ink` are #6d7570 on
#:     #fafbfa, measuring 4.57:1 against a 4.5 floor. The worst NAMED ground
#:     crosses that floor at 1.36%; the three candidates measured 4.45 / 4.35 /
#:     4.22, and worse against an unconstrained one. Every candidate was a gate
#:     failure in light. `check_sidebar_headroom` now enforces this.
#:   * And it would have bought nothing. At 3% in light all six shipped grounds
#:     mix to the SAME hex, #f7f8f7 — not similar, identical. Match Theme's own
#:     light pane is four distinct colours across seventeen tenants. The
#:     surface ramp is not what identifies a site; `--bnd-brand` is.
#:
#: Dark has both the room and the gain: every ink clears the floor at every
#: candidate, and 5% holds the separation from Match Theme at 3.80 worst case
#: while 8% drops it to 2.84 — under this repo's own 3.0 separation floor, and
#: seven of seventeen palettes with it.
#:
#: WHY NOT 8%, properly. The plan said it "collapses Minimal into Match Theme".
#: True, but not for the stated reason and not by a threshold: Match Theme's
#: light pane is `mix(ground, 8%, #ffffff)`, so Minimal at 8% would be the SAME
#: RECIPE AT THE SAME PERCENTAGE with a different base, and the difference
#: between them becomes the constant `0.92 x (#fafbfa - #ffffff)` at every
#: ground. The light separation curve is not even monotonic — it bottoms at ~6%
#: (ΔE 0.47) and recovers — so "pick a smaller number to be safe" is false
#: there. 8% also crosses the hue-fit binding at 6.20%.
#:
#: DARK CONTRAST KEEPS THE BRAND, deliberately and inconsistently. It is a
#: statement pane, not a stand-down, so it stays `("brand", …)` — but note that
#: it therefore ignores the ground entirely, which is a question this slice did
#: not open. Recorded so the next reader knows it was seen, not missed.
#: The pane a sidebar hue has to be legible on.
#:
#: WAS FOUR PANES PER POLARITY, and the shrink is the whole of item 40's colour
#: decision: the kit used to carry Match Theme, Minimal, Dark Contrast and Brand
#: as separate colour worlds, each with its own hand-authored working set. They
#: are gone -- the pane takes the theme's palette now -- and what is left is the
#: one they all should have been: `--bnd-pane`, which `derive` already produces
#: per site and per polarity.
#:
#: IT IS STILL A MAP RATHER THAN A CONSTANT because two fits read it and both
#: need the polarity split: `_sb_binding_bg` walks it for the hardest pane a hue
#: must clear, and it is the shape `fit_ink`'s straddle precondition is
#: satisfied by -- light panes and dark panes must never be fitted together.
SB_PANES = {
    "light": {"theme": SidebarPane(("alias", "--bnd-pane"), "pane", themed=True)},
    "dark": {"theme": SidebarPane(("alias", "--bnd-pane"), "pane, dark desk", themed=True)},
}

#: THE PANE SURFACES THAT MOVE THE BACKGROUND, and by how much (item 42).
#:
#: Six surfaces ship; four of them change no colour at all -- Solid is the pane,
#: Bordered adds edges, Elevated swaps to `--bnd-raised` (already swept, and
#: measured at 5.12:1 worst hue against the pane's 4.60), Textured lays a grain
#: in the pane's own line colour. Only Tinted and Gradient mix the brand in, and
#: they mix the SAME amount because Gradient's strong stop IS Tinted's colour --
#: one fit, two surfaces, no second number to drift.
#:
#: WHY THE FIT IS PER SURFACE RATHER THAN GLOBAL. Measured 2026-09-04 across the
#: 27 gate seeds x 2 modes: the seven hues are fitted to land EXACTLY on the 4.6
#: target against the binding pane, so a brand tint of ONE PER CENT already puts
#: the worst of them under 4.5 (4.47:1). Feeding the tint into the global walk
#: fixes that -- every hue clears 4.60 again at every tint -- but it re-fits the
#: hues for EVERY site, including the ones on Solid, and at a 16% stop the light
#: binding moves from #ebebeb to #c5c5c5 and the whole palette muddies. So the
#: tinted surfaces carry their own block, fitted against their own binding, and
#: a site that does not choose them pays nothing.
SB_SURFACE_TINT = {"tinted": 9, "gradient": 9}

#: Textured's grain, as the alpha of ONE stripe of `--bnd-sb-ink` over the pane.
#:
#: THE NUMBER IS THE WORST PIXEL, not the average. A repeating gradient's mean is
#: not what a glyph sits on -- a stripe is -- so the gate measures the stripe at
#: full alpha and no average is computed anywhere.
#:
#: IT IS DRAWN IN INK, and the two rejected alternatives are why:
#:
#:   * `--bnd-sb-line` at 22% puts the seven hues at 2.95:1. The gate fired on
#:     its own subject before the surface shipped, which is what writing the
#:     check first is for.
#:   * `--bnd-raised` at any alpha is contrast-free (4.89:1 worst at 55%) and
#:     INVISIBLE on some sites: at the pure-white seed pane and raised are both
#:     #ffffff, deltaE 0.00. An option that renders nothing is the defect this
#:     vocabulary exists to prevent, so safe was not enough.
#:
#: Ink is both. It is always visible -- ink against pane is the largest delta the
#: desk has -- and it needs no fit of its own, because at the BINDING seed the
#: tint's extreme is pure black in light and pure white in dark, and the ink is
#: inside that by construction. So Textured shares Tinted's block, and the gate
#: asserts the bound that makes the sharing legal rather than assuming it.
SB_GRAIN_PCT = 9

def sb_pane_value(pane: SidebarPane, brand: str, polarity: str, ground: str | None = None) -> str:
    """One pane as the concrete hex a SITE renders.

    ``ground=None`` means the tenant set none, which is the case a
    ``("ground", …)`` recipe answers by standing down to its base — the whole
    of the "what tints Minimal" decision, in one branch.
    """
    kind = pane.recipe[0]
    if kind == "literal":
        return pane.recipe[1]
    if kind == "brand":
        return mix(brand, pane.recipe[1], pane.recipe[2])
    if kind == "ground":
        return mix(ground, pane.recipe[1], pane.recipe[2]) if ground else pane.recipe[2]
    if kind == "alias":
        ramp = SURFACES_LIGHT if polarity == "light" else SURFACES_DARK
        for tok, pct, base in ramp:
            if tok == pane.recipe[1]:
                # The aliased surface mixes `ground or brand`, exactly as
                # `derive` does. Reading it any other way would model a pane
                # this app never paints.
                return mix(ground or brand, pct, base)
        raise ValueError(f"unknown surface alias {pane.recipe[1]}")
    raise ValueError(f"unknown pane recipe {pane.recipe!r}")


def _sb_binding_bg(polarity: str, tint: int = 0) -> str:
    """The single hardest pane a hue of ``polarity`` must clear, across every seed.

    Same structure as :func:`_chart_binding_bg`, and for the same reason: it is
    computed from the recipes at the extreme seed so the ramp never recurses
    into :func:`derive`. A light hue is dark-on-light, so the binding pane is
    the DARKEST any light pane gets, which is at the darkest seed; a dark hue
    is the LIGHTEST, at the brightest seed.

    THE EXTREME IS APPLIED TO BOTH SEEDS, brand and ground, because both are
    unconstrained Frappe Color fields — `ground_color`'s `validate()` strips and
    lowercases and throws nothing. A walk that took the extreme brand but a
    named ground would compute a binding no pathological site reaches, and the
    next re-fit would land hues that fail on one.

    An ``("alias", …)`` entry resolves to the aliased surface's own recipe —
    NOT to the alias string. Reading it as an opaque literal would compute a
    binding that cannot see Match Theme's pane at all, and the next re-fit
    would land hues that fail there. It happens to be invisible today, which is
    the "a branch whose guard is false on the dev site is UNTESTED" case.
    """
    if polarity not in ("light", "dark"):
        raise ValueError(f"polarity must be light or dark, got {polarity!r}")
    extreme = "#000000" if polarity == "light" else "#ffffff"
    cands = [sb_pane_value(p, extreme, polarity, ground=extreme)
             for p in SB_PANES[polarity].values()]
    # A TINTED SURFACE IS A PANE, so it belongs in the walk rather than in a
    # second fit somewhere else. `tint` is the percentage of the brand seed
    # mixed into the pane, and at the extreme seed that mix is the darkest a
    # light pane ever gets and the lightest a dark one does -- which is what
    # `_chart_binding_bg` means by binding, arriving here unchanged.
    if tint:
        cands += [mix(extreme, tint, c) for c in list(cands)]
    key = lambda hx: luminance(parse_color(hx))
    return min(cands, key=key) if polarity == "light" else max(cands, key=key)


def sb_hues(polarity: str, tint: int = 0) -> list[str]:
    """The seven category hues for one polarity, fitted to the binding pane.

    Every fit takes exactly ONE background, so :func:`fit_ink`'s straddle
    precondition cannot be violated here by construction.

    At every seed the designed values already clear the floor and come back
    untouched — verified for all fourteen, and re-verified after the slice-2
    tint decision moved the dark Minimal recipe. That is the point: this
    replaces a hand-copied table with the derivation that produces it, at no
    visual cost.
    """
    bg = _sb_binding_bg(polarity, tint)
    seeds = SB_HUE_SEEDS_LIGHT if polarity == "light" else SB_HUE_SEEDS_DARK
    return [fit_ink(h, [bg], target=SB_TARGET_HUE)[0] for h in seeds]




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
    # DARK ONLY. A light ground needs the fill DARKER, so lifting in both modes would
    # wash the brand out on white — the check pins the light value for that reason.
    fill_seed = brand
    if mode != "light":
        fill_seed = to_hex(lift_lightness(parse_color(brand), DARK_FILL_TARGET_L))
    # THE SIDEBAR'S PANES USED TO JOIN THE CONSTRAINT SET, and this is what
    # removing them costs and buys. Slice 12 added the Minimal and Dark Contrast
    # panes here because neither was a global surface, so the active pill's fill
    # could sit at 1.06:1 against the one surface it lived on. Those panes are
    # gone; the pane is `--bnd-pane`, which is already in `surfaces`, so the
    # constraint is now satisfied by construction rather than by a second list.
    #
    # MEASURED before removing it (2026-09-01, 27 seeds x 2 modes): five of
    # fifty-four brand-solid values move, all light, all at pathological seeds,
    # and every one still clears 3:1 on its pane -- worst 3.03:1. Four of the
    # five are a REPAIR: a black seed derived #646464 because the fill was being
    # lifted to clear a dark pane nobody renders, and now derives #111111, which
    # is 5.01:1 -> 15.98:1 and the colour the tenant actually chose. The shipped
    # seed is not among the five, so `_tokens.scss` needs no regeneration.
    out["--bnd-brand-solid"], out["--bnd-on-brand"], _ = fill_pair(
        fill_seed, surfaces=surfaces
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


def adjustments(brand: str, accent: str, ground: str | None = None) -> list[dict]:
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
        d = derive(brand, accent, mode, ground=ground)
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
