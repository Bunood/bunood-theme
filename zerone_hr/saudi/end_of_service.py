"""End-of-service award, Articles 84, 85, 80 and 87 of the Labor Law.

The FULL award (Article 84) is half a month's wage for each of the first five
years and a whole month's wage for each year after, a part year counting in
proportion. What the worker receives depends on why the service ended:

- the employer ended it, or a fixed-term contract ran out: the full award;
- the worker resigned (Article 85): nothing under two years, a third up to five,
  two thirds above five and under ten, and the whole from ten;
- Article 80 dismissal: nothing;
- Article 87 (force majeure, or a woman leaving within six months of marriage or
  three months of giving birth): the full award, although she resigned.

The wage is the last ACTUAL wage — the components a site counts are its choice
(basic, housing and transport by default); this module takes the total.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from zerone_hr.saudi.money import D, halala
from zerone_hr.saudi.wages import daily_wage

TERMINATION = "termination"
CONTRACT_END = "contract_end"
RESIGNATION = "resignation"
ARTICLE_80 = "article_80"
ARTICLE_87 = "article_87"

REASONS = (TERMINATION, CONTRACT_END, RESIGNATION, ARTICLE_80, ARTICLE_87)

ONE_THIRD = Decimal(1) / 3
TWO_THIRDS = Decimal(2) / 3


@dataclass(frozen=True)
class Award:
	years: Decimal
	full: Decimal
	share: Decimal
	amount: Decimal


def service_years(joined: date, last_day: date, unpaid_days: int = 0) -> Decimal:
	"""Years of service from the joining date to the last working day, inclusive.

	Counted as whole years and months on the calendar, then the remaining days
	over 365, so 01-03-2019 to 30-11-2026 is exactly 7.75. Days of leave without
	pay do not count as service and are taken off.
	"""
	if last_day < joined:
		raise ValueError("the last day is before the joining date")
	end = last_day + timedelta(days=1)
	months = (end.year - joined.year) * 12 + (end.month - joined.month)
	if end.day < joined.day:
		months -= 1
	anchor = _add_months(joined, months)
	days = (end - anchor).days - unpaid_days
	return Decimal(months) / 12 + Decimal(days) / 365


def full_award(wage, years) -> Decimal:
	"""Article 84's award before any reduction, unrounded."""
	wage, years = D(wage), D(years)
	first = min(years, Decimal(5))
	rest = max(years - 5, Decimal(0))
	return first * wage / 2 + rest * wage


def resignation_share(years) -> Decimal:
	"""Article 85: the share of the full award a resigning worker receives."""
	years = D(years)
	if years < 2:
		return Decimal(0)
	if years <= 5:
		return ONE_THIRD
	if years < 10:
		return TWO_THIRDS
	return Decimal(1)


def award(wage, years, reason: str) -> Award:
	if reason not in REASONS:
		raise ValueError(f"unknown reason {reason!r}; expected one of {REASONS}")
	years = D(years)
	full = full_award(wage, years)
	if reason == ARTICLE_80:
		share = Decimal(0)
	elif reason == RESIGNATION:
		share = resignation_share(years)
	else:
		share = Decimal(1)
	return Award(years=years, full=halala(full), share=share, amount=halala(full * share))


def leave_encashment(wage, days) -> Decimal:
	"""Article 111: the untaken annual leave, paid at the day's wage, whatever the reason."""
	return halala(daily_wage(wage) * D(days))


def _add_months(d: date, months: int) -> date:
	year, month = divmod(d.month - 1 + months, 12)
	year += d.year
	month += 1
	last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
	return date(year, month, min(d.day, last))
