"""Install and migrate: the fields this app adds to ERPNext's Employee.

Everything else this app reads is Frappe HR's own data model. The two additions
are what a Saudi HR desk needs and Employee lacks: a nationality (GOSI rates and
Saudization both turn on it) and dated documents (iqama, work permit, Saudi
Council of Engineers membership), which the compliance screens count down.

``create_custom_fields`` with ``update=True`` is idempotent, so the same call
runs on install and on every migrate, and a field changed here reaches sites
that installed an earlier version.
"""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

#: Frappe's Country record for Saudi Arabia, the value that marks a Saudi employee.
SAUDI_ARABIA = "Saudi Arabia"

EMPLOYEE_FIELDS = {
	"Employee": [
		{
			"fieldname": "zo_nationality",
			"label": "Nationality",
			"fieldtype": "Link",
			"options": "Country",
			"insert_after": "gender",
		},
		{
			"fieldname": "zo_documents_section",
			"label": "Documents",
			"fieldtype": "Section Break",
			"insert_after": "place_of_issue",
		},
		{
			"fieldname": "zo_documents",
			"label": "Documents",
			"fieldtype": "Table",
			"options": "Zero One Employee Document",
			"insert_after": "zo_documents_section",
		},
	]
}


def after_install():
	create_custom_fields(EMPLOYEE_FIELDS, update=True)


def after_migrate():
	create_custom_fields(EMPLOYEE_FIELDS, update=True)

