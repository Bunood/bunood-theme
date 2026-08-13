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
    composite,
    parse_color,
    ratio,
    to_hex,
)

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
        "brand-pane ink at the gradient's lightest stop; see the brand-mode note",
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

    if failures or drift:
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
          "fallback, both modes. _tokens.scss agrees with palette.derive.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
