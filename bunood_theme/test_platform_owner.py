"""Actual-site checks for «مالك المنصة» (platform_owner.py, platform_owner_methods.py).

A tenant's System Manager (who here may also have given the role write rights through Role
Permissions, as a tenant can) is refused on every protected field, insert and delete, through
``doc.save``, ``frappe.client.*`` and the wrapped whitelisted methods; still edits the address and
switches Phase 1 on and off; the platform owner succeeds; the role and its holders are out of a
tenant's reach and lists; the framework's own passes still write. The HTTP path is
``tools/platform_owner_probe.py``, against a running site. Everything here is rolled back.

ksa_compliance must be installed on the site (the ZATCA cases skip without it).
"""

import uuid
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from bunood_theme import platform_owner as po
from bunood_theme import platform_owner_methods as methods

VAT = "300000000000003"
VAT_2 = "311111111111113"
CR = "1010101010"


def _without(doc_events: dict, doctype: str, prefix: str) -> dict:
    """These doc_events with one app's handlers on one DocType left out."""
    events = {key: dict(value) for key, value in doc_events.items()}
    for method, handlers in events.get(doctype, {}).items():
        events[doctype][method] = [h for h in handlers if not h.startswith(prefix)]
    return events


class TestPlatformOwner(IntegrationTestCase):
    def setUp(self):
        super().setUp()
        self.previous_user = frappe.session.user
        frappe.set_user("Administrator")
        self.savepoint = "platform_owner_" + uuid.uuid4().hex
        frappe.db.savepoint(self.savepoint)
        frappe.flags.bnd_enforce_platform_owner = True
        setattr(frappe.local, po.PENDING, [])
        self.company = frappe.db.get_value("Company", {}, "name", order_by="creation asc")
        self.tenant = self.user("tenant", "System Manager")
        self.platform = self.user("platform", "System Manager", po.ROLE)
        self.other = self.user("other", "Accounts User")
        # Nothing here may reach the database for good: a commit fails the test instead.
        self.no_commit = patch.object(frappe.db, "commit", side_effect=AssertionError("a commit during the tests"))
        self.no_commit.start()

    def tearDown(self):
        self.no_commit.stop()
        frappe.flags.bnd_enforce_platform_owner = False
        frappe.flags.in_migrate = False
        frappe.local.job = None
        setattr(frappe.local, po.PENDING, [])
        frappe.set_user("Administrator")
        frappe.db.rollback(save_point=self.savepoint)
        frappe.local.role_permissions = {}
        frappe.clear_cache()
        frappe.set_user(self.previous_user)
        super().tearDown()

    # ── fixtures ──────────────────────────────────────────────────────────

    def user(self, prefix: str, *roles: str) -> str:
        email = f"po-{prefix}-{uuid.uuid4().hex[:10]}@example.com"
        frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": prefix,
                "send_welcome_email": 0,
                "user_type": "System User",
                "allowed_in_mentions": 0 if po.ROLE in roles else 1,
                "roles": [{"role": role} for role in roles],
            }
        ).insert(ignore_permissions=True)
        return email

    def ksa(self):
        if not frappe.db.exists("DocType", po.PHASE2):
            self.skipTest("ksa_compliance is not installed on this site")

    def tenant_may_write_zatca(self):
        """What a tenant can do in Role Permissions: give System Manager every right back."""
        for doctype in (po.PHASE2, po.EGS):
            if not frappe.db.exists("Custom DocPerm", {"parent": doctype}):
                continue
            for name in frappe.get_all("Custom DocPerm", filters={"parent": doctype, "role": "System Manager"}, pluck="name"):
                frappe.db.set_value("Custom DocPerm", name, {"write": 1, "create": 1, "delete": 1})
        frappe.clear_cache()
        frappe.local.role_permissions = {}

    def address(self) -> str:
        doc = frappe.get_doc(
            {
                "doctype": "Address",
                "address_title": "PO test",
                "address_type": "Billing",
                "address_line1": "طريق الملك فهد",
                "city": "الرياض",
                "pincode": "12345",
                "country": "Saudi Arabia",
                "links": [{"link_doctype": "Company", "link_name": self.company}],
            }
        )
        meta = frappe.get_meta("Address")
        if meta.has_field("custom_building_number"):
            doc.custom_building_number = "1234"
        if meta.has_field("custom_area"):
            doc.custom_area = "العليا"
        return doc.insert(ignore_permissions=True).name

    def phase2(self, **values):
        doc = frappe.get_doc(
            {
                "doctype": po.PHASE2,
                "company": self.company,
                "company_address": self.address(),
                "currency": "SAR",
                "country": "Saudi Arabia",
                "seller_name": "مؤسسة الاختبار",
                "vat_registration_number": VAT,
                "company_unit": "Main",
                "company_unit_serial": "1-TST|2-TST|3-1",
                "company_category": "Retail",
                "cli_setup": "Manual",
                "fatoora_server": "Sandbox",
                "sync_with_zatca": "Batches",
                "status": "Active",
                "other_ids": [{"type_name": "Commercial Registration Number", "type_code": "CRN", "value": CR}],
                **values,
            }
        )
        return doc.insert(ignore_permissions=True)

    def egs(self, settings):
        return frappe.get_doc(
            {
                "doctype": po.EGS,
                "business_settings": settings.name,
                "egs_type": "POS Device",
                "unit_common_name": "dev-" + uuid.uuid4().hex[:6],
                "unit_serial": "1-a|2-b|3-c",
            }
        ).insert(ignore_permissions=True)

    def refused(self, call, *args, **kwargs):
        frappe.clear_messages()
        with self.assertRaises(frappe.PermissionError) as caught:
            call(*args, **kwargs)
        frappe.clear_messages()
        return caught.exception

    def as_user(self, user):
        frappe.set_user(user)
        frappe.local.role_permissions = {}

    # ── who counts ────────────────────────────────────────────────────────

    def test_who_is_the_platform_owner(self):
        self.assertTrue(po.is_platform_owner(self.platform))
        self.assertFalse(po.is_platform_owner(self.tenant))
        self.assertFalse(po.is_platform_owner("Guest"))
        # Administrator: the console, migrate, the ops script; never over HTTP, never in a job.
        self.assertTrue(po.is_platform_owner("Administrator"))
        with patch.object(frappe.local, "request", object(), create=True):
            self.assertFalse(po.is_platform_owner("Administrator"))
        frappe.local.job = frappe._dict(method="frappe.core.doctype.data_import.data_import.start_import")
        self.assertFalse(po.is_platform_owner("Administrator"))
        # A job is whoever queued it, ksa_compliance's too (a tenant queues those as well).
        frappe.local.job = frappe._dict(method="ksa_compliance.background_jobs.sync_e_invoices")
        self.assertFalse(po.is_platform_owner(self.tenant))
        self.assertFalse(po.is_platform_owner("Administrator"))
        self.assertTrue(po.is_platform_owner(self.platform))
        frappe.local.job = None
        # The framework's own passes are not a person editing.
        frappe.flags.in_migrate = True
        self.assertTrue(po.is_platform_owner(self.tenant))

    # ── ZATCA Phase 2 and its devices ───────────────────────────────────────

    def test_tenant_refused_on_phase2(self):
        self.ksa()
        self.tenant_may_write_zatca()
        settings = self.phase2()
        self.as_user(self.tenant)
        # insert
        self.refused(lambda: frappe.copy_doc(settings).insert())
        # any field, through doc.save
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.fatoora_server = "Production"
        self.refused(doc.save)
        for field, value in (("vat_registration_number", VAT_2), ("seller_name", "غيره"), ("enable_zatca_integration", 1), ("zatca_cli_path", "/tmp/x")):
            doc = frappe.get_doc(po.PHASE2, settings.name)
            doc.set(field, value)
            self.refused(doc.save)
        # the CR copy (other_ids CRN rows)
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.other_ids[0].value = "2020202020"
        self.refused(doc.save)
        # frappe.client.set_value, on the record and on its child row
        self.refused(frappe.client.set_value, po.PHASE2, settings.name, "fatoora_server", "Production")
        self.refused(frappe.client.set_value, "Additional Seller IDs", settings.other_ids[0].name, "value", "2020202020")
        # flags.ignore_validate does not walk past on_update
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.flags.ignore_validate = True
        doc.fatoora_server = "Production"
        self.refused(doc.save)
        # delete (ksa refuses every delete itself; the guard stands behind it) and rename
        self.refused(po.guard_zatca_record, frappe.get_doc(po.PHASE2, settings.name), "on_trash")
        self.refused(frappe.rename_doc, po.PHASE2, settings.name, settings.name + "-x")
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value(po.PHASE2, settings.name, "fatoora_server"), "Sandbox")
        self.assertEqual(frappe.db.get_value("Additional Seller IDs", settings.other_ids[0].name, "value"), CR)

    def test_platform_owner_manages_phase2(self):
        self.ksa()
        self.as_user(self.platform)
        settings = self.phase2()
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.fatoora_server = "Simulation"
        doc.other_ids[0].value = "2020202020"
        doc.save()
        frappe.client.set_value(po.PHASE2, settings.name, "fatoora_server", "Production")
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.seller_name = "مؤسسة أخرى"
        doc.save(ignore_version=False)  # tests skip Versions unless asked
        self.assertEqual(frappe.db.get_value(po.PHASE2, settings.name, ["fatoora_server", "seller_name"]), ("Production", "مؤسسة أخرى"))
        # Version (the DocType tracks changes) holds old → new, who and when.
        version = frappe.get_all("Version", filters={"ref_doctype": po.PHASE2, "docname": settings.name}, fields=["owner", "data"], order_by="creation desc", limit=1)
        self.assertEqual(version[0].owner, self.platform)
        self.assertIn("seller_name", version[0].data)

    def test_tenant_refused_on_devices(self):
        self.ksa()
        self.tenant_may_write_zatca()
        settings = self.phase2()
        device = self.egs(settings)
        self.as_user(self.tenant)
        self.refused(lambda: frappe.copy_doc(device).insert())
        doc = frappe.get_doc(po.EGS, device.name)
        doc.enable_zatca_integration = 1
        self.refused(doc.save)
        self.refused(frappe.client.set_value, po.EGS, device.name, "unit_serial", "9-x|9-y|9-z")
        self.refused(po.guard_zatca_record, frappe.get_doc(po.EGS, device.name), "on_trash")
        self.as_user(self.platform)
        doc = frappe.get_doc(po.EGS, device.name)
        doc.enable_zatca_integration = 1
        doc.save()
        self.assertEqual(frappe.db.get_value(po.EGS, device.name, "enable_zatca_integration"), 1)

    # ── Phase 1: activation stays with the tenant ──────────────────────────────

    def test_phase1_activation_stays_with_the_tenant(self):
        self.ksa()
        frappe.db.set_value("Company", self.company, "tax_id", VAT)
        frappe.db.delete(po.PHASE1, {"company": self.company})
        for name in frappe.get_all(po.PHASE2, filters={"company": self.company, "status": "Active"}, pluck="name"):
            frappe.db.set_value(po.PHASE2, name, "status", "Revoked")
        address = self.address()
        self.as_user(self.tenant)
        # Activating takes the company's own VAT number: allowed.
        phase1 = frappe.get_doc(
            {"doctype": po.PHASE1, "company": self.company, "vat_registration_number": VAT, "address": address, "type_of_transaction": "Both", "status": "Active"}
        ).insert()
        phase1.status = "Disabled"
        phase1.type_of_transaction = "Simplified Tax Invoice"
        phase1.save()
        # Any other number: refused, through save and set_value.
        phase1.vat_registration_number = VAT_2
        self.refused(phase1.save)
        self.refused(frappe.client.set_value, po.PHASE1, phase1.name, "vat_registration_number", VAT_2)
        # A new row carrying another number: refused.
        frappe.set_user("Administrator")
        frappe.db.delete(po.PHASE1, {"company": self.company})
        self.as_user(self.tenant)
        self.refused(
            lambda: frappe.get_doc(
                {"doctype": po.PHASE1, "company": self.company, "vat_registration_number": VAT_2, "address": address, "type_of_transaction": "Both", "status": "Active"}
            ).insert()
        )
        # The platform owner changes it; a Comment records old → new (Phase 1 tracks no changes).
        self.as_user(self.platform)
        phase1 = frappe.get_doc(
            {"doctype": po.PHASE1, "company": self.company, "vat_registration_number": VAT, "address": address, "type_of_transaction": "Both", "status": "Disabled"}
        ).insert()
        phase1.vat_registration_number = VAT_2
        phase1.save()
        comment = frappe.get_all("Comment", filters={"reference_doctype": po.PHASE1, "reference_name": phase1.name, "comment_type": "Info"}, fields=["content", "owner"])
        self.assertTrue(comment and VAT in comment[0].content and VAT_2 in comment[0].content and comment[0].owner == self.platform)

    # ── the company ────────────────────────────────────────────────────────

    def test_tenant_refused_on_company_identity(self):
        frappe.db.set_value("Company", self.company, {"tax_id": None, "registration_details": None})
        self.as_user(self.tenant)
        fields = {
            "tax_id": VAT,  # from empty
            "registration_details": "CR " + CR,
            "company_name": "اسم آخر",
        }
        meta = frappe.get_meta("Company")
        for field in ("bnd_commercial_registration", "bnd_company_name_ar", "bnd_company_name_en"):
            if meta.has_field(field):
                fields[field] = CR if field == "bnd_commercial_registration" else "اسم"
        for field, value in fields.items():
            doc = frappe.get_doc("Company", self.company)
            doc.set(field, value)
            self.refused(doc.save)
            self.refused(frappe.client.set_value, "Company", self.company, field, value)
        self.refused(frappe.rename_doc, "Company", self.company, self.company + " 2")
        # A change, and a clearing, of a value the platform owner set.
        frappe.set_user("Administrator")
        frappe.db.set_value("Company", self.company, "tax_id", VAT)
        self.as_user(self.tenant)
        for value in (VAT_2, ""):
            doc = frappe.get_doc("Company", self.company)
            doc.tax_id = value
            self.refused(doc.save)
        # Everything else on the company stays the tenant's.
        doc = frappe.get_doc("Company", self.company)
        doc.phone_no = "0110000000"
        doc.save()
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Company", self.company, "tax_id"), VAT)

    def test_tenant_creates_a_company_without_vat_or_cr(self):
        self.as_user(self.tenant)
        values = {"doctype": "Company", "default_currency": "SAR", "country": "Saudi Arabia", "create_chart_of_accounts_based_on": "Standard Template", "chart_of_accounts": "Standard"}
        self.refused(lambda: frappe.get_doc({**values, "company_name": "شركة بضريبة " + uuid.uuid4().hex[:4], "abbr": "SB" + uuid.uuid4().hex[:3], "tax_id": VAT}).insert())
        # bunood_business renames the new company's warehouses on its on_update, which a System
        # Manager without Warehouse rights cannot; that is not what is under test here.
        with patch("frappe.get_doc_hooks", return_value=_without(frappe.get_doc_hooks(), "Company", "bunood_business.")):
            doc = frappe.get_doc({**values, "company_name": "شركة بلا ضريبة " + uuid.uuid4().hex[:4], "abbr": "SN" + uuid.uuid4().hex[:3]}).insert()
        self.assertTrue(frappe.db.exists("Company", doc.name))
        self.assertFalse(doc.tax_id)

    def test_platform_owner_sets_company_identity(self):
        self.as_user(self.platform)
        doc = frappe.get_doc("Company", self.company)
        doc.tax_id = VAT_2
        doc.registration_details = "CR " + CR
        doc.save(ignore_version=False)  # tests skip Versions unless asked
        frappe.client.set_value("Company", self.company, "tax_id", VAT)
        self.assertEqual(frappe.db.get_value("Company", self.company, "tax_id"), VAT)
        version = frappe.get_all("Version", filters={"ref_doctype": "Company", "docname": self.company, "owner": self.platform}, fields=["owner", "data"], order_by="creation desc", limit=1)
        self.assertEqual(version[0].owner, self.platform)
        self.assertIn(VAT_2, version[0].data)

    def test_tenant_still_edits_the_address(self):
        address = self.address()
        self.as_user(self.tenant)
        doc = frappe.get_doc("Address", address)
        doc.address_line1 = "شارع التحلية"
        doc.save()
        self.assertEqual(frappe.db.get_value("Address", address, "address_line1"), "شارع التحلية")

    # ── the wrapped whitelisted methods ─────────────────────────────────────

    def test_the_overrides_point_at_the_wrappers(self):
        overrides = frappe.get_hooks("override_whitelisted_methods")
        for original, wrapper in methods.OVERRIDES.items():
            self.assertEqual(overrides.get(original, [None])[-1], wrapper, original)
            self.assertTrue(frappe.get_attr(wrapper) in frappe.whitelisted, wrapper)

    def test_onboarding_methods_refused_or_allowed(self):
        self.ksa()
        from ksa_compliance.ksa_compliance.doctype.zatca_business_settings.zatca_business_settings import ZATCABusinessSettings

        settings = self.phase2()
        cases = (
            (methods.onboard, {"business_settings_id": settings.name, "otp": "123456"}, (ZATCABusinessSettings, "onboard")),
            (methods.get_production_csid, {"business_settings_id": settings.name, "otp": "123456"}, (ZATCABusinessSettings, "get_production_csid")),
        )
        for call, kwargs, (owner, name) in cases:
            with patch.object(owner, name) as network:
                self.as_user(self.tenant)
                self.refused(call, **kwargs)
                network.assert_not_called()
                self.as_user(self.platform)
                call(**kwargs)
                network.assert_called_once_with(kwargs["otp"])
        # The compliance checks are queued; the CLI downloads and runs a binary: mocked.
        with patch("frappe.utils.background_jobs.enqueue") as queued:
            args = {"business_settings_id": settings.name, "simplified_customer_id": None, "standard_customer_id": None, "item_id": "x", "tax_category_id": "y"}
            self.as_user(self.tenant)
            self.refused(methods.perform_compliance_checks, **args)
            queued.assert_not_called()
            self.as_user(self.platform)
            methods.perform_compliance_checks(**args)
            queued.assert_called_once()
        with patch("ksa_compliance.zatca_cli.setup") as setup, patch("ksa_compliance.zatca_cli.run_command") as run:
            self.as_user(self.tenant)
            self.refused(methods.zatca_cli_setup, None, None)
            self.refused(methods.zatca_cli_check_setup, "/bin/sh", None)
            self.refused(methods.zatca_cli_check_validation_details_support, "/bin/sh", None)
            setup.assert_not_called()
            run.assert_not_called()
            self.as_user(self.platform)
            methods.zatca_cli_setup(None, None)
            setup.assert_called_once()
        # create_business_settings maps a new record from an old one.
        self.as_user(self.tenant)
        self.refused(methods.create_business_settings, settings.name)
        self.as_user(self.platform)
        self.assertEqual(methods.create_business_settings(settings.name).doctype, po.PHASE2)
        # revoke writes with frappe.db.set_value, which no doc event sees: the wrapper is the lock.
        self.as_user(self.tenant)
        self.refused(methods.revoke_business_settings, settings.name, self.company)
        self.assertEqual(frappe.db.get_value(po.PHASE2, settings.name, "status"), "Active")
        self.as_user(self.platform)
        methods.revoke_business_settings(settings.name, self.company)
        self.assertEqual(frappe.db.get_value(po.PHASE2, settings.name, "status"), "Revoked")

    # ── the role and its holders ───────────────────────────────────────────

    def test_tenant_cannot_grant_or_take_the_role(self):
        self.as_user(self.tenant)
        for user in (self.tenant, self.other):
            doc = frappe.get_doc("User", user)
            doc.append("roles", {"role": po.ROLE})
            self.refused(doc.save)
        self.refused(lambda: frappe.get_doc({"doctype": "User", "email": f"po-new-{uuid.uuid4().hex[:6]}@example.com", "first_name": "x", "send_welcome_email": 0, "roles": [{"role": po.ROLE}]}).insert())
        self.refused(lambda: frappe.client.insert({"doctype": "Has Role", "parenttype": "User", "parentfield": "roles", "parent": self.other, "role": po.ROLE}))
        self.refused(lambda: frappe.get_doc({"doctype": "Role Profile", "role_profile": "PO " + uuid.uuid4().hex[:6], "roles": [{"role": po.ROLE}]}).insert())
        doc = frappe.get_doc("User", self.platform)
        doc.set("roles", [{"role": row.role} for row in doc.roles if row.role != po.ROLE])
        self.refused(doc.save)
        self.refused(doc.save, ignore_permissions=True)
        frappe.set_user("Administrator")
        self.assertFalse(po.holds_role(self.other))
        self.assertTrue(po.holds_role(self.platform))

    def test_tenant_cannot_touch_the_platform_user(self):
        self.as_user(self.tenant)
        # Twice each: through the tenant's permissions (has_permission refuses the record), and
        # as a server path that saves with ignore_permissions (guard_user refuses the change).
        for field, value in (("enabled", 0), ("first_name", "x"), ("mobile_no", "+966500000000"), ("restrict_ip", "10.0.0.1"), ("api_key", "abc")):
            for ignore in (False, True):
                doc = frappe.get_doc("User", self.platform)
                doc.set(field, value)
                self.refused(doc.save, ignore_permissions=ignore)
        for ignore in (False, True):
            doc = frappe.get_doc("User", self.platform)
            doc.new_password = "Lab-only-throwaway-9!"
            self.refused(doc.save, ignore_permissions=ignore)
        self.refused(frappe.client.set_value, "User", self.platform, "enabled", 0)
        self.refused(frappe.delete_doc, "User", self.platform)
        self.refused(frappe.delete_doc, "User", self.platform, ignore_permissions=True)
        self.refused(frappe.rename_doc, "User", self.platform, "po-renamed@example.com")
        self.refused(lambda: frappe.get_doc({"doctype": "User Permission", "user": self.platform, "allow": "Company", "for_value": self.company}).insert())
        self.refused(methods.generate_keys, self.platform)
        self.refused(methods.reset_otp_secret, self.platform)
        self.refused(methods.impersonate, self.platform, "test")
        # The reset email is quietly not sent (Frappe answers every caller alike).
        methods.reset_password(self.platform)
        self.assertFalse(frappe.db.get_value("User", self.platform, "reset_password_key"))
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("User", self.platform, "enabled"), 1)
        # The tenant still manages everyone else.
        self.as_user(self.tenant)
        doc = frappe.get_doc("User", self.other)
        doc.mobile_no = "+966500000001"
        doc.save()
        self.assertTrue(methods.generate_keys(self.other)["api_secret"])

    def test_a_reset_key_for_the_platform_user_is_refused(self):
        from frappe.utils.data import sha256_hash

        frappe.db.set_value("User", self.platform, "reset_password_key", sha256_hash("lab-key"))
        frappe.set_user("Guest")
        self.refused(methods.update_password, "Lab-only-throwaway-9!", 0, "lab-key")

    def test_a_guest_cannot_flood_the_platform_owner(self):
        # reset_password and send_login_link are open to Guests and answer every caller alike; a
        # Guest's refusal is quietly not done and notifies nobody (release review L1), while a
        # signed-in user's still reaches the platform owner.
        frappe.set_user("Guest")
        for _ in range(3):
            methods.reset_password(self.platform)
            self.assertIsNone(methods.send_login_link(self.platform))
        self.assertEqual(getattr(frappe.local, po.PENDING), [])
        self.assertEqual(po.write_refusals(), 0)
        frappe.set_user("Administrator")
        self.assertFalse(frappe.db.get_value("User", self.platform, "reset_password_key"))
        self.assertFalse(frappe.db.exists("Notification Log", {"for_user": self.platform}))
        # Signed in, the same calls name someone on the site: recorded, one each.
        self.as_user(self.tenant)
        methods.reset_password(self.platform)
        self.assertIsNone(methods.send_login_link(self.platform))
        self.assertEqual([row["user"] for row in getattr(frappe.local, po.PENDING)], [self.tenant, self.tenant])
        frappe.set_user("Administrator")
        self.assertEqual(po.write_refusals(), 2 * len(po.platform_users(enabled_only=True)))
        subjects = frappe.get_all("Notification Log", filters={"for_user": self.platform, "from_user": self.tenant}, pluck="subject")
        self.assertEqual(len(subjects), 2)
        self.assertFalse(frappe.db.get_value("User", self.platform, "reset_password_key"))

    def test_tenant_cannot_change_the_role_record(self):
        self.as_user(self.tenant)
        role = frappe.get_doc("Role", po.ROLE)
        role.two_factor_auth = 0
        self.refused(role.save)
        self.refused(frappe.client.set_value, "Role", po.ROLE, "disabled", 1)
        self.refused(frappe.delete_doc, "Role", po.ROLE)
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Role", po.ROLE, "two_factor_auth"), 1)

    def test_tenant_cannot_switch_two_factor_off(self):
        frappe.db.set_single_value("System Settings", "enable_two_factor_auth", 1)
        frappe.db.set_single_value("System Settings", "two_factor_method", "OTP App")
        frappe.clear_cache()
        self.as_user(self.tenant)
        for field, value in (("enable_two_factor_auth", 0), ("two_factor_method", "Email"), ("disable_user_pass_login", 1)):
            doc = frappe.get_doc("System Settings")
            doc.set(field, value)
            self.refused(doc.save)
        # Other system settings stay the tenant's.
        doc = frappe.get_doc("System Settings")
        doc.session_expiry = "12:00"
        doc.save()

    def test_installer_holds_the_role_to_its_contract(self):
        frappe.db.set_value("Role", po.ROLE, "two_factor_auth", 0)
        self.assertTrue(po.ensure_role())
        self.assertEqual(frappe.db.get_value("Role", po.ROLE, ["two_factor_auth", "desk_access"]), (1, 1))
        self.assertFalse(po.ensure_role())

    def test_zatca_permissions(self):
        self.ksa()
        frappe.db.delete("Custom DocPerm", {"parent": ("in", list(po.ZATCA_PERMISSIONS))})
        frappe.clear_cache()
        done = po.ensure_zatca_permissions()
        self.assertIn(po.PHASE2, done)
        rows = {(r.role, r.read, r.write, r.create, r.delete) for r in frappe.get_all("Custom DocPerm", filters={"parent": po.PHASE2}, fields=["role", "read", "write", "create", "delete"])}
        self.assertIn(("System Manager", 1, 0, 0, 0), rows)
        self.assertIn((po.ROLE, 1, 1, 1, 1), rows)
        # Phase 1 keeps the tenant's rights (activation is theirs).
        self.assertTrue(frappe.db.get_value("Custom DocPerm", {"parent": po.PHASE1, "role": "System Manager"}, "write"))
        self.assertEqual(po.ensure_zatca_permissions(), [])
        frappe.local.role_permissions = {}
        self.assertTrue(frappe.has_permission(po.PHASE2, "read", user=self.tenant))
        self.assertFalse(frappe.has_permission(po.PHASE2, "write", user=self.tenant))
        self.assertTrue(frappe.has_permission(po.PHASE2, "write", user=self.platform))

    # ── the User list ─────────────────────────────────────────────────────────

    def test_user_lists_hide_the_platform_owner(self):
        from frappe.core.doctype.user.user import user_query
        from frappe.desk.search import get_names_for_mentions, search_widget

        self.as_user(self.tenant)
        names = frappe.get_list("User", pluck="name", limit_page_length=0)
        self.assertNotIn(self.platform, names)
        self.assertIn(self.other, names)
        self.assertNotIn(self.platform, [row[0] for row in user_query("User", "po-", "name", 0, 50, {})])
        self.assertIn(self.other, [row[0] for row in user_query("User", "po-", "name", 0, 50, {})])
        found = search_widget("User", txt="po-", page_length=50) or []
        self.assertNotIn(self.platform, [row[0] if isinstance(row, (list, tuple)) else row.get("value") for row in found])
        self.assertFalse(frappe.has_permission("User", "read", doc=self.platform))
        self.assertTrue(frappe.has_permission("User", "read", doc=self.other))
        frappe.cache.delete_value("users_for_mentions")
        self.assertNotIn(self.platform, [row["id"] for row in get_names_for_mentions("po-")])
        # Assigning to anyone else still works.
        from frappe.desk.form.assign_to import add

        add({"doctype": "Company", "name": self.company, "assign_to": [self.other], "description": "test"})
        self.assertTrue(frappe.db.exists("ToDo", {"allocated_to": self.other, "reference_name": self.company}))
        # The platform owner sees everyone.
        self.as_user(self.platform)
        self.assertIn(self.platform, frappe.get_list("User", pluck="name", limit_page_length=0))

    # ── the framework's own passes ─────────────────────────────────────────────

    def test_background_and_migrate_contexts_still_write(self):
        self.ksa()
        self.tenant_may_write_zatca()
        settings = self.phase2()
        self.as_user(self.tenant)
        frappe.flags.in_migrate = True
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.fatoora_server = "Simulation"
        doc.save()
        frappe.flags.in_migrate = False
        # A ksa_compliance job the platform owner queued runs as the platform owner.
        self.as_user(self.platform)
        frappe.local.job = frappe._dict(method="ksa_compliance.compliance_checks._perform_compliance_checks")
        doc = frappe.get_doc(po.PHASE2, settings.name)
        doc.fatoora_server = "Production"
        doc.save()
        # A job Administrator queued over HTTP (a Data Import, a scheduled Notification) is not one.
        frappe.local.job = frappe._dict(method="frappe.core.doctype.data_import.data_import.start_import")
        frappe.set_user("Administrator")
        doc = frappe.get_doc("Company", self.company)
        doc.tax_id = VAT_2
        self.refused(doc.save)
        frappe.local.job = None
        # The console (no request, no job) is the platform owner's.
        doc = frappe.get_doc("Company", self.company)
        doc.tax_id = VAT_2
        doc.save()

    def test_a_tenant_queued_ksa_job_is_still_the_tenant(self):
        # A tenant queues ksa_compliance's jobs too (add_batch_to_background_queue is whitelisted),
        # and what a tenant hangs on such a job's saves (a Server Script, a Notification) runs
        # inside it: the job's namespace exempts nothing (release review M1).
        self.ksa()
        self.tenant_may_write_zatca()
        settings = self.phase2()
        frappe.db.set_value("Company", self.company, "tax_id", VAT)
        meta = frappe.get_meta("Company")
        self.as_user(self.tenant)
        for method in ("ksa_compliance.background_jobs.sync_e_invoices", "ksa_compliance.compliance_checks._perform_compliance_checks"):
            frappe.local.job = frappe._dict(method=method, user=self.tenant)
            # The company's VAT number and CR.
            for field, value in (("tax_id", VAT_2), ("bnd_commercial_registration", "2020202020"), ("registration_details", "CR 2020202020")):
                if not meta.has_field(field):
                    continue
                doc = frappe.get_doc("Company", self.company)
                doc.set(field, value)
                self.refused(doc.save)
            # The ZATCA Phase 2 settings, the CR copy included.
            for field, value in (("vat_registration_number", VAT_2), ("fatoora_server", "Production"), ("seller_name", "غيره")):
                doc = frappe.get_doc(po.PHASE2, settings.name)
                doc.set(field, value)
                self.refused(doc.save)
            doc = frappe.get_doc(po.PHASE2, settings.name)
            doc.other_ids[0].value = "2020202020"
            self.refused(doc.save)
        frappe.local.job = None
        frappe.set_user("Administrator")
        self.assertEqual(frappe.db.get_value("Company", self.company, "tax_id"), VAT)
        self.assertEqual(frappe.db.get_value(po.PHASE2, settings.name, ["vat_registration_number", "fatoora_server"]), (VAT, "Sandbox"))
        self.assertEqual(frappe.db.get_value("Additional Seller IDs", settings.other_ids[0].name, "value"), CR)

    # ── refusals reach the platform owner ───────────────────────────────────────

    def test_a_refusal_notifies_the_platform_owner(self):
        self.as_user(self.tenant)
        doc = frappe.get_doc("Company", self.company)
        doc.tax_id = VAT_2
        self.refused(doc.save)
        frappe.set_user("Administrator")
        # What after_rollback / after_request do once the request is rolled back.
        self.assertGreaterEqual(po.write_refusals(), 1)
        logs = frappe.get_all("Notification Log", filters={"for_user": self.platform, "from_user": self.tenant}, fields=["subject", "document_name"])
        self.assertTrue(logs)
        self.assertIn(frappe.local.site, logs[0].subject)
        self.assertIn("الرقم الضريبي", logs[0].subject)
        self.assertEqual(logs[0].document_name, self.company)

    def test_sign_in_only_with_password_and_code(self):
        manager = frappe._dict(user=self.platform)
        frappe.db.set_single_value("System Settings", "enable_two_factor_auth", 1)
        frappe.local.system_settings = None
        frappe.clear_cache()
        with patch.object(frappe.local, "request", object(), create=True):
            frappe.flags.bnd_password_login = False
            with self.assertRaises(frappe.AuthenticationError):
                po.on_login(manager)  # impersonation, an email link, a reset link, a social login
            frappe.flags.bnd_password_login = True
            po.on_login(manager)  # the password and the code
            frappe.db.set_single_value("System Settings", "enable_two_factor_auth", 0)
            frappe.local.system_settings = None
            frappe.clear_cache()
            with self.assertRaises(frappe.AuthenticationError):
                po.on_login(manager)  # a password alone
            po.on_login(frappe._dict(user=self.tenant))  # a tenant is not concerned
        frappe.flags.bnd_password_login = False
