from zerone_hr import __version__

app_version = __version__
app_name = "zerone_hr"
app_title = "Zero One HR"
app_publisher = "Bunood"
app_description = "Zero One HR: attendance, leave and Saudi payroll over Frappe HR"
app_email = "sales@bunood.com"
app_license = "mit"

# The data model is Frappe HR's (Employee Checkin, Attendance, Leave Application,
# Payroll Entry, Salary Slip …). This app adds the screens at /people and the Saudi
# rules HRMS does not carry; it forks none of HRMS's doctypes.
required_apps = ["frappe/erpnext", "frappe/hrms"]

add_to_apps_screen = [
	{
		"name": "zerone_hr",
		"title": "HR",
		"route": "/people",
		"has_permission": "zerone_hr.api.access.has_app_permission",
	}
]

# One server-rendered page serves every client route of the single-page app.
# Not /hr: Frappe HR 16 routes /hr/<path> to its own Roster page (and /hrms to its
# PWA), so a rule here would lose to, or take over, HRMS's.
website_route_rules = [
	{"from_route": "/people/<path:app_path>", "to_route": "people"},
]

after_install = "zerone_hr.install.after_install"
after_migrate = "zerone_hr.install.after_migrate"
before_uninstall = "zerone_hr.install.before_uninstall"
