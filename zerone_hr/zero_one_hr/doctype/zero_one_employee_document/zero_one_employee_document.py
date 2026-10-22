from frappe.model.document import Document


class ZeroOneEmployeeDocument(Document):
	"""One identity or work document with an expiry date: an iqama, a work permit,
	a passport, a Saudi Council of Engineers membership. A row on Employee."""
