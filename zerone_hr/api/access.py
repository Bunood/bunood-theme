"""Who may open /people, and the guard every endpoint calls first.

The guard is a floor, not the whole check: every query behind it goes through
``frappe.get_list``, so a user's permissions on Employee, Attendance and the rest
still narrow what each endpoint returns.
"""

import frappe

HR_ROLES = ("HR Manager", "HR User", "System Manager")


def has_hr_role(user: str | None = None) -> bool:
	user = user or frappe.session.user
	if user == "Administrator":
		return True
	return bool(set(frappe.get_roles(user)) & set(HR_ROLES))


def has_app_permission() -> bool:
	"""``add_to_apps_screen``'s check: the tile is shown only to whom /people opens for."""
	return has_hr_role()


def require_hr() -> None:
	if frappe.session.user == "Guest":
		raise frappe.AuthenticationError
	if not has_hr_role():
		frappe.throw(
			frappe._("Only HR users can open this page.", context="Zero One HR"),
			frappe.PermissionError,
		)
