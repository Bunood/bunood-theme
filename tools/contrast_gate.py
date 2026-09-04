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

    # ── The sidebar kit's category hues (item 22, rewritten item 40) ─────────
    #
    # ONE PANE NOW, AND THESE ROWS ARE WHY THE HUES DID NOT FOLLOW IT. The kit
    # used to carry four colour worlds and this block swept the seven hues
    # across all of them. The panes went; the hues did not, and must not:
    # `--bnd-sb-hue` is read as `color:` in six rules, so it is INK, while the
    # global `--bnd-cat-*` are FILLS. Aliasing one to the other is a role
    # change, which this repo forbids, and it measures: #eda100 amber as text
    # on a light pane is 1.82:1, and 282 of 378 pairs fail.
    #
    # Fitted as ink by `palette.sb_hues()` they clear every pane at every seed,
    # worst 4.60:1 -- measured 2026-09-01 across 27 seeds x 2 modes. The fit
    # binds against the worst pane, so holding it here against `--bnd-pane`
    # (which MOVES with the seed) is the row that keeps that true.
    for polarity in ("light", "dark"):
        for n, hue in enumerate(palette.sb_hues(polarity), 1):
            out.append(Pair(
                hue, "var(--bnd-pane)", AA_TEXT,
                f"sidebar hue {n} ({polarity} fit) on the pane", polarity,
            ))

    # ── The pane's own surfaces, measured on the pane (item 40) ─────────────
    #
    # THE GATE HAD NO CHIP ROW AT ALL, and that is how defect 25 lived: dark
    # minimal declared 12 of the 14 working-set tokens, so --bnd-sb-chip-ink
    # fell through to the LIGHT block and painted #6d7570 on a #15181a pane.
    # 3.76:1, shipped, with a green gate -- because nothing here ever asked.
    #
    # These rows used to walk six colour worlds and read each one's own
    # declarations out of the stylesheet. There is one pane now and it is the
    # theme's, so the values are the GLOBAL tokens and the sweep is the one
    # already running: `--bnd-ink` on `--bnd-pane` is a row above, at every
    # seed, in both modes. What is NOT already covered is the chip, because
    # the pane derives it rather than aliasing it --
    # `color-mix(--bnd-ink 7%, transparent)` over the pane -- and a derived
    # pair is a pair no global row has. That is the whole of what is left, and
    # it is the shape of `closed is not covered`: the ratios were never wrong,
    # there was simply no row.
    #
    # Measured 2026-09-01 across 27 seeds x 2 modes: 324 pairs, worst 6.11:1.
    CHIP = "color-mix(in srgb, var(--bnd-ink) 7%, transparent)"
    for polarity in ("light", "dark"):
        for ink, what in (("var(--bnd-ink)", "link text"),
                          ("var(--bnd-ink-muted)", "muted text")):
            # The chip is TRANSLUCENT, which is why `Pair.overlay` exists:
            # `resolve` flattens a translucent colour over --bnd-surface by
            # default, and --bnd-surface is #ffffff in light. A chip measured
            # against that reads 'fine' for exactly the dark pane where it is
            # not.
            out.append(Pair(
                ink, CHIP, AA_TEXT,
                f"sidebar {what} on its chip", polarity,
                overlay="var(--bnd-pane)",
            ))
            out.append(Pair(
                ink, "var(--bnd-raised)", AA_TEXT,
                f"sidebar {what} on a section card", polarity,
            ))
    # Measured, not enforced -- the same standing as --bnd-border on
    # --bnd-surface above. A hairline separator is a boundary between two
    # regions of the same surface, not a control edge; item 22 argued this
    # once and the pane's line is the same thing under another name.
    out.append(Pair(
        "var(--bnd-border)", "var(--bnd-pane)", None,
        "sidebar separator on the pane; see item 22",
    ))
    # ── The active pill's fill against the pane it sits on ──────────────────
    #
    # Was a sweep over four panes, of which the two ALIAS ones duplicated a
    # global surface row. One pane, one row per polarity -- and it is the
    # 1.4.11 question (is the control identifiable against its own ground),
    # so the floor is the non-text 3.0.
    #
    # THE BRAND-PANE STAND-DOWN ROW WENT WITH THE PANE. The pill used to route
    # through the brand's gated label pair in every mode EXCEPT brand, where no
    # fixed pair survives an arbitrary-seed gradient; that exception had one
    # row here asserting the stand-down. There is nothing left to stand down
    # from, so the general pair above is simply what renders, everywhere.
    #
    # AND THIS USED TO BE MEASURED-BUT-NOT-ENFORCED, and it is enforced now: the
    # two pathological readings that forced that (a near-black seed's
    # dark-contrast pane at ~1.06:1, a near-white seed's brand gradient at
    # 1.00:1) were both properties of panes that no longer exist. Measured
    # against the real pane the worst of 54 is 3.04:1, so the exemption has
    # nothing left to excuse.
    PILL = "var(--bnd-brand-solid, var(--bnd-brand))"
    for polarity in ("light", "dark"):
        out.append(Pair(
            PILL, "var(--bnd-pane)", AA_NON_TEXT,
            "sidebar active pill fill against the pane", polarity,
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


def check_sidebar_hues() -> list[str]:
    """The pane's category hues in `_sidebar.scss` are `palette.sb_hues()`.

    ALL THAT SURVIVES OF A SIX-ARM SWEEP, and the reason it survives is that it
    is the only sidebar colour fact the global palette does not already carry.
    Item 40 collapsed the pane's four colour worlds onto the theme, so
    `--bnd-sb-bg`, `-ink`, `-line` and the rest are aliases of `--bnd-pane`,
    `--bnd-ink`, `--bnd-border` -- already swept, at every seed, in both modes.
    Re-measuring them here would measure the same pair twice and report one
    finding as two.

    The hues are different: they are INK fits against the pane, and no global
    token plays that role (`--bnd-cat-*` are fills). So they are declared in
    the stylesheet, and this is the drift check that pins those declarations to
    the derivation that produced them -- `check_defaults_agree`'s shape, for
    the same reason: a copy with a drift check is a cache, a copy without one
    is the same fact in two places.

    Both polarity blocks are read, AND the `automatic` arm, because an
    Automatic user on a dark OS paints from CSS for the whole first-paint
    window -- defect 27's lesson, and the arm a mode-keyed block is likeliest
    to be missing.
    """
    problems: list[str] = []
    src = _strip_comments(open(SIDEBAR_SCSS, encoding="utf-8").read())
    blocks = {
        "light": r"html\[data-bnd-sb-color\]\s*\{",
        "dark": r"html\[data-theme=\"dark\"\]\[data-bnd-sb-color\]\s*\{",
        "automatic": r"html\[data-theme=\"automatic\"\]\[data-bnd-sb-color\]\s*\{",
    }
    for name, pattern in blocks.items():
        # `automatic` must carry the DARK fits: it is the dark-OS first paint.
        want = palette.sb_hues("light" if name == "light" else "dark")
        # EVERY block with this selector, merged in source order -- which is
        # what the cascade does. The alias block and the hue block share
        # `html[data-bnd-sb-color]`, so reading only the first found an
        # alias block with no hues in it and reported seven false
        # drifts. A check that looks at one of two identical selectors is
        # measuring the wrong element, one level up from the DOM.
        found = list(re.finditer(pattern, src))
        if not found:
            problems.append(
                f"_sidebar.scss has no {name} category-hue block -- "
                f"a pane in that mode falls through to the global FILL hues"
            )
            continue
        got: dict = {}
        for m in found:
            got.update(read_decls_from(_balanced(src, m.end() - 1)))
        for i, hue in enumerate(want, 1):
            tok = f"--bnd-sb-cat-{i}"
            have = got.get(tok)
            if have is None:
                problems.append(
                    f"{name}: {tok} is not declared, so it falls through to "
                    f"var(--bnd-cat-{i}) -- a FILL hue used as ink"
                )
            elif have.lower() != hue.lower():
                problems.append(
                    f"{name}: {tok} is {have} but palette.sb_hues() derives {hue}"
                )
    return problems


def _balanced(src: str, open_brace: int) -> str:
    """The text between `src[open_brace]` and its matching `}`."""
    depth = 0
    for i in range(open_brace, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[open_brace + 1:i]
    raise ValueError("unbalanced block in _sidebar.scss")


def read_decls_from(body: str) -> dict:
    """`--prop: value;` pairs at any depth of one block body."""
    out = {}
    for decl in _split_decls(body):
        if ":" not in decl:
            continue
        name, _, value = decl.partition(":")
        name = name.strip()
        if name.startswith("--"):
            out[name] = value.strip().rstrip(";").strip()
    return out


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
        ambiguous, and "Custom" would be the only honest answer to both. Held for
        the eight SIDEBAR looks too, since item 40 — nothing checked those, and
        merging an option that two looks differ at ALONE would have collapsed them
        with the gate still green.
      * EVERY AXIS IS A REAL FIELD. `allowed = options.get(field)` returns None
        for a field the doctype does not have, and the option check then SKIPS it
        — so a field could sit in `SIDEBAR_FIELDS`, be written by all eight
        presets, and not exist. At runtime the comparison is `"" vs "Off"`, so all
        twelve cards read "Custom" on every site forever, with a green suite and a
        green gate. This is item 37's own trap, and a deletion slice is exactly
        when it fires.
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
    # EVERY fieldname, not only the Selects: the option check below cannot see a
    # field that does not exist, and that is the hole this closes.
    fieldnames = {f["fieldname"] for f in meta["fields"] if f.get("fieldname")}

    bad: list[str] = []
    axes = set(THEME_AXES)

    phantom = sorted(axes - fieldnames)
    if phantom:
        bad.append(
            f"{len(phantom)} theme axes name a field the doctype does not have: "
            f"{', '.join(phantom[:6])}. Every preset would write them and every card "
            "would read Custom on every site, with nothing else failing — the option "
            "check skips a field it cannot find."
        )
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

    # THE EIGHT SIDEBAR LOOKS, WHICH NOTHING CHECKED. `THEME_PRESETS` names a
    # `SIDEBAR_PRESETS` entry by string, so two identical looks make two theme
    # cards indistinguishable in the pane while the twelve compositions still
    # differ elsewhere — the distinctness check above would not see it. It bites
    # the moment an option is merged away: item 40 removes two `sidebar_active_style`
    # values, and `Daylight` and `Paper` differ at that field ALONE.
    from bunood_theme.presets import _SIDEBAR_LOOKS as SIDEBAR_PRESETS

    looks = list(SIDEBAR_PRESETS)
    for i, a in enumerate(looks):
        for b in looks[i + 1:]:
            if SIDEBAR_PRESETS[a] == SIDEBAR_PRESETS[b]:
                bad.append(
                    f"sidebar looks {a} and {b} are identical — a merge collapsed them, "
                    "and every theme that names either now shows the same pane"
                )

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


def check_layout_catalogue() -> list[str]:
    """Every layout row is internally consistent: its tenants land in containers it turns on.

    ITEM 42'S FIRST GUARD, written before the catalogue is replaced so the five new rows
    are held to it from their first commit. Item 36's sharpest finding was a layout that
    wrote HALF of itself — containers here, placements there — and the shape the suite
    drove was one no gesture could produce; item 37 answered it with one composer
    (`registry.layout_settings`). This is the check that composer never had: a row can
    still say `topbar: 0` and `inbox_placement: "Top Bar End"` in the same breath, and
    the bell then points at a region that does not exist on the day the layout is
    picked — `mount_placed_tenants` falls through its fallback order and the label
    derived by comparison reads a shape nobody drew.

    Three claims per row, each one a way the catalogue has actually been wrong:
      * a `LAYOUT_CHROME` row has a `LAYOUT_TENANTS` row (a layout without placements
        writes containers only — the half-written shape);
      * every placement value is one the doctype's Select offers (a value nothing can
        store is a value the picker cannot show);
      * the region a placement names is ON in that row's chrome (a tenant placed in a
        container the row switches off).
    Plus: the default layout is in the catalogue at all.

    Frappe-free: the options come from the doctype JSON on disk, the rows from
    `registry`, and nothing here needs a site.
    """
    import json

    from bunood_theme import registry
    from bunood_theme.presets import DEFAULT_DESK_LAYOUT

    problems: list[str] = []
    doctype = os.path.join(
        os.path.dirname(__file__), "..", "bunood_theme", "bunood_theme", "doctype",
        "theme_settings", "theme_settings.json",
    )
    with open(doctype, encoding="utf-8") as f:
        fields = {r.get("fieldname"): r for r in json.load(f)["fields"]}
    options = {
        name: [o for o in (row.get("options") or "").split("\n") if o]
        for name, row in fields.items()
        if row.get("fieldtype") == "Select"
    }
    # "Top Bar Center" -> topbar: the region is the label's prefix, and REGION_LABELS is
    # the one place the label is decided, so the map is derived rather than restated.
    by_label = {label: key for key, label in registry.REGION_LABELS.items()}

    if DEFAULT_DESK_LAYOUT not in registry.LAYOUT_CHROME:
        problems.append(f"DEFAULT_DESK_LAYOUT {DEFAULT_DESK_LAYOUT!r} is not a LAYOUT_CHROME row")
    # EVERY FIELD ANY ROW STATES, checked against EVERY row. Asking only whether a
    # row exists let a row that named two of the three tenant fields pass as
    # complete: the third then falls through to the shipped default, which is a
    # different layout's answer, and the picker's derived label reads Custom on a
    # desk nobody customised.
    stated: set = set()
    for tenants in registry.LAYOUT_TENANTS.values():
        stated |= set(tenants)
    for name, chrome in registry.LAYOUT_CHROME.items():
        tenants = registry.LAYOUT_TENANTS.get(name)
        if not tenants:
            problems.append(f"{name}: has a LAYOUT_CHROME row but no LAYOUT_TENANTS row -- a half-written layout")
            continue
        for missing in sorted(stated - set(tenants)):
            problems.append(
                f"{name}: states no {missing} while every other row does -- it would inherit "
                f"another layout's answer from the shipped default"
            )
        for field, value in tenants.items():
            # A FIELD THE DOCTYPE DOES NOT OFFER IS THE LOUDEST CASE, not a skip.
            # `if field in options` meant a renamed or deleted Select made this
            # guard silent about the row that still writes it -- and Theme Settings
            # is a Single, where one out-of-range value fails every later save of
            # the whole document.
            if field not in options:
                problems.append(
                    f"{name}: {field} is not a Select on Theme Settings, so this row writes a "
                    f"value nothing can store"
                )
                continue
            if value not in options[field]:
                problems.append(f"{name}: {field} = {value!r} is not an option the doctype offers")
            if value == "Off":
                # "Off" RELEASES THE CLAIM so Frappe's own affordance renders --
                # and every one of those lives in the SIDE PANE (registry's `native`
                # column names `.body-sidebar .sidebar-notification` and
                # `.body-sidebar .sidebar-user-button`). A row that switches the pane
                # off and still says Off is promising a control it does not mount;
                # for `user_placement` that is the only route to Log Out.
                # `guard_critical_reach` recovers it at runtime, which is exactly why
                # the catalogue must not be able to spell it in the first place.
                if not chrome.get("sidepane", 0):
                    component = next(
                        (c for c in registry.COMPONENTS if c.get("key") == field[: -len("_placement")]),
                        None,
                    )
                    if component and component.get("native"):
                        problems.append(
                            f"{name}: {field} = 'Off' releases the tenant to {component['native']!r}, "
                            f"which lives in the side pane this row switches OFF"
                        )
                continue
            region = next((by_label[label] for label in by_label if value.startswith(label + " ")), None)
            if region is None:
                problems.append(f"{name}: {field} = {value!r} names no region REGION_LABELS knows")
                continue
            if not chrome.get(region, 0):
                problems.append(
                    f"{name}: {field} = {value!r} places a tenant in {region!r}, which this row switches OFF"
                )
    return problems


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

    sb_hues = check_sidebar_hues()
    if sb_hues:
        print("the pane's category hues have drifted from palette.sb_hues():")
        for m in sb_hues:
            print(f"   {m}")
        print()

    layouts = check_layout_catalogue()
    if layouts:
        print("the layout catalogue is inconsistent with itself:")
        for m in layouts:
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

    if (failures or drift or sep or ref or inert or lift or cat or theme or shape or layouts
            or split or sb_hues):
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
          "carries the pane hues palette.sb_hues() derives, and the chart series "
          "clears its separation floor.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
