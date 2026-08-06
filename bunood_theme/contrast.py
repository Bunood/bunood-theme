# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Colour maths: sRGB parsing, WCAG contrast, and contrast-safe ink derivation.

WHAT
    A dependency-free module that can (a) resolve the colour expressions this theme
    actually writes — hex, ``rgba()`` and ``color-mix(in srgb, …)`` over ``var()``
    references — down to concrete sRGB, (b) compute WCAG 2.2 contrast ratios, and
    (c) derive an ink or a fill that is guaranteed to clear a target ratio.

WHY IT LIVES IN THE APP AND NOT IN THE BUILD
    Two consumers need identical answers and only one of them is JavaScript:

    * ``brand.py`` runs on the server, per site, against a seed the CUSTOMER chose.
      It cannot consult a build-time table, because the seed did not exist at build
      time.
    * ``tools/contrast_gate.py`` runs in CI against a matrix of seeds.

    Implementing the maths twice — once in Python for the runtime and once in
    JavaScript for the gate — would be the same fact in two places, which is the
    defect class this repo keeps paying for (CLAUDE.md, "the traps"). So the maths
    lives here, once, and the gate imports it. The build stays pure JS and simply
    does not do contrast; ``npm run contrast`` shells out to Python.

WHY WCAG 2.2 AA AND NOT APCA
    APCA (the WCAG 3 candidate) models thin light-on-dark text far better than the
    1.4.3 ratio does, and every serious design system is watching it. It is also
    still a draft, has no conformance level anyone can be held to, and no
    procurement questionnaire asks for it. An ERP is bought by organisations with
    accessibility clauses in their contracts, and those clauses say WCAG 2.1/2.2
    AA. We target the thing we can be held to, and note the ratio is a floor and
    not a design goal.

THE TARGETS (WCAG 2.2 AA)
    * 4.5:1 — text under 18.66px bold / 24px regular. Every text token in this
      theme is in this bucket: the largest is ``--bnd-text-2xl`` at 1.75rem = 28px,
      but it is used for page titles that also inherit ``--bnd-ink`` at 17:1, so
      nothing relies on the large-text allowance and we do not model it.
    * 3:1 — user-interface components and meaningful graphics (1.4.11): a
      control's boundary, a status dot, a focus ring.
    * Exempt — disabled controls (1.4.3 "incidental"), and pure decoration such as
      a separator rule that carries no information.
"""

from __future__ import annotations

import re

#: WCAG 2.2 AA, success criterion 1.4.3 — text below the large-text threshold.
AA_TEXT = 4.5

#: WCAG 2.2 AA, success criterion 1.4.11 — non-text contrast: the boundary of a
#: control, and any graphic needed to understand the content.
AA_NON_TEXT = 3.0

#: The ink used on light fills. Not ``#000``: pure black on a coloured fill reads
#: as a printing error, and the extra 0.75 of a ratio point it buys is not worth
#: it when the derivation below can darken the FILL instead.
INK_DARK = "#16181d"

#: The ink used on dark fills.
INK_LIGHT = "#ffffff"


# ── Parsing ──────────────────────────────────────────────────────────────────


def parse_color(text: str, variables: dict[str, str] | None = None, _depth: int = 0):
    """Resolve a CSS colour expression to ``(r, g, b, a)`` with 0-255 channels.

    Handles exactly the forms this theme writes, and refuses anything else rather
    than guessing — a silently mis-parsed colour would make the gate report a
    ratio for a colour that is not on screen, which is worse than no gate.

    Supported:
        ``#rgb`` · ``#rrggbb`` · ``#rrggbbaa`` · ``rgb(…)`` · ``rgba(…)`` ·
        ``color-mix(in srgb, <colour> <pct>%, <colour>)`` · ``var(--name)`` and
        ``var(--name, <fallback>)`` resolved against ``variables``.

    Args:
        text: the expression.
        variables: token name (with the leading ``--``) to expression. Resolved
            recursively, so a token may be defined in terms of another.
        _depth: recursion guard. A token cycle in the SCSS would otherwise hang
            the build instead of naming the cycle.

    Returns:
        ``(r, g, b, a)`` — channels 0-255 as floats, alpha 0-1.

    Raises:
        ValueError: on an unsupported expression, an unknown ``var()``, or a
            reference cycle.
    """
    variables = variables or {}
    if _depth > 24:
        raise ValueError(f"colour reference cycle at: {text[:60]!r}")
    s = text.strip().rstrip(";").strip()

    if s.startswith("var("):
        inner = _args(s[4:-1])
        name = inner[0].strip()
        if name in variables:
            return parse_color(variables[name], variables, _depth + 1)
        if len(inner) > 1:
            return parse_color(inner[1], variables, _depth + 1)
        raise ValueError(f"unknown custom property {name}")

    if s.startswith("#"):
        h = s[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 6:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
        if len(h) == 8:
            return (
                int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) / 255
            )
        raise ValueError(f"bad hex colour {s!r}")

    if s.startswith("rgb(") or s.startswith("rgba("):
        parts = _args(s[s.index("(") + 1 : -1])
        # `rgb(0 0 0 / 50%)` — the modern space-separated form. Normalised here
        # because Sass emits whichever the author wrote.
        if len(parts) == 1:
            parts = re.split(r"[\s/]+", parts[0].strip())
        nums = [p.strip().rstrip("%") for p in parts]
        r, g, b = (float(n) for n in nums[:3])
        a = 1.0
        if len(nums) > 3:
            a = float(nums[3])
            if "%" in parts[3]:
                a /= 100
        return (r, g, b, a)

    if s.startswith("color-mix("):
        return _parse_color_mix(s, variables, _depth)

    raise ValueError(f"unsupported colour expression {s!r}")


def _parse_color_mix(s: str, variables: dict[str, str], depth: int):
    """Resolve ``color-mix(in srgb, A p%, B)``.

    Only the ``srgb`` interpolation space is accepted. That is deliberate: the
    theme writes ``in srgb`` everywhere, and ``in oklab`` (CSS's default for
    ``color-mix`` when a polar space is not named) would land somewhere else
    entirely. Modelling a space the stylesheet does not use would produce ratios
    for colours nobody sees.

    Percentages follow the CSS rule: one stated percentage ``p`` gives the other
    colour ``100 - p``; two are normalised to sum to 100.
    """
    args = _args(s[len("color-mix(") : -1])
    space = args[0].strip()
    if space != "in srgb":
        raise ValueError(f"only 'in srgb' is modelled, got {space!r}")

    def split_pct(part: str):
        m = re.search(r"\s([\d.]+)%\s*$", part.strip())
        if not m:
            return part.strip(), None
        return part.strip()[: m.start()].strip(), float(m.group(1))

    c1, p1 = split_pct(args[1])
    c2, p2 = split_pct(args[2])
    if p1 is None:
        p1 = 100.0 - p2 if p2 is not None else 50.0
    if p2 is None:
        p2 = 100.0 - p1
    total = p1 + p2
    w1, w2 = p1 / total, p2 / total

    a1 = parse_color(c1, variables, depth + 1)
    a2 = parse_color(c2, variables, depth + 1)
    # Premultiplied, per the CSS spec. Every mix in this theme is between opaque
    # colours, so this reduces to a plain lerp — but `transparent` appears in the
    # palette and sidebar washes, and there the premultiplication matters.
    alpha = a1[3] * w1 + a2[3] * w2
    if alpha == 0:
        return (0.0, 0.0, 0.0, 0.0)
    ch = tuple(
        (a1[i] * a1[3] * w1 + a2[i] * a2[3] * w2) / alpha for i in range(3)
    )
    return (ch[0], ch[1], ch[2], alpha)


def _args(inner: str) -> list[str]:
    """Split a function's argument list on top-level commas."""
    out, depth, buf = [], 0, ""
    for ch in inner:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(buf)
            buf = ""
        else:
            buf += ch
    out.append(buf)
    return out


def composite(fg, bg):
    """Flatten a translucent colour over an opaque one (source-over).

    Needed because ``--bnd-border`` and ``--bnd-border-strong`` are ``rgba()``: a
    ratio computed from the raw token would describe a colour that never reaches
    a pixel. The audit in GUIDELINES §2.2 measured them composited, and so do we.
    """
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3)) + (1.0,)


# ── WCAG ─────────────────────────────────────────────────────────────────────


def _linear(channel: float) -> float:
    """sRGB 0-255 to linear-light 0-1, per WCAG 2.x / IEC 61966-2-1."""
    c = channel / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(color) -> float:
    """Relative luminance, WCAG 2.2 definition. Alpha is ignored — composite first."""
    r, g, b = (_linear(c) for c in color[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b) -> float:
    """Contrast ratio between two OPAQUE colours, 1.0 … 21.0."""
    la, lb = luminance(a), luminance(b)
    lo, hi = sorted((la, lb))
    return (hi + 0.05) / (lo + 0.05)


# ── Derivation ───────────────────────────────────────────────────────────────
#
# The functions below are the whole answer to "a white-label theme must refuse
# illegible brand colours" — except that it must not refuse them.
#
# A tenant's brand colour is not a preference, it is their identity; a settings
# form that rejects it produces a support ticket, not an accessible desk. Every
# mature system solves this the same way: THE SEED CONTRIBUTES HUE, THE SYSTEM
# CONTROLS LIGHTNESS. Material 3 stores colour as hue/chroma/TONE and pins role
# pairs to fixed tones (primary 40 / on-primary 100 in light), so the pairing
# passes by construction whatever hue you seed it with. Radix ships 12-step
# scales where step 9 is the solid fill and 11/12 are the text, generated so the
# pair holds. Adobe Spectrum and IBM Carbon both make you pick a RAMP, not a
# colour. Salesforce Lightning lets you pick freely and then quietly corrects.
#
# So we adjust, and we say so. Nothing is ever rejected.


def fit_ink(ink: str, backgrounds, target: float = AA_TEXT, toward: str | None = None):
    """Darken or lighten ``ink`` until it clears ``target`` against every background.

    Args:
        ink: the starting colour — the designed value, kept unchanged if it
            already passes. That matters: a customer whose seed is fine must see
            exactly the theme as designed, not a colour we nudged for no reason.
        backgrounds: the surfaces this ink is placed on. The ink must clear the
            target against the WORST of them, because a token is one value and
            the stylesheet puts it on all of them.
        target: required ratio.
        toward: ``"#000000"`` or ``"#ffffff"``. Defaults to whichever direction
            the worst background is further from, which is the direction that can
            actually reach the target.

    Returns:
        ``(hex, adjusted)`` — the fitted colour and whether it moved.

    Method is bisection on the mix fraction, and it is valid only because THE
    BACKGROUNDS ARE ALL ON THE SAME SIDE OF THE INK — which holds here, since a
    mode's six surfaces are all light or all dark. Under that precondition,
    moving away from them raises contrast monotonically and 24 iterations land
    within a rounding error of the smallest sufficient adjustment. "Smallest
    sufficient" is the point: the designed ramp survives as far as legibility
    allows, rather than being replaced by a computed one.

    Pass backgrounds that STRADDLE the ink and this will silently return a value
    on the wrong side of the dip where contrast falls through 1.0. :func:`fill_pair`
    faces exactly that and scans linearly instead; if a caller ever needs mixed
    backgrounds here, it needs that scan, not this bisection.

    EVERY MEASUREMENT IS TAKEN ON THE QUANTISED COLOUR. Bisecting on continuous
    channels and rounding to ``#rrggbb`` at the end returns a value that was never
    measured: rounding moves each channel by up to half a step, which is enough to
    drop a just-sufficient result back under the target. That is not theoretical —
    it put four pairs a hundredth of a point below 4.5 while this function
    reported them fitted. Rounding first and measuring second means the number
    this returns is the number the browser will paint.
    """
    bgs = [parse_color(b) if isinstance(b, str) else b for b in backgrounds]
    start = quantise(parse_color(ink) if isinstance(ink, str) else ink)

    def worst(c):
        return min(ratio(c, bg) for bg in bgs)

    if worst(start) >= target:
        return to_hex(start), False

    if toward is None:
        # Move away from the background we are failing hardest against.
        heaviest = min(bgs, key=lambda bg: ratio(start, bg))
        toward = "#000000" if luminance(heaviest) > 0.18 else "#ffffff"
    end = parse_color(toward)

    def mixed(t):
        return quantise(
            tuple(start[i] * (1 - t) + end[i] * t for i in range(3)) + (1.0,)
        )

    if worst(mixed(1.0)) < target:
        # Unreachable: the backgrounds straddle the ink so completely that no
        # single value clears them all. Return the best available and let the
        # caller decide — this is a design problem, not an arithmetic one, and
        # silently returning black would hide it.
        return to_hex(mixed(1.0)), True

    lo, hi = 0.0, 1.0
    for _ in range(24):
        mid = (lo + hi) / 2
        if worst(mixed(mid)) >= target:
            hi = mid
        else:
            lo = mid
    return to_hex(mixed(hi)), True


def quantise(color):
    """Round to the 8-bit channels a browser will actually rasterise."""
    return tuple(float(max(0, min(255, round(c)))) for c in color[:3]) + (1.0,)


def fill_pair(
    seed: str,
    target: float = AA_TEXT,
    surfaces=None,
    graphic_target: float = AA_NON_TEXT,
):
    """Pick a fill and its ink, moving the fill as little as possible.

    Args:
        seed: the colour the fill wants to be.
        target: ratio the label must clear against the fill (1.4.3).
        surfaces: if given, the fill must ALSO stay this visible against each of
            them (1.4.11) — a brand-coloured chip on a brand-tinted pane is a
            chip nobody can see.
        graphic_target: the ratio for that second constraint.

    Returns:
        ``(solid_hex, ink_hex, adjusted)``.

    WHY THE FILL MOVES AND NOT ONLY THE INK
        With ``INK_DARK`` at ``#16181d`` there is a band of luminances where
        NEITHER white nor our dark ink reaches 4.5:1, and the shipped default
        ``#4d8756`` sits in it — 4.27 against white, 4.16 against dark. Choosing
        the better ink is not enough on its own, which is the case GUIDELINES
        §2.2 flags. Moving the fill a few percent closes it while leaving the
        colour recognisably the customer's.

        A bright yellow takes the other branch untouched: ``#F5C542`` is 1.62:1
        against white but 10.9:1 against our dark ink, so the yellow stays yellow
        and the label turns dark. That is why this never rejects a seed.

    WHY THE TWO CONSTRAINTS ARE SOLVED TOGETHER AND NOT IN SEQUENCE
        They pull opposite ways in dark mode. Darkening a fill so white text
        clears 4.5:1 moves it TOWARD dark surfaces, so satisfying the label can
        cost the visibility — measured: at the shipped seed, the dark-mode fill
        fitted for its label dropped to 2.98:1 against ``--bnd-hover``. Applying
        one then the other therefore cannot work in either order. Both candidate
        inks are tried instead, and the one needing the smallest move wins; in
        dark mode that is usually the dark ink on a LIGHTENED fill, which helps
        both constraints at once.

        The scan is linear rather than a bisection because contrast against a
        surface is not monotonic along the path — it falls to 1.0 as the fill
        passes through the surface's own luminance and rises after. Bisection
        assumes monotonicity and would happily return a value on the wrong side
        of that dip.
    """
    bgs = [parse_color(s) if isinstance(s, str) else s for s in (surfaces or [])]
    start = quantise(parse_color(seed))

    def ok(c, ink_c):
        if ratio(c, ink_c) < target:
            return False
        return all(ratio(c, bg) >= graphic_target for bg in bgs)

    best = None  # (steps_moved, solid, ink)
    for ink, direction in ((INK_LIGHT, "#000000"), (INK_DARK, "#ffffff")):
        ink_c = parse_color(ink)
        end = parse_color(direction)
        for step in range(0, 257):
            t = step / 256
            c = quantise(tuple(start[i] * (1 - t) + end[i] * t for i in range(3)))
            if ok(c, ink_c):
                if best is None or step < best[0]:
                    best = (step, to_hex(c), ink)
                break

    if best is None:
        # Nothing on either axis satisfies both. Reachable only if the surfaces
        # span the full range, which no real palette does — but returning a
        # plausible-looking colour that fails would hide it, so say so.
        raise ValueError(
            f"no fill derived from {seed} clears {target}:1 for its label and "
            f"{graphic_target}:1 against every surface"
        )
    _, solid, ink = best
    return solid, ink, solid.lower() != to_hex(start).lower()


def to_hex(color) -> str:
    """Round to ``#rrggbb``. Alpha is dropped — every token we emit is opaque."""
    return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in color[:3])
