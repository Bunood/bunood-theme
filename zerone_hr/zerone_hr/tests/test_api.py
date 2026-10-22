"""The endpoints against real Frappe HR records.

Run on a bench: ``bench --site <site> run-tests --app zerone_hr``. Every record is
created in the test's transaction and rolled back with it.

The day under test is fixed (Thursday 22-10-2026, read at noon) so the outcome
does not depend on when the suite runs; the endpoints' own ``now`` is only the
default for that argument.
"""

from datetime import date, datetime

import frappe
from frappe.tests import IntegrationTestCase

from zerone_hr.api import day as day_api
from zerone_hr.api import employees as employees_api
from zerone_hr.install import SAUDI_ARABIA

DAY = date(2026, 10, 22)
NOON = datetime(2026, 10, 22, 12, 0)
COMPANY = "Zero One HR Test Co"


def _company():
	if not frappe.db.exists("Company", COMPANY):
		frappe.get_doc(
			{
				"doctype": "Company",
				"company_name": COMPANY,
				"abbr": "BHRT",
				"default_currency": "SAR",
				"country": SAUDI_ARABIA,
			}
		).insert()
	_holidays()
	return COMPANY


def _holidays():
	"""A 2026 list with Fridays and Saturdays off, assigned to the company."""
	name = "BHR 2026"
	if not frappe.db.exists("Holiday List", name):
		weekend = [
			{"holiday_date": d, "description": "Weekend", "weekly_off": 1}
			for d in ("2026-10-23", "2026-10-24", "2026-10-30", "2026-10-31")
		]
		frappe.get_doc(
			{
				"doctype": "Holiday List",
				"holiday_list_name": name,
				"from_date": "2026-01-01",
				"to_date": "2026-12-31",
				"holidays": weekend,
			}
		).insert()
	if not frappe.db.exists("Holiday List Assignment", {"assigned_to": COMPANY, "docstatus": 1}):
		assignment = frappe.get_doc(
			{
				"doctype": "Holiday List Assignment",
				"applicable_for": "Company",
				"assigned_to": COMPANY,
				"holiday_list": name,
				"from_date": "2026-01-01",
			}
		)
		assignment.insert()
		assignment.submit()


def _gender():
	if not frappe.db.exists("Gender", "Male"):
		frappe.get_doc({"doctype": "Gender", "gender": "Male"}).insert()
	return "Male"


def _shift():
	name = "BHR Office"
	if not frappe.db.exists("Shift Type", name):
		frappe.get_doc(
			{
				"doctype": "Shift Type",
				"name": name,
				"start_time": "08:00:00",
				"end_time": "17:00:00",
				"late_entry_grace_period": 15,
				"enable_late_entry_marking": 1,
			}
		).insert()
	return name


def _employee(first_name, nationality=SAUDI_ARABIA, joined="2021-02-15", **extra):
	doc = frappe.get_doc(
		{
			"doctype": "Employee",
			# Unique per call, so what an interrupted earlier run left behind can
			# never match a search or a count here.
			"first_name": f"{first_name} {frappe.generate_hash(length=6)}",
			"company": _company(),
			"gender": _gender(),
			"date_of_birth": "1990-01-01",
			"date_of_joining": joined,
			"status": "Active",
			"default_shift": _shift(),
			"zo_nationality": nationality,
			**extra,
		}
	).insert()
	return doc.name


def _checkin(employee, hh, mm, log_type="IN", **extra):
	frappe.get_doc(
		{
			"doctype": "Employee Checkin",
			"employee": employee,
			"time": datetime(2026, 10, 22, hh, mm),
			"log_type": log_type,
			**extra,
		}
	).insert()


class TestDay(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.on_time = _employee("BHR On Time")
		self.late = _employee("BHR Late", nationality="India")
		self.absent = _employee("BHR Absent", nationality="India")
		self.duty = _employee("BHR Duty")
		self.mobile = _employee("BHR Mobile")

		_checkin(self.on_time, 7, 52, device_id="ZK-01")
		_checkin(self.on_time, 17, 4, log_type="OUT", device_id="ZK-01")
		_checkin(self.late, 8, 18, device_id="ZK-01")
		_checkin(self.mobile, 8, 5, latitude=24.7136, longitude=46.6753)

		request = frappe.get_doc(
			{
				"doctype": "Attendance Request",
				"employee": self.duty,
				"company": COMPANY,
				"from_date": DAY,
				"to_date": DAY,
				"reason": "On Duty",
				"explanation": "Municipality visit",
			}
		)
		request.insert()
		request.submit()

	def rows(self):
		return {r["employee"]: r for r in day_api.collect_day(COMPANY, DAY, NOON)}

	def test_each_employee_gets_the_right_word(self):
		rows = self.rows()
		self.assertEqual(rows[self.on_time]["status"], "present")
		self.assertEqual(rows[self.late]["status"], "late")
		self.assertEqual(rows[self.late]["late_minutes"], 18)
		self.assertEqual(rows[self.absent]["status"], "absent")
		self.assertEqual(rows[self.duty]["status"], "duty")
		self.assertEqual(rows[self.mobile]["status"], "present")

	def test_times_and_sources_come_through(self):
		rows = self.rows()
		self.assertEqual(rows[self.on_time]["first_in"], "07:52")
		self.assertEqual(rows[self.on_time]["last_out"], "17:04")
		self.assertEqual(rows[self.on_time]["source"], "device")
		self.assertEqual(rows[self.mobile]["source"], "mobile")
		self.assertEqual(rows[self.on_time]["shift_start"], "08:00")

	def test_absent_and_late_come_first(self):
		order = [r["employee"] for r in day_api.collect_day(COMPANY, DAY, NOON)]
		self.assertLess(order.index(self.absent), order.index(self.late))
		self.assertLess(order.index(self.late), order.index(self.on_time))

	def test_counts_add_up(self):
		mine = {self.on_time, self.late, self.absent, self.duty, self.mobile}
		rows = [r for r in day_api.collect_day(COMPANY, DAY, NOON) if r["employee"] in mine]
		counts = day_api._counts(rows)
		self.assertEqual(counts["in_work"], counts["late"] + 2)
		self.assertEqual(counts["absent"], 1)
		self.assertEqual(counts["duty"], 1)
		self.assertEqual(counts["longest_late"], 18)

	def test_a_weekly_off_on_the_assigned_list_is_a_day_off(self):
		friday = date(2026, 10, 23)
		rows = {r["employee"]: r for r in day_api.collect_day(COMPANY, friday, datetime(2026, 10, 23, 12))}
		self.assertEqual(rows[self.absent]["status"], "off")

	def test_get_attendance_for_a_past_day_reads_the_whole_day(self):
		out = day_api.get_attendance(company=COMPANY, date=str(DAY))
		self.assertEqual(out["date"], str(DAY))
		by = {r["employee"]: r for r in out["rows"]}
		self.assertEqual(by[self.absent]["status"], "absent")

	def test_a_user_without_an_hr_role_is_refused(self):
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": "bhr-noperm@example.com",
				"first_name": "No",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		frappe.set_user(user.name)
		try:
			with self.assertRaises(frappe.PermissionError):
				day_api.get_today(company=COMPANY)
		finally:
			frappe.set_user("Administrator")


class TestEmployees(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.saudi = _employee("BHR Saudi")
		self.expat = _employee(
			"BHR Expat",
			nationality="India",
			zo_documents=[
				{
					"document_type": "Iqama",
					"document_number": "2xxxxxxxx",
					"expiry_date": frappe.utils.add_days(frappe.utils.today(), 24),
				}
			],
		)
		self.joiner = _employee("BHR Joiner", joined=frappe.utils.add_days(frappe.utils.today(), -10))

	def test_tabs_are_counted_from_the_same_rows(self):
		out = employees_api.get_employees(company=COMPANY)
		counts = out["counts"]
		self.assertGreaterEqual(counts["saudi"], 2)
		self.assertGreaterEqual(counts["non_saudi"], 1)
		self.assertEqual(counts["all"], counts["saudi"] + counts["non_saudi"])
		self.assertGreaterEqual(counts["probation"], 1)
		self.assertGreaterEqual(counts["documents"], 1)

	def test_documents_tab_carries_the_expiring_iqama(self):
		out = employees_api.get_employees(company=COMPANY, tab="documents")
		row = next(r for r in out["rows"] if r["employee"] == self.expat)
		self.assertEqual(row["document"]["document"], "Iqama")
		self.assertEqual(row["document"]["days_left"], 24)

	def test_search_narrows_by_name(self):
		name = frappe.db.get_value("Employee", self.joiner, "employee_name")
		out = employees_api.get_employees(company=COMPANY, search=name.upper())
		self.assertEqual([r["employee"] for r in out["rows"]], [self.joiner])

	def test_unknown_tab_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			employees_api.get_employees(company=COMPANY, tab="everyone")
