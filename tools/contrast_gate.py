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
    to_lab,
)
from bunood_theme.contrast import delta_e  # noqa: E402

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

#: Indicator status-dot separation floor (item 28). LOWER THAN THE SERIES FLOOR,
#: and deliberately so — the two sets are not the same kind of palette.
#:
#: The series ramp is SEVEN slots we chose freely, so it can be a designed
#: CVD-safe scheme. The status ramp is TWELVE names Frappe already ships with
#: fixed meanings (red is danger, green is success): the hues are given, and all
#: that is fitted is their tone for a dark ground. Twelve constrained hues cannot
#: reach the separation seven free ones can, and forcing them there would mean
#: changing what a colour MEANS.
#:
#: The floor is set from measurement, not taste. Borrowing Frappe's own
#: --text-on-* values — the first repair item 28 shipped — scores 0.83, which is
#: BELOW the ~2.3 just-noticeable difference: legible dots that cannot be told
#: apart. The fitted ramp scores 3.58 in dark and 4.28 in light. 3.0 sits above
#: the JND and below what is achievable, so it fails the borrowed set and passes
#: the fitted one.
STATUS_FLOOR_COMMON = 3.0

#: The twelve names, in Frappe's own order. Imported rather than restated so the
#: gate and palette.STATUS_HUES cannot list different sets.
STATUS_NAMES = tuple(palette.STATUS_HUES)

#: The shipped accent. Held constant while the brand seed varies: the two are
#: independent settings, and varying both would multiply the matrix without
#: testing anything the brand axis does not already cover.
ACCENT_SEED = "#0090ff"

TOKENS_SCSS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "bunood_theme", "public", "scss", "_tokens.scss",
)

SIDEBAR_SCSS = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "bunood_theme", "public", "scss", "chrome", "_sidebar.scss",
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
    #: The surface a TRANSLUCENT ``bg`` is painted on. Defaults to
    #: ``--bnd-surface`` because that is what every pair before item 40
    #: assumed — but the sidebar chip sits on the PANE, and the pane is
    #: #15181a where --bnd-surface is #ffffff. Flattening the chip over the
    #: wrong host is not a rounding error, it is the difference between
    #: 3.76:1 and a pass.
    overlay: str = "var(--bnd-surface)"


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
    SB_HUES = {p: palette.sb_hues(p) for p in ("light", "dark")}
    for polarity, panes in palette.SB_PANES.items():
        for n in range(7):
            for pane in panes.values():
                # The dark-contrast pane is dark in BOTH desk themes, but its
                # hues come from the mode block that also serves dark desks, so
                # the dark fit is what renders on it always — checked in dark
                # mode, where --bnd-pane agrees with it.
                out.append(Pair(
                    SB_HUES[polarity][n], palette.sb_pane_css(pane), AA_TEXT,
                    f"sidebar hue {n + 1} ({polarity} fit) on the {pane.label}", polarity,
                ))
    for pct, base in palette.SB_STOPS:
        out.append(Pair(
            "#ffffff", f"color-mix(in srgb, var(--bnd-brand) {pct}%, {base})", None,
            f"brand-pane ink at the gradient's {base} stop; see the brand-mode note",
        ))

    # ── The chip, measured on the pane it is actually painted on (item 40) ───
    #
    # THE GATE HAD NO CHIP ROW AT ALL, and that is how defect 25 lived: dark
    # minimal declared 12 of the 14 working-set tokens, so --bnd-sb-chip-ink
    # fell through to the LIGHT block and painted #6d7570 on a #15181a pane.
    # 3.76:1, shipped, with a green gate — because nothing here ever asked.
    #
    # The values come from the stylesheet rather than a derivation because the
    # chip HAS no derivation yet — the ramp so far derives the hues, and what
    # tints Minimal is still an open design decision. Read, do not re-copy.
    #
    # THE PANE'S OWN TEXT HAD NO ROW EITHER, which is the larger half of the
    # same hole: every enforced sidebar row before item 40 measured a CATEGORY
    # HUE, and the workspace links are painted in --bnd-sb-ink and
    # --bnd-sb-ink-muted. Fourteen decorative marks were gated and the words
    # were not. Both are declared per mode, both are wrong on the other mode's
    # pane, and neither the hue rows nor `check_sidebar_coverage` can see it —
    # a dark arm that simply omits an override leaves a COMPLETE map after the
    # cascade, carrying the light value. Only measuring says so.
    #
    # Worst across the 27 gate seeds when these landed: ink 9.00 everywhere,
    # muted 4.57 (minimal light) to 7.95. That 4.57 is a 0.07 margin — exactly
    # the kind of figure that should be enforced rather than admired once.
    for (polarity, mode_name), block in sidebar_worlds().items():
        pane = _sb_pane_expr(polarity, mode_name)
        if pane is None:
            continue  # the brand gradient: see palette.SB_UNMEASURABLE
        where = f"{mode_name} {polarity or 'both'}"
        # The chip background is TRANSLUCENT in three of the four modes, which
        # is why `Pair.overlay` had to exist: `resolve` flattens a translucent
        # colour over --bnd-surface by default, and --bnd-surface is #ffffff in
        # light. A chip measured against that would read "fine" for exactly the
        # dark pane where it was not.
        out.append(Pair(
            block["--bnd-sb-chip-ink"], block["--bnd-sb-chip-bg"], AA_TEXT,
            f"sidebar chip label on its chip, {where}", polarity, overlay=pane,
        ))
        for ink, what in (("--bnd-sb-ink", "link text"), ("--bnd-sb-ink-muted", "muted text")):
            out.append(Pair(block[ink], pane, AA_TEXT, f"sidebar {what} on the pane, {where}", polarity))
            # The card surface is translucent in Dark Contrast, so it needs the
            # pane as its own host before anything is measured against it.
            out.append(Pair(
                block[ink], block["--bnd-sb-card-base"], AA_TEXT,
                f"sidebar {what} on a section card, {where}", polarity, overlay=pane,
            ))
        # Measured, not enforced — the same standing as --bnd-border on
        # --bnd-surface above. A hairline separator is a boundary between two
        # regions of the same surface, not a control edge; item 22 argued this
        # once and the sidebar's line is the same thing under another name.
        # Published so the gap has a number: 1.17-1.30 across the five panes.
        out.append(Pair(
            block["--bnd-sb-line"], pane, None,
            f"sidebar separator on the pane, {where}; see item 22", polarity, overlay=pane,
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
    PILL = "var(--bnd-brand-solid, var(--bnd-brand))"
    for polarity, panes in palette.SB_PANES.items():
        for pane in panes.values():
            # An ALIAS pane is a global surface under another name, and that
            # surface already has its own --bnd-brand-solid row above. Adding
            # it here would measure the same pair twice and report it as two
            # findings. (Before item 40 this read `LIGHT_PANES[1:]` — index
            # arithmetic that happened to skip the right entry, and would have
            # skipped the wrong one the day a pane was inserted before it.)
            if pane.recipe[0] == "alias":
                continue
            out.append(Pair(
                PILL, palette.sb_pane_css(pane), None,
                f"sidebar active pill fill against its own {pane.label}", polarity,
            ))
    # Dark Contrast's own pane is dark in BOTH desk themes (see the hue-fit
    # loop above), so its fill needs checking against a LIGHT-derived
    # brand-solid too — a light desk with Dark Contrast sidebar mode is a
    # real, reachable combination.
    out.append(Pair(
        PILL, palette.sb_pane_css(palette.SB_PANES["dark"]["dark"]), None,
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
    # ── Filters kit (item 31) ────────────────────────────────────────────────
    # `filters_applied: Accented` washes the applied filter control with the
    # SAME expression, character-identical, so the string is reused rather than
    # restated — and its label is the fitted brand ink rather than a body ink,
    # which the rows above do not cover. Worst measured 4.54:1 across the eleven
    # seeds x two modes, so it passes; an unenforced pair nobody can see is
    # indistinguishable from an oversight, which is why it is here at all.
    #
    # The pole's identifiability does NOT rest on this wash. At a pale seed the
    # wash converges on the surface (measured: 2 channels at near-white, 0 at
    # pure white), so the RING carries the state — and the ring is
    # --bnd-brand-solid, already held at 3:1 by "brand fill against the chrome"
    # above.
    out.append(
        Pair("var(--bnd-brand-ink, var(--bnd-brand))", SEL_BG, AA_TEXT,
             "the applied filter control's label on its brand wash")
    )
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

    # ── Login / signup / forgot (item 32) ─────────────────────────────────────
    # The SAME 4%-ink lever, over `--bnd-page` instead of `--bnd-surface`. That
    # one substitution is the whole reason these rows exist rather than reusing
    # TRACK_BG above: the login card is `--bnd-page` under `Original`, and a
    # fill delta is a delta against its HOST. Measured live before this was
    # noticed — mixing against `--bnd-surface` on a `--bnd-page` card gave FOUR
    # channels, inside the range item 29 twice rejected as "renders as nothing".
    # Against the host it is nine, in both modes, at every seed.
    #
    # Three inks, because the field carries three roles and they are NOT
    # interchangeable — which this gate proved rather than assumed. The first cut
    # put the placeholder on `--bnd-ink-subtle` and these rows failed at three
    # pale seeds (4.38 bright yellow, 4.24 near-white, 4.16 pure white): a fill
    # darkened by an ink wash costs contrast, and the weakest ink is fitted
    # against the RAW surface. The placeholder moved to `--bnd-ink-muted`.
    #
    # The third row is EXEMPT and measured rather than enforced: the disabled
    # submit's label is on a control that is `disabled`, which WCAG 1.4.3 does
    # not cover. It is printed anyway because an exemption nobody can see the
    # number for is indistinguishable from an oversight — this file's own rule.
    FIELD_BG = "color-mix(in srgb, var(--bnd-ink) 4%, var(--bnd-page))"
    out += [
        Pair("var(--bnd-ink)", FIELD_BG, AA_TEXT, "login field value on its resting fill"),
        Pair("var(--bnd-ink-muted)", FIELD_BG, AA_TEXT,
             "login field placeholder and label on that fill"),
        Pair("var(--bnd-ink-subtle)", FIELD_BG, None,
             "login disabled submit label; 1.4.3 exempts a disabled control"),
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

    # ── Toast subtitle on Frappe's four alert washes (item 28) ───────────────
    # The washes are Frappe CONSTANTS (desk/dark.scss:89-92 and its light twin),
    # so five literal rows cover all eleven seeds at once. They are pinned here
    # because the first version of this repair used a SEED-DERIVED ink and
    # measured 3.67 on the warning wash in dark at seed #000000 — a quieter AA
    # failure swapped in for the loud one, and nothing in the tree would have
    # caught it. TEXT, not graphic: this is a sentence.
    # Mode-SCOPED, using Pair's own `mode` field: the wash is a different literal
    # in each theme, so a dark wash must not be evaluated against light tokens.
    _ALERT_WASHES = {
        "light": {"danger": "#fff7f7", "warning": "#fffcef", "info": "#f7fbfd", "success": "#e4f5e9"},
        "dark": {"danger": "#6b1515", "warning": "#733f12", "info": "#004880", "success": "#173b2c"},
    }
    for _mode, washes in _ALERT_WASHES.items():
        for name, bg in washes.items():
            out.append(Pair("var(--bnd-ink)", bg, AA_TEXT,
                            f"toast subtitle on the {name} wash", _mode))

    # ── Indicator status dots (item 28) ───────────────────────────────────────
    # A status dot is a meaningful graphic, so 1.4.11's 3:1. The three surfaces
    # are every ground a dot lands on: a dialog header and a list row
    # (--bnd-surface), a raised panel (--bnd-raised) and the canvas (--bnd-page).
    # Brand-independent like the series ramp, so these hold for every seed at
    # once. Mutual separation is check_status_separation's job, not a ratio's.
    # ALL SIX SURFACES, not the chart's three. A dot sits in a list row (which
    # HOVERS), in a sidebar card (--bnd-pane) and in a selected row
    # (--bnd-active) — the release review measured ten of the twelve below 3:1
    # on exactly those three while this table reported green, because it had
    # borrowed the chart ramp's narrower set along with its binding function.
    for name in STATUS_NAMES:
        for bg in ("var(--bnd-page)", "var(--bnd-surface)", "var(--bnd-raised)",
                   "var(--bnd-pane)", "var(--bnd-hover)", "var(--bnd-active)"):
            out.append(Pair(f"var(--bnd-status-{name})", bg, AA_NON_TEXT,
                            f"status dot {name}"))

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


#: How far a shipped palette's focus ring must sit from every status colour
#: (CIEDE2000). Measured: the catalogue's worst is 31.5 and the two candidates the
#: round rejected scored 9.6 (tomato, against --bnd-serious) and 3.7 (the ring
#: following a green brand, against --bnd-good). 25 sits clear of both.
ACCENT_STATUS_MIN_DE = 25.0

#: The lightness floor the DARK brand fill must clear (item 37).
DARK_FILL_MIN_L = 62.0

#: Seeds to check. The first is what ships; the rest are the colours a tenant
#: plausibly picks, including the two GUIDELINES §2.2 measured as catastrophic.
SEEDS = [
    ("#3d8150", "shipped default"),
    ("#0090ff", "accent blue"),
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
    # ── The shipped palettes (item 37) ───────────────────────────────────────
    # A published palette is a colour a tenant reaches in ONE CLICK, so it is not
    # "a colour somebody might paste in" — it has to be swept like the shipped
    # default. `check_palette_catalogue` additionally re-derives each one as the
    # (brand, accent, ground) TRIPLE it actually ships; this list is what puts its
    # brand through the full pair set. Bunood is already the shipped default above.
    ("#3e63dd", "palette Indigo"),
    ("#0090ff", "palette Blue"),
    ("#00a2c7", "palette Cyan"),
    ("#12a594", "palette Teal"),
    ("#6e56cf", "palette Violet"),
    ("#ab4aba", "palette Plum"),
    ("#e93d82", "palette Crimson"),
    ("#e5484d", "palette Red"),
    ("#f76b15", "palette Orange"),
    ("#a18072", "palette Bronze"),
    ("#8b8d98", "palette Slate"),
    ("#ffc53d", "palette Ochre"),
    ("#ffe629", "palette Olive"),
    ("#bdee63", "palette Moss"),
    ("#86ead4", "palette Sea"),
    ("#7ce2fe", "palette Steel"),
]


# ── Reading the tokens ───────────────────────────────────────────────────────


def _strip_comments(src: str) -> str:
    """Drop `//` line comments. Every SCSS reader here starts with this."""
    return re.sub(r"//[^\n]*", "", src)


def body_of(src: str, pattern: str, what: str, path: str) -> str:
    """The brace-matched body of the first construct matching ``pattern``."""
    m = re.search(pattern, src, re.M)
    if not m:
        raise SystemExit(f"contrast gate: no {what} in {path}")
    depth, i = 1, m.end()
    while depth and i < len(src):
        depth += {"{": 1, "}": -1}.get(src[i], 0)
        i += 1
    return src[m.end() : i - 1]


def expand_includes(src: str, body: str, path: str, depth: int = 0) -> str:
    """Substitute ``@include <name>;`` with the body of ``@mixin <name>``.

    WHY THIS EXISTS (item 32). The dark token set became a ``@mixin`` so it
    could be emitted under a third selector — a website page carries no
    ``data-theme``, so the login sheet reaches dark through
    ``prefers-color-scheme`` — and this parser reads the SOURCE, not the
    compiled CSS. Without expansion, ``html[data-theme="dark"] { @include
    dark; }`` parses as an EMPTY block, ``dark`` collapses onto ``light``,
    and the gate reports 150 failures in dark for every seed while the
    stylesheet is perfectly correct.

    Recorded because of how it was found: the mixin commit proved itself
    inert with a BYTE-IDENTICAL rebuild, which is real evidence about the
    compiled sheet and no evidence at all about a tool that parses the
    source. Two things read ``_tokens.scss`` and only one of them is Sass.

    MODULE-LEVEL SINCE ITEM 40, and that is the point. ``_sidebar.scss`` now
    uses the same mixin shape for the same reason — its dark hue set is
    emitted under ``[data-theme="dark"]`` AND the ``automatic`` arm — so a
    second reader had to expand includes too. Nested inside ``read_blocks``
    this would have been copied, and a copy of a parser is the same-fact-twice
    defect wearing a different hat: the item-32 incident above would then be
    fixable in one reader and still live in the other.
    """
    if depth > 4:
        raise SystemExit("contrast gate: @include nesting too deep in " + path)

    def sub(m):
        name = m.group(1)
        inner = body_of(src, r"@mixin\s+" + re.escape(name) + r"\s*\{", f"@mixin {name}", path)
        return expand_includes(src, inner, path, depth + 1)

    return re.sub(r"@include\s+([\w-]+)\s*;", sub, body)


def read_decls(src: str, pattern: str, what: str, path: str) -> dict:
    """The custom-property declarations of one brace-matched block, includes expanded."""
    out = {}
    for decl in _split_decls(expand_includes(src, body_of(src, pattern, what, path), path)):
        if ":" not in decl:
            continue
        name, _, value = decl.partition(":")
        name = name.strip()
        if name.startswith("--"):
            out[name] = value.strip()
    return out


#: How each of the six colour worlds is composed, as ``(selector, mixin|None)``.
#:
#: This is a MODEL of the cascade, so `check_sidebar_agrees` pins it to the
#: file: the `[data-theme="dark"]` blocks must declare exactly the mixin named
#: here and nothing else. Without that, a declaration added straight to the
#: dark selector would be invisible to every check below while rendering
#: perfectly on a desk — the shape of defect 25, one layer up.
_SB_WORLDS = {
    ("light", "theme"):   ('html[data-bnd-sb-color="theme"]', None),
    ("light", "minimal"): ('html[data-bnd-sb-color="minimal"]', None),
    ("dark", "theme"):    ('html[data-bnd-sb-color="theme"]', "sb-theme-dark"),
    ("dark", "minimal"):  ('html[data-bnd-sb-color="minimal"]', "sb-minimal-dark"),
    # Dark Contrast declares its own full set and applies in BOTH desk themes;
    # it is filed under "dark" because its PANE is dark either way, which is
    # the grouping palette.SB_PANES uses and the reason it must not join the
    # light hue walk.
    ("dark", "dark"):     ('html[data-bnd-sb-color="dark"]', None),
    (None, "brand"):      ('html[data-bnd-sb-color="brand"]', None),
}

#: The `[data-theme="dark"]` selector each dark override is emitted under.
_SB_DARK_ARMS = {
    "sb-theme-dark": 'html[data-theme="dark"][data-bnd-sb-color="theme"]',
    "sb-minimal-dark": 'html[data-theme="dark"][data-bnd-sb-color="minimal"]',
}

_sb_cache: dict | None = None


def sidebar_worlds() -> dict:
    """``{(polarity, mode): {token: value}}`` for every sidebar colour world.

    Parsed from ``_sidebar.scss`` with the same reader ``_tokens.scss`` uses —
    including ``@include`` expansion, which this file needs for the same reason
    that one does. Cached: ``pairs()`` runs 54 times a gate run and the file
    does not change under it.
    """
    global _sb_cache
    if _sb_cache is None:
        src = _strip_comments(open(SIDEBAR_SCSS, encoding="utf-8").read())
        worlds = {}
        for key, (selector, mixin) in _SB_WORLDS.items():
            base = read_decls(src, r"^" + re.escape(selector) + r"\s*\{",
                              f"`{selector}` block", SIDEBAR_SCSS)
            if mixin:
                base = {**base, **read_decls(src, r"@mixin\s+" + re.escape(mixin) + r"\s*\{",
                                             f"@mixin {mixin}", SIDEBAR_SCSS)}
            worlds[key] = base
        _sb_cache = worlds
    return _sb_cache


def _sb_pane_expr(polarity, mode: str):
    """The CSS expression for one world's pane, or None if it is unmeasurable."""
    pane = palette.SB_PANES.get(polarity, {}).get(mode)
    return palette.sb_pane_css(pane) if pane else None


def check_sidebar_agrees() -> list[str]:
    """`_sidebar.scss` declares exactly what the ramp derives — item 40.

    THE DUPLICATION THIS DELETES. Until this landed, `pairs()` carried its own
    copy of the fourteen fitted hues and the four pane expressions, and its own
    comment admitted the arrangement: "edit the fits in _sidebar.scss and these
    hexes together or the gate says so." It did not say so. Nothing compared
    them; the sentence was an instruction to a human, which is the failure mode
    this repo names first. Now the hues come from `palette.sb_hues` and the
    panes from `palette.sb_pane_css`, and this function is the only place the
    stylesheet and the derivation meet.

    It also pins the cascade model in `_SB_WORLDS`: a dark arm that declares
    anything of its own, rather than including the mixin, would otherwise be
    read by nothing here.
    """
    src = _strip_comments(open(SIDEBAR_SCSS, encoding="utf-8").read())
    problems = []

    for mixin, selector in _SB_DARK_ARMS.items():
        arm = read_decls(src, r"^" + re.escape(selector) + r"\s*\{",
                         f"`{selector}` block", SIDEBAR_SCSS)
        body = read_decls(src, r"@mixin\s+" + re.escape(mixin) + r"\s*\{",
                          f"@mixin {mixin}", SIDEBAR_SCSS)
        if arm != body:
            differs = sorted({k for k in set(arm) | set(body) if arm.get(k) != body.get(k)})
            problems.append(
                f"{selector} does not reduce to @include {mixin}; it differs at {differs} — "
                "_SB_WORLDS models it as the mixin, so those declarations are invisible to this gate"
            )

    for (polarity, mode), block in sidebar_worlds().items():
        if polarity:
            want = palette.sb_hues(polarity)
            for n in range(7):
                token = f"--bnd-sb-cat-{n + 1}"
                got = block.get(token)
                if got != want[n]:
                    problems.append(
                        f"{mode}/{polarity}: {token} is {got}, the ramp derives {want[n]}"
                    )
        pane = _sb_pane_expr(polarity, mode)
        if pane is not None and block.get("--bnd-sb-bg") != pane:
            problems.append(
                f"{mode}/{polarity}: --bnd-sb-bg is {block.get('--bnd-sb-bg')}, "
                f"palette.SB_PANES derives {pane}"
            )

    brand_bg = " ".join(sidebar_worlds()[(None, "brand")].get("--bnd-sb-bg", "").split())
    for pct, base in palette.SB_STOPS:
        stop = f"color-mix(in srgb, var(--bnd-brand) {pct}%, {base})"
        if stop not in brand_bg:
            problems.append(f"brand: --bnd-sb-bg does not carry the gradient stop {stop}")
    return problems


def check_sidebar_coverage() -> list[str]:
    """Every colour world declares the whole working set, and nothing stray.

    WHAT THIS CATCHES, STATED NARROWLY, because the first draft of this
    docstring claimed defect 25 and that claim was false — caught by running
    the sabotage rather than by reading the code. Deleting dark minimal's two
    chip declarations, which is defect 25 exactly, leaves this check SILENT:
    `_SB_WORLDS` models the cascade correctly, so the dark map is the light
    map plus an override, and dropping the override leaves fourteen keys
    present. Complete, and carrying the light block's #6d7570 onto a #15181a
    pane. The guard for that is a MEASURED ROW — the chip pair in `pairs()`,
    which reports 3.76:1 at all 27 seeds when the fix is reverted.

    So this one owns the two things measurement cannot reach:

    * A token missing from a mode with no base layer to inherit from. Dark
      Contrast and Brand declare standalone full sets; a gap there resolves to
      nothing at all rather than to the wrong colour, which no ratio can see.
    * A stray unclassified ``--bnd-sb-*``. One block declaring a token the
      other five do not is the *next* fall-through, waiting for the day a
      component starts reading it — the shape of defect 25 before it was one.

    The file's own header has said "Each mode sets the full set; components
    below never look elsewhere" since item 10, two lines above a block that did
    not. A sentence in a comment is not a contract; this is.
    """
    problems = []
    for (polarity, mode), block in sidebar_worlds().items():
        where = f"{mode}/{polarity or 'both'}"
        for token in palette.SB_WORKING_SET:
            if token not in block:
                problems.append(
                    f"{where} does not declare {token} — it will fall through to another block"
                )
        allowed = set(palette.SB_WORKING_SET) | set(palette.SB_EXTRAS.get(mode, {}))
        for token in block:
            if token.startswith("--bnd-sb-") and token not in allowed:
                problems.append(
                    f"{where} declares {token}, which is in neither palette.SB_WORKING_SET "
                    f"nor palette.SB_EXTRAS[{mode!r}] — classify it or the other five modes "
                    "silently lack it"
                )
    return problems


def check_sidebar_headroom() -> list[str]:
    """A pane that MOVES must not take its own ink below the floor — item 40.

    THE GAP THIS CLOSES, and it is a structural one. `pairs()` measures each
    pane through :func:`palette.sb_pane_css`, which is the STATIC fallback: a
    ``("ground", …)`` recipe declares its base there, because there is no
    `--bnd-ground` token for a stylesheet to name. So the seed sweep — which
    has a brand axis and no ground axis — never sees the colour a grounded site
    actually paints. Every row in it would stay green while the shipped pane
    moved underneath.

    WHAT IT CAUGHT BEFORE IT GUARDED ANYTHING. Slice 2 asked whether Minimal
    should be tinted at 3, 5 or 8 percent. In light it can be tinted by
    **1.36%**: `--bnd-sb-ink-muted` and `--bnd-sb-chip-ink` are #6d7570 on
    #fafbfa, 4.57:1 against a 4.5 floor, and the three candidates measure
    4.45 / 4.35 / 4.22 at the worst shipped ground — worse against an
    unconstrained one. That is a three-for-three failure that no existing check
    could see, and it is why light ships at 0% and dark at 5%.

    HOW IT MEASURES. Every measurable pane, at every tint a tenant can reach:
    the extreme (both `brand_color` and `ground_color` are unconstrained Frappe
    Color fields — `ground_color`'s `validate()` strips and lowercases and
    throws nothing) plus the six shipped grounds. The block's own inks are
    resolved against a `derive()` at that same seed, so a mode whose inks are
    `var(--bnd-ink-muted)` is measured as a site renders it rather than skipped.

    The chip is measured on the chip, composited over the pane — a translucent
    chip flattened over the wrong host is the defect-25 shape, one layer down.
    """
    from bunood_theme.presets import GROUNDS

    light, dark = read_blocks(TOKENS_SCSS)
    defaults = {"light": light, "dark": dark}
    inks = ("--bnd-sb-ink", "--bnd-sb-ink-muted", "--bnd-sb-chip-ink")
    problems = []

    for (polarity, mode), block in sidebar_worlds().items():
        recipe = palette.SB_PANES.get(polarity, {}).get(mode)
        if recipe is None:
            continue  # the brand gradient: see palette.SB_UNMEASURABLE
        extreme = "#000000" if polarity == "light" else "#ffffff"
        tints = [(extreme, "the extreme ground")] + [
            (g, f"the {name} ground") for name, g in sorted(GROUNDS.items())
        ]
        for tint, why in tints:
            pane = palette.sb_pane_value(recipe, tint, polarity, ground=tint)
            v = dict(defaults[polarity])
            v["--bnd-brand"] = tint
            try:
                v.update(palette.derive(tint, ACCENT_SEED, polarity, ground=tint))
            except ValueError as exc:
                problems.append(f"{mode}/{polarity} at {tint}: derive failed — {exc}")
                continue
            pane_c = parse_color(pane)
            for tok in inks:
                r = ratio(resolve(block[tok], v, over=pane), pane_c)
                if r < AA_TEXT:
                    problems.append(
                        f"{mode}/{polarity}: {tok} ({block[tok]}) measures {r:.2f} on the pane "
                        f"{pane} that {why} produces — under {AA_TEXT}. A pane that moves and an "
                        "ink that does not is half a pair; move both or neither."
                    )
            chip_bg = resolve(block["--bnd-sb-chip-bg"], v, over=pane)
            chip_ink = resolve(block["--bnd-sb-chip-ink"], v, over=to_hex(chip_bg))
            r = ratio(chip_ink, chip_bg)
            if r < AA_TEXT:
                problems.append(
                    f"{mode}/{polarity}: the chip label measures {r:.2f} on its chip over the pane "
                    f"{pane} that {why} produces — under {AA_TEXT}."
                )
    return problems


def _specificity(selector: str) -> tuple:
    """(ids, classes+attributes+pseudo-classes, elements) for ONE simple selector.

    Deliberately narrow, and it RAISES on anything it has not been taught. A
    specificity calculator that guesses is worse than none: it would return a
    number, the comparison below would pass, and the emitted block would lose to
    the bundle on every site that set a ground — silently, because the fallback
    it lost to is a plausible colour.
    """
    sel = selector.strip()
    ids = cls = els = 0
    # `:not(...)` takes the specificity of its argument, so unwrap and recurse.
    for inner in re.findall(r":not\(([^()]*)\)", sel):
        a, b, c = _specificity(inner)
        ids, cls, els = ids + a, cls + b, els + c
    sel = re.sub(r":not\([^()]*\)", "", sel)
    cls += len(re.findall(r"\[[^\]]*\]", sel))
    sel = re.sub(r"\[[^\]]*\]", "", sel)
    cls += len(re.findall(r"\.[A-Za-z_-][\w-]*", sel))
    sel = re.sub(r"\.[A-Za-z_-][\w-]*", "", sel)
    ids += len(re.findall(r"#[A-Za-z_-][\w-]*", sel))
    sel = re.sub(r"#[A-Za-z_-][\w-]*", "", sel)
    for tok in re.findall(r"[A-Za-z][\w-]*", sel):
        els += 1
        sel = sel.replace(tok, "", 1)
    leftover = sel.strip()
    if leftover:
        raise SystemExit(
            f"contrast gate: _specificity cannot read {leftover!r} in {selector!r}. "
            "Teach it or the emission check is measuring a number it invented."
        )
    return ids, cls, els


def _sb_static_selectors(mode: str) -> list[str]:
    """Every selector in `_sidebar.scss` that DECLARES the working set for ``mode``.

    Derived from `_SB_WORLDS` and `_SB_DARK_ARMS` rather than restated, so a mode
    whose blocks move cannot leave this behind. Selectors that merely READ
    `--bnd-sb-bg` (`html[data-bnd-sb-color] .body-sidebar-container`) are not here
    and must not be: an emission has to out-specify what DECLARES the token, not
    what paints with it.
    """
    out = []
    for (polarity, name), (selector, mixin) in _SB_WORLDS.items():
        if name != mode:
            continue
        out.append(selector)
        if mixin:
            out.append(_SB_DARK_ARMS[mixin])
            out.append(_SB_DARK_ARMS[mixin].replace('data-theme="dark"', 'data-theme="automatic"'))
    return sorted(set(out))


def check_sidebar_emission() -> list[str]:
    """What `brand.py` emits for the pane reaches the site, and beats the bundle.

    Item 40, slice 3. A ground-tinted pane cannot be written as static CSS —
    there is no `--bnd-ground` token, because the ground is an input to
    `palette.derive` and not an output — so it reaches a desk only through the
    per-site sheet. Four things have to hold, and three of them fail SILENTLY:

    * **Specificity.** `_sidebar.scss` declares (0,2,1). The per-site sheet loads
      after the bundle, so an equal block wins on source order and a LOWER one
      loses however late it loads. Item 32 lost `:focus`, `:disabled` and a whole
      strength track to exactly this, sizing a selector against the resting rule.
      Here the emitted selector is compared to the static one it must beat.

    * **The automatic twin.** `data-theme` is literally "automatic" until our JS
      resolves it. `build.mjs`'s `assertAutomaticArms` refuses a compiled dark
      selector with no twin, but it reads compiled CSS and cannot see a string
      built at runtime — so this is where the runtime half is checked.

    * **Standing down.** A site that set no ground must get NOTHING, not a block
      restating the fallback. Bytes on every desk page for no change, and a
      second copy of a literal that the bundle already owns.

    * **The value.** Round-tripped out of the rendered text rather than trusted:
      a formatting bug produces CSS that parses and paints the wrong colour.
    """
    from bunood_theme.presets import GROUNDS

    problems = []
    src = _strip_comments(open(SIDEBAR_SCSS, encoding="utf-8").read())

    # Every tenant shape that can reach the emitter: no ground (must be silent),
    # and each shipped ground (must emit, and emit the derivation's own answer).
    if palette.sb_blocks(SEEDS[0][0], SEEDS[0][0], None) != "":
        problems.append(
            "a site with no ground still emits a sidebar block — that is bytes on every "
            "desk page restating a literal the bundle already declares"
        )

    for gname, ground in sorted(GROUNDS.items()):
        text = palette.sb_blocks(SEEDS[0][0], SEEDS[0][0], ground)
        size = len(text.encode("utf-8"))
        if size > palette.SB_EMIT_CEILING:
            problems.append(
                f"the {gname} ground emits {size} bytes into every desk page's stylesheet, "
                f"over palette.SB_EMIT_CEILING ({palette.SB_EMIT_CEILING}). Raise it in the "
                "commit that needs it, with the reason."
            )
        if not text:
            problems.append(f"the {gname} ground emits nothing, but its pane differs from the fallback")
            continue

        # Every rule in the emitted text, with the media context it sits in.
        in_media = False
        for line in text.splitlines():
            st = line.strip()
            if st.startswith("@media"):
                in_media = "prefers-color-scheme: dark" in st
                continue
            if not st.endswith("{") or st == "{":
                continue
            sel = st[:-1].strip()
            for one in [x.strip() for x in sel.split(",")]:
                m = re.search(r'\[data-bnd-sb-color="([a-z-]+)"\]', one)
                if not m:
                    problems.append(f"emitted selector {one!r} names no colour mode")
                    continue
                mode = m.group(1)
                # THE TARGET COMES FROM THE MODE, NEVER FROM THE EMITTED SELECTOR.
                # The first version of this check read `data-theme` off the string
                # it was judging and looked up the static block that matched IT —
                # so an emission downgraded to one attribute simply picked the
                # bundle's one-attribute block as its target and compared equal.
                # A vacuous comparison that returns a number is worse than none,
                # and the sabotage that proved it is case (m). What an emission
                # must beat is the STRONGEST static block naming that mode,
                # because that is what the cascade will actually put in its way.
                statics = [
                    st_sel for st_sel in _sb_static_selectors(mode)
                    if st_sel in src
                ]
                if not statics:
                    problems.append(
                        f"emitted {one!r} has no counterpart in _sidebar.scss — it is either "
                        "unopposed (so the fallback is missing) or aimed at nothing"
                    )
                    continue
                target = max(statics, key=_specificity)
                if _specificity(one) < _specificity(target):
                    problems.append(
                        f"emitted {one!r} is {_specificity(one)} against the bundle's "
                        f"{target!r} at {_specificity(target)} — it loses however late "
                        "the sheet loads"
                    )
                theme = re.search(r'\[data-theme="([a-z]+)"\]', one)
                if theme and theme.group(1) == "automatic" and not in_media:
                    problems.append(f"emitted {one!r} is not inside a prefers-color-scheme block")

        # Round-trip the value out of the text, and check the twin exists.
        for polarity, modes in palette.SB_PANES.items():
            for mode, pane in modes.items():
                if pane.recipe[0] not in ("ground",):
                    continue
                want = palette.sb_pane_value(pane, SEEDS[0][0], polarity, ground=ground)
                got = re.findall(r"--bnd-sb-bg:\s*([^;]+);", text)
                if not got:
                    problems.append(f"the {gname} ground emits a block with no --bnd-sb-bg")
                elif any(v.strip() != want for v in got):
                    problems.append(
                        f"the {gname} ground emits {set(v.strip() for v in got)} for {mode}/{polarity}, "
                        f"but palette.sb_pane_value derives {want}"
                    )
                if polarity == "dark":
                    dark_sel = f'html[data-theme="dark"][data-bnd-sb-color="{mode}"]'
                    auto_sel = f'html[data-theme="automatic"][data-bnd-sb-color="{mode}"]'
                    if dark_sel in text and auto_sel not in text:
                        problems.append(
                            f"the {gname} ground emits {dark_sel} with no `automatic` twin — an "
                            "Automatic user on a dark OS gets the light fallback until JS resolves "
                            "the attribute. That is defect 27, in a string build.mjs cannot read."
                        )
    return problems


def check_sidebar_binding() -> list[str]:
    """Every colour mode the stylesheet offers is a pane some hue was fitted against.

    The hues are fitted to a BINDING pane — the hardest one across every seed —
    so a colour mode that reaches neither `palette.SB_PANES` nor
    `palette.SB_UNMEASURABLE` is a pane no fit has ever seen. It would render,
    and the gate would report nothing, which is how a sixth mode would arrive
    at the contrast of whatever it happened to be given.

    Checked in both directions: a table entry with no block in the stylesheet
    is a pane being fitted against that nobody can select.
    """
    src = _strip_comments(open(SIDEBAR_SCSS, encoding="utf-8").read())
    # NOT anchored on `html[` — a mode declared only on a COMPOUND selector,
    # `html[data-theme="dark"][data-bnd-sb-color="sepia"]`, is still a mode
    # somebody can select, and an anchored pattern would walk straight past it.
    # Found by re-reading this line, not by the sabotage below: case (e) added
    # its fake mode as a single-attribute block, which the anchored version did
    # catch. A guard's test passing says nothing about the case the test did not
    # write — so the compound form is now case (i).
    declared = set(re.findall(r'\[data-bnd-sb-color="([a-z-]+)"\]', src))
    known = {m for modes in palette.SB_PANES.values() for m in modes} | set(palette.SB_UNMEASURABLE)
    problems = []
    for mode in sorted(declared - known):
        problems.append(
            f'_sidebar.scss offers data-bnd-sb-color="{mode}" and neither palette.SB_PANES nor '
            "palette.SB_UNMEASURABLE names it — no hue has ever been fitted against that pane"
        )
    for mode in sorted(known - declared):
        problems.append(
            f"palette names the {mode!r} pane but _sidebar.scss declares no block for it"
        )
    return problems


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
    src = _strip_comments(open(path, encoding="utf-8").read())

    def block(selector: str) -> dict:
        return read_decls(src, r"^" + re.escape(selector) + r"\s*\{", f"top-level `{selector}` block", path)

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
            bg_c = resolve(bg, v, over=pair.overlay)
            # Composite the ink over the FLATTENED background, not over the
            # background's expression — a translucent bg would otherwise host
            # the ink at its own alpha, which is not what a browser paints.
            ink_c = resolve(ink, v, over=to_hex(bg_c))
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


def check_theme_catalogue() -> list[str]:
    """The theme catalogue, held to what the doctype will actually accept.

    Item 37. A theme preset writes ~124 values in one click — the largest blast
    radius any control in this app has had — so the table is checked against the
    doctype rather than trusted, on four properties:

      * EVERY AXIS IS WRITTEN. A preset that writes 123 of 124 leaves one field at
        whatever the last preset set, so clicking A then B does not give you B.
      * ONLY OFFERED VALUES. A Select that stores a value its options do not list
        is not a cosmetic fault on a Single: one un-offered value silently fails
        every later save of the whole document (item 36 measured six unrelated
        tests going red from exactly that).
      * PAIRWISE DISTINCT. Two presets with one composition make the derived label
        ambiguous, and "Custom" would be the only honest answer to both.
      * THE DEFAULT PRESET IS THE SHIPPED DEFAULT. If they differ by one value a
        brand-new site reads "Custom" on the day it is installed, which is the
        first thing its owner sees the settings page say.

    Frappe-free by construction: the options come from the doctype JSON on disk,
    which is the same file the server loads.
    """
    import json

    from bunood_theme.presets import (
        DEFAULT_THEME_PRESET,
        THEME_AXES,
        THEME_PRESETS,
        _shipped_baseline,
        theme_settings,
    )

    doctype = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "bunood_theme",
        "bunood_theme", "doctype", "theme_settings", "theme_settings.json",
    )
    with open(doctype, encoding="utf-8") as fh:
        meta = json.load(fh)
    options = {
        f["fieldname"]: [o for o in (f.get("options") or "").split("\n") if o]
        for f in meta["fields"]
        if f.get("fieldname") and f.get("fieldtype") == "Select"
    }

    bad: list[str] = []
    axes = set(THEME_AXES)
    composed: dict = {}

    for name in THEME_PRESETS:
        values = theme_settings(name)
        composed[name] = values

        missing = axes - set(values)
        if missing:
            bad.append(f"{name}: writes {len(values)} of {len(axes)} axes, missing "
                       f"{', '.join(sorted(missing)[:4])}")

        for field, value in values.items():
            allowed = options.get(field)
            if allowed and str(value) not in allowed:
                bad.append(f"{name}: {field}={value!r} is not one of the doctype's "
                           f"options ({', '.join(allowed[:4])}…)")

    names = list(composed)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if composed[a] == composed[b]:
                bad.append(f"{a} and {b} compose identically — the derived label "
                           f"cannot name either")

    base = {f: v for f, v in _shipped_baseline().items() if f in axes}
    drift = {k for k in axes if base.get(k) != composed.get(DEFAULT_THEME_PRESET, {}).get(k)}
    if drift:
        bad.append(f"{DEFAULT_THEME_PRESET} is not the shipped default; a fresh install "
                   f"would read Custom. Differs at: {', '.join(sorted(drift)[:4])}")
    return bad


def check_palette_catalogue() -> list[str]:
    """Every SHIPPED palette must hold, as the triple it actually ships.

    Item 37. The eleven :data:`SEEDS` sweep the pair set against one accent and no
    ground, which is the right shape for "any colour a tenant might paste in". It is the
    wrong shape for a palette we PUBLISH: a shipped palette is a (brand, accent, ground)
    triple, and the ground moves the very surfaces the other two are fitted against. A
    catalogue checked only through the generic sweep would be gated on a combination it
    never renders.

    So each palette is derived exactly as `brand.py` will derive it, in both modes, and
    the three floors are re-measured on the result:

      * the brand fill against the page (1.4.11, 3:1),
      * its own label on that fill (1.4.3, 4.5:1),
      * the focus ring against the page (1.4.11, 3:1).

    ALSO CHECKED, and it is the one that would rot silently: every shipped brand seed is
    a member of :data:`SEEDS`. Ship a palette the sweep does not carry and the catalogue
    grows coverage it does not have — the gate would still say "all pairs pass" while
    saying nothing about the colour a tenant just clicked.
    """
    from bunood_theme.presets import GROUNDS, PALETTES

    known = {s.lower() for s, _ in SEEDS}
    bad: list[str] = []
    for name, p in PALETTES.items():
        brand, accent = p["brand_color"], p["accent_color"]
        # `ground: None` is legal and means "mix the brand" — the shipped default's
        # own case. Only a NAME that GROUNDS does not know is a fault.
        ground = None
        if p["ground"] is not None:
            ground = GROUNDS.get(p["ground"])
            if ground is None:
                bad.append(f"{name}: ground {p['ground']!r} is not in GROUNDS")
                continue
        if brand.lower() not in known:
            bad.append(f"{name}: brand {brand} is not in SEEDS, so no pair sweep covers it")
        for mode in ("light", "dark"):
            d = palette.derive(brand, accent, mode, ground=ground)
            page, fill = d["--bnd-page"], d["--bnd-brand-solid"]
            pairs = (
                ("fill on the page", fill, page, AA_NON_TEXT),
                ("label on the fill", d["--bnd-on-brand"], fill, AA_TEXT),
                ("focus ring on the page", d["--bnd-accent"], page, AA_NON_TEXT),
            )
            for what, ink, bg, need in pairs:
                got = ratio(parse_color(ink), parse_color(bg))
                if got < need:
                    bad.append(f"{name}/{mode}: {what} is {got:.2f}:1, needs {need}")

            # THE ARM THAT ACTUALLY GATES CATALOGUE DATA. The three ratios above are a
            # regression net on `derive`, not a test of the palette: `fill_pair` and
            # `fit_ink` GUARANTEE those floors, so a deliberately terrible accent is
            # silently corrected and the ratios pass. Proved by sabotage — a near-white
            # ring was fixed before it could be measured.
            #
            # What no fitter can rescue is MEANING. The ring is fitted for contrast, not
            # for distinctness, so an accent may land a shade away from "this failed".
            # Measured on the first cut of this catalogue: Blue shipped an orange ring
            # 9.0 from --bnd-serious, Cyan shipped tomato at 9.6 — the exact colour the
            # round rejected for Bunood — and five more sat under 20. Our status ramp
            # owns green, amber, orange and red, so ANY warm accent collides; the floor
            # is what forces the catalogue onto the cool half of the wheel.
            ring = d["--bnd-accent"]
            for k in ("good", "warn", "serious", "critical"):
                de = delta_e(to_lab(parse_color(ring)), to_lab(parse_color(d[f"--bnd-{k}"])))
                if de < ACCENT_STATUS_MIN_DE:
                    bad.append(
                        f"{name}/{mode}: ring {ring} is dE {de:.1f} from --bnd-{k}; "
                        f"a focus ring must not read as a status (floor {ACCENT_STATUS_MIN_DE})"
                    )
    return bad


def check_dark_lift() -> list[str]:
    """The dark brand fill must clear a LIGHTNESS floor, not merely the contrast floor.

    Item 37. `fill_pair` solves for the minimum correction that clears 3:1 against the
    surfaces and 4.5:1 under the label, and measured, that lands every dark seed at
    L* ~54 — legible, and dimmer than the brand a tenant chose. Radix holds its solid
    step across modes and Material 3 lifts the resolved role; this is the second, done
    inside `derive()` so ONE stored seed produces it. A palette needs no dark colour of
    its own.

    Two arms, and the second is the one that stops the lift leaking:

      * DARK: every seed's fill sits at or above the floor. Seeds already lighter than
        the target keep their own value (gold, teal, near-white, white are untouched),
        so the assertion is a floor and not an equality.
      * LIGHT: the fill is NOT lifted. The lift is a dark-mode answer to a dark-mode
        problem — a light ground needs the fill DARKER, not lighter — and a helper
        applied in both modes would wash the brand out on white. Pinned to the shipped
        seed's concrete light value so the arm cannot pass vacuously.

    The pairs are re-asserted here too: a brighter fill needs a darker ink, and
    `fill_pair` re-solves both together, so the floors are re-proved rather than assumed
    to survive.
    """
    floor = DARK_FILL_MIN_L
    bad: list[str] = []
    for seed, label in SEEDS:
        d = palette.derive(seed, ACCENT_SEED, "dark")
        fill, ink = d["--bnd-brand-solid"], d["--bnd-on-brand"]
        lum = to_lab(parse_color(fill))[0]
        if lum < floor - 1.0:
            bad.append(f"{label}/dark: fill {fill} is L* {lum:.1f}, under the {floor:.0f} floor")
        r_fill = ratio(parse_color(fill), parse_color(d["--bnd-page"]))
        r_lab = ratio(parse_color(ink), parse_color(fill))
        if r_fill < AA_NON_TEXT:
            bad.append(f"{label}/dark: lifted fill {fill} is {r_fill:.2f}:1 on the page")
        if r_lab < AA_TEXT:
            bad.append(f"{label}/dark: label {ink} on {fill} is {r_lab:.2f}:1")

    # AN INVARIANCE TEST, and the two drafts before it were both worthless.
    #
    # Pinning the shipped seed's light fill went stale the moment that seed was
    # recalibrated. Asserting the light fill's L* stays under the floor was VACUOUS:
    # in light mode `fill_pair` DARKENS a lifted seed straight back down, because a
    # light ground needs a dark fill — so a lift applied in both modes is invisible
    # in the light output, which is exactly why it would have shipped.
    #
    # What is actually true is that light does not DEPEND on the dark target. Move the
    # constant somewhere absurd and light must not move at all.
    original = palette.DARK_FILL_TARGET_L
    try:
        before = {s0: palette.derive(s0, ACCENT_SEED, "light") for s0, _ in SEEDS}
        palette.DARK_FILL_TARGET_L = 95.0
        for seed, label in SEEDS:
            if palette.derive(seed, ACCENT_SEED, "light") != before[seed]:
                bad.append(f"{label}/light: moved when the DARK target moved; the lift is leaking")
    finally:
        palette.DARK_FILL_TARGET_L = original
    return bad


def check_ground_inert() -> list[str]:
    """The ground parameter must be INERT by default, and must move the surfaces when set.

    Item 37 lets a palette choose what the SURFACES are mixed from, so a tenant can
    have a neutral desk under a coloured brand. Two properties have to hold together,
    and only one of them is obvious:

      * ``ground=None`` (and ``ground == brand``) must reproduce today's derivation
        EXACTLY. ``_tokens.scss`` is a static copy of the shipped seed's output and
        ``check_defaults_agree`` pins it, so a parameter that shifts the default by one
        channel breaks every seed at once.
      * a ground that differs must actually move ``--bnd-page``. The obvious
        implementation — scaling the seed percentage toward zero — collapses page,
        surface, raised, pane and active onto ``#ffffff``: one flat white, no deltas.
        That is item 31's rule ("a pole may not take the slot's fill away") and it is
        why the axis changes WHAT is mixed rather than how much.

    Checked over four seeds x both modes rather than one, because "inert" is a claim
    about the function and not about the shipped colour.
    """
    bad: list[str] = []
    neutral = "#8b8d98"  # radix slate9, a ground no brand seed here resolves to
    for seed, label in SEEDS[:4]:
        for mode in ("light", "dark"):
            base = palette.derive(seed, ACCENT_SEED, mode)
            for arg, why in ((None, "ground=None"), (seed, "ground == brand")):
                got = palette.derive(seed, ACCENT_SEED, mode, ground=arg)
                if got != base:
                    diff = [k for k in base if base[k] != got.get(k)]
                    bad.append(f"{label}/{mode}: {why} is not inert; moved {', '.join(diff[:4])}")
            moved = palette.derive(seed, ACCENT_SEED, mode, ground=neutral)
            if moved["--bnd-page"] == base["--bnd-page"] and seed.lower() != neutral:
                bad.append(f"{label}/{mode}: ground={neutral} did not move --bnd-page")
    return bad


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


def check_status_separation(light: dict, dark: dict) -> list[str]:
    """The twelve status dots must be tellable apart from EACH OTHER.

    The same measure as :func:`check_series_separation` against a different
    floor and a different set, and separate for the same reason: a worst-pairwise
    DIFFERENCE across a set is not an ink-on-background ratio.

    `gray` and `grey` are one colour under two spellings and are de-duplicated
    before measuring — a palette is not less distinguishable because a name has
    two English spellings. Only the COMMON vision models are enforced; the twelve
    hues are Frappe's, and holding a fixed vocabulary to a tritan floor would be
    reporting a defect nobody here can fix.
    """
    problems = []
    for mode, block in (("light", light), ("dark", dark)):
        try:
            hues = [block[f"--bnd-status-{n}"] for n in STATUS_NAMES]
        except KeyError as exc:
            problems.append(f"{mode}: _tokens.scss is missing status token {exc}")
            continue
        # MEASURE OVER NAMES, NOT VALUES. Deduplicating by hex was the whole
        # defect: two DIFFERENT status names resolving to the SAME colour
        # collapsed to one entry and scored inf, so the gate reported green on
        # the worst possible outcome. Only `gray`/`grey` may share a value —
        # they are one colour under two spellings in palette.STATUS_HUES — and
        # that is asserted from the source table rather than assumed.
        aliases = {}
        for name, hue in palette.STATUS_HUES.items():
            aliases.setdefault(hue, []).append(name)
        allowed = {tuple(sorted(g)) for g in aliases.values() if len(g) > 1}

        by_value = {}
        for name in STATUS_NAMES:
            by_value.setdefault(block[f"--bnd-status-{name}"], []).append(name)
        for value, names in by_value.items():
            if len(names) > 1 and tuple(sorted(names)) not in allowed:
                problems.append(
                    f"{mode}: status dots {', '.join(sorted(names))} are all {value} — "
                    f"distinct status names must not share a colour"
                )

        # One representative per DECLARED alias group, so `grey` does not count
        # as a collision with `gray`, and everything else stands on its own.
        seen_alias, hues = set(), []
        for name in STATUS_NAMES:
            group = next((g for g in allowed if name in g), (name,))
            if group in seen_alias:
                continue
            seen_alias.add(group)
            hues.append(block[f"--bnd-status-{name}"])

        common = separation(hues, CVD_COMMON)
        if common < STATUS_FLOOR_COMMON:
            problems.append(
                f"{mode}: status-dot separation {common:.2f} < {STATUS_FLOOR_COMMON} "
                f"(normal+protan+deutan) — two status marks confuse for a common CVD viewer"
            )
    return problems


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
                bg_c = resolve(bg, variables, over=pair.overlay)
                ink_c = resolve(ink, variables, over=to_hex(bg_c))
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


def check_sidebar_rendered() -> int:
    """The pane's OWN tokens, read out of a browser, for every colour mode.

    WHAT THIS CLOSES. `check_computed` sets ``data-theme`` to light and to dark
    and reads every ``--bnd-*`` off ``<html>``. It never touches
    ``data-bnd-sb-color`` — so whichever pane colour the desk happened to be in
    is the only one it has ever seen, and the other three are measured by the
    model alone. The model reads `_sidebar.scss`; it cannot know whether a
    declaration reaches the element. A token shadowed by a Frappe rule, lost to a
    typo, or in a block whose selector does not match is invisible to it, and
    those are exactly the failures a rendered check exists to catch.

    A SEPARATE MODE, NOT A WIDER ``--check-computed``. `Pair`'s own docstring
    records why: widening that path's shape is what broke it once already, with
    a crash that needed a particular stylesheet deployed to appear at all.
    `check_measured` was added as its own mode for the same reason and says so.
    This shares only `parse_color` with the rest of the file, so it cannot break
    `--check-computed` and cannot be broken by a change to `pairs()`.

    WHAT IT ASSERTS, per slug per desk theme:

    * every token in :data:`palette.SB_WORKING_SET` has a value on the element —
      an empty one means the block never applied;
    * that value is the colour the derivation says it should be.

    It does NOT re-measure ratios. Those are gated across 27 seeds and both modes
    by the model sweep, which is far more coverage than one browser can give; the
    question here is only whether what CI computed is what the element carries.

    Reads on stdin::

        {"light": {token: value, ...},          # globals, to resolve var() refs
         "dark":  {...},
         "sidebar": {"<slug>": {"light": {...}, "dark": {...}}}}

    The ``sidebar`` key is REQUIRED. A collector that stops sending it must fail
    loudly rather than quietly measure less than it claims.
    """
    data = json.load(sys.stdin)
    if "sidebar" not in data:
        print("check-sidebar: no `sidebar` key on stdin — the collector sent nothing to measure")
        return 1

    globals_for = {m: data.get(m) or {} for m in ("light", "dark")}
    for mode, v in globals_for.items():
        if not v:
            print(f"check-sidebar: no {mode} globals supplied; var() references cannot resolve")
            return 1

    # Every slug the stylesheet offers, derived rather than restated — the same
    # set `check_sidebar_binding` holds `_sidebar.scss` to.
    known = {m for modes in palette.SB_PANES.values() for m in modes} | set(palette.SB_UNMEASURABLE)
    missing = sorted(known - set(data["sidebar"]))
    if missing:
        print(f"check-sidebar: the collector skipped {', '.join(missing)} — "
              "every colour mode a tenant can select has to be measured, not whichever one "
              "the desk happened to be in")
        return 1

    worlds = sidebar_worlds()
    failures = []
    checked = 0
    for slug in sorted(data["sidebar"]):
        for mode in ("light", "dark"):
            seen = data["sidebar"][slug].get(mode) or {}
            if not seen:
                failures.append(f"{slug}/{mode}: the collector read no tokens at all")
                continue
            # HOW MANY BLOCKS A MODE HAS IS THE FACT, not which polarity key it
            # sits under. Match Theme and Minimal have two -- a light block and a
            # dark one -- so the desk theme picks. Dark Contrast and Brand have
            # ONE that applies in both, and Dark Contrast is filed under the DARK
            # polarity because its PANE is dark, not because its block is: a
            # lookup keyed on the desk theme finds nothing for it in light. That
            # is `SidebarPane.themed` seen from the other side, and getting it
            # wrong reported "no block in _sidebar.scss" for a mode whose block
            # is plainly there.
            candidates = {pol: blk for (pol, name), blk in worlds.items() if name == slug}
            block = next(iter(candidates.values())) if len(candidates) == 1 else candidates.get(mode)
            if block is None:
                failures.append(
                    f"{slug}/{mode}: no block in _sidebar.scss for this mode "
                    f"(found {sorted(str(k) for k in candidates)})"
                )
                continue
            allowed = set(palette.SB_WORKING_SET) | set(palette.SB_EXTRAS.get(slug, {}))
            for token in sorted(allowed):
                if token not in block:
                    continue
                got = (seen.get(token) or "").strip()
                if not got:
                    failures.append(
                        f"{slug}/{mode}: {token} has no value on the element. The block is in "
                        "the stylesheet, so this is a selector that never matched or a rule "
                        "that shadowed it — the class the model cannot see."
                    )
                    continue
                # The brand pane is a gradient; no single colour to compare. Its
                # stand-down is `palette.SB_UNMEASURABLE`'s whole subject.
                if token == "--bnd-sb-bg" and slug in palette.SB_UNMEASURABLE:
                    continue
                try:
                    # THE WORLD'S OWN DECLARATIONS SHADOW THE GLOBALS. Brand mode
                    # writes `--bnd-sb-cat-N: var(--bnd-sb-ink)`, and that
                    # reference means BRAND's ink -- not whichever slug the desk
                    # happened to be stamped with when the globals were collected.
                    # Resolving against the globals alone reported seventeen
                    # disagreements that were entirely this check's own error.
                    want = parse_color(block[token], {**globals_for[mode], **block})
                except ValueError as exc:
                    failures.append(f"{slug}/{mode}: cannot resolve the source value of {token} — {exc}")
                    continue
                try:
                    have = parse_color(got)
                except ValueError as exc:
                    failures.append(f"{slug}/{mode}: cannot read the rendered {token} ({got!r}) — {exc}")
                    continue
                checked += 1
                # One unit of tolerance per channel: a browser round-trips through
                # its own colour type and may land a unit away. Anything larger is
                # a different colour, not a rounding difference.
                if any(abs(a - b) > 1.0 for a, b in zip(want[:3], have[:3])) or abs(want[3] - have[3]) > 0.01:
                    failures.append(
                        f"{slug}/{mode}: {token} renders {to_hex(have)} (alpha {have[3]:.2f}) but the "
                        f"derivation says {to_hex(want)} (alpha {want[3]:.2f}) — source {block[token]!r}"
                    )
    if failures:
        print(f"{len(failures)} rendered sidebar tokens disagree with the derivation:")
        for f in failures:
            print(f"   {f}")
        return 1
    print(f"{checked} rendered sidebar tokens match the derivation, "
          f"across {len(data['sidebar'])} colour modes x 2 desk themes")
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


def check_layout_identity() -> list[str]:
    """The layout's identity survives losing its stored name — item 37.

    ``desk_layout`` is deleted, so `presets.layout_of` derives the shape by
    comparing the live values against `registry.layout_settings`. Two runtime
    call sites depend on the answer, and both were measured WRONG before this
    check existed, so it holds three properties rather than one:

      * EVERY LAYOUT ROUND-TRIPS. `layout_of(layout_settings(name)) == name` for
        all five, which is the only thing that makes the derivation a substitute
        for the field it replaced.
      * CLASSIC AND BOTTOM BAR ARE TOLD APART. Their CONTAINER rows are
        byte-identical - a first draft compared only the five toggles and every
        Bottom Bar desk reported itself as Classic, which is exactly the search
        fallback order the two disagree about. They differ only in where the bell
        and the profile sit, so this pins that the comparison reads them.
      * A SEARCH OVERRIDE DOES NOT CHANGE THE SHAPE. `search_placement` is the
        question the one consumer is asking, so it must not also be the answer.
        Including it made a Classic desk that wanted search in a top bar it does
        not have report "" and fall to the Top Bar order.

    A shape no preset names must answer "" - callers fall back rather than guess.
    """
    from bunood_theme.presets import layout_of
    from bunood_theme.registry import LAYOUT_CHROME, layout_settings

    bad: list[str] = []
    for name in LAYOUT_CHROME:
        got = layout_of(layout_settings(name))
        if got != name:
            bad.append(f"{name} does not round-trip: layout_of said {got!r}")

    containers = {c for c in layout_settings("Classic") if c.endswith("_enabled")}
    if all(layout_settings("Classic")[c] == layout_settings("Bottom Bar")[c] for c in containers):
        if layout_of(layout_settings("Bottom Bar")) == "Classic":
            bad.append("Classic and Bottom Bar collapse - the comparison reads containers only")

    for name in ("Classic", "Dock"):
        moved = dict(layout_settings(name))
        moved["search_placement"] = "Top Bar Center"
        got = layout_of(moved)
        if got != name:
            bad.append(f"{name} with search moved reports {got!r} - search_placement is "
                       f"deciding the shape it is supposed to be asking about")

    odd = dict(layout_settings("Classic"))
    odd["topbar_enabled"] = 1
    if layout_of(odd) == "Classic":
        bad.append("a Classic desk with a top bar still reports Classic - the match is "
                   "not exact")
    return bad


def check_personal_partition() -> list[str]:
    """Every theme axis is filed as exactly one kind of thing — item 38.

    ``personal.py`` splits the 124 fields a theme preset writes into four sets:
    what a person's LOOK may carry, what their SHAPE is, what belongs to surfaces
    that are not the desk, and what stays the administrator's. The split decides
    what the per-user layer is allowed to touch, so it has to be a partition and
    not a set of opinions that happen not to have collided yet.

    THIS EXISTS BECAUSE THE FIRST DRAFT DEFINED THE LOOK BY SUBTRACTION, and
    subtraction quietly admitted twenty-two fields it must never carry: the
    sign-in page and the website render through a cache keyed on ``(path, lang)``
    and nothing else, so a per-user value there is served to the next visitor;
    email renders in a different process; print is regenerated as a per-site
    record. A look that "worked" would have been leaking or inert, and nothing
    would have said which.

    Three properties, each failing differently:

      * NO OVERLAP. A field in both LOOK and SHAPE has two owners on one request
        and the winner is decided by composition order.
      * NOTHING UNCLAIMED. A field a future kit adds and nobody files is a field
        a look silently cannot carry — invisible, because the look still applies.
      * NOTHING PHANTOM. A field filed here that no preset writes is describing
        something that has been renamed or deleted.

    And one that is not arithmetic: SHAPE must be exactly what a named layout
    writes. Under "names only" a person picks a layout, so a shape field outside
    ``layout_settings`` is one no gesture could ever set.
    """
    from bunood_theme import personal
    from bunood_theme.registry import LAYOUT_CHROME, layout_settings

    bad: list[str] = []
    p = personal.partition()

    for pair, fields in p["overlap"].items():
        bad.append(f"{pair} claim the same field(s): {', '.join(fields)}")
    if p["unclaimed"]:
        bad.append(
            "filed nowhere, so no look can carry them and nothing says why: "
            + ", ".join(p["unclaimed"])
        )
    if p["phantom"]:
        bad.append(
            "filed but not written by any preset — renamed or deleted: "
            + ", ".join(p["phantom"])
        )

    written = {f for name in LAYOUT_CHROME for f in layout_settings(name)}
    if set(p["shape"]) != written:
        missing = sorted(written - set(p["shape"]))
        extra = sorted(set(p["shape"]) - written)
        bad.append(
            "SHAPE_FIELDS is not what the layouts write"
            + (f" (missing {', '.join(missing)})" if missing else "")
            + (f" (extra {', '.join(extra)})" if extra else "")
        )

    # EVERY LOCK IS A REAL FIELD, WITH THE DEFAULT THE TABLE CLAIMS. `LOCKS` and
    # the doctype are the same fact in two files — the trap this repo pays for
    # more than any other — and the failure is silent in both directions: a lock
    # naming a field the doctype lacks reads back None forever and the axis is
    # permanently open, while a default that disagrees means the seeder writes
    # one answer and `lock_open` resolves another for every site that has not
    # migrated yet.
    doctype_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "bunood_theme",
        "bunood_theme", "doctype", "theme_settings", "theme_settings.json",
    )
    with open(doctype_path, encoding="utf-8") as fh:
        doctype = json.load(fh)
    by_name = {f.get("fieldname"): f for f in doctype.get("fields", [])}
    for lock, row in personal.LOCKS.items():
        field = by_name.get(lock)
        if field is None:
            bad.append(f"{lock} is declared in personal.LOCKS but is not a Theme Settings field")
            continue
        if field.get("fieldtype") != "Check":
            bad.append(f"{lock} is a {field.get('fieldtype')} — a lock must be a Check")
        declared = str(row["default"])
        stored = str(field.get("default", "0"))
        if declared != stored:
            bad.append(
                f"{lock} defaults to {declared} in personal.LOCKS but {stored} in the doctype"
            )

    # Every axis this app stores must name a lock that exists, or be one of the
    # deliberately unlockable ones. A typo here would read as "no lock" and the
    # axis would be ungoverned rather than loudly wrong.
    for row in personal.AXES:
        lock = row.get("lock")
        if lock is None:
            if row["kind"] == personal.PREFERENCE and row["key"] not in personal.UNLOCKABLE:
                bad.append(f"{row['key']} is a preference with no lock and is not in UNLOCKABLE")
        elif lock not in personal.LOCKS:
            bad.append(f"{row['key']} names a lock that does not exist: {lock!r}")
        if not row["key"].startswith(personal.PREFIX):
            bad.append(f"{row['key']} does not carry the {personal.PREFIX!r} prefix")

    return bad


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
    if "--check-sidebar" in args:
        return check_sidebar_rendered()

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

    sb_agree = check_sidebar_agrees()
    if sb_agree:
        print("_sidebar.scss and the sidebar ramp disagree:")
        for m in sb_agree:
            print(f"   {m}")
        print()

    sb_cover = check_sidebar_coverage()
    if sb_cover:
        print("a sidebar colour mode does not declare its whole working set:")
        for m in sb_cover:
            print(f"   {m}")
        print()

    sb_emit = check_sidebar_emission()
    if sb_emit:
        print("the per-site sidebar emission does not hold:")
        for m in sb_emit:
            print(f"   {m}")
        print()

    sb_head = check_sidebar_headroom()
    if sb_head:
        print("a sidebar pane moves further than its own ink can follow:")
        for m in sb_head:
            print(f"   {m}")
        print()

    sb_bind = check_sidebar_binding()
    if sb_bind:
        print("a sidebar colour mode has no pane the hues were fitted against:")
        for m in sb_bind:
            print(f"   {m}")
        print()

    theme = check_theme_catalogue()
    if theme:
        print("the theme catalogue does not hold:")
        for m in theme:
            print(f"   {m}")
        print()

    shape = check_layout_identity()
    if shape:
        print("the layout's derived identity does not hold:")
        for m in shape:
            print(f"   {m}")
        print()

    split = check_personal_partition()
    if split:
        print("the per-user field partition does not hold:")
        for m in split:
            print(f"   {m}")
        print()

    cat = check_palette_catalogue()
    if cat:
        print("a shipped palette does not hold:")
        for m in cat:
            print(f"   {m}")
        print()

    lift = check_dark_lift()
    if lift:
        print("the dark brand fill is under its lightness floor:")
        for m in lift:
            print(f"   {m}")
        print()

    inert = check_ground_inert()
    if inert:
        print("the ground parameter is not inert (or does not move the surfaces):")
        for m in inert:
            print(f"   {m}")
        print()

    ref = check_deltae_reference()
    if ref:
        print(f"CIEDE2000 disagrees with the Sharma-Wu-Dalal reference ({len(ref)}):")
        for r in ref:
            print(f"   {r}")
        print()

    sep, sep_advisories = check_series_separation(light, dark)
    sep += check_status_separation(light, dark)
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

    if (failures or drift or sep or ref or inert or lift or cat or theme or shape or split
            or sb_agree or sb_cover or sb_bind or sb_head or sb_emit):
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
          "fallback, both modes. _tokens.scss agrees with palette.derive, _sidebar.scss "
          "agrees with the sidebar ramp, and the chart series clears its separation floor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
