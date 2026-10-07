"""Provision and prove the local release candidate against ZATCA Sandbox.

This script refuses non-test sites and non-Sandbox settings.  It installs no
second compliance app.  The existing ``ksa_compliance`` app signs and sends one
invoice, credit note and debit note for each of the Standard and Simplified
profiles.  The resulting XML and ZATCA Integration Logs remain in the local
candidate as acceptance evidence; no production endpoint is touched.

Run inside the backend container after ``ksa_compliance.zatca_cli.setup``::

    bench --site "$BND_SITE" execute bunood_theme.acceptance.zatca_sandbox.run

When copied directly for a release gate, expose ``run`` from an installed app
module.  The Sandbox OTP defaults to ZATCA's non-secret test value and can be
overridden with ``BND_ZATCA_SANDBOX_OTP``.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

import frappe
from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return
from frappe.utils import add_days, nowdate
from result import is_ok


COMPANY = os.environ.get("BND_ACCEPTANCE_COMPANY", "Bunood Test Company")
ADDRESS = os.environ.get("BND_ACCEPTANCE_ADDRESS", "Bunood Test Company-Billing")
VAT = "300000000000003"
BUYER_VAT = "310000000000003"
CRN = "1010000000"
MARKER = "BND-ZATCA-SANDBOX-RC-20260911"
STANDARD_CUSTOMER = "Bunood ZATCA Standard Acceptance"
SIMPLIFIED_CUSTOMER = "Bunood ZATCA Simplified Acceptance"
ITEM = "BND-ZATCA-ACCEPTANCE"
TAX_CATEGORY = "KSA VAT 15%"
SALES_TAX_TEMPLATE = os.environ.get("BND_ACCEPTANCE_SALES_TAX_TEMPLATE", "KSA VAT 15% - BND")


def require(condition: object, message: str) -> None:
	if not condition:
		raise AssertionError(message)


def _safe_site() -> str:
	site = frappe.local.site or ""
	require(site.endswith((".test", ".localhost")), f"refusing ZATCA acceptance on non-test site {site!r}")
	require("ksa_compliance" in frappe.get_installed_apps(), "ksa_compliance is not installed")
	return site


def _tool_paths(site: str) -> tuple[str, str]:
	root = Path(frappe.get_site_path("zatca-tools"))
	java_home = root / "jdk-11.0.23+9-jre"
	cli = root / "zatca-cli-2.10.0" / "bin" / "zatca-cli"
	require((java_home / "bin" / "java").is_file(), "pinned ZATCA JRE is missing")
	require(cli.is_file(), "pinned ZATCA CLI is missing")
	return str(java_home.resolve()), str(cli.resolve())


def _prepare_address() -> None:
	require(frappe.db.exists("Address", ADDRESS), f"acceptance address {ADDRESS!r} is missing")
	updates = {}
	meta = frappe.get_meta("Address")
	if meta.has_field("custom_building_number"):
		updates["custom_building_number"] = "1234"
	if meta.has_field("custom_area"):
		updates["custom_area"] = "العليا"
	for field, value in updates.items():
		frappe.db.set_value("Address", ADDRESS, field, value)


def _prepare_settings(site: str):
	frappe.db.set_single_value("System Settings", "time_zone", "Asia/Riyadh")
	frappe.clear_cache(doctype="System Settings")
	_prepare_address()
	java_home, cli = _tool_paths(site)
	phase1 = frappe.db.get_value("ZATCA Phase 1 Business Settings", {"company": COMPANY}, "name")
	if phase1:
		frappe.db.set_value("ZATCA Phase 1 Business Settings", phase1, "status", "Disabled")

	name = frappe.db.get_value("ZATCA Business Settings", {"company": COMPANY, "status": "Active"}, "name")
	doc = frappe.get_doc("ZATCA Business Settings", name) if name else frappe.new_doc("ZATCA Business Settings")
	doc.update(
		{
			"company": COMPANY,
			"company_address": ADDRESS,
			"currency": "SAR",
			"seller_name": COMPANY,
			"vat_registration_number": VAT,
			"country": "Saudi Arabia",
			"company_unit": "Bunood Acceptance Unit",
			"company_unit_serial": "1-Bunood|2-0.44.18|3-RC1",
			"company_category": "Real Estate",
			"type_of_business_transactions": "Let the system decide (both)",
			"cli_setup": "Manual",
			"zatca_cli_path": cli,
			"java_home": java_home,
			"fatoora_server": "Sandbox",
			"sync_with_zatca": "Live",
			"enable_zatca_integration": 0,
			"validate_generated_xml": 1,
			"block_invoice_on_invalid_xml": 1,
			"status": "Active",
		}
	)
	if not any(row.type_code == "CRN" for row in doc.other_ids):
		doc.append(
			"other_ids",
			{"type_name": "Commercial Registration Number", "type_code": "CRN", "value": CRN},
		)
	if doc.is_new():
		doc.insert(ignore_permissions=True)
	else:
		doc.save(ignore_permissions=True)
	# The controller fills set-only-once tax fields while inserting.  Reload so
	# the later onboarding save cannot compare stale in-memory values with DB.
	doc.reload()
	require(doc.fatoora_server == "Sandbox", "acceptance settings left Sandbox")
	return doc


def _ensure_customer(name: str, standard: bool) -> str:
	if frappe.db.exists("Customer", name):
		doc = frappe.get_doc("Customer", name)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_type": "Company" if standard else "Individual",
			}
		).insert(ignore_permissions=True)
	doc.tax_id = BUYER_VAT if standard else None
	if frappe.get_meta("Customer").has_field("custom_vat_registration_number"):
		doc.custom_vat_registration_number = BUYER_VAT if standard else None
	doc.save(ignore_permissions=True)
	address_name = frappe.db.get_value(
		"Dynamic Link", {"parenttype": "Address", "link_doctype": "Customer", "link_name": doc.name}, "parent"
	)
	if not address_name:
		address = frappe.get_doc(
			{
				"doctype": "Address",
				"address_title": name,
				"address_type": "Billing",
				"address_line1": "King Fahd Road",
				"city": "Riyadh",
				"state": "Riyadh",
				"country": "Saudi Arabia",
				"pincode": "12211",
				"links": [{"link_doctype": "Customer", "link_name": doc.name}],
			}
		)
		if frappe.get_meta("Address").has_field("custom_building_number"):
			address.custom_building_number = "1234"
		if frappe.get_meta("Address").has_field("custom_area"):
			address.custom_area = "Olaya"
		address.insert(ignore_permissions=True)
	return doc.name


def _ensure_item() -> str:
	if frappe.db.exists("Item", ITEM):
		return ITEM
	return frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": ITEM,
			"item_name": "ZATCA Acceptance Service",
			"item_group": "All Item Groups",
			"stock_uom": "Nos",
			"is_stock_item": 0,
			"standard_rate": 100,
		}
	).insert(ignore_permissions=True).name


def _ensure_tax_configuration() -> None:
	if not frappe.db.exists("Tax Category", TAX_CATEGORY):
		frappe.get_doc(
			{
				"doctype": "Tax Category",
				"title": TAX_CATEGORY,
				"custom_zatca_category": "Standard rate",
			}
		).insert(ignore_permissions=True)
	else:
		frappe.db.set_value("Tax Category", TAX_CATEGORY, "custom_zatca_category", "Standard rate")
	require(
		frappe.db.exists("Sales Taxes and Charges Template", SALES_TAX_TEMPLATE),
		f"sales VAT template {SALES_TAX_TEMPLATE!r} is missing",
	)
	frappe.db.set_value("Sales Taxes and Charges Template", SALES_TAX_TEMPLATE, "tax_category", TAX_CATEGORY)
	filters = {"company": COMPANY, "tax_type": "Sales", "tax_category": TAX_CATEGORY}
	if not frappe.db.exists("Tax Rule", filters):
		frappe.get_doc(
			{
				"doctype": "Tax Rule",
				**filters,
				"sales_tax_template": SALES_TAX_TEMPLATE,
			}
		).insert(ignore_permissions=True)


def _new_invoice(customer: str):
	doc = frappe.new_doc("Sales Invoice")
	doc.company = COMPANY
	doc.customer = customer
	doc.currency = "SAR"
	doc.set_posting_time = 1
	doc.posting_date = add_days(nowdate(), -1)
	doc.posting_time = "12:00:00"
	doc.due_date = add_days(nowdate(), 29)
	doc.tax_category = TAX_CATEGORY
	doc.remarks = MARKER
	doc.append("items", {"item_code": ITEM, "qty": 2, "rate": 50})
	doc.set_taxes()
	doc.set_missing_values()
	doc.insert(ignore_permissions=True)
	from ksa_compliance.standard_doctypes.sales_invoice import ignore_additional_fields_for_invoice

	ignore_additional_fields_for_invoice(doc.name)
	doc.submit()
	return doc


def _return(original: str, *, debit: bool):
	doc = make_sales_return(original)
	# Persist both note profiles against one source without over-returning it.
	# The upstream compliance helper avoids this by rolling the credit note back;
	# our acceptance evidence is intentionally durable, so each uses half.
	for row in doc.items:
		row.qty = -1
	doc.custom_return_reason = "Other"
	doc.remarks = f"{MARKER} {'DEBIT' if debit else 'CREDIT'}"
	if debit:
		doc.is_debit_note = True
	doc.set_taxes()
	doc.set_missing_values()
	doc.insert(ignore_permissions=True)
	from ksa_compliance.standard_doctypes.sales_invoice import ignore_additional_fields_for_invoice

	ignore_additional_fields_for_invoice(doc.name)
	doc.submit()
	return doc


def _send(invoice) -> dict[str, object]:
	from ksa_compliance.ksa_compliance.doctype.sales_invoice_additional_fields.sales_invoice_additional_fields import (
		ZatcaSendMode,
	)

	fields = frappe.new_doc("Sales Invoice Additional Fields")
	fields.send_mode = ZatcaSendMode.Compliance
	fields.sales_invoice = invoice.name
	fields.invoice_doctype = "Sales Invoice"
	fields.flags.ignore_permissions = True
	fields.insert()
	result = fields.submit_to_zatca()
	require(is_ok(result), f"ZATCA rejected {invoice.name}: {getattr(result, 'err_value', result)}")
	log = frappe.get_value(
		"ZATCA Integration Log",
		{"invoice_additional_fields_reference": fields.name},
		["name", "zatca_status", "zatca_message"],
		as_dict=True,
	)
	require(log, f"ZATCA Integration Log missing for {invoice.name}")
	payload = json.loads(log.zatca_message)
	errors = (payload.get("validationResults") or {}).get("errorMessages") or []
	issue = re.search(r"<cbc:IssueDate>([^<]+)</cbc:IssueDate>", fields.invoice_xml or "")
	require(
		not errors,
		f"ZATCA validation errors for {invoice.name} (posting={invoice.posting_date}, XML issue={issue.group(1) if issue else '?'}): {errors}",
	)
	status = payload.get("clearanceStatus") or payload.get("reportingStatus")
	require(status in {"CLEARED", "REPORTED"}, f"unexpected ZATCA status for {invoice.name}: {status}")
	require(fields.invoice_xml, f"signed XML missing for {invoice.name}")
	require(fields.qr_code, f"ZATCA QR missing for {invoice.name}")
	return {
		"invoice": invoice.name,
		"additional_fields": fields.name,
		"integration_log": log.name,
		"status": status,
		"xml_sha256": hashlib.sha256(fields.invoice_xml.encode()).hexdigest(),
		"xml_bytes": len(fields.invoice_xml.encode()),
		"qr_bytes": len(fields.qr_code),
		"warnings": len((payload.get("validationResults") or {}).get("warningMessages") or []),
	}


def _existing_evidence() -> list[dict[str, object]]:
	rows = frappe.get_all("Sales Invoice", filters={"remarks": ["like", f"{MARKER}%"]}, pluck="name")
	result = []
	for invoice in rows:
		fields_name = frappe.db.get_value("Sales Invoice Additional Fields", {"sales_invoice": invoice}, "name")
		if not fields_name:
			continue
		fields = frappe.get_doc("Sales Invoice Additional Fields", fields_name)
		log = frappe.get_value(
			"ZATCA Integration Log",
			{"invoice_additional_fields_reference": fields_name},
			["name", "zatca_status", "zatca_message"],
			as_dict=True,
		)
		if not log:
			continue
		payload = json.loads(log.zatca_message)
		result.append(
			{
				"invoice": invoice,
				"additional_fields": fields_name,
				"integration_log": log.name,
				"status": payload.get("clearanceStatus") or payload.get("reportingStatus"),
				"xml_sha256": hashlib.sha256((fields.invoice_xml or "").encode()).hexdigest(),
				"xml_bytes": len((fields.invoice_xml or "").encode()),
				"qr_bytes": len(fields.qr_code or ""),
				"warnings": len((payload.get("validationResults") or {}).get("warningMessages") or []),
			}
		)
	return result


def run() -> None:
	frappe.set_user("Administrator")
	site = _safe_site()
	before_errors = frappe.db.count("Error Log")
	settings = _prepare_settings(site)
	# Configuration must be durable before the external request.  If ZATCA
	# accepts and the local credential save later fails, rolling this insert
	# back would leave an orphaned remote compliance request.
	frappe.db.commit()
	if not settings.compliance_request_id:
		settings.onboard(os.environ.get("BND_ZATCA_SANDBOX_OTP", "123345"))
		frappe.db.commit()
	settings.reload()
	require(settings.is_sandbox_server, "onboarded setting is not Sandbox")
	require(settings.compliance_request_id and settings.security_token and settings.secret, "Sandbox CSID missing")

	evidence = _existing_evidence()
	if len(evidence) != 6:
		require(not evidence, f"partial ZATCA evidence exists ({len(evidence)}/6); inspect before rerun")
		_ensure_tax_configuration()
		standard = _ensure_customer(STANDARD_CUSTOMER, True)
		simplified = _ensure_customer(SIMPLIFIED_CUSTOMER, False)
		_ensure_item()
		for customer in (standard, simplified):
			invoice = _new_invoice(customer)
			evidence.append(_send(invoice))
			credit = _return(invoice.name, debit=False)
			evidence.append(_send(credit))
			debit = _return(invoice.name, debit=True)
			evidence.append(_send(debit))
		frappe.db.commit()

	require(len(evidence) == 6, "expected six ZATCA acceptance documents")
	require({row["status"] for row in evidence} == {"CLEARED", "REPORTED"}, "both ZATCA profiles did not pass")
	require(all(row["xml_bytes"] and row["qr_bytes"] for row in evidence), "XML/QR evidence is incomplete")
	require(frappe.db.count("Error Log") == before_errors, "ZATCA acceptance created an Error Log")
	print(
		json.dumps(
			{
				"site": site,
				"server": settings.fatoora_server,
				"settings": settings.name,
				"credential_values_printed": False,
				"documents": evidence,
				"new_error_logs": 0,
			},
			ensure_ascii=False,
			indent=2,
		)
	)


if __name__ == "__main__":
	frappe.init(site=os.environ.get("BND_SITE", "candidate.bunood.test"), sites_path=".")
	frappe.connect()
	try:
		run()
	finally:
		frappe.destroy()
