"""Pure checks for the shared deployment-time custom-field installer."""

import unittest
from unittest.mock import Mock

from bunood_theme.custom_fields import ensure_custom_fields, fields_installed


class CustomFieldInstallerTests(unittest.TestCase):
    def test_existing_field_is_updated_only_when_metadata_differs(self):
        frappe = Mock()
        frappe.db.exists.side_effect = [True, "Project-custom_flag"]
        field = frappe.get_doc.return_value
        field.get.side_effect = lambda key: {"fieldname": "custom_flag", "label": "Old"}[key]
        ensure_custom_fields(frappe, {"Project": [{"fieldname": "custom_flag", "label": "New"}]})
        field.set.assert_called_once_with("label", "New")
        field.save.assert_called_once_with(ignore_permissions=True)
        frappe.clear_cache.assert_called_once_with(doctype="Project")

    def test_missing_field_is_inserted_and_missing_doctype_is_skipped(self):
        frappe = Mock()
        frappe.db.exists.side_effect = [False, True, None]
        ensure_custom_fields(
            frappe,
            {
                "Absent": [{"fieldname": "custom_skip"}],
                "Task": [{"fieldname": "custom_flag"}],
            },
        )
        frappe.get_doc.assert_called_once_with(
            {"doctype": "Custom Field", "dt": "Task", "fieldname": "custom_flag"}
        )
        frappe.get_doc.return_value.insert.assert_called_once_with(ignore_permissions=True)
        frappe.clear_cache.assert_called_once_with(doctype="Task")

    def test_field_presence_is_indeterminate_on_metadata_error(self):
        frappe = Mock()
        frappe.get_meta.side_effect = RuntimeError("metadata unavailable")
        self.assertFalse(fields_installed(frappe, {"Task": [{"fieldname": "custom_flag"}]}))


if __name__ == "__main__":
    unittest.main()
