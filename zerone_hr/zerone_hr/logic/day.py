"""Where each employee stands today, from Frappe HR's records.

Frappe HR marks Attendance in a scheduled job after the shift, so in the middle of
the day most people have check-ins and no Attendance yet. This module reads both
and decides the word the HR desk shows NOW: present, late, absent, not in yet, on
leave, on duty, or off. It is free of Frappe so the decision can be tested alone;
``zerone_hr.api.day`` gathers the rows and calls it.

The order of precedence, first match wins:

1. a submitted Attendance says what happened (HR has already decided) — except
   the Present that HRMS itself writes when it approves an on-duty request,
   which is still a day of duty, not a day at the desk;
2. an approved Leave Application covering today;
3. an approved on-duty Attendance Request covering today;
4. a holiday or a weekly off;
5. the first check-in against the shift start and its grace period;
6. no check-in: absent once the absence threshold has passed, not in yet before.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

PRESENT = "present"
LATE = "late"
ABSENT = "absent"
NOT_YET = "not_yet"
LEAVE = "leave"
DUTY = "duty"
OFF = "off"

#: The list puts what needs someone first.
ORDER = {ABSENT: 0, LATE: 1, NOT_YET: 2, PRESENT: 3, DUTY: 4, LEAVE: 5, OFF: 6}

#: No check-in this long after the shift starts counts as an absence.
ABSENT_AFTER_MINUTES = 240

MOBILE = "mobile"
DEVICE = "device"
MANUAL = "manual"


@dataclass(frozen=True)
class Shift:
	name: str
	start: time
	end: time
	late_grace: int = 0


@dataclass(frozen=True)
class Standing:
	status: str
	late_minutes: int = 0


def standing(
	day: date,
	now: datetime,
	shift: Shift | None,
	first_in: datetime | None,
	*,
	attendance: str | None = None,
	late_entry: bool = False,
	attendance_from_duty: bool = False,
	on_leave: bool = False,
	on_duty: bool = False,
	off: bool = False,
	absent_after: int = ABSENT_AFTER_MINUTES,
) -> Standing:
	if attendance and attendance_from_duty:
		return Standing(DUTY)
	if attendance:
		marked = _from_attendance(attendance, late_entry, day, shift, first_in)
		if marked:
			return marked
	if on_leave:
		return Standing(LEAVE)
	if on_duty:
		return Standing(DUTY)
	if off:
		return Standing(OFF)

	if first_in is not None:
		if shift is None:
			return Standing(PRESENT)
		return _against_shift(day, shift, first_in)

	if shift is None:
		return Standing(NOT_YET)
	start = datetime.combine(day, shift.start)
	if now >= start + timedelta(minutes=absent_after):
		return Standing(ABSENT)
	return Standing(NOT_YET)


def _against_shift(day: date, shift: Shift, first_in: datetime) -> Standing:
	start = datetime.combine(day, shift.start)
	if first_in <= start + timedelta(minutes=shift.late_grace):
		return Standing(PRESENT)
	# Lateness is counted from the shift start, not from the end of the grace:
	# 08:18 against 08:00 with fifteen minutes' grace is eighteen minutes late.
	return Standing(LATE, int((first_in - start).total_seconds() // 60))


def _from_attendance(status, late_entry, day, shift, first_in) -> Standing | None:
	if status == "On Leave":
		return Standing(LEAVE)
	if status == "Absent":
		return Standing(ABSENT)
	if status in ("Present", "Work From Home", "Half Day"):
		if late_entry and shift is not None and first_in is not None:
			late = _against_shift(day, shift, first_in)
			return late if late.status == LATE else Standing(LATE)
		return Standing(LATE) if late_entry else Standing(PRESENT)
	return None


def source(latitude=None, device_id=None) -> str:
	"""Where a check-in came from: the phone (it carries a location), a device, or a person."""
	if latitude:
		return MOBILE
	if device_id:
		return DEVICE
	return MANUAL


def sort_key(row: dict):
	return (ORDER.get(row["status"], 99), -row.get("late_minutes", 0), row.get("employee_name") or "")


@dataclass(frozen=True)
class Expiry:
	employee: str
	employee_name: str
	document: str
	expiry_date: date
	days_left: int

	@property
	def urgent(self) -> bool:
		return self.days_left <= 30


def expiring(rows, today: date, horizon: int = 90) -> list[Expiry]:
	"""The documents that expire within ``horizon`` days, soonest first.

	A document that has ALREADY expired is kept, at the top: it is the most urgent
	row on the page, not one that fell out of the window.
	"""
	out = []
	for r in rows:
		if not r.get("expiry_date"):
			continue
		left = (r["expiry_date"] - today).days
		if left <= horizon:
			out.append(
				Expiry(
					employee=r["employee"],
					employee_name=r.get("employee_name") or r["employee"],
					document=r["document"],
					expiry_date=r["expiry_date"],
					days_left=left,
				)
			)
	return sorted(out, key=lambda e: (e.days_left, e.employee_name))
