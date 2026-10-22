"""Today's standing for each employee, against the rows the design shows."""

from datetime import date, datetime, time

from zerone_hr.logic import day as d

TODAY = date(2026, 10, 22)
OFFICE = d.Shift("Office", time(8, 0), time(17, 0), late_grace=15)
SITE = d.Shift("Site", time(6, 30), time(15, 30), late_grace=15)
NOON = datetime(2026, 10, 22, 12, 0)


def at(h, m):
	return datetime(2026, 10, 22, h, m)


def test_on_time_within_grace():
	assert d.standing(TODAY, NOON, OFFICE, at(8, 15)).status == d.PRESENT


def test_late_minutes_count_from_the_shift_start():
	s = d.standing(TODAY, NOON, OFFICE, at(8, 18))
	assert (s.status, s.late_minutes) == (d.LATE, 18)


def test_no_check_in_before_the_threshold_is_not_yet():
	assert d.standing(TODAY, at(9, 0), OFFICE, None).status == d.NOT_YET


def test_no_check_in_after_the_threshold_is_absent():
	assert d.standing(TODAY, NOON, OFFICE, None).status == d.ABSENT
	assert d.standing(TODAY, at(10, 29), SITE, None).status == d.NOT_YET
	assert d.standing(TODAY, at(10, 30), SITE, None).status == d.ABSENT


def test_leave_and_duty_outrank_a_missing_check_in():
	assert d.standing(TODAY, NOON, OFFICE, None, on_leave=True).status == d.LEAVE
	assert d.standing(TODAY, NOON, OFFICE, None, on_duty=True).status == d.DUTY
	assert d.standing(TODAY, NOON, OFFICE, None, off=True).status == d.OFF


def test_submitted_attendance_has_the_last_word():
	assert d.standing(TODAY, NOON, OFFICE, at(7, 50), attendance="Absent").status == d.ABSENT
	assert d.standing(TODAY, NOON, OFFICE, None, attendance="On Leave").status == d.LEAVE
	late = d.standing(TODAY, NOON, OFFICE, at(8, 24), attendance="Present", late_entry=True)
	assert (late.status, late.late_minutes) == (d.LATE, 24)


def test_present_written_by_an_on_duty_request_is_still_duty():
	s = d.standing(TODAY, NOON, OFFICE, None, attendance="Present", attendance_from_duty=True)
	assert s.status == d.DUTY


def test_unknown_attendance_status_falls_through():
	assert d.standing(TODAY, NOON, OFFICE, at(7, 52), attendance="").status == d.PRESENT


def test_no_shift_with_a_check_in_is_present():
	assert d.standing(TODAY, NOON, None, at(9, 40)).status == d.PRESENT
	assert d.standing(TODAY, NOON, None, None).status == d.NOT_YET


def test_sort_puts_absent_then_longest_late_first():
	rows = [
		{"employee_name": "A", "status": d.PRESENT},
		{"employee_name": "B", "status": d.LATE, "late_minutes": 18},
		{"employee_name": "C", "status": d.ABSENT},
		{"employee_name": "D", "status": d.LATE, "late_minutes": 42},
	]
	assert [r["employee_name"] for r in sorted(rows, key=d.sort_key)] == ["C", "D", "B", "A"]


def test_source():
	assert d.source(latitude=24.7, device_id="x") == d.MOBILE
	assert d.source(device_id="ZK-01") == d.DEVICE
	assert d.source() == d.MANUAL


def test_expiring_keeps_expired_and_drops_far():
	rows = [
		{
			"employee": "E1",
			"employee_name": "أنور",
			"document": "Work Permit",
			"expiry_date": date(2026, 11, 9),
		},
		{"employee": "E2", "employee_name": "راجيش", "document": "Iqama", "expiry_date": date(2026, 11, 15)},
		{"employee": "E3", "employee_name": "جون", "document": "Passport", "expiry_date": date(2027, 6, 1)},
		{"employee": "E4", "employee_name": "عمر", "document": "Iqama", "expiry_date": date(2026, 10, 1)},
		{"employee": "E5", "employee_name": "ريم", "document": "Passport", "expiry_date": None},
	]
	out = d.expiring(rows, TODAY)
	assert [(e.employee, e.days_left) for e in out] == [("E4", -21), ("E1", 18), ("E2", 24)]
	assert all(e.urgent for e in out)
