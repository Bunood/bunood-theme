"""Money arithmetic for the Saudi rules.

Every rule in this package computes in :class:`~decimal.Decimal` and rounds once,
at the end, to the halala. Rounding an intermediate value (an hourly rate, a daily
wage) moves the result by a halala on ordinary salaries — 4,725 a month over 11
overtime hours is 296.77 computed whole and 296.78 from a rounded hourly rate —
and a payslip that disagrees with the bank file by one halala is a support call.
"""

from decimal import ROUND_HALF_UP, Decimal

HALALA = Decimal("0.01")


def D(value) -> Decimal:
	"""A Decimal from an int, a str or a Decimal. Floats are refused.

	A float has already lost the value it was meant to hold (``0.1`` is not one
	tenth), so accepting one would let a caller's rounding error into every rule.
	Frappe hands currency fields over as floats; convert them with ``str()`` at
	the boundary, where the caller can see it.
	"""
	if isinstance(value, float):
		raise TypeError("pass money as str, int or Decimal, not float")
	return value if isinstance(value, Decimal) else Decimal(value)


def halala(value: Decimal) -> Decimal:
	"""Round to the halala, half away from zero, as the banks and GOSI do."""
	return value.quantize(HALALA, rounding=ROUND_HALF_UP)
