"""Daily and hourly wages, overtime, absence and proration.

The month is thirty days, whatever the calendar says. That is the convention the
payroll screens, the absence deduction and the end-of-service leave encashment
all share, so one constant holds it and nothing else divides by a month length.
"""

from decimal import Decimal

from bunood_hr.saudi.money import D, halala

MONTH_DAYS = 30
DAY_HOURS = 8

#: Article 92: a loan instalment may not take more than this share of the wage.
ADVANCE_SHARE_CAP = Decimal("0.10")


def daily_wage(monthly) -> Decimal:
	"""The wage for one day: the monthly amount over thirty days, unrounded."""
	return D(monthly) / MONTH_DAYS


def hourly_wage(monthly, day_hours: int = DAY_HOURS) -> Decimal:
	"""The wage for one hour of a normal day, unrounded."""
	return daily_wage(monthly) / day_hours


def overtime_pay(total, basic, hours, day_hours: int = DAY_HOURS) -> Decimal:
	"""Overtime under Article 107: the hour's wage plus half the hour's basic wage.

	``total`` is the whole monthly wage (basic and allowances) and ``basic`` the
	basic alone; the premium is half of the BASIC hourly wage, not of the total.
	"""
	rate = hourly_wage(total, day_hours) + hourly_wage(basic, day_hours) / 2
	return halala(rate * D(hours))


def absence_deduction(total, days) -> Decimal:
	"""What an unexcused absence takes: a day's wage per day."""
	return halala(daily_wage(total) * D(days))


def prorate(monthly, days) -> Decimal:
	"""The wage for ``days`` of a thirty-day month (a joiner's or a leaver's month)."""
	return halala(daily_wage(monthly) * D(days))


def max_advance_instalment(total) -> Decimal:
	"""The largest monthly loan instalment Article 92 allows on this wage."""
	return halala(D(total) * ADVANCE_SHARE_CAP)


def instalments_within_cap(total, instalments) -> bool:
	"""Whether the instalments due in one month fit under Article 92's cap together.

	The cap is on the deduction, not on each loan: a second advance whose own
	instalment is small can still push the month over.
	"""
	due = sum((D(i) for i in instalments), Decimal(0))
	return due <= max_advance_instalment(total)
