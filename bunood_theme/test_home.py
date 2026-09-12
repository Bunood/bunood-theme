"""Focused server contract for the shared ERP operational home."""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.classes.integration_test_case import IntegrationTestCase

from bunood_theme.api import (
	_can_prove_complete_stock_scope,
	_stock_below_reorder,
	_stock_below_reorder_names,
	_stock_bin_rows,
	get_home_dashboard,
)


ORDINARY_USER = "operational-home-user@example.com"


def _row(**values):
	return frappe._dict(values)


STOCK_WAREHOUSES = [
	_row(name="All Warehouses - BND", parent_warehouse="", is_group=1),
	_row(name="Availability - BND", parent_warehouse="All Warehouses - BND", is_group=1),
	_row(name="Availability A - BND", parent_warehouse="Availability - BND", is_group=0),
	_row(name="Availability B - BND", parent_warehouse="Availability - BND", is_group=0),
	_row(name="Destination - BND", parent_warehouse="All Warehouses - BND", is_group=0),
]


def _reorder_level():
	return _row(
		parent="BND-HOME-STOCK",
		warehouse="Destination - BND",
		warehouse_group="Availability - BND",
		warehouse_reorder_level=10,
		warehouse_reorder_qty=5,
	)


def _bin(name, warehouse, projected_qty):
	return _row(
		name=name,
		item_code="BND-HOME-STOCK",
		warehouse=warehouse,
		projected_qty=projected_qty,
	)


class TestStockReorderAttention(IntegrationTestCase):
	def test_group_aggregate_prevents_destination_false_positive(self) -> None:
		# The destination is individually low (5), but the selected availability
		# group totals 12. Native ERPNext does not reorder and neither may Home.
		bins = [
			_bin("destination-bin", "Destination - BND", 5),
			_bin("availability-a-bin", "Availability A - BND", 6),
			_bin("availability-b-bin", "Availability B - BND", 6),
		]
		self.assertEqual(
			_stock_below_reorder_names([_reorder_level()], STOCK_WAREHOUSES, bins),
			[],
		)

	def test_group_precedence_and_inclusive_boundary_recover_false_negative(self) -> None:
		# Destination stock is high, but the availability group is exactly at the
		# threshold. ERPNext's <= boundary triggers the permission-visible Item.
		bins = [
			_bin("destination-bin", "Destination - BND", 20),
			_bin("availability-a-bin", "Availability A - BND", 4),
			_bin("availability-b-bin", "Availability B - BND", 6),
		]
		self.assertEqual(
			_stock_below_reorder_names([_reorder_level()], STOCK_WAREHOUSES, bins),
			["BND-HOME-STOCK"],
		)

	def test_missing_bin_is_native_zero_and_still_returns_an_item(self) -> None:
		self.assertEqual(
			_stock_below_reorder_names([_reorder_level()], STOCK_WAREHOUSES, []),
			["BND-HOME-STOCK"],
		)

	def test_leaf_availability_scope_uses_its_own_projected_quantity(self) -> None:
		level = _reorder_level()
		level.warehouse_group = "Destination - BND"
		self.assertEqual(
			_stock_below_reorder_names(
				[level],
				STOCK_WAREHOUSES,
				[_bin("destination-bin", "Destination - BND", 100)],
			),
			[],
		)

	def test_hidden_configured_scope_is_not_misreported_as_zero_stock(self) -> None:
		hidden_group = _reorder_level()
		hidden_group.warehouse_group = "Restricted Group - BND"
		hidden_direct = _reorder_level()
		hidden_direct.warehouse_group = None
		hidden_direct.warehouse = "Restricted Warehouse - BND"
		for level in (hidden_group, hidden_direct):
			with self.subTest(scope=level.warehouse_group or level.warehouse):
				self.assertEqual(
					_stock_below_reorder_names([level], STOCK_WAREHOUSES, []),
					[],
				)

	def test_incomplete_stock_visibility_stands_down_before_zero_is_inferred(self) -> None:
		with (
			patch("bunood_theme.api._can_prove_complete_stock_scope", return_value=False),
			patch("bunood_theme.api._dashboard_rows") as rows,
		):
			names, filters = _stock_below_reorder("Bunood")

		self.assertEqual(names, [])
		self.assertEqual(filters, {"name": ["in", ["__none__"]]})
		rows.assert_not_called()

	def test_stock_scope_is_complete_only_without_permission_match_conditions(self) -> None:
		with (
			patch("bunood_theme.api.frappe.db.exists", return_value=True),
			patch("bunood_theme.api.frappe.has_permission", return_value=True),
			patch(
				"bunood_theme.api.DatabaseQuery.build_match_conditions",
				side_effect=["", "`tabBin`.`warehouse` = 'Allowed - BND'"],
			),
		):
			self.assertFalse(_can_prove_complete_stock_scope())

	def test_bin_query_failure_is_not_interpreted_as_zero_stock(self) -> None:
		def visible_rows(doctype, **_kwargs):
			return {
				"Item": [_row(name="BND-HOME-STOCK")],
				"Warehouse": STOCK_WAREHOUSES,
			}[doctype]

		with (
			patch("bunood_theme.api._can_prove_complete_stock_scope", return_value=True),
			patch("bunood_theme.api._dashboard_rows", side_effect=visible_rows),
			patch("bunood_theme.api.frappe.get_all", return_value=[_reorder_level()]),
			patch("bunood_theme.api._stock_bin_rows", return_value=None),
		):
			names, filters = _stock_below_reorder("Bunood")

		self.assertEqual(names, [])
		self.assertEqual(filters, {"name": ["in", ["__none__"]]})

	def test_bin_reader_preserves_query_failure_as_indeterminate(self) -> None:
		with (
			patch("bunood_theme.api.frappe.get_list", side_effect=RuntimeError("query failed")),
			patch("bunood_theme.api.frappe.log_error") as log_error,
		):
			self.assertIsNone(_stock_bin_rows("Bunood", ["BND-HOME-STOCK"]))
		log_error.assert_called_once()

	def test_permission_filtered_inputs_produce_an_exact_item_drilldown(self) -> None:
		visible_bins = [
			_bin("destination-bin", "Destination - BND", 20),
			_bin("availability-a-bin", "Availability A - BND", 2),
			_bin("availability-b-bin", "Availability B - BND", 3),
		]
		# This record exists conceptually below the same group but is deliberately
		# absent from the permission-filtered Warehouse and Bin fixtures.
		hidden_bin_name = "restricted-availability-bin"

		def visible_rows(doctype, **_kwargs):
			return {
				"Item": [_row(name="BND-HOME-STOCK")],
				"Warehouse": STOCK_WAREHOUSES,
			}[doctype]

		queried = {}

		def visible_levels(doctype, *, filters, fields):
			queried.update({"doctype": doctype, "filters": filters, "fields": fields})
			return [_reorder_level()]

		with (
			patch("bunood_theme.api._can_prove_complete_stock_scope", return_value=True),
			patch("bunood_theme.api._dashboard_rows", side_effect=visible_rows),
			patch("bunood_theme.api.frappe.get_all", side_effect=visible_levels),
			patch("bunood_theme.api._stock_bin_rows", return_value=visible_bins),
		):
			names, filters = _stock_below_reorder("Bunood")

		self.assertEqual(names, ["BND-HOME-STOCK"])
		self.assertEqual(filters, {"name": ["in", names]})
		self.assertEqual(len(names), len(filters["name"][1]))
		self.assertNotIn(hidden_bin_name, names)
		self.assertEqual(queried["doctype"], "Item Reorder")
		self.assertEqual(
			queried["filters"],
			{"parenttype": "Item", "parent": ["in", ["BND-HOME-STOCK"]]},
		)


class TestERPHomeContract(IntegrationTestCase):
	def setUp(self) -> None:
		frappe.set_user("Administrator")

	def tearDown(self) -> None:
		frappe.set_user("Administrator")

	def test_administrator_receives_exact_operational_shape(self) -> None:
		data = get_home_dashboard()
		self.assertEqual(data["profile"], "erp")
		self.assertEqual(len(data["kpis"]), 5)
		self.assertEqual(
			[queue["key"] for queue in data["attention"]],
			[
				"sales_drafts",
				"purchase_drafts",
				"overdue_receivables",
				"payables_due",
				"stock_below_reorder",
				"zatca_exceptions",
			],
		)
		stock = next(queue for queue in data["attention"] if queue["key"] == "stock_below_reorder")
		self.assertEqual(stock["doctype"], "Item")
		self.assertIn("admin_health", data)

	def test_each_attention_count_matches_the_exact_permission_filtered_list(self) -> None:
		data = get_home_dashboard()
		for queue in data["attention"]:
			with self.subTest(queue=queue["key"]):
				self.assertEqual(
					queue["count"],
					len(
						frappe.get_list(
							queue["doctype"],
							filters=queue["filters"],
							pluck="name",
							limit=0,
						)
					),
				)

	def test_ordinary_user_never_receives_infrastructure_health(self) -> None:
		if not frappe.db.exists("User", ORDINARY_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": ORDINARY_USER,
					"first_name": "Operational Home",
					"send_welcome_email": 0,
				}
			).insert()
		frappe.get_doc("User", ORDINARY_USER).add_roles("Sales User")
		frappe.set_user(ORDINARY_USER)
		frappe.clear_cache(user=ORDINARY_USER)
		data = get_home_dashboard()
		self.assertEqual(data["profile"], "erp")
		self.assertNotIn("admin_health", data)
