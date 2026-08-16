#!/usr/bin/env python3
# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Contrast gate — recompute every pair the token contract creates, and fail on any
that misses WCAG 2.2 AA.

WHAT IT CHECKS
    Each declared pair, for every seed in the matrix, in light AND dark mode.
    The seed matrix exists because the surfaces are seed-tinted: ``--bnd-pane`` is
    ``color-mix(in srgb, var(--bnd-brand) 8%, #ffffff)``, so its luminance — and
    therefore every ratio measured against it — moves with a colour the customer
    chooses. A gate that only checked the shipped default would be the green test
    that asserts existence rather than correctness (CLAUDE.md), because the seed
    it validates is the one seed no tenant uses.

WHERE THE VALUES COME FROM
    Parsed out of ``_tokens.scss`` at run time, never restated here. A table of
    numbers copied into a checker is a second copy of the design, and it goes
    stale the first time someone re-steps a token — at which point the gate is
    reporting on a theme that no longer exists.

USAGE
    npm run contrast                 # the whole matrix, both modes
    npm run contrast -- --seed=#F5C542
    npm run contrast -- --table      # the published table for the shipped seed
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import NamedTuple

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from bunood_theme import palette  # noqa: E402
from bunood_theme.contrast import (  # noqa: E402
    AA_NON_TEXT,
    AA_TEXT,
    CVD_ALL,
    CVD_COMMON,
    composite,
    parse_color,
    ratio,
    separation,
    to_hex,
)

#: Chart series separation floors (item 25). A worst-pair CIEDE2000 under
#: colour-vision simulation, NOT a WCAG ratio — see contrast.separation.
#:
#: The floor is enforced over the COMMON vision models (normal + protan + deutan),
#: which cover ~99.99% of people including the two common dichromacies. Tritan is
#: held to a lower ADVISORY floor: tritanopia is ~0.01% of the population and its
#: simulation is the least validated, so penalising an otherwise-excellent palette
#: on it would be false precision — the advisory WARNS, it does not fail the build
#: (only the common floor does). Calibrated against published palettes under this
#: exact model (Machado-linear + CIEDE2000): Okabe-Ito 11.6 and IBM 9.4 (both
#: designed CVD-safe) clear it; frappe-charts' own DEFAULT_COLORS 0.95 and
#: Tableau-10 0.7 do not — a clean gap the floor sits inside.
SERIES_FLOOR_COMMON = 6.0
SERIES_FLOOR_TRITAN = 4.5

#: The shipped accent. Held constant while the brand seed varies: the two are
#: independent settings, and varying both would multiply the matrix without
#: testing anything the brand axis does not already cover.
ACCENT_SEED = "#4463f0"

TOKENS_SCSS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "bunood_theme", "public", "scss", "_tokens.scss",
)

# ── The pairs ────────────────────────────────────────────────────────────────
#
# A pair is (ink, background, requirement, why). `requirement` is None for pairs
# that are deliberately exempt: they are still measured and printed, because an
# exemption nobody can see the number for is indistinguishable from an oversight.

SURFACES = [
    "var(--bnd-page)",
    "var(--bnd-surface)",
    "var(--bnd-raised)",
    "var(--bnd-pane)",
    "var(--bnd-hover)",
    "var(--bnd-active)",
]

#: Inks the stylesheet puts on ordinary body text. All three are used as `color:`
#: on real, informational text — verified by grep, 2026-08-06: --bnd-ink-subtle
#: alone appears on 14 text rules across the palette, breadcrumbs, inbox, navbar,
#: status bar and cluster. None of them is decorative, so none of them gets the
#: decorative exemption.
TEXT_INKS = ["var(--bnd-ink)", "var(--bnd-ink-muted)", "var(--bnd-ink-subtle)"]

#: The status bar's escalation tint, written out because it is an inline
#: expression in the stylesheet rather than a token.
ALARM_BG = "color-mix(in srgb, var(--bnd-critical) 10%, var(--bnd-surface))"


class Pair(NamedTuple):
    """One contrast requirement: ``ink`` on ``bg`` must clear ``need`` — or is
    merely measured and printed when ``need`` is None (see the module
    docstring on exemptions). ``mode`` names the ONE desk theme this pair
    renders in, or None if it renders in both.

    A typed field rather than a variable-length tuple (4 elements for a
    both-modes pair, 5 for a mode-scoped one): the variable-length shape
    already broke `check_computed`'s unpacking once — "too many values to
    unpack" — the first day a desk actually served the mode-scoped sidebar
    fits, invisible until then because the crash needed that stylesheet
    deployed. A fifth pair family arriving with this item invites the same
    crash again; `mode` defaulting to None removes the possibility.
    """

    ink: str
    bg: str
    need: float | None
    why: str
    mode: str | None = None


def pairs():
    """The full pair list. Generated where it is a cross product, explicit where not."""
    out = []
    for ink in TEXT_INKS:
        for bg in SURFACES:
            out.append(Pair(ink, bg, AA_TEXT, "body text"))

    # Text on a brand fill: the sidebar's active item and the dock's active tab.
    # `--bnd-on-brand` / `--bnd-brand-solid` are the derived pair; if they are not
    # declared yet the fallbacks model what ships today, which is the failure this
    # gate exists to catch.
    out += [
        Pair("var(--bnd-on-brand, var(--bnd-ink-inverse))",
             "var(--bnd-brand-solid, var(--bnd-brand))", AA_TEXT, "label on a brand fill"),
        Pair("var(--bnd-on-critical)", "var(--bnd-critical)", AA_TEXT, "unread badge count"),
        Pair("var(--bnd-warn)", "var(--bnd-raised)", AA_TEXT, "status segment, warning"),
        Pair("var(--bnd-critical)", "var(--bnd-raised)", AA_TEXT, "status segment, bad"),
        Pair("var(--bnd-critical)", ALARM_BG, AA_TEXT, "status segment on the alarm tint"),

        # 1.4.11 - non-text contrast.
        Pair("var(--bnd-good)", "var(--bnd-raised)", AA_NON_TEXT, "status dot, healthy"),
        Pair("var(--bnd-serious)", "var(--bnd-pane)", AA_NON_TEXT, "sidebar badge fill"),
    ]

    # The focus ring, against every surface it can be drawn over. `outline` paints
    # OUTSIDE the element, so the adjacent colour is the container's, not the
    # control's — which is why this is a cross product and not one pair.
    # 2.4.11 and 1.4.11 both bear on it and both want 3:1.
    for bg in SURFACES:
        out.append(Pair("var(--bnd-accent)", bg, AA_NON_TEXT, "focus ring"))

    # Desk icons, now that `_bridge.scss` points Frappe's `--icon-stroke` at our
    # muted ink instead of its own greys. An icon is a graphic, so 1.4.11's 3:1
    # is the bar. The colour is `--bnd-ink-muted`, already enforced at the
    # stricter 4.5:1 as body text above, so these rows pass today — the point is
    # that icons are now a NAMED gated concern: repoint `--icon-stroke` in the
    # bridge to anything that fails 3:1 and this is what says so. (Sidebar chip
    # icons are coloured by the chip kit's own ink, not this token, and are
    # gated by the 34a pane rows below.)
    for bg in SURFACES:
        out.append(Pair("var(--bnd-ink-muted)", bg, AA_NON_TEXT, "desk icon stroke"))

    # The brand painted as an opaque graphic — the inbox unread dot, the dock's
    # active tab, the sidebar's active item — against the surfaces it lands on.
    # This is the pair that a seed-tinted chrome makes hard: tint every surface
    # with the seed and a fill of that same seed can disappear into them.
    for bg in SURFACES:
        out.append(Pair(
            "var(--bnd-brand-solid, var(--bnd-brand))", bg, AA_NON_TEXT,
            "brand fill against the chrome",
        ))

    # The brand written as TEXT: the current breadcrumb, the dock's active label,
    # the inbox filter tab and unread count, three sidebar rules. Seven call
    # sites, all `color: var(--bnd-brand)` before this item, all failing at the
    # shipped seed.
    for bg in SURFACES:
        out.append(Pair(
            "var(--bnd-brand-ink, var(--bnd-brand))", bg, AA_TEXT, "brand as text",
        ))

    # ── Measured, deliberately not enforced ──────────────────────────────────
    #
    # Both border tokens are read as 1.4.11 candidates and both are left exempt,
    # on evidence rather than convenience. Every rule that consumes them was read
    # (2026-08-06): `--bnd-border-strong` appears exactly twice, on the HOVER
    # state of the navbar search trigger and of a breadcrumb link, and in both
    # the hover is also signalled by a background change - so the border is not
    # carrying state on its own. `--bnd-border` is a separator rule.
    #
    # What is NOT settled is whether a control whose resting boundary is a 1.22:1
    # hairline over a near-identical background is identifiable at all. That is a
    # per-component judgement about which affordances need a boundary, not a
    # question about a token's value, and it belongs to item 22. Publishing the
    # number here is the point: an exemption whose ratio nobody can see is
    # indistinguishable from an oversight.
    out += [
        Pair("var(--bnd-border)", "var(--bnd-surface)", None, "separator; see item 22"),
        Pair("var(--bnd-border-strong)", "var(--bnd-hover)", None,
             "hover accent alongside a background change; see item 22"),
    ]

    # ── The sidebar kit's own palette (34a) ──────────────────────────────────
    #
    # ENFORCED NOW, and per pane FAMILY, because the measurement round proved
    # no single hex can serve four panes: every one of the seven global
    # --bnd-cat-N hues failed AA on at least one pane (hue 4 read 1.97:1 on
    # the light pair, hue 7 read 1.86:1 on the dark pair). Each colour mode
    # therefore declares its own fits in _sidebar.scss — light modes darken,
    # dark modes lighten, hue and saturation held, lightness searched until
    # the worst ratio across every seed here cleared 4.6:1. These rows hold
    # the gate to exactly those declared values; edit the fits in
    # _sidebar.scss and these hexes together or the gate says so.
    #
    # The brand pane has no rows: no fixed hue can be fitted to an
    # arbitrary-seed gradient, so the hues stand down there and section
    # labels take the mode's own white ink — checked below as a MEASURED row
    # against the gradient's lightest stop, not enforced, because a
    # near-white seed makes white-on-brand illegible by construction and
    # that is the brand mode's own pre-existing design question, not this
    # palette's.
    SB_FITS_LIGHT = ["#2469bc", "#b94112", "#127753", "#8e6000", "#c62360", "#007a00", "#4a3aa7"]
    SB_FITS_DARK = ["#7aabe5", "#f08e66", "#1dbe84", "#eda100", "#eb8aae", "#00c300", "#a9a0de"]
    LIGHT_PANES = [("var(--bnd-pane)", "match-theme pane"), ("#fafbfa", "minimal pane")]
    DARK_PANES = [
        ("#15181a", "minimal pane, dark desk"),
        ("color-mix(in srgb, var(--bnd-brand) 10%, #131a15)", "dark-contrast pane"),
    ]
    for n in range(7):
        for pane, pane_label in LIGHT_PANES:
            out.append(Pair(SB_FITS_LIGHT[n], pane, AA_TEXT,
                             f"sidebar hue {n + 1} (light fit) on the {pane_label}", "light"))
        for pane, pane_label in DARK_PANES:
            # The dark-contrast pane is dark in BOTH desk themes, but its
            # hues come from the mode block that also serves dark desks, so
            # the dark fit is what renders on it always — checked in dark
            # mode, where --bnd-pane agrees with it.
            out.append(Pair(SB_FITS_DARK[n], pane, AA_TEXT,
                             f"sidebar hue {n + 1} (dark fit) on the {pane_label}", "dark"))
    out.append(Pair(
        "#ffffff", "color-mix(in srgb, var(--bnd-brand) 96%, #ffffff)", None,
        "brand-pane ink and active-pill fill at the gradient's lightest stop; see the brand-mode note",
    ))
    out.append(Pair(
        "#ffffff", "color-mix(in srgb, var(--bnd-brand) 72%, #000000)", None,
        "brand-pane active-pill fill at the gradient's darkest stop",
    ))

    # ── The active pill's fill and its label are one derivation (item 22) ────
    #
    # 34a fitted the categorical hues to be INK on a pane (AA_TEXT), never a
    # FILL under a label — Solid Pill used the wash hue as its fill whenever
    # a wash was on, with the label set independently per colour mode, and
    # the two drifted: Match Theme + Solid Pill measured 2.08:1 at seed
    # #7f7f7f (already a gate seed above), Dark Contrast + Solid Pill
    # measured 2.17-2.40:1 at every hue. The fix routes the pill through the
    # brand's own gated pair instead (the "label on a brand fill" row above)
    # in every colour mode except brand, which stands the pair down the same
    # way its hues already do four lines up — no fixed pair survives an
    # arbitrary-seed gradient. This row enforces that stand-down; the
    # general-mode pair is the existing row above, now what actually renders.
    out.append(Pair(
        "#16181d", "#ffffff", AA_TEXT,
        "sidebar active pill label on the brand pane's stand-down fill",
    ))

    # ── Measured, deliberately not enforced: the fill's own visibility ───────
    #
    # The fix above makes the pill's fill legible UNDER its label at every
    # seed. Whether the fill stays identifiable AS A CONTROL against its own
    # pane is a different, 1.4.11 boundary question — and this fix exposes it
    # more often rather than creating it: --bnd-brand-solid already fell back
    # to this same fill whenever a wash was off, in all four non-theme colour
    # modes, so wash-on joins wash-off in the exposure rather than being new.
    # At the seed matrix's pathological ends it fails outright — the
    # dark-contrast pane at a near-black seed on a LIGHT desk measures
    # ~1.06:1 (the light-derived fill and the pane are both near-black), and
    # the brand pane's own lightest gradient stop measures 1.00:1 at a
    # near-white seed (two rows up). Fixing it needs --bnd-brand-solid fitted
    # against the sidebar's OWN panes, not just the six global SURFACES — a
    # palette.derive() change whose blast radius is every brand-solid
    # consumer site-wide, not just the sidebar. Out of scope for this fix;
    # measured and published so the gap has a number, not silence, and
    # recorded as an open thread rather than lost.
    for pane, pane_label in LIGHT_PANES[1:]:  # skip match-theme: already the global --bnd-pane row
        out.append(Pair(
            "var(--bnd-brand-solid, var(--bnd-brand))", pane, None,
            f"sidebar active pill fill against its own {pane_label}", "light",
        ))
    for pane, pane_label in DARK_PANES:
        out.append(Pair(
            "var(--bnd-brand-solid, var(--bnd-brand))", pane, None,
            f"sidebar active pill fill against its own {pane_label}", "dark",
        ))
    # Dark Contrast's own pane is dark in BOTH desk themes (see the hue-fit
    # loop above), so its fill needs checking against a LIGHT-derived
    # brand-solid too — a light desk with Dark Contrast sidebar mode is a
    # real, reachable combination.
    out.append(Pair(
        "var(--bnd-brand-solid, var(--bnd-brand))", DARK_PANES[1][0], None,
        "sidebar active pill fill against its own dark-contrast pane, light desk", "light",
    ))

    # ── List view kit (item 15, was 16) ───────────────────────────────────────
    # The selection wash and its inks, plus the rail against the wash. The
    # wash is brand-tinted so it moves with every seed — exactly the shape
    # item 17 (was 32) proved cannot pass by luck.
    SEL_BG = "color-mix(in srgb, var(--bnd-brand) 10%, var(--bnd-surface))"
    out += [
        Pair("var(--bnd-ink)", SEL_BG, AA_TEXT, "list selected-row text"),
        Pair("var(--bnd-ink-muted)", SEL_BG, AA_TEXT, "list selected-row secondary text"),
        Pair("var(--bnd-brand-solid, var(--bnd-brand))", SEL_BG, AA_NON_TEXT,
             "list selection rail against the selected wash"),
    ]
    # ── Form view kit (item 16, was 18) ───────────────────────────────────────
    # The Segment Pills track is the kit's only NEW colour relationship —
    # everything else is built from already-gated cross-products (surfaces ×
    # inks, brand fill × its label, and the list kit's SEL_BG, which the grid's
    # checked rows reuse verbatim so one selection colour serves both
    # surfaces). The track string is character-identical to _form.scss.
    TRACK_BG = "color-mix(in srgb, var(--bnd-ink) 4%, var(--bnd-surface))"
    out += [
        Pair("var(--bnd-ink)", TRACK_BG, AA_TEXT, "form tab label on the segment track"),
        Pair("var(--bnd-ink-muted)", TRACK_BG, AA_TEXT,
             "form tab, inactive label on the segment track"),
    ]

    # ── Chart series marks (item 25) ──────────────────────────────────────────
    # A series mark is a graphic that carries meaning — 1.4.11's 3:1, NOT 4.5:1
    # text. The two backgrounds are the only surfaces a chart lands on: the tile
    # (--bnd-surface) and, for a transparent-tile style, the canvas (--bnd-page).
    # The ramp is brand-independent, so these hold for every seed at once; the
    # separation FLOOR between marks is a different measure entirely and is
    # checked by check_series_separation, not here (a ratio cannot express it).
    for n in range(1, 8):
        for bg in ("var(--bnd-surface)", "var(--bnd-page)"):
            out.append(Pair(f"var(--bnd-series-{n})", bg, AA_NON_TEXT,
                            f"chart series {n} mark"))

    # ── Measured, deliberately not enforced: the vendor's overflow slice ──────
    # frappe-charts hard-writes colors[maxSlices-1] = 'grey' (#A6B1B9) for the
    # "Rest" slice on Pie/Donut (AggregationChart.js), overwriting whatever we
    # supplied. It is not reachable from our colours array, so we cannot fix it
    # here — only replace the whole widget's palette, which we do, but the vendor
    # re-imposes this one slot. Published with its number rather than left silent:
    # ~2.2:1 on a white card, a live 1.4.11 shortfall we do not control.
    out.append(Pair("#A6B1B9", "var(--bnd-surface)", None,
                    "frappe-charts overflow 'Rest' slice; not reachable from our array"))
    return out


#: Seeds to check. The first is what ships; the rest are the colours a tenant
#: plausibly picks, including the two GUIDELINES §2.2 measured as catastrophic.
SEEDS = [
    ("#4d8756", "shipped default"),
    ("#4463f0", "accent blue"),
    ("#c8923c", "gold"),
    ("#f5c542", "bright yellow"),
    ("#111111", "near-black"),
    ("#e8e8e8", "near-white"),
    ("#b42318", "deep red"),
    ("#00b3a4", "teal"),
    # The pathological ends. Nobody brands with pure white, but a paste error
    # produces one, and the derivation has to hold rather than emit a desk with
    # invisible text. Mid-grey is the hardest case in principle: it is the
    # luminance furthest from both inks at once.
    ("#ffffff", "pure white"),
    ("#000000", "pure black"),
    ("#7f7f7f", "mid grey"),
]


# ── Reading the tokens ───────────────────────────────────────────────────────


def read_blocks(path: str) -> tuple[dict, dict]:
    """Return ``(light, dark)`` custom-property maps parsed from ``_tokens.scss``.

    Only the two TOP-LEVEL blocks are read — ``:root`` and
    ``html[data-theme="dark"]``. The file also contains an indented ``:root``
    inside ``@media (prefers-reduced-motion)`` and the density attribute blocks;
    matching those would mix a motion override into the colour model. Anchoring on
    a selector at column zero is what separates them, so the anchor is the parse
    rule and not an incidental detail.

    NOT MEASURED, AND SAID OUT LOUD: ``_print.scss`` re-declares
    ``--bnd-ink-subtle`` and ``--bnd-border-strong`` as ``#666666`` inside
    ``@media print``. Paper is not a screen — WCAG's ratios are defined for
    displays, and the print sheet forces light mode with black text on white, so
    the pairs this gate enforces do not describe it. It is left out on purpose
    rather than by oversight, which is only a meaningful distinction if it is
    written down.
    """
    src = open(path, encoding="utf-8").read()
    src = re.sub(r"//[^\n]*", "", src)

    def block(selector: str) -> dict:
        m = re.search(r"^" + re.escape(selector) + r"\s*\{", src, re.M)
        if not m:
            raise SystemExit(f"contrast gate: no top-level `{selector}` block in {path}")
        depth, i = 1, m.end()
        while depth and i < len(src):
            depth += {"{": 1, "}": -1}.get(src[i], 0)
            i += 1
        body = src[m.end() : i - 1]
        out = {}
        for decl in _split_decls(body):
            if ":" not in decl:
                continue
            name, _, value = decl.partition(":")
            name = name.strip()
            if name.startswith("--"):
                out[name] = value.strip()
        return out

    light = block(":root")
    # Dark is an OVERRIDE layer, exactly as the cascade applies it — the dark
    # block re-declares eleven tokens and inherits the rest. Modelling it as a
    # standalone map would silently drop --bnd-ink-inverse and every radius.
    dark = {**light, **block('html[data-theme="dark"]')}
    return light, dark


def _split_decls(body: str) -> list[str]:
    """Split a declaration block on top-level semicolons.

    Values here contain commas AND parentheses — ``--bnd-shadow-md`` is three
    comma-separated ``rgba()`` shadows — so a naive ``split(";")`` is fine but a
    naive ``split(",")`` would not be. Depth tracking costs four lines and removes
    the class of bug entirely.
    """
    out, depth, buf = [], 0, ""
    for ch in body:
        depth += {"(": 1, ")": -1}.get(ch, 0)
        if ch == ";" and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    if buf.strip():
        out.append(buf)
    return out


def resolve(expr: str, variables: dict, over: str = "var(--bnd-surface)"):
    """Resolve an expression to an opaque colour, compositing if it is translucent.

    ``over`` is the surface a translucent token is painted on. Border tokens are
    ``rgba()``, and their ratio is only meaningful once flattened — an un-composited
    ``rgba(0,0,0,.16)`` would measure as near-black and pass everything.
    """
    c = parse_color(expr, variables)
    if c[3] < 1.0:
        c = composite(c, parse_color(over, variables))
    return c


# ── Evaluation ───────────────────────────────────────────────────────────────


def evaluate(seed: str, defaults: dict, mode: str, derived: bool = True):
    """Measure every pair for one seed in one mode. Returns a list of result rows.

    Args:
        seed: the brand seed under test.
        defaults: the mode's map parsed from ``_tokens.scss``.
        mode: ``"light"`` or ``"dark"``.
        derived: when true, layer :func:`palette.derive` over those defaults — i.e.
            measure what a site WITH a brand stylesheet renders. When false,
            measure ``_tokens.scss`` alone, which is what renders if that
            stylesheet is missing. Both have to hold: the fallback is not a
            degraded mode anyone opted into, it is what a fresh install paints
            before ``after_migrate`` has written the file, and ``brand.py``
            returns ``None`` on any failure by design.
    """
    v = dict(defaults)
    v["--bnd-brand"] = seed
    if derived:
        try:
            v.update(palette.derive(seed, ACCENT_SEED, mode))
        except ValueError as exc:
            # A seed the derivation cannot satisfy is a RESULT, not a crash. A
            # traceback here would look like a broken gate and get worked around;
            # a failing row gets read.
            return [(f"derive({seed})", mode, AA_TEXT, str(exc), None, "underivable")]
    rows = []
    for pair in pairs():
        ink, bg, need, why = pair.ink, pair.bg, pair.need, pair.why
        # A mode-scoped pair names the ONE mode it renders in. The sidebar
        # fits forced this: the theme-mode pane follows the desk theme and a
        # different fit serves each side, so testing a light fit against the
        # dark pane would be measuring a combination the stylesheet never
        # produces.
        if pair.mode and pair.mode != mode:
            continue
        try:
            bg_c = resolve(bg, v)
            ink_c = resolve(ink, v, over=bg)
            r = ratio(ink_c, bg_c)
        except ValueError as exc:
            rows.append((ink, bg, need, why, None, str(exc)))
            continue
        rows.append((ink, bg, need, why, r, to_hex(bg_c)))
    return rows


def short(expr: str) -> str:
    """`var(--bnd-ink-muted)` -> `ink-muted`, for a table a human reads."""
    m = re.match(r"var\(--bnd-([a-z-]+)", expr)
    if m:
        return m.group(1)
    return expr[:34]


def check_defaults_agree(light: dict, dark: dict) -> list[str]:
    """The static tokens must equal what ``palette.derive`` produces for the shipped seed.

    WHY THIS CHECK EXISTS
        ``_tokens.scss`` has to declare the complete token set as literal CSS,
        because it is what renders when the per-site sheet is absent. That makes
        it a SECOND copy of values ``palette.py`` also computes — the exact defect
        class this repo keeps paying for. It cannot be deleted, so it is
        mechanized instead: if either side moves without the other, this fails and
        names the token. Re-run with ``--emit-defaults`` to get the block to paste.
    """
    problems = []
    for mode, block in (("light", light), ("dark", dark)):
        want = palette.derive(SEEDS[0][0], ACCENT_SEED, mode)
        for token, expected in sorted(want.items()):
            if token in ("--bnd-brand", "--bnd-accent"):
                continue  # the seeds themselves, not derived from anything
            if token not in block:
                problems.append(f"{mode}: _tokens.scss does not declare {token} (want {expected})")
                continue
            try:
                actual = to_hex(parse_color(block[token], block))
            except ValueError as exc:
                problems.append(f"{mode}: {token} -> {exc}")
                continue
            if actual.lower() != expected.lower():
                problems.append(
                    f"{mode}: {token} is {actual} in _tokens.scss, {expected} from palette.derive"
                )
    return problems


#: CIEDE2000 reference pairs from Sharma, Wu & Dalal (2005), Table 1 — the data
#: set every conformant implementation is checked against, chosen to exercise the
#: hue-quadrant and arctangent edge cases. ``(Lab1, Lab2, expected dE00)``.
_SHARMA_2005 = [
    ((50, 2.6772, -79.7751), (50, 0, -82.7485), 2.0425),
    ((50, 3.1571, -77.2803), (50, 0, -82.7485), 2.8615),
    ((50, 2.8361, -74.0200), (50, 0, -82.7485), 3.4412),
    ((50, -1.3802, -84.2814), (50, 0, -82.7485), 1.0000),
    ((50, -1.1848, -84.8006), (50, 0, -82.7485), 1.0000),
    ((50, -0.9009, -85.5211), (50, 0, -82.7485), 1.0000),
    ((50, 0, 0), (50, -1, 2), 2.3669),
    ((50, -1, 2), (50, 0, 0), 2.3669),
    # Canonical pairs 9 and 11 differ only in b2's sign-crossing (0.0009 vs 0.0011)
    # and give DIFFERENT dE00 by design — Sharma's test that the hue quadrant flips.
    ((50, 2.49, -0.001), (50, -2.49, 0.0009), 7.1792),
    ((50, 2.49, -0.001), (50, -2.49, 0.0011), 7.2195),
    ((50, 2.5, 0), (50, 0, -2.5), 4.3065),  # opposite-hue: 4.3065, not 4.8045
    ((50, 2.5, 0), (73, 25, -18), 27.1492),
    ((50, 2.5, 0), (61, -5, 29), 22.8977),
    ((50, 2.5, 0), (56, -27, -3), 31.9030),
    ((50, 2.5, 0), (58, 24, 15), 19.4535),
    ((50, 2.5, 0), (50, 3.1736, 0.5854), 1.0000),
    ((50, 2.5, 0), (50, 3.2972, 0), 1.0000),
    ((50, 2.5, 0), (50, 1.8634, 0.5757), 1.0000),
    ((50, 2.5, 0), (50, 3.2592, 0.3350), 1.0000),
    ((60.2574, -34.0099, 36.2677), (60.4626, -34.1751, 39.4387), 1.2644),
    ((63.0109, -31.0961, -5.8663), (62.8187, -29.7946, -4.0864), 1.2630),
    ((61.2901, 3.7196, -5.3901), (61.4292, 2.2480, -4.9620), 1.8731),
    ((35.0831, -44.1164, 3.7933), (35.0232, -40.0716, 1.5901), 1.8645),
    ((22.7233, 20.0904, -46.6940), (23.0331, 14.9730, -42.5619), 2.0373),
    ((36.4612, 47.8580, 18.3852), (36.2715, 50.5065, 21.2231), 1.4146),
    ((90.8027, -2.0831, 1.4410), (91.1528, -1.6435, 0.0447), 1.4441),
    ((90.9257, -0.5406, -0.9208), (88.6381, -0.8985, -0.7239), 1.5381),
    ((6.7747, -0.2908, -2.4247), (5.8714, -0.0985, -2.2286), 0.6377),
    ((2.0776, 0.0795, -1.1350), (0.9033, -0.0636, -0.5514), 0.9082),
]


def check_deltae_reference() -> list[str]:
    """Pin ``contrast.delta_e`` to the Sharma-Wu-Dalal reference values.

    The chart-series floor is only as trustworthy as the difference metric under
    it, so the metric proves itself against the published data every run rather
    than on trust. Runs inside ``npm run contrast``, so CI enforces it.
    """
    from bunood_theme.contrast import delta_e

    problems = []
    for lab1, lab2, want in _SHARMA_2005:
        got = delta_e(lab1, lab2)
        if abs(got - want) > 1e-3:
            problems.append(f"CIEDE2000({lab1}, {lab2}) = {got:.4f}, reference {want:.4f}")
    return problems


def check_series_separation(light: dict, dark: dict) -> tuple[list[str], list[str]]:
    """The chart series marks must be tellable apart from EACH OTHER, including
    under colour-vision deficiency — a floor the pair table cannot express.

    A separate function, sharing only the colour primitives, for the reason
    `check_measured` is separate: this measures a worst-pairwise DIFFERENCE across
    a set, not a single ink-on-background ratio, and folding it into `Pair` would
    widen a shape whose widening already broke `check_computed` once.

    Reads the seven series hexes straight from each mode's parsed block, so it
    gates exactly what ships. The "other" overflow slot is excluded on purpose: it
    is the un-highlighted remainder, not a category that has to stand apart.

    Returns ``(problems, advisories)``. Only ``problems`` (the COMMON floor)
    fails the build; ``advisories`` (the tritan floor) are printed as warnings —
    otherwise "advisory" would be a lie, hard-failing CI on a palette that is
    excellent for the ~8% common CVDs but trades tritan margin (~0.01%), which the
    tritan floor exists NOT to punish.
    """
    problems, advisories = [], []
    for mode, block in (("light", light), ("dark", dark)):
        try:
            hues = [block[f"--bnd-series-{n}"] for n in range(1, 8)]
        except KeyError as exc:
            problems.append(f"{mode}: _tokens.scss is missing series token {exc}")
            continue
        common = separation(hues, CVD_COMMON)
        allk = separation(hues, CVD_ALL)
        if common < SERIES_FLOOR_COMMON:
            problems.append(
                f"{mode}: series separation {common:.2f} < {SERIES_FLOOR_COMMON} "
                f"(normal+protan+deutan) — two marks confuse for a common CVD viewer"
            )
        if allk < SERIES_FLOOR_TRITAN:
            advisories.append(
                f"{mode}: series separation {allk:.2f} < {SERIES_FLOOR_TRITAN} "
                f"(incl. tritan, advisory only — not a build failure)"
            )
    return problems, advisories


def check_computed() -> int:
    """Measure the pair table against token values READ OUT OF A BROWSER.

    Reads ``{"light": {token: value, ...}, "dark": {...}}`` on stdin — what
    ``getComputedStyle`` reported on a live desk — and evaluates the same pairs
    against it, deriving nothing.

    WHY THIS EXISTS
        Everything else in this file measures a MODEL of the stylesheet. The model
        can be right about colour and still wrong about the desk: a token can be
        shadowed by a Frappe rule, lost to a typo, or simply never reach the
        element. The smoke suite calls this so the numbers CI enforces are checked
        against pixels at least once, using this same implementation rather than a
        second one written in JavaScript.
    """
    data = json.load(sys.stdin)
    failures = []
    for mode in ("light", "dark"):
        variables = data.get(mode) or {}
        if not variables:
            print(f"check-computed: no {mode} tokens supplied")
            return 1
        for pair in pairs():
            ink, bg, need, why = pair.ink, pair.bg, pair.need, pair.why
            # A mode-scoped pair names the ONE mode it renders in (the 34a
            # sidebar fits — see the model loop above, which grew this arm at
            # the same time). This loop used to unpack a variable-length
            # tuple, so the first desk that actually SERVED the fitted tokens
            # crashed the gate with "too many values to unpack" — invisible
            # until then, because the crash needed the 34a stylesheet to be
            # the one deployed. `Pair.mode` replaced the variable length so a
            # sixth field can never surprise an unpacker again. Same
            # skip-rule as the model: a light fit against the dark pane is a
            # combination the stylesheet never produces, and measuring it
            # would fail rows that no user can see.
            if pair.mode and pair.mode != mode:
                continue
            if need is None:
                continue
            try:
                bg_c = resolve(bg, variables)
                ink_c = resolve(ink, variables, over=bg)
                r = ratio(ink_c, bg_c)
            except ValueError as exc:
                failures.append(f"{mode}: {short(ink)} / {short(bg)} -> {exc}")
                continue
            if r < need:
                failures.append(
                    f"{mode}: {short(ink)} / {short(bg)} = {r:.2f}, needs {need} ({why})"
                )
    if failures:
        print(f"{len(failures)} rendered pairs fail:")
        for f in failures:
            print(f"   {f}")
        return 1
    print("rendered tokens pass every enforced pair, both modes")
    return 0


def check_measured() -> int:
    """Measure ad-hoc (ink, bg) pairs read from stdin — colours that live on an
    ELEMENT (its computed ``color`` and ``background-color``), not on ``<html>``
    as custom properties, so they cannot be swept by :func:`check_computed`'s
    token model. The sidebar's active pill is the first caller: its fill and
    label are set on the active LIST ITEM, not the root.

    A NEW mode rather than a widened `--check-computed`, on purpose. Widening
    that pair's SHAPE is exactly what broke it once already (see `Pair`'s
    docstring) — a second caller with a different shape is a second way to
    break the first. This one shares only ``parse_color``/``ratio`` with the
    rest of the file and touches nothing else, so it cannot be broken by a
    change to `pairs()` and cannot break `--check-computed`.

    Reads a JSON array of ``{"fg": "...", "bg": "...", "need": N, "why": "..."}``
    on stdin — literal colour strings as ``getComputedStyle`` reports them
    (``rgb()``/``rgba()``), already resolved, nothing to substitute.
    """
    items = json.load(sys.stdin)
    if not items:
        print("check-measured: no pairs supplied")
        return 1
    failures = []
    for item in items:
        fg, bg, need, why = item["fg"], item["bg"], item.get("need", AA_TEXT), item["why"]
        try:
            bg_c = parse_color(bg)
            if bg_c[3] < 1.0:
                raise ValueError(f"background {bg!r} is translucent — resolve it against its own host before sending it here")
            fg_c = parse_color(fg)
            if fg_c[3] < 1.0:
                fg_c = composite(fg_c, bg_c)
            r = ratio(fg_c, bg_c)
        except ValueError as exc:
            failures.append(f"{why}: {exc}")
            continue
        if r < need:
            failures.append(f"{why}: {fg} on {bg} = {r:.2f}, needs {need}")
    if failures:
        print(f"{len(failures)} measured pairs fail:")
        for f in failures:
            print(f"   {f}")
        return 1
    print(f"{len(items)} measured pairs pass")
    return 0


def emit_defaults() -> int:
    """Print the SCSS declarations for the shipped seed, ready to paste."""
    for mode in ("light", "dark"):
        print(f"/* --- {mode} --- */")
        for token, value in palette.derive(SEEDS[0][0], ACCENT_SEED, mode).items():
            print(f"  {token}: {value};")
        print()
    return 0


def main() -> int:
    args = sys.argv[1:]
    only_seed = next((a.split("=", 1)[1] for a in args if a.startswith("--seed=")), None)
    table_only = "--table" in args
    if "--emit-defaults" in args:
        return emit_defaults()
    if "--check-computed" in args:
        return check_computed()
    if "--check-measured" in args:
        return check_measured()

    light, dark = read_blocks(TOKENS_SCSS)
    seeds = [(only_seed, "requested")] if only_seed else SEEDS

    failures = []
    print(f"WCAG 2.2 AA : text {AA_TEXT}:1, non-text {AA_NON_TEXT}:1\n")

    # Two sources, because a tenant can be served by either.
    #   "brand sheet"  - brand.py has run; palette.derive's values are live.
    #   "fallback"     - it has not, or it 404'd; _tokens.scss stands alone. Only
    #                    the shipped seed is meaningful there, since without the
    #                    sheet there is no customer seed in play.
    runs = [(seed, label, True) for seed, label in seeds]
    runs.append((SEEDS[0][0], "fallback, no brand sheet", False))

    # Counted as evaluate() hands rows back, not derived from len(pairs()) —
    # a mode-scoped pair is skipped for HALF the runs, so a multiply-out
    # formula counts rows that were never measured. This is what "measured"
    # means: what evaluate() actually returned, summed as it is returned, so
    # the number cannot disagree with the loop that produces it.
    total = 0
    for seed, label, derived in runs:
        for mode, defaults in (("light", light), ("dark", dark)):
            rows = evaluate(seed, defaults, mode, derived=derived)
            total += len(rows)
            bad = [r for r in rows if r[2] is not None and (r[4] is None or r[4] < r[2])]
            if bad:
                failures.extend((seed, label, mode, r) for r in bad)

            show = table_only and seed == SEEDS[0][0] and derived
            if show or (bad and not table_only):
                print(f"-- {seed} ({label}) [{mode}]")
                for ink, bg, need, why, r, extra in rows:
                    if r is None:
                        print(f"   ????  {short(ink):>14} / {short(bg):<14} {extra}")
                        continue
                    if not show and (need is None or r >= need):
                        continue
                    mark = "ok  " if need is None or r >= need else "FAIL"
                    req = f"needs {need}" if need is not None else "exempt"
                    print(
                        f"   {mark} {r:6.2f}  {short(ink):>14} / {short(bg):<14}"
                        f" {req:<10} {why}"
                    )
                print()

    drift = check_defaults_agree(light, dark)

    if drift:
        print("_tokens.scss and palette.derive disagree:")
        for d in drift:
            print(f"   {d}")
        print("\nRun with --emit-defaults for the block to paste.\n")

    ref = check_deltae_reference()
    if ref:
        print(f"CIEDE2000 disagrees with the Sharma-Wu-Dalal reference ({len(ref)}):")
        for r in ref:
            print(f"   {r}")
        print()

    sep, sep_advisories = check_series_separation(light, dark)
    if sep:
        print("chart series separation is below the floor:")
        for s in sep:
            print(f"   {s}")
        print()
    if sep_advisories:
        print("chart series separation advisories (not build failures):")
        for s in sep_advisories:
            print(f"   {s}")
        print()

    if failures or drift or sep or ref:
        if failures:
            print(f"{len(failures)} of {total} measured pairs fail.\n")
            by_pair = {}
            for seed, label, mode, r in failures:
                by_pair.setdefault((short(r[0]), short(r[1])), []).append(f"{label}/{mode}")
            print("Grouped by pair:")
            for (ink, bg), where in sorted(by_pair.items()):
                print(f"   {ink:>14} / {bg:<14} fails for {len(where)}: {', '.join(where[:4])}"
                      + (" ..." if len(where) > 4 else ""))
        return 1

    print(f"All {total} measured pairs pass: {len(seeds)} seeds plus the no-brand-sheet "
          "fallback, both modes. _tokens.scss agrees with palette.derive, and the chart "
          "series clears its separation floor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
