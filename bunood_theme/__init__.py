__version__ = "0.32.1"

# Runs once, at app load — the earliest point that can beat any request's
# lazy import of frappe/www/desk.py. See bunood_theme/i18n/rtl_patch.py for
# what this does and why an __init__.py import is the correct place for it.
#
# GUARDED, DELIBERATELY: __init__.py executes on ANY import of this package,
# including from tooling that runs with no Frappe environment at all —
# tools/contrast_gate.py imports bunood_theme.palette as plain Python (no
# bench, no site), which is the whole point of palette.py/contrast.py being
# "pure math" (see their own headers). An unconditional `import frappe` here
# broke that (measured 2026-08-13: contrast_gate.py crashed with
# ModuleNotFoundError before it ever reached its own code). Checking `frappe`
# itself first, rather than catching ImportError around the whole thing,
# means a genuine bug inside rtl_patch.py still fails loudly in a real
# Frappe environment — only "frappe isn't installed at all" is swallowed.
try:
	import frappe  # noqa: F401
except ImportError:
	pass
else:
	import bunood_theme.i18n.rtl_patch  # noqa: E402,F401
