"""Social insurance (GOSI) contributions.

The contributory wage is the basic wage plus the housing allowance, capped. The
rates differ by branch and by who pays, and a non-Saudi is covered by
occupational hazards alone, paid by the employer.

The rates are DATA, not constants of the law: the new Social Insurance Law raises
the annuities rate step by step for people registered under it for the first
time, so a site carries more than one Saudi rate set at once. ``LEGACY_SAUDI`` and
``NON_SAUDI`` are the defaults a site starts from; Bunood HR Settings is where a
site edits them, and every call here takes the set to apply as an argument.
"""

from dataclasses import dataclass
from decimal import Decimal

from bunood_hr.saudi.money import D, halala

#: The contributory wage is capped at this amount a month.
WAGE_CAP = Decimal("45000")


@dataclass(frozen=True)
class Rates:
	"""Percentages, by branch and payer."""

	annuities_employee: Decimal
	annuities_employer: Decimal
	saned_employee: Decimal
	saned_employer: Decimal
	hazards_employer: Decimal

	@property
	def employee(self) -> Decimal:
		return self.annuities_employee + self.saned_employee

	@property
	def employer(self) -> Decimal:
		return self.annuities_employer + self.saned_employer + self.hazards_employer


LEGACY_SAUDI = Rates(
	annuities_employee=Decimal("9"),
	annuities_employer=Decimal("9"),
	saned_employee=Decimal("0.75"),
	saned_employer=Decimal("0.75"),
	hazards_employer=Decimal("2"),
)

NON_SAUDI = Rates(
	annuities_employee=Decimal(0),
	annuities_employer=Decimal(0),
	saned_employee=Decimal(0),
	saned_employer=Decimal(0),
	hazards_employer=Decimal("2"),
)


@dataclass(frozen=True)
class Contribution:
	wage: Decimal
	employee: Decimal
	employer: Decimal

	@property
	def total(self) -> Decimal:
		return self.employee + self.employer


def contributory_wage(basic, housing) -> Decimal:
	"""Basic plus housing, capped at :data:`WAGE_CAP`."""
	return min(D(basic) + D(housing), WAGE_CAP)


def contribution(basic, housing, rates: Rates, payment_days=30) -> Contribution:
	"""The month's contribution on this wage at these rates.

	``payment_days`` prorates a joiner's or a leaver's month over thirty days, the
	same convention as the wage itself. The cap is a monthly figure, so it applies
	to the month's wage first and the proration follows.
	"""
	wage = contributory_wage(basic, housing) * D(payment_days) / 30
	return Contribution(
		wage=halala(wage),
		employee=halala(wage * rates.employee / 100),
		employer=halala(wage * rates.employer / 100),
	)
