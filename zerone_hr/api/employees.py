"""The employee list: tabs counted from the same rows the list shows."""

import frappe
from frappe.utils import add_days, getdate, now_datetime

from zerone_hr.api.access import require_hr
from zerone_hr.api.day import _company, collect_day, collect_expiring
from zerone_hr.install import SAUDI_ARABIA

TABS = ("all", "saudi", "non_saudi", "probation", "documents", "left")

#: The Labor Law's longest probation without an agreed extension.
PROBATION_DAYS = 90


def _tab_of(e, today, flagged: set[str]) -> set[str]:
	tabs = set()
	if e.status == "Left":
		return {"left"}
	tabs.add("all")
	tabs.add("saudi" if e.zo_nationality == SAUDI_ARABIA else "non_saudi")
	if e.date_of_joining and getdate(e.date_of_joining) > add_days(today, -PROBATION_DAYS):
		tabs.add("probation")
	if e.name in flagged:
		tabs.add("documents")
	return tabs


@frappe.whitelist()
def get_employees(
	company: str | None = None, tab: str = "all", search: str = "", start: int = 0, page_length: int = 50
) -> dict:
	require_hr()
	if tab not in TABS:
		frappe.throw(frappe._("Unknown list.", context="Zero One HR"))
	company = _company(company)
	now = now_datetime()
	today = now.date()

	filters = {"company": company, "status": ["in", ["Active", "Left"]]}
	employees = frappe.get_list(
		"Employee",
		filters=filters,
		fields=[
			"name",
			"employee_name",
			"designation",
			"department",
			"zo_nationality",
			"date_of_joining",
			"relieving_date",
			"status",
			"image",
		],
		order_by="employee_name asc",
		limit_page_length=0,
	)

	expiring = collect_expiring(company, today, horizon=60)
	flagged = {x["employee"] for x in expiring}
	soonest = {}
	for x in expiring:
		soonest.setdefault(x["employee"], x)

	counts = dict.fromkeys(TABS, 0)
	chosen = []
	needle = (search or "").strip().lower()
	for e in employees:
		tabs = _tab_of(e, today, flagged)
		for t in tabs:
			counts[t] += 1
		if tab not in tabs:
			continue
		if needle and needle not in (e.employee_name or "").lower() and needle not in e.name.lower():
			continue
		chosen.append(e)

	page = chosen[int(start) : int(start) + int(page_length)]
	ids = [e.name for e in page]

	base = {}
	if ids:
		for a in frappe.get_list(
			"Salary Structure Assignment",
			filters={"employee": ["in", ids], "docstatus": 1, "from_date": ["<=", today]},
			fields=["employee", "base", "currency"],
			order_by="from_date desc",
			limit_page_length=0,
		):
			base.setdefault(a.employee, a)

	standing = {r["employee"]: r for r in collect_day(company, today, now)} if ids else {}

	rows = []
	for e in page:
		b = base.get(e.name)
		s = standing.get(e.name)
		doc = soonest.get(e.name)
		rows.append(
			{
				"employee": e.name,
				"employee_name": e.employee_name,
				"designation": e.designation,
				"department": e.department,
				"nationality": e.zo_nationality,
				"saudi": e.zo_nationality == SAUDI_ARABIA,
				"date_of_joining": str(e.date_of_joining) if e.date_of_joining else None,
				"relieving_date": str(e.relieving_date) if e.relieving_date else None,
				"status": e.status,
				"image": e.image,
				"base": b.base if b else None,
				"currency": b.currency if b else None,
				"today": s["status"] if s else None,
				"first_in": s["first_in"] if s else None,
				"late_minutes": s["late_minutes"] if s else 0,
				"document": doc,
			}
		)

	saudi, active = counts["saudi"], counts["all"]
	return {
		"company": company,
		"tab": tab,
		"counts": counts,
		"saudization": round(saudi * 100 / active, 1) if active else 0,
		"total": len(chosen),
		"rows": rows,
	}
