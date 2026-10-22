"""The Saudi rules against the figures the v0.1 design shows.

Every expected value here was worked by hand from the Labor Law and appears on a
screen of the design canvas (the payroll run, the payslip, the end-of-service
page), so a change that moves one of them moves a number a customer has seen.
"""

from datetime import date
from decimal import Decimal

import pytest

from bunood_hr.saudi import end_of_service as eos
from bunood_hr.saudi import gosi, wages
from bunood_hr.saudi.money import D


def money(s):
	return Decimal(s)


# ── wages ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
	"who, total, basic, hours, expected",
	[
		("فهد الدوسري", "16200", "12000", 6, "555.00"),
		("أحمد عبدالحميد", "10800", "8000", 12, "740.00"),
		("محمد الحربي", "8100", "6000", 8, "370.00"),
		("جون ديلا كروز", "6075", "4500", 4, "138.75"),
		# Rounded once at the end: a rounded hourly rate (26.98) would give 296.78.
		("إمران خان", "4725", "3500", 11, "296.77"),
	],
)
def test_overtime_article_107(who, total, basic, hours, expected):
	assert wages.overtime_pay(total, basic, hours) == money(expected), who


def test_overtime_premium_is_on_basic_not_total():
	# Same total, different basic: only the premium may move.
	high_basic = wages.overtime_pay("10000", "10000", 1)
	low_basic = wages.overtime_pay("10000", "5000", 1)
	assert high_basic - low_basic == money("10.42")


def test_absence_is_a_thirtieth_of_the_total_wage():
	assert wages.absence_deduction("9450", 2) == money("630.00")
	assert wages.absence_deduction("4320", 1) == money("144.00")


def test_joiner_month_is_prorated_over_thirty_days():
	# Lina joined on 12 October: 20 days of a 31-day month, paid over 30.
	assert wages.prorate("9450", 20) == money("6300.00")


def test_article_92_caps_the_instalments_of_a_month_together():
	assert wages.max_advance_instalment("10800") == money("1080.00")
	assert wages.instalments_within_cap("10800", ["1000"])
	# The second advance's 1,000 is fine alone and over the cap with the first.
	assert not wages.instalments_within_cap("10800", ["1000", "1000"])


def test_money_refuses_floats():
	with pytest.raises(TypeError):
		D(0.1)


# ── GOSI ──────────────────────────────────────────────────────────────────


def test_saudi_contribution_on_basic_and_housing():
	c = gosi.contribution("18000", "4500", gosi.LEGACY_SAUDI)
	assert c.wage == money("22500.00")
	assert c.employee == money("2193.75")
	assert c.employer == money("2643.75")


def test_legacy_saudi_rates_add_up():
	assert gosi.LEGACY_SAUDI.employee == money("9.75")
	assert gosi.LEGACY_SAUDI.employer == money("11.75")


def test_non_saudi_pays_nothing_and_employer_pays_hazards():
	c = gosi.contribution("8000", "2000", gosi.NON_SAUDI)
	assert c.employee == 0
	assert c.employer == money("200.00")


def test_wage_is_capped():
	c = gosi.contribution("50000", "12500", gosi.LEGACY_SAUDI)
	assert c.wage == money("45000.00")
	assert c.employee == money("4387.50")


def test_joiner_contribution_is_prorated():
	c = gosi.contribution("7000", "1750", gosi.LEGACY_SAUDI, payment_days=20)
	assert c.employee == money("568.75")


def test_cap_applies_to_the_month_before_proration():
	# 60,000 a month for 15 days: half of the CAPPED month, not the cap itself.
	c = gosi.contribution("48000", "12000", gosi.LEGACY_SAUDI, payment_days=15)
	assert c.wage == money("22500.00")


# ── end of service ────────────────────────────────────────────────────────

YASER_WAGE = "10125"


def test_service_years_counts_calendar_months():
	assert eos.service_years(date(2019, 3, 1), date(2026, 11, 30)) == money("7.75")


def test_service_years_drops_unpaid_leave():
	full = eos.service_years(date(2020, 1, 1), date(2024, 12, 31))
	less = eos.service_years(date(2020, 1, 1), date(2024, 12, 31), unpaid_days=73)
	assert full == 5
	assert less == money("4.8")


def test_service_years_refuses_a_last_day_before_joining():
	with pytest.raises(ValueError):
		eos.service_years(date(2026, 1, 1), date(2025, 12, 31))


def test_full_award_article_84():
	a = eos.award(YASER_WAGE, "7.75", eos.TERMINATION)
	assert a.full == money("53156.25")
	assert a.amount == money("53156.25")


def test_resignation_between_five_and_ten_years_is_two_thirds():
	assert eos.award(YASER_WAGE, "7.75", eos.RESIGNATION).amount == money("35437.50")


@pytest.mark.parametrize(
	"years, share",
	[
		("1.99", Decimal(0)),
		("2", eos.ONE_THIRD),
		("5", eos.ONE_THIRD),
		("5.01", eos.TWO_THIRDS),
		("9.99", eos.TWO_THIRDS),
		("10", Decimal(1)),
	],
)
def test_article_85_boundaries(years, share):
	assert eos.resignation_share(years) == share


def test_article_80_forfeits_and_article_87_keeps_the_award():
	assert eos.award(YASER_WAGE, "7.75", eos.ARTICLE_80).amount == 0
	assert eos.award(YASER_WAGE, "3", eos.ARTICLE_87).amount == money("15187.50")


def test_unknown_reason_is_refused():
	with pytest.raises(ValueError):
		eos.award(YASER_WAGE, "3", "quit")


def test_leave_encashment():
	assert eos.leave_encashment(YASER_WAGE, "12.5") == money("4218.75")


def test_settlement_on_the_design_page():
	resign = eos.award(YASER_WAGE, "7.75", eos.RESIGNATION).amount
	net = resign + eos.leave_encashment(YASER_WAGE, "12.5") - money("2000")
	assert net == money("37656.25")
