"""The HR desk's day: who is in, who is late, what waits for a decision.

Every query goes through ``frappe.get_list`` so the reader's own permissions still
apply behind :func:`require_hr`. The deciding is in
:mod:`zerone_hr.logic.day`, which these endpoints feed and do not second-guess.
"""

from datetime import date, datetime, time, timedelta

import frappe
from frappe.utils import add_days, get_datetime, getdate, now_datetime

from zerone_hr.api.access import require_hr
from zerone_hr.logic import day as logic


def _company(company: str | None) -> str:
	"""The company the desk shows: the one asked for, else the person's default,
	else the site's, else the only one they can read. A site with several and no
	default has to be told which."""
	if company:
		if not frappe.has_permission("Company", "read", company):
			frappe.throw(frappe._("Choose a company first.", context="Zero One HR"), frappe.PermissionError)
		return company
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	if company:
		return company
	readable = frappe.get_list("Company", pluck="name", limit_page_length=2)
	if len(readable) == 1:
		return readable[0]
	frappe.throw(frappe._("Choose a company first.", context="Zero One HR"))


def _as_time(value) -> time | None:
	"""Frappe hands a Time field over as a ``timedelta`` from midnight."""
	if value is None or value == "":
		return None
	if isinstance(value, time):
		return value
	if isinstance(value, timedelta):
		return (datetime.min + value).time()
	return datetime.strptime(str(value), "%H:%M:%S").time()


def _employees(company: str) -> list[dict]:
	return frappe.get_list(
		"Employee",
		filters={"company": company, "status": "Active"},
		fields=[
			"name",
			"employee_name",
			"designation",
			"department",
			"default_shift",
			"image",
		],
		order_by="employee_name asc",
		limit_page_length=0,
	)


def _shifts(ids: list[str], day: date, defaults: dict[str, str | None]) -> dict[str, logic.Shift]:
	assigned = {
		r.employee: r.shift_type
		for r in frappe.get_list(
			"Shift Assignment",
			filters={
				"employee": ["in", ids],
				"docstatus": 1,
				"status": "Active",
				"start_date": ["<=", day],
			},
			or_filters=[["end_date", "is", "not set"], ["end_date", ">=", day]],
			fields=["employee", "shift_type"],
			limit_page_length=0,
		)
	}
	names = {assigned.get(e) or defaults.get(e) for e in ids} - {None, ""}
	types = (
		{
			t.name: logic.Shift(
				name=t.name,
				start=_as_time(t.start_time),
				end=_as_time(t.end_time),
				late_grace=t.late_entry_grace_period or 0,
			)
			for t in frappe.get_all(
				"Shift Type",
				filters={"name": ["in", list(names)]},
				fields=["name", "start_time", "end_time", "late_entry_grace_period"],
			)
		}
		if names
		else {}
	)
	return {e: types.get(assigned.get(e) or defaults.get(e)) for e in ids}


def _off(employees: list[dict], company: str, day: date) -> set[str]:
	"""Who has the day off: a holiday or weekly off on the holiday list in force.

	Frappe HR 16 assigns holiday lists through Holiday List Assignment (to the
	employee, else to the company) rather than through Employee's own field, so
	which list is in force on a date is HRMS's decision; its resolver is used as is.
	"""
	from hrms.utils.holiday_list import get_holiday_list_assignments, resolve_holiday_list_assignment

	ids = [e.name for e in employees]
	assignments = get_holiday_list_assignments([*ids, company])
	lists = {}
	for employee in ids:
		chosen = resolve_holiday_list_assignment(
			assignments.get(employee, []), assignments.get(company, []), day
		)
		if chosen:
			lists[employee] = chosen.holiday_list
	if not lists:
		return set()
	with_holiday = set(
		frappe.get_all(
			"Holiday",
			filters={"parent": ["in", list(set(lists.values()))], "holiday_date": day},
			pluck="parent",
		)
	)
	return {e for e, hl in lists.items() if hl in with_holiday}


def collect_day(company: str, day: date, now: datetime) -> list[dict]:
	employees = _employees(company)
	ids = [e.name for e in employees]
	if not ids:
		return []

	start, end = datetime.combine(day, time.min), datetime.combine(day, time.max)
	first_in, last_out, origin = {}, {}, {}
	for c in frappe.get_list(
		"Employee Checkin",
		filters={"employee": ["in", ids], "time": ["between", [start, end]]},
		fields=["employee", "log_type", "time", "device_id", "latitude"],
		order_by="time asc",
		limit_page_length=0,
	):
		t = get_datetime(c.time)
		if c.log_type != "OUT" and c.employee not in first_in:
			first_in[c.employee] = t
			origin[c.employee] = logic.source(c.latitude, c.device_id)
		if c.log_type == "OUT":
			last_out[c.employee] = t

	marked = {
		a.employee: a
		for a in frappe.get_list(
			"Attendance",
			filters={"employee": ["in", ids], "attendance_date": day, "docstatus": 1},
			fields=["employee", "status", "late_entry", "attendance_request"],
			limit_page_length=0,
		)
	}
	on_leave = {
		r.employee: r
		for r in frappe.get_list(
			"Leave Application",
			filters={
				"employee": ["in", ids],
				"status": "Approved",
				"docstatus": 1,
				"from_date": ["<=", day],
				"to_date": [">=", day],
			},
			fields=["employee", "leave_type", "to_date"],
			limit_page_length=0,
		)
	}
	on_duty = set(
		frappe.get_list(
			"Attendance Request",
			filters={
				"employee": ["in", ids],
				"docstatus": 1,
				"reason": "On Duty",
				"from_date": ["<=", day],
				"to_date": [">=", day],
			},
			pluck="employee",
			limit_page_length=0,
		)
	)
	shifts = _shifts(ids, day, {e.name: e.default_shift for e in employees})
	off = _off(employees, company, day)

	rows = []
	for e in employees:
		shift = shifts.get(e.name)
		att = marked.get(e.name)
		s = logic.standing(
			day,
			now,
			shift,
			first_in.get(e.name),
			attendance=att.status if att else None,
			late_entry=bool(att and att.late_entry),
			attendance_from_duty=bool(att and att.attendance_request and e.name in on_duty),
			on_leave=e.name in on_leave,
			on_duty=e.name in on_duty,
			off=e.name in off,
		)
		leave = on_leave.get(e.name)
		rows.append(
			{
				"employee": e.name,
				"employee_name": e.employee_name,
				"designation": e.designation,
				"department": e.department,
				"image": e.image,
				"shift": shift.name if shift else None,
				"shift_start": shift.start.strftime("%H:%M") if shift and shift.start else None,
				"shift_end": shift.end.strftime("%H:%M") if shift and shift.end else None,
				"first_in": first_in[e.name].strftime("%H:%M") if e.name in first_in else None,
				"last_out": last_out[e.name].strftime("%H:%M") if e.name in last_out else None,
				"source": origin.get(e.name),
				"leave_type": leave.leave_type if leave else None,
				"leave_until": str(leave.to_date) if leave else None,
				"status": s.status,
				"late_minutes": s.late_minutes,
			}
		)
	return sorted(rows, key=logic.sort_key)


def _counts(rows: list[dict]) -> dict:
	by = {}
	for r in rows:
		by[r["status"]] = by.get(r["status"], 0) + 1
	late = [r["late_minutes"] for r in rows if r["status"] == logic.LATE]
	return {
		"total": len(rows),
		"in_work": by.get(logic.PRESENT, 0) + by.get(logic.LATE, 0),
		"late": by.get(logic.LATE, 0),
		"longest_late": max(late) if late else 0,
		"absent": by.get(logic.ABSENT, 0),
		"not_yet": by.get(logic.NOT_YET, 0),
		"away": by.get(logic.LEAVE, 0) + by.get(logic.DUTY, 0),
		"leave": by.get(logic.LEAVE, 0),
		"duty": by.get(logic.DUTY, 0),
		"off": by.get(logic.OFF, 0),
	}


def _decisions(company: str, limit: int = 8) -> dict:
	"""What waits for HR: open leave, attendance corrections, advances, claims."""
	sources = [
		(
			"Leave Application",
			{"status": "Open", "docstatus": 0},
			[
				"name",
				"employee",
				"employee_name",
				"leave_type",
				"from_date",
				"to_date",
				"total_leave_days",
				"creation",
			],
		),
		(
			"Attendance Request",
			{"docstatus": 0},
			["name", "employee", "employee_name", "reason", "from_date", "to_date", "creation"],
		),
		(
			"Employee Advance",
			{"docstatus": 0},
			["name", "employee", "employee_name", "advance_amount", "purpose", "creation"],
		),
		(
			"Expense Claim",
			{"docstatus": 0, "approval_status": "Draft"},
			["name", "employee", "employee_name", "total_claimed_amount", "creation"],
		),
	]
	items, count = [], 0
	for doctype, filters, fields in sources:
		if not frappe.has_permission(doctype, "read"):
			continue
		filters = {**filters, "company": company}
		rows = frappe.get_list(
			doctype, filters=filters, fields=fields, order_by="creation asc", limit_page_length=0
		)
		count += len(rows)
		items.extend({"doctype": doctype, **r} for r in rows[:limit])
	items.sort(key=lambda r: r["creation"])
	for r in items:
		r["creation"] = str(r["creation"])
		for k in ("from_date", "to_date"):
			if r.get(k):
				r[k] = str(r[k])
	return {"count": count, "items": items[:limit]}


def collect_expiring(company: str, today: date, horizon: int = 90) -> list[dict]:
	employees = frappe.get_list(
		"Employee",
		filters={"company": company, "status": "Active"},
		fields=["name", "employee_name", "valid_upto", "contract_end_date"],
		limit_page_length=0,
	)
	if not employees:
		return []
	names = {e.name: e.employee_name for e in employees}
	rows = []
	for e in employees:
		if e.valid_upto:
			rows.append(
				{
					"employee": e.name,
					"employee_name": e.employee_name,
					"document": "Passport",
					"expiry_date": getdate(e.valid_upto),
				}
			)
		if e.contract_end_date:
			rows.append(
				{
					"employee": e.name,
					"employee_name": e.employee_name,
					"document": "Contract",
					"expiry_date": getdate(e.contract_end_date),
				}
			)
	# A child table is read with get_all: its rows carry no permissions of their
	# own, and the parents were already narrowed by get_list above.
	for d in frappe.get_all(
		"Zero One Employee Document",
		filters={
			"parenttype": "Employee",
			"parent": ["in", list(names)],
			"expiry_date": ["<=", add_days(today, horizon)],
		},
		fields=["parent", "document_type", "expiry_date"],
	):
		rows.append(
			{
				"employee": d.parent,
				"employee_name": names[d.parent],
				"document": d.document_type,
				"expiry_date": getdate(d.expiry_date),
			}
		)
	return [
		{
			"employee": x.employee,
			"employee_name": x.employee_name,
			"document": x.document,
			"expiry_date": str(x.expiry_date),
			"days_left": x.days_left,
			"urgent": x.urgent,
		}
		for x in logic.expiring(rows, today, horizon)
	]


def _payroll(company: str, today: date) -> dict | None:
	entry = frappe.get_list(
		"Payroll Entry",
		filters={
			"company": company,
			"docstatus": ["!=", 2],
			"start_date": ["<=", today],
			"end_date": [">=", today],
		},
		fields=[
			"name",
			"status",
			"docstatus",
			"start_date",
			"end_date",
			"posting_date",
			"number_of_employees",
			"salary_slips_created",
			"salary_slips_submitted",
		],
		order_by="creation desc",
		limit_page_length=1,
	)
	if not entry:
		return None
	e = entry[0]
	slips = frappe.get_list(
		"Salary Slip",
		filters={"payroll_entry": e.name, "docstatus": ["!=", 2]},
		fields=["gross_pay", "net_pay", "total_deduction"],
		limit_page_length=0,
	)
	t = {
		"gross": sum(s.gross_pay or 0 for s in slips),
		"net": sum(s.net_pay or 0 for s in slips),
		"deductions": sum(s.total_deduction or 0 for s in slips),
	}
	return {
		"name": e.name,
		"status": e.status,
		"start_date": str(e.start_date),
		"end_date": str(e.end_date),
		"posting_date": str(e.posting_date),
		"employees": e.number_of_employees,
		"slips_created": bool(e.salary_slips_created),
		"slips_submitted": bool(e.salary_slips_submitted),
		"gross": t.get("gross") or 0,
		"net": t.get("net") or 0,
		"deductions": t.get("deductions") or 0,
	}


@frappe.whitelist()
def get_today(company: str | None = None) -> dict:
	require_hr()
	company = _company(company)
	now = now_datetime()
	today = now.date()
	rows = collect_day(company, today, now)
	return {
		"company": company,
		"date": str(today),
		"counts": _counts(rows),
		"needs_attention": [r for r in rows if r["status"] in (logic.ABSENT, logic.LATE)][:8],
		"decisions": _decisions(company),
		"expiring": collect_expiring(company, today, horizon=45)[:8],
		"payroll": _payroll(company, today),
	}


@frappe.whitelist()
def get_attendance(company: str | None = None, date: str | None = None) -> dict:
	require_hr()
	company = _company(company)
	now = now_datetime()
	day = getdate(date) if date else now.date()
	rows = collect_day(company, day, now if day == now.date() else datetime.combine(day, time.max))
	return {"company": company, "date": str(day), "counts": _counts(rows), "rows": rows}
