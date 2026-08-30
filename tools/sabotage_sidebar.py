"""Break `_sidebar.scss` on purpose, one way at a time, and demand the right guard says so.

    python tools/sabotage_sidebar.py

NOT WIRED INTO ANY GATE, on purpose: it MUTATES `_sidebar.scss` and `palette.py`,
so it must never run alongside a build (`build.mjs` reaps older hashes) or a suite. It is the
"watch it fail for the right reason" step, made repeatable instead of retyped.

WHY IT EXISTS. This repo's first named trap is green tests that assert existence
rather than correctness -- 75 of them were green while five real defects lived.
Item 40 added guards over the side pane's palette, and one of them was WRONG in a
way only this could find: `check_sidebar_coverage` was written believing it
caught defect 25, and case (g) proved it silent. Deleting a dark override leaves
a COMPLETE map after the cascade, so the key-set check has nothing to see; the
measured chip row is what reports 3.76:1. The docstring was corrected to say so.
Reading the code would not have found that. Running it did.

Each case names the guard that OWNS it. "Something went red" is not the bar -- a
guard that fires for the wrong reason is a guard nobody will read next time.

MAINTENANCE. The mutations are string literals against a file item 40 rewrites,
so they WILL go stale. That failure is loud by construction: a mutation that
does not change the file is reported as a MISS, never as a pass. Fix the literal
or delete the case; do not let it no-op.
"""
import io
import subprocess
import sys

#: The two files that define the pane's colour. The stylesheet says what
#: RENDERS; `palette.py` says what the derivation BELIEVES. Item 40 split them
#: on purpose, so a harness that could only break one of them could only ever
#: test half the contract -- and the half it could not reach is where the
#: slice-2 tint decision lives.
SCSS = "bunood_theme/public/scss/chrome/_sidebar.scss"
PALETTE = "bunood_theme/palette.py"
TARGETS = (SCSS, PALETTE)

# REFUSE TO RUN OVER UNCOMMITTED WORK. The restore is in a `finally`, and this
# repo has already lost a probe's `finally` to a mid-run kill -- "the worst place
# to die". With clean files, recovery from any death is `git checkout -- <path>`;
# with a dirty one it is somebody's lost afternoon.
for _t in TARGETS:
    if subprocess.run(["git", "diff", "--quiet", "--", _t]).returncode != 0:
        sys.exit(f"{_t} has uncommitted changes. Commit or stash them first: this "
                 "script mutates that file and a mid-run kill would strand the edit.")

# BYTES, NOT TEXT. Python's text mode translates newlines on the way in AND on
# the way out, so a read-mutate-write round trip silently rewrites every line
# ending to the host's -- which on a Windows checkout of an LF worktree is a
# 1,129-line diff produced by a script whose whole promise is that it changes
# nothing. The restore writes RAW back verbatim, so it is byte-identical by
# construction rather than by hoping the translation is symmetric.
RAW = {t: io.open(t, "rb").read() for t in TARGETS}
NEWLINE = {t: ("\r\n" if b"\r\n" in RAW[t] else "\n") for t in TARGETS}
#: What the mutations below match against: LF, whatever the checkout uses.
FLAT = {t: RAW[t].decode("utf-8").replace("\r\n", "\n") for t in TARGETS}


def write(target: str, text: str) -> None:
    """Write a FLAT string back in the checkout's own line endings."""
    io.open(target, "wb").write(text.replace("\n", NEWLINE[target]).encode("utf-8"))


def restore() -> None:
    for t in TARGETS:
        io.open(t, "wb").write(RAW[t])


sys.path.insert(0, "tools")

CHECKS = ("check_sidebar_agrees", "check_sidebar_coverage", "check_sidebar_binding",
          "check_sidebar_headroom")


def probe():
    """Every sidebar guard, on a freshly imported gate (sidebar_worlds caches)."""
    for m in ("contrast_gate", "bunood_theme.palette"):
        sys.modules.pop(m, None)
    import contrast_gate as g
    fired, detail = [], {}
    for name in CHECKS:
        try:
            out = getattr(g, name)()
        except SystemExit as exc:
            out = [f"RAISED SystemExit: {exc}"]
        except Exception as exc:
            out = [f"RAISED {type(exc).__name__}: {exc}"]
        if out:
            fired.append(name)
            detail[name] = out
    # The measured sweep: only the sidebar rows, only over the shipped seed and
    # two others -- 27 seeds per case would make this run for minutes.
    try:
        light, dark = g.read_blocks(g.TOKENS_SCSS)
        bad = []
        for seed, label in g.SEEDS[:3]:
            for mode, defaults in (("light", light), ("dark", dark)):
                for ink, bg, need, why, r, _ in g.evaluate(seed, defaults, mode):
                    if need is not None and r is not None and r < need and "sidebar" in why:
                        bad.append(f"{label}/{mode}: {ink} on {bg} = {r:.2f} needs {need} ({why})")
    except Exception as exc:
        bad = [f"RAISED {type(exc).__name__}: {exc}"]
    if bad:
        fired.append("measured pairs")
        detail["measured pairs"] = bad
    return fired, detail


#: ``(label, target, mutate, owning_guard)``.
CASES = [
    ("a: re-step one light hue", SCSS,
     lambda s: s.replace("--bnd-sb-cat-1: #2469bc;", "--bnd-sb-cat-1: #2469bd;", 1),
     "check_sidebar_agrees"),
    ("b: gut the shared dark-hue mixin", SCSS,
     lambda s: s.replace("@mixin sb-dark-hues {\n  --bnd-sb-cat-1: #7aabe5;",
                         "@mixin sb-dark-hues {\n  --bnd-sb-cat-0: #7aabe5;"),
     "check_sidebar_coverage"),
    ("c: an unclassified --bnd-sb-* token", SCSS,
     lambda s: s.replace("  --bnd-sb-card-base: #ffffff;",
                         "  --bnd-sb-card-base: #ffffff;\n  --bnd-sb-halo: #ff0000;", 1),
     "check_sidebar_coverage"),
    ("d: a declaration on the dark arm instead of the mixin", SCSS,
     lambda s: s.replace('html[data-theme="dark"][data-bnd-sb-color="minimal"] {\n'
                         "  @include sb-minimal-dark;",
                         'html[data-theme="dark"][data-bnd-sb-color="minimal"] {\n'
                         "  @include sb-minimal-dark;\n  --bnd-sb-ink: #ffffff;"),
     "check_sidebar_agrees"),
    ("e: a sixth colour mode nothing was fitted against", SCSS,
     lambda s: s + '\nhtml[data-bnd-sb-color="sepia"] {\n  --bnd-sb-bg: #f4ecd8;\n}\n',
     "check_sidebar_binding"),
    ("f: move the minimal pane and leave the table alone", SCSS,
     lambda s: s.replace("  --bnd-sb-bg: #fafbfa;", "  --bnd-sb-bg: #f0f0f0;", 1),
     "check_sidebar_agrees"),
    # g and h are defect 25's exact shape, and they are MEASURED, not counted:
    # dropping a dark override leaves a complete map after the cascade, so the
    # key-set check is structurally blind to it. See check_sidebar_coverage.
    ("g: revert defect 25 -- drop dark minimal's chip ink", SCSS,
     lambda s: s.replace("  --bnd-sb-chip-bg: transparent;\n  --bnd-sb-chip-ink: #8b938e;\n}",
                         "}", 1),
     "measured pairs"),
    # (i) is the case (e) did not write. `check_sidebar_binding` anchored its
    # pattern on `html[`, so it saw (e)'s single-attribute block and would have
    # walked straight past this one. A guard's passing test says nothing about
    # the case the test did not cover.
    ("i: a sixth colour mode declared ONLY on a compound selector", SCSS,
     lambda s: s + '\nhtml[data-theme="dark"][data-bnd-sb-color="sepia"] {\n'
                   "  --bnd-sb-bg: #2b2418;\n}\n",
     "check_sidebar_binding"),
    # j and k are slice 2's decision, and they are the cases the harness could
    # not reach before: they break the RECIPE, not the stylesheet. (j) is the
    # option the measurement rejected -- tinting the light pane at all -- and it
    # must be reported by check_sidebar_headroom, because no other check can see
    # a ground-tinted pane at all.
    ("j: tint the light pane, which has 0.07:1 of margin", PALETTE,
     lambda s: s.replace('"minimal": SidebarPane(("literal", "#fafbfa"), "minimal pane"),',
                         '"minimal": SidebarPane(("ground", 3, "#fafbfa"), "minimal pane"),', 1),
     "check_sidebar_headroom"),
    ("k: push the dark pane past its own ceiling", PALETTE,
     lambda s: s.replace('SidebarPane(("ground", 5, "#15181a")',
                         'SidebarPane(("ground", 14, "#15181a")', 1),
     "check_sidebar_headroom"),
    ("l: change the recipe and leave the stylesheet's fallback behind", PALETTE,
     lambda s: s.replace('SidebarPane(("ground", 5, "#15181a")',
                         'SidebarPane(("ground", 5, "#171a1c")', 1),
     "check_sidebar_agrees"),
    ("h: drop dark minimal's muted-ink override", SCSS,
     lambda s: s.replace("  --bnd-sb-ink-muted: #8b938e;\n  --bnd-sb-line: rgba(255, 255, 255, 0.08);",
                         "  --bnd-sb-line: rgba(255, 255, 255, 0.08);", 1),
     "measured pairs"),
]

failures = []
try:
    print("HEAD:", probe()[0] or "every guard quiet", "\n")
    for label, target, mutate, expect in CASES:
        broken = mutate(FLAT[target])
        if broken == FLAT[target]:
            failures.append(f"{label}: the sabotage did not change the file")
            print(f"MISS  {label}\n        the sabotage did not change {target}\n")
            continue
        write(target, broken)
        fired, detail = probe()
        ok = expect in fired
        print(f"{'PASS' if ok else 'MISS'}  {label}")
        print(f"        owner {expect}; fired: {fired or 'NOTHING'}")
        for k in fired:
            print(f"          {k}: {detail[k][0]}")
            if len(detail[k]) > 1:
                print(f"          {' ' * len(k)}  (+{len(detail[k]) - 1} more)")
        if not ok:
            failures.append(f"{label}: expected {expect}, got {fired or 'nothing'}")
        print()
    restore()
finally:
    restore()

print("restored byte-identical:", all(io.open(t, "rb").read() == RAW[t] for t in TARGETS))
print("git says clean:", all(
    subprocess.run(["git", "diff", "--quiet", "--", t]).returncode == 0 for t in TARGETS))
if failures:
    print("\nSABOTAGE FAILURES:")
    for f in failures:
        print("  ", f)
    sys.exit(1)
print("\nevery sabotage was caught by the guard that owns it")
