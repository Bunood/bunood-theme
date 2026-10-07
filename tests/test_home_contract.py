"""Site-free negative tests for the actual native boot adapter."""
import copy
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


class Row(dict):
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__


class TestHomeBoot(unittest.TestCase):
    def setUp(self):
        self.default = None
        self.permitted = True
        self.fake = types.ModuleType("frappe")
        self.fake._ = lambda text: text
        self.fake.whitelist = lambda **kwargs: lambda method: method
        self.fake.session = Row(user="Administrator")
        self.fake.db = types.SimpleNamespace(exists=lambda *args: True, get_default=lambda key: self.default)
        self.fake.get_cached_doc = lambda *args: types.SimpleNamespace(is_permitted=lambda: self.permitted)
        self.fake.get_roles = lambda: []
        self.page = Row(name="bnd-home", doctype="Page")
        desk = types.ModuleType("frappe.desk")
        desk.desk_page = types.SimpleNamespace(get=lambda name: self.page)
        assets_spec = importlib.util.spec_from_file_location("bunood_theme.assets", Path(__file__).parents[1] / "bunood_theme/assets.py")
        assets = importlib.util.module_from_spec(assets_spec)
        assets_spec.loader.exec_module(assets)
        self.context = patch.dict(sys.modules, {"frappe":self.fake, "frappe.desk":desk, "bunood_theme.assets":assets})
        self.context.start()
        spec = importlib.util.spec_from_file_location("home_under_test", Path(__file__).parents[1] / "bunood_theme/home.py")
        self.home = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.home)

    def tearDown(self):
        self.context.stop()

    def boot(self):
        return Row(home_page="desktop", docs=[], allowed_workspaces=[{"name":"Selling"},{"name":"Custom operations"}], workspace_sidebar_item={"selling":{"items":[{"type":"Link","link_type":"Report","link_to":"My Report"}]}})

    def test_unset_default_preloads_native_page_without_writing_preferences(self):
        boot = self.boot()
        self.home.extend_bootinfo(boot)
        self.assertEqual(boot.home_page, "bnd-home")
        self.assertEqual(boot.docs, [self.page])
        self.home.extend_bootinfo(boot)
        self.assertEqual(boot.docs, [self.page])

    def test_translated_home_retains_native_sidebar_routing_identity(self):
        self.home._ = lambda text: "translated:" + text
        boot = self.boot()
        self.home.extend_bootinfo(boot)
        # Native get_workspace_sidebars resolves by label, then compares that
        # identity to sidebar_title; translated labels change routing identity.
        candidates = [sidebar.get("label") or key
                      for key, sidebar in boot.workspace_sidebar_item.items()
                      if any(item.get("link_to") == "bnd-home" for item in sidebar["items"])]
        self.assertIn("Bunood Home", candidates)
        self.assertEqual(boot.workspace_sidebar_item["bunood home"]["items"][0]["label"],
                         "translated:Bunood Home")

    def test_explicit_role_landing_keeps_native_root(self):
        self.fake.get_roles = lambda: ["Office User"]
        self.fake.get_cached_value = lambda dt, name, field: "/engineering" if dt == "Role" else None
        boot = self.boot()
        self.home.extend_bootinfo(boot)
        self.assertEqual(boot.home_page, "desktop")

    def test_domain_links_require_installed_app_and_its_own_gate(self):
        self.fake.get_installed_apps = lambda: ["bunood_engineering"]
        permitted = types.SimpleNamespace(has_app_permission=lambda: True)
        with patch("importlib.import_module", return_value=permitted) as importer:
            routes = self.home._domain_routes()
        self.assertEqual([r["route"] for r in routes], ["/engineering"])
        importer.assert_called_once_with("bunood_engineering.www.engineering")
        permitted.has_app_permission = lambda: False
        with patch("importlib.import_module", return_value=permitted):
            self.assertEqual(self.home._domain_routes(), [])

    def test_legacy_crm_uses_its_own_gate_not_native_role_vocabulary(self):
        self.fake.get_installed_apps = lambda: ["crm"]
        gate = types.SimpleNamespace(check_app_permission=lambda: True)
        with patch("importlib.import_module", return_value=gate) as importer:
            self.assertEqual(self.home._domain_routes(), [{"app":"crm", "route":"/crm", "label":"CRM"}])
        importer.assert_called_once_with("crm.api")

    def test_explicit_default_desktop_or_custom_stays(self):
        for default in ("desktop", "my-page"):
            with self.subTest(default=default):
                self.default = default
                boot = self.boot()
                self.home.extend_bootinfo(boot)
                self.assertEqual(boot.home_page, "desktop")
                self.assertEqual(boot.docs, [])

    def test_missing_native_generic_sentinels_use_home_but_valid_targets_stay(self):
        for name in ("workspace", "desktop"):
            self.default = name
            self.fake.db.exists = lambda doctype, target: target == "bnd-home"
            boot = self.boot()
            self.home.extend_bootinfo(boot)
            self.assertEqual(boot.home_page, "bnd-home")
            self.fake.db.exists = lambda *args: True
            boot = self.boot()
            self.home.extend_bootinfo(boot)
            self.assertEqual(boot.home_page, "desktop")

    def test_existing_hook_landing_and_custom_sidebar_survive(self):
        boot = self.boot()
        boot.home_page = "other-app"
        original = copy.deepcopy(boot.workspace_sidebar_item["selling"]["items"])
        self.home.extend_bootinfo(boot)
        self.assertEqual(boot.home_page, "other-app")
        self.assertEqual(boot.workspace_sidebar_item["selling"]["items"][1:], original)
        links = [row.get("link_to") for row in boot.workspace_sidebar_item["bunood home"]["items"]]
        self.assertIn("Custom operations", links)
        self.assertNotIn("Buying", links)

    def test_native_and_theme_personal_landings_are_not_replaced(self):
        for key, value in (("user", {"default_workspace":{"name":"Selling","public":1}}),
                           ("bnd_personal", {"home":"Custom operations"})):
            boot = self.boot()
            boot[key] = value
            self.home.extend_bootinfo(boot)
            self.assertEqual(boot.home_page, "desktop")
            self.assertEqual(boot.docs, [])

    def test_denied_page_and_guest_make_no_navigation_changes(self):
        for guest in (False, True):
            self.permitted = guest
            self.fake.session.user = "Guest" if guest else "Administrator"
            boot = self.boot()
            before = copy.deepcopy(boot)
            self.home.extend_bootinfo(boot)
            self.assertEqual(boot, before)

    def test_website_user_cannot_reach_data_readers(self):
        self.fake.get_cached_value = lambda *args: "Website User"
        self.fake.PermissionError = PermissionError
        def refuse(message, error):
            raise error(message)
        self.fake.throw = refuse
        with self.assertRaises(PermissionError):
            self.home.read()

    def test_company_operator_inputs_are_rejected_before_reads(self):
        self.fake.get_cached_value = lambda *args: "System User"
        self.fake.ValidationError = ValueError
        def refuse(message, error=None):
            raise ValueError(message)
        self.fake.throw = refuse
        self.fake.has_permission = lambda *args: True
        def unexpected_read(*args, **kwargs):
            raise AssertionError("native query reached before validating company")
        self.fake.get_list = unexpected_read
        boot_module = types.ModuleType("bunood_theme.boot")
        boot_module._permitted_pages = lambda names: []
        desktop = types.ModuleType("frappe.desk.desktop")
        desktop.get_workspaces = lambda: {"pages":[]}
        with patch.dict(sys.modules, {"bunood_theme.boot":boot_module, "frappe.desk.desktop":desktop}):
            for company in (["!=", ""], {"name": ["!=", ""]}, 3, True):
                with self.subTest(company=company), self.assertRaises(ValueError):
                    self.home.read(company)

    def test_denied_company_stops_before_any_queue_query(self):
        self.fake.get_cached_value = lambda *args: "System User"
        self.fake.has_permission = lambda *args: True
        queried = []
        self.fake.get_list = lambda doctype, **kwargs: queried.append(doctype) or []
        def denied(permission):
            raise PermissionError("company denied")
        self.fake.get_doc = lambda *args: types.SimpleNamespace(check_permission=denied)
        boot_module = types.ModuleType("bunood_theme.boot")
        boot_module._permitted_pages = lambda names: []
        desktop = types.ModuleType("frappe.desk.desktop")
        desktop.get_workspaces = lambda: {"pages":[]}
        with patch.dict(sys.modules, {"bunood_theme.boot":boot_module, "frappe.desk.desktop":desktop}):
            with self.assertRaises(PermissionError):
                self.home.read("denied")
        self.assertEqual(queried, ["Company"])


if __name__ == "__main__":
    unittest.main()
