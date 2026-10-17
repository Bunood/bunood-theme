"""«مالك المنصة» over HTTP: the locks as a tenant's browser or script meets them.

Runs against a served LAB site (never production: it writes, then puts back what it can). The
credentials come as JSON on stdin and are never printed:

    {"tenant": ["tenant@lab.test", "<pw>"], "platform": ["platform@lab.test", "<pw>", "<base32 otp secret>"],
     "admin": "<Administrator's lab password>"}

usage, from the bench (its env has requests and pyotp):
    ../env/bin/python apps/bunood_theme/tools/platform_owner_probe.py --url http://127.0.0.1:8000 \\
        --host lab.localhost < creds.json

What it proves (each line PASS/FAIL, exit 1 on any FAIL):
  - a tenant System Manager, even after giving System Manager every right on the ZATCA DocTypes
    in Role Permissions, is refused (403) on Phase 2, its devices, Phase 1's VAT number, the
    company's VAT number, CR, legal names and rename, ksa_compliance's onboarding methods, the
    platform owner's account (edit, disable, keys, OTP, impersonation), the role, and two-factor;
    the REST API, frappe.client.* and bunood_business's own endpoints alike;
  - the same tenant still edits the national address and switches Phase 1;
  - the platform owner users are not in a tenant's User list, and their record does not open;
  - Administrator over HTTP is refused like a tenant;
  - the platform owner signs in with the password AND the code, and succeeds on all of it;
  - the request flow end to end: certificate upload, request, ToDo, «تطبيق», the company changed;
  - refusals reach the platform owner as notifications.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

import pyotp
import requests

PHASE2 = "ZATCA Business Settings"
EGS = "ZATCA EGS"
PHASE1 = "ZATCA Phase 1 Business Settings"
KSA = "ksa_compliance.ksa_compliance.doctype.zatca_business_settings.zatca_business_settings"
ORG = "bunood_business.api.organization"
ZL = "bunood_business.api.zatca_link"
RESULTS: list[tuple[bool, str]] = []


def check(ok: bool, label: str, detail: str = "") -> bool:
    RESULTS.append((ok, label))
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + (f"  ({detail})" if detail and not ok else ""))
    return ok


class Client:
    def __init__(self, url: str, host: str):
        self.url, self.http = url.rstrip("/"), requests.Session()
        self.http.headers.update({"Host": host, "Accept": "application/json"})

    def login(self, user: str, password: str, otp_secret: str | None = None) -> requests.Response:
        response = self.http.post(f"{self.url}/api/method/login", data={"usr": user, "pwd": password})
        body = _json(response)
        if body.get("verification") and otp_secret:
            response = self.http.post(
                f"{self.url}/api/method/login",
                data={"usr": user, "pwd": password, "otp": pyotp.TOTP(otp_secret).now(), "tmp_id": body.get("tmp_id")},
            )
        self.csrf()
        return response

    def csrf(self):
        """The Desk's CSRF token, as a browser holds it after opening the Desk."""
        page = self.http.get(f"{self.url}/desk", headers={"Accept": "text/html"})
        found = re.search(r'csrf_token\s*=\s*"([^"]+)"', page.text or "")
        if found:
            self.http.headers["X-Frappe-CSRF-Token"] = found.group(1)

    def get(self, path: str, **params):
        return self.http.get(f"{self.url}{path}", params={k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in params.items()})

    def method(self, _method: str, **data):
        return self.http.post(f"{self.url}/api/method/{_method}", data={k: json.dumps(v) if isinstance(v, (list, dict)) else v for k, v in data.items()})

    def put(self, doctype: str, name: str, values: dict):
        return self.http.put(f"{self.url}/api/resource/{doctype}/{requests.utils.quote(name)}", json=values)

    def post(self, doctype: str, values: dict):
        return self.http.post(f"{self.url}/api/resource/{doctype}", json=values)

    def delete(self, doctype: str, name: str):
        return self.http.delete(f"{self.url}/api/resource/{doctype}/{requests.utils.quote(name)}")


def _pdf() -> bytes:
    """A one-page PDF that Frappe's upload check (pypdf) reads: the lab's stand-in certificate."""
    objects = [b"<</Type/Catalog/Pages 2 0 R>>", b"<</Type/Pages/Kids[3 0 R]/Count 1>>", b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>"]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj" % number + body + b"endobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


def _json(response) -> dict:
    try:
        return response.json()
    except ValueError:
        return {}


def message(response):
    return _json(response).get("message", _json(response).get("data"))


def refused(response, label: str) -> bool:
    return check(response.status_code == 403, f"tenant refused: {label}", f"HTTP {response.status_code}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    creds = json.load(sys.stdin)
    tenant_user, tenant_pw = creds["tenant"]
    platform_user, platform_pw, otp_secret = creds["platform"]

    tenant = Client(args.url, args.host)
    check(tenant.login(tenant_user, tenant_pw).status_code == 200, "tenant signs in")
    company = message(tenant.get("/api/resource/Company", limit_page_length=1, order_by="creation asc"))[0]["name"]
    before = message(tenant.get("/api/method/frappe.client.get_value", doctype="Company", filters={"name": company}, fieldname=["tax_id", "bnd_commercial_registration", "bnd_company_name_ar", "bnd_company_name_en"]))

    # ── Phase 1 stays with the tenant (before Phase 2 exists: ksa refuses an active Phase 1 beside it) ──
    phase1 = message(tenant.get("/api/method/frappe.client.get_value", doctype=PHASE1, filters={"company": company}, fieldname="name"))
    if not phase1:
        activated = tenant.method(f"{ORG}.activate_zatca", company=company, transaction="Both")
        check(activated.status_code == 200, "tenant activates Phase 1 (business)", activated.text[:300])
        phase1 = message(tenant.get("/api/method/frappe.client.get_value", doctype=PHASE1, filters={"company": company}, fieldname="name"))
    if phase1:
        check(tenant.put(PHASE1, phase1["name"], {"type_of_transaction": "Simplified Tax Invoice"}).status_code == 200, "tenant changes Phase 1's invoice types")
        tenant.put(PHASE1, phase1["name"], {"type_of_transaction": "Both"})
        refused(tenant.put(PHASE1, phase1["name"], {"vat_registration_number": "399999999999993"}), "Phase 1: another VAT number")

    # ── the platform owner signs in: the password alone is not enough ──────────────
    platform = Client(args.url, args.host)
    first = platform.http.post(f"{platform.url}/api/method/login", data={"usr": platform_user, "pwd": platform_pw})
    check(bool(_json(first).get("verification")), "platform owner: the password alone asks for the code", f"HTTP {first.status_code}")
    check(platform.login(platform_user, platform_pw, otp_secret).status_code == 200, "platform owner signs in with the password and the code")

    # The platform owner sets the company up for Phase 2 (business screen endpoint).
    settings = (message(platform.get(f"/api/method/{ZL}.overview", company=company)) or {}).get("settings")
    if not settings:
        created = platform.method(f"{ZL}.create_settings", company=company, server="Sandbox")
        check(created.status_code == 200, "platform owner creates the Phase 2 settings from the company", created.text[:200])
        settings = (message(created) or {}).get("settings")
    name = settings["name"]
    devices = message(platform.get(f"/api/resource/{EGS}", filters=[["business_settings", "=", name]])) or []
    if devices:
        device_name = devices[0]["name"]
    else:
        device = platform.post(EGS, {"business_settings": name, "egs_type": "POS Device", "unit_common_name": "POS-01", "unit_serial": "1-ZeroOne|2-POS|3-0001"})
        check(device.status_code == 200, "platform owner adds a device (EGS)", device.text[:200])
        device_name = (message(device) or {}).get("name")

    # ── a tenant who gave System Manager every right in Role Permissions ──────────
    for doctype in (PHASE2, EGS):
        for right in ("write", "create", "delete"):
            tenant.method("frappe.core.page.permission_manager.permission_manager.update", doctype=doctype, role="System Manager", permlevel=0, ptype=right, value=1)
    refused(tenant.put(PHASE2, name, {"fatoora_server": "Production"}), "Phase 2: change a field (REST)")
    refused(tenant.method("frappe.client.set_value", doctype=PHASE2, name=name, fieldname="vat_registration_number", value="399999999999993"), "Phase 2: VAT number (frappe.client.set_value)")
    refused(tenant.post(PHASE2, {"company": company, "seller_name": "x", "vat_registration_number": "399999999999993"}), "Phase 2: insert")
    deleted = tenant.delete(PHASE2, name)
    check(deleted.status_code >= 400, "tenant cannot delete Phase 2 (ksa refuses every delete; the guard stands behind it)", f"HTTP {deleted.status_code}")
    if device_name:
        refused(tenant.put(EGS, device_name, {"enable_zatca_integration": 1}), "device: change")
        removed = tenant.delete(EGS, device_name)
        check(removed.status_code >= 400, "tenant cannot delete a device (ksa refuses every delete; the guard stands behind it)", f"HTTP {removed.status_code}")
    refused(tenant.post(EGS, {"business_settings": name, "egs_type": "POS Device", "unit_common_name": "POS-X", "unit_serial": "1-a|2-b|3-c"}), "device: insert")
    for method in ("onboard", "get_production_csid"):
        refused(tenant.method(f"{KSA}.{method}", business_settings_id=name, otp="123456"), f"ksa {method}")
    refused(tenant.method(f"{KSA}.revoke_business_settings", settings_id=name, company=company), "ksa revoke")
    refused(tenant.method(f"{KSA}.create_business_settings", source_name=name), "ksa create_business_settings")
    refused(tenant.method("ksa_compliance.compliance_checks.perform_compliance_checks", business_settings_id=name, simplified_customer_id="", standard_customer_id="", item_id="x", tax_category_id="y"), "ksa compliance checks")
    refused(tenant.method("ksa_compliance.zatca_cli.setup", override_cli_download_url="", override_jre_download_url=""), "ksa CLI setup (downloads)")
    refused(tenant.method("ksa_compliance.zatca_cli.check_setup", zatca_cli_path="/bin/sh", java_home=""), "ksa CLI check (runs a binary)")
    refused(tenant.method(f"{ZL}.create_settings", company=company, server="Production"), "business: create the Phase 2 settings")
    refused(tenant.method(f"{ZL}.set_server", settings=name, server="Production"), "business: the environment")

    # The company's legal identity.
    refused(tenant.put("Company", company, {"tax_id": "399999999999993"}), "company VAT number (REST)")
    refused(tenant.method("frappe.client.set_value", doctype="Company", name=company, fieldname="bnd_commercial_registration", value="2020202020"), "company CR (frappe.client.set_value)")
    refused(tenant.put("Company", company, {"bnd_company_name_ar": "اسم آخر"}), "company name in Arabic")
    refused(tenant.put("Company", company, {"bnd_company_name_en": "Other"}), "company name in English")
    refused(tenant.method("frappe.client.rename_doc", doctype="Company", old_name=company, new_name=company + " 2"), "company rename")
    values = {"tax_id": "399999999999993", "phone_no": "0110000000"}
    refused(tenant.method(f"{ORG}.save_company", company=company, values=values), "business save_company with a VAT number")
    kept = tenant.method(f"{ORG}.save_company", company=company, values={**before, "phone_no": "0112345679"})
    check(kept.status_code == 200, "tenant still saves the company's other details (the locked ones unchanged)", kept.text[:200])

    # What stays with the tenant: the address (Phase 1, above).
    address = (message(tenant.get(f"/api/method/{ORG}.profile", company=company)) or {}).get("address") or {}
    if address.get("name"):
        check(tenant.put("Address", address["name"], {"address_line2": "مبنى 2"}).status_code == 200, "tenant edits the national address (REST)")

    # The platform owner's account and role.
    users = [row["name"] for row in message(tenant.get("/api/resource/User", limit_page_length=0)) or []]
    check(platform_user not in users and tenant_user in users, "the User list leaves the platform owner out")
    business_users = [row["name"] for row in (message(tenant.get("/api/method/bunood_business.api.admin.users")) or {}).get("users", [])]
    check(platform_user not in business_users and tenant_user in business_users, "the Users screen leaves the platform owner out")
    refused(tenant.get(f"/api/resource/User/{platform_user}"), "open the platform owner's record")
    refused(tenant.put("User", platform_user, {"enabled": 0}), "disable the platform owner")
    refused(tenant.method("frappe.client.set_value", doctype="User", name=platform_user, fieldname="mobile_no", value="+966500000000"), "edit the platform owner (set_value)")
    refused(tenant.method("frappe.core.doctype.user.user.generate_keys", user=platform_user), "the platform owner's API keys")
    refused(tenant.method("frappe.twofactor.reset_otp_secret", user=platform_user), "the platform owner's OTP secret")
    refused(tenant.method("frappe.core.doctype.user.user.impersonate", user=platform_user, reason="probe"), "impersonate the platform owner")
    refused(tenant.method("bunood_business.api.admin.set_password", user=platform_user, password="Lab-only-throwaway-9!"), "set the platform owner's password (business)")
    me = message(tenant.get(f"/api/resource/User/{tenant_user}"))
    roles = [{"role": row["role"]} for row in me.get("roles", [])] + [{"role": "Platform Owner"}]
    refused(tenant.put("User", tenant_user, {"roles": roles}), "grant oneself the Platform Owner role")
    refused(tenant.put("Role", "Platform Owner", {"two_factor_auth": 0}), "switch the role's two-factor off")
    refused(tenant.put("System Settings", "System Settings", {"enable_two_factor_auth": 0}), "switch two-factor sign-in off")
    reset = Client(args.url, args.host).method("frappe.core.doctype.user.user.reset_password", user=platform_user)
    check(reset.status_code == 200, "a password reset request for the platform owner gets Frappe's usual answer, and no email")

    overview = message(tenant.get(f"/api/method/{ZL}.overview", company=company)) or {}
    check(overview.get("platform_owner") is False and "settings" not in overview and "status" in overview, "the tenant's ZATCA screen: the status card only")

    # ── Administrator over HTTP is a tenant here ─────────────────────────────────
    if creds.get("admin"):
        admin = Client(args.url, args.host)
        check(admin.login("Administrator", creds["admin"]).status_code == 200, "Administrator signs in over HTTP")
        check(admin.put("Company", company, {"tax_id": "399999999999993"}).status_code == 403, "Administrator over HTTP refused: the VAT number")
        check(admin.method("frappe.core.doctype.user.user.impersonate", user=platform_user, reason="probe").status_code == 403, "Administrator over HTTP refused: impersonating the platform owner")
        check(admin.put(PHASE2, name, {"fatoora_server": "Production"}).status_code == 403, "Administrator over HTTP refused: Phase 2")

    # ── the request flow, end to end ─────────────────────────────────────────────
    upload = tenant.http.post(
        f"{tenant.url}/api/method/upload_file",
        files={"file": ("vat-certificate.pdf", _pdf(), "application/pdf")},
        data={"is_private": 1, "doctype": "Company", "docname": company, "folder": "Home/Attachments"},
    )
    file_url = (message(upload) or {}).get("file_url")
    check(bool(file_url), "tenant uploads the VAT certificate (private, on the company)")
    wanted = {**before, "bnd_commercial_registration": "1010999888"}
    sent = tenant.method(f"{ORG}.request_tax_details", company=company, values=wanted, file_url=file_url)
    check(sent.status_code == 200 and (message(sent) or {}).get("requests", [{}])[0].get("status") == "pending", "tenant's request is pending", sent.text[:300])
    pending = [r for r in (message(platform.get(f"/api/method/{ZL}.overview", company=company)) or {}).get("requests", []) if r["company"] == company]
    check(bool(pending), "the platform owner sees the request")
    todos = message(platform.get("/api/resource/ToDo", filters=[["allocated_to", "=", platform_user], ["reference_name", "=", company], ["status", "=", "Open"]], fields=["name"]))
    check(bool(todos), "a ToDo for the platform owner")
    refused(tenant.method(f"{ZL}.apply_request", request=pending[0]["id"] if pending else "x"), "apply a request")
    applied = platform.method(f"{ZL}.apply_request", request=pending[0]["id"], values=pending[0]["values"]) if pending else None
    check(bool(applied) and applied.status_code == 200, "the platform owner applies it («تطبيق»)", applied.text[:300] if applied is not None else "")
    after = message(tenant.get("/api/method/frappe.client.get_value", doctype="Company", filters={"name": company}, fieldname="bnd_commercial_registration"))
    check(after.get("bnd_commercial_registration") == "1010999888", "the company carries the applied CR")
    crn = message(platform.get(f"/api/resource/{PHASE2}/{name}")).get("other_ids", [])
    check(any(row.get("type_code") == "CRN" and row.get("value") == "1010999888" for row in crn), "the Phase 2 settings carry the applied CR")
    state = (message(tenant.get(f"/api/method/{ORG}.profile", company=company)) or {}).get("requests", [{}])[0].get("status")
    check(state == "applied", "the tenant sees it applied")

    # ── the platform owner, on everything the tenant was refused ─────────────────────
    check(platform.put(PHASE2, name, {"fatoora_server": "Simulation"}).status_code == 200, "platform owner changes Phase 2")
    platform.put(PHASE2, name, {"fatoora_server": "Sandbox"})
    onboard = platform.method(f"{KSA}.onboard", business_settings_id=name, otp="123456")
    check(onboard.status_code not in (401, 403), "platform owner reaches ksa's onboarding (it answers about its CLI, not a refusal)", f"HTTP {onboard.status_code}")
    check(platform.put("Company", company, {"bnd_company_name_en": before.get("bnd_company_name_en") or "Lab"}).status_code == 200, "platform owner changes the company's legal name")
    logs = message(platform.get("/api/resource/Notification Log", filters=[["for_user", "=", platform_user], ["subject", "like", "%Refused%"]], limit_page_length=500))
    check(len(logs or []) >= 10, "the refusals reached the platform owner as notifications", f"{len(logs or [])}")

    # Put back what the tenant changed in Role Permissions.
    for doctype in (PHASE2, EGS):
        for right in ("write", "create", "delete"):
            tenant.method("frappe.core.page.permission_manager.permission_manager.update", doctype=doctype, role="System Manager", permlevel=0, ptype=right, value=0)

    failed = sum(1 for ok, _ in RESULTS if not ok)
    print(f"{len(RESULTS) - failed}/{len(RESULTS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
