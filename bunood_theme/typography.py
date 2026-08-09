# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""The Arabic face catalogue — one table, three consumers, no second copy.

WHAT
    ``FACES`` maps each value the ``arabic_font`` Select may hold to everything
    the runtime needs to honour it: the CSS family name, the shipped woff2
    files, the fallback chain, and the leading Arabic text needs *in this
    face*. The consumers:

    * :mod:`bunood_theme.brand` emits ``@font-face`` + the tokens for the ONE
      selected face into the per-site brand sheet;
    * the doctype's ``arabic_font`` options are asserted to equal these keys by
      ``assertTypographySync`` in ``build.mjs`` (parsed as text, same idiom as
      the registry guard);
    * the smoke suite asserts the selected face actually resolves on a desk.

WHY ``unicode-range`` IS THE WHOLE MECHANISM
    Every ``@font-face`` here is restricted to the Arabic blocks, so the face
    applies only to Arabic glyphs — a workspace *named* in Arabic on an English
    desk gets it, which no language- or direction-scoped rule could do (the
    cursive-guard work already paid for that lesson: script is not language).

    THE DOWNLOAD CLAIM, MEASURED RATHER THAN RECITED: the spec says a ranged
    face downloads only when needed, but Chromium triggers on in-range
    CHARACTERS IN THE DOM, rendered or not — and Frappe's boot script carries
    the native language names (العربية among them) on every desk. Measured
    2026-08-10 on a live ``en`` desk: both weights fetched with zero rendered
    Arabic on the page. So the honest cost is "one face, ~60-90 KB, fetched
    once per browser and cached against an immutable URL" — on every desk, not
    only Arabic ones. Never write "Latin desks download nothing" anywhere; it
    was written, measured, and retracted.

WHY LEADING IS PER-FACE AND NOT A CONSTANT
    Arabic wants looser line-height than Latin, but "+8%" is wrong as a rule:
    these four faces carry very different vertical metrics. Cairo's are so tall
    that its *natural* line box is ~1.9 — it needs reining in, not loosening.
    The number here is "the right leading for THIS face on a desk", found by
    eye against the settings form and the sidebar; refine per face, never
    globally.

WHY THE WEIGHTS ARE 400 + 700
    Almarai ships no 600 — its cuts are 300/400/700/800 — and one uniform pair
    keeps the table honest. CSS font-matching sends 500–600 requests to the
    nearest declared weight, so ``--bnd-weight-medium`` text renders at 400 and
    semibold+ at 700. Noto and Cairo are variable files whose single woff2
    covers the whole span; their ``weight`` value is the range ``@font-face``
    declares.
"""

#: The Arabic Unicode blocks, one string, used by every @font-face emitted.
#: Base block, supplements, presentation forms — the set Google Fonts uses for
#: its own arabic subsets, which is where these files come from.
ARABIC_RANGE = "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1"

#: A fallback chain of the faces the three desktop OSes actually ship for
#: Arabic. Ends in sans-serif, never in a Latin-only family: a Latin tail
#: would render tofu boxes the moment both the webfont and the OS face miss.
SYSTEM_ARABIC = '"Segoe UI", "SF Arabic", "Geeza Pro", "Noto Naskh Arabic", sans-serif'

#: The catalogue. Keys ARE the Select values — human-readable, like every
#: other picker in this app. ``build.mjs`` parses the keys from this literal
#: as text; keep the four-space indent and one-key-per-line shape.
FACES = {
    "System": {
        # The zero-payload choice: no @font-face, no body rule, the OS answers.
        # It exists so the picker can honestly offer "download nothing" — but
        # it is NOT the default, because the desk then differs per platform,
        # which is the defect item 7(b) names.
        "family": None,
        "files": [],
        "fallback": SYSTEM_ARABIC,
        "line_height": None,
    },
    "IBM Plex Sans Arabic": {
        # The shipped default: a UI-drawn Naskh with the closest x-height
        # pairing to Frappe's Inter. Reads as a system face, not a brand face.
        "family": "IBM Plex Sans Arabic",
        "files": [
            {"file": "plex-arabic-400.woff2", "weight": "400"},
            {"file": "plex-arabic-700.woff2", "weight": "700"},
        ],
        "fallback": SYSTEM_ARABIC,
        "line_height": "1.7",
    },
    "Noto Sans Arabic": {
        # The widest coverage and the strongest hinting at small sizes; the
        # safe choice, and the ready one if Urdu or Persian tenants follow.
        # One variable file covers every weight.
        "family": "Noto Sans Arabic",
        "files": [
            {"file": "noto-arabic-var.woff2", "weight": "100 900"},
        ],
        "fallback": SYSTEM_ARABIC,
        "line_height": "1.68",
    },
    "Almarai": {
        # Gulf-modern and instantly familiar to a Saudi audience. Static cuts
        # only — 300/400/700/800 upstream, of which the uniform pair ships.
        "family": "Almarai",
        "files": [
            {"file": "almarai-400.woff2", "weight": "400"},
            {"file": "almarai-700.woff2", "weight": "700"},
        ],
        "fallback": SYSTEM_ARABIC,
        "line_height": "1.6",
    },
    "Cairo": {
        # Geometric, designed, the most personality of the four. Its vertical
        # metrics are famously tall — the explicit leading REINS IN a natural
        # line box of ~1.9 rather than loosening anything.
        "family": "Cairo",
        "files": [
            {"file": "cairo-var.woff2", "weight": "200 1000"},
        ],
        "fallback": SYSTEM_ARABIC,
        "line_height": "1.62",
    },
}

#: What a fresh install selects. A self-hosted face and not System, because
#: defaulting to System ships the per-platform inconsistency 7(b) exists to
#: remove. ``setup.SHIPPED`` reads this so the two cannot disagree.
DEFAULT_FACE = "IBM Plex Sans Arabic"
