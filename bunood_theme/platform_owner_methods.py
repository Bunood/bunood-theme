"""The whitelisted methods only the platform owner may call (``override_whitelisted_methods``).

Each wrapper keeps the original's name, arguments and HTTP verbs, asks ``is_platform_owner`` first
and then calls the original, so the Desk's own buttons (ksa_compliance's form, Frappe's user form)
keep working for the platform owner and refuse everyone else with the same 403 the doc_events give.

ZATCA Phase 2 (ksa_compliance 0.61.7): onboarding with the OTP, the production CSID, a new settings
record mapped from an old one, revoking (``frappe.db.set_value``: no doc event would see it), the
compliance checks (queued as a job), and the CLI: ``zatca_cli.setup`` downloads the CLI and a JRE
into the site from any address the caller passes, and ``check_setup`` /
``check_validation_details_support`` run the binary at a path the caller passes, so they are the
platform owner's too. Read-only helpers (``fetch_company_addresses``, the customer query, the
integration status) stay open.

The platform owner's account (Frappe 16.36): API keys, a password-reset email or link, the OTP
secret, impersonation and a login link by email are refused (or, where Frappe answers every caller
the same way to hide who has an account, quietly not done) for a platform owner user, unless the
one asking is the platform owner. ``platform_owner.on_login`` refuses every sign-in into that
account that is not the password and the code, whatever started it.
"""

from __future__ import annotations

import frappe

from bunood_theme.platform_owner import holds_role, is_platform_owner, record_refusal, refuse

KSA_SETTINGS = "ksa_compliance.ksa_compliance.doctype.zatca_business_settings.zatca_business_settings"
USER = "frappe.core.doctype.user.user"
HERE = "bunood_theme.platform_owner_methods"

#: original dotted path → this module's wrapper (hooks.py reads it).
OVERRIDES = {
    f"{KSA_SETTINGS}.onboard": f"{HERE}.onboard",
    f"{KSA_SETTINGS}.get_production_csid": f"{HERE}.get_production_csid",
    f"{KSA_SETTINGS}.create_business_settings": f"{HERE}.create_business_settings",
    f"{KSA_SETTINGS}.revoke_business_settings": f"{HERE}.revoke_business_settings",
    "ksa_compliance.compliance_checks.perform_compliance_checks": f"{HERE}.perform_compliance_checks",
    "ksa_compliance.zatca_cli.setup": f"{HERE}.zatca_cli_setup",
    "ksa_compliance.zatca_cli.check_setup": f"{HERE}.zatca_cli_check_setup",
    "ksa_compliance.zatca_cli.check_validation_details_support": f"{HERE}.zatca_cli_check_validation_details_support",
    f"{USER}.generate_keys": f"{HERE}.generate_keys",
    f"{USER}.reset_password": f"{HERE}.reset_password",
    f"{USER}.update_password": f"{HERE}.update_password",
    f"{USER}.impersonate": f"{HERE}.impersonate",
    "frappe.twofactor.reset_otp_secret": f"{HERE}.reset_otp_secret",
    "frappe.www.login.send_login_link": f"{HERE}.send_login_link",
}

PHASE2_AR, PHASE2_EN = "إدارة الربط مع زاتكا (المرحلة الثانية)", "manage the ZATCA Phase 2 connection"


def _require(what_ar: str, what_en: str, doctype: str | None = None, name: str | None = None) -> None:
    if not is_platform_owner():
        refuse(what_ar, what_en, doctype, name)


def _ksa():
    from ksa_compliance.ksa_compliance.doctype.zatca_business_settings import zatca_business_settings

    return zatca_business_settings


# --- ZATCA Phase 2 ------------------------------------------------------------------------------------


@frappe.whitelist()
def onboard(business_settings_id: str, otp: str):
    _require(f"{PHASE2_AR}: الربط برمز OTP", f"{PHASE2_EN} (onboard with the OTP)", "ZATCA Business Settings", business_settings_id)
    return _ksa().onboard(business_settings_id=business_settings_id, otp=otp)


@frappe.whitelist()
def get_production_csid(business_settings_id: str, otp: str):
    _require(f"{PHASE2_AR}: شهادة الإنتاج", f"{PHASE2_EN} (get the production CSID)", "ZATCA Business Settings", business_settings_id)
    return _ksa().get_production_csid(business_settings_id=business_settings_id, otp=otp)


@frappe.whitelist()
def create_business_settings(source_name: str, target_doc=None):
    _require(f"{PHASE2_AR}: إعدادات جديدة", f"{PHASE2_EN} (create new settings)", "ZATCA Business Settings", source_name)
    return _ksa().create_business_settings(source_name=source_name, target_doc=target_doc)


@frappe.whitelist()
def revoke_business_settings(settings_id: str, company: str):
    _require(f"{PHASE2_AR}: إلغاء الشهادة", f"{PHASE2_EN} (revoke the CSID)", "ZATCA Business Settings", settings_id)
    return _ksa().revoke_business_settings(settings_id=settings_id, company=company)


@frappe.whitelist()
def perform_compliance_checks(
    business_settings_id: str,
    simplified_customer_id: str | None,
    standard_customer_id: str | None,
    item_id: str,
    tax_category_id: str,
):
    _require(f"{PHASE2_AR}: فحوص الامتثال", f"{PHASE2_EN} (run the compliance checks)", "ZATCA Business Settings", business_settings_id)
    from ksa_compliance.compliance_checks import perform_compliance_checks as original

    return original(
        business_settings_id=business_settings_id,
        simplified_customer_id=simplified_customer_id,
        standard_customer_id=standard_customer_id,
        item_id=item_id,
        tax_category_id=tax_category_id,
    )


@frappe.whitelist()
def zatca_cli_setup(override_cli_download_url: str | None, override_jre_download_url: str | None):
    _require(f"{PHASE2_AR}: تثبيت أداة زاتكا", f"{PHASE2_EN} (set up the ZATCA CLI)")
    from ksa_compliance.zatca_cli import setup as original

    return original(override_cli_download_url=override_cli_download_url, override_jre_download_url=override_jre_download_url)


@frappe.whitelist()
def zatca_cli_check_setup(zatca_cli_path: str, java_home: str | None):
    _require(f"{PHASE2_AR}: فحص أداة زاتكا", f"{PHASE2_EN} (check the ZATCA CLI)")
    from ksa_compliance.zatca_cli import check_setup as original

    return original(zatca_cli_path=zatca_cli_path, java_home=java_home)


@frappe.whitelist()
def zatca_cli_check_validation_details_support(zatca_cli_path: str, java_home: str | None) -> dict:
    _require(f"{PHASE2_AR}: فحص أداة زاتكا", f"{PHASE2_EN} (check the ZATCA CLI)")
    from ksa_compliance.zatca_cli import check_validation_details_support as original

    return original(zatca_cli_path=zatca_cli_path, java_home=java_home)


# --- the platform owner's account -------------------------------------------------------------------------


def _user_name(value: str | None) -> str | None:
    """A user as the sign-in pages name them: the record's name, or its email."""
    if not value:
        return None
    if frappe.db.exists("User", value):
        return value
    return frappe.db.get_value("User", {"email": value}, "name")


def _protected(user: str | None) -> bool:
    return bool(user) and holds_role(user) and not is_platform_owner()


@frappe.whitelist(methods=["POST"])
def generate_keys(user: str):
    if _protected(_user_name(user)):
        refuse("إنشاء مفاتيح API لحساب مالك المنصة", "generate API keys for the platform owner's account", "User", user)
    from frappe.core.doctype.user.user import generate_keys as original

    return original(user=user)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def reset_password(user: str) -> None:
    """Frappe answers every caller the same way here (no user enumeration); so does this. The
    reset email of a platform owner would go through the tenant's own mail, so it is not sent."""
    from frappe.core.doctype.user.user import reset_password as original

    target = _user_name(user)
    if _protected(target):
        record_refusal("طلب رابط إعادة تعيين كلمة مرور مالك المنصة", "request a password reset link for the platform owner", "User", target)
        # Frappe's own answer for an account it never emails (Administrator): the same message,
        # the same rate limit, nothing sent.
        return original(user="Administrator")
    return original(user=user)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def update_password(new_password: str, logout_all_sessions: int = 0, key: str | None = None, old_password: str | None = None):
    """A reset KEY for a platform owner is refused: the platform owner changes the password with
    the old one, or through the ops script on every site."""
    if key:
        from frappe.utils.data import sha256_hash

        target = frappe.db.get_value("User", {"reset_password_key": sha256_hash(key)}, "name")
        if _protected(target):
            refuse("تعيين كلمة مرور مالك المنصة برابط", "set the platform owner's password with a reset link", "User", target)
    from frappe.core.doctype.user.user import update_password as original

    return original(new_password=new_password, logout_all_sessions=logout_all_sessions, key=key, old_password=old_password)


@frappe.whitelist(methods=["POST"])
def impersonate(user: str, reason: str):
    if holds_role(_user_name(user)):
        refuse("الدخول باسم مالك المنصة (انتحال الهوية)", "impersonate the platform owner", "User", user)
    from frappe.core.doctype.user.user import impersonate as original

    return original(user=user, reason=reason)


@frappe.whitelist()
def reset_otp_secret(user: str):
    if _protected(_user_name(user)):
        refuse("إعادة تعيين التحقق بخطوتين لمالك المنصة", "reset the platform owner's two-factor secret", "User", user)
    from frappe.twofactor import reset_otp_secret as original

    return original(user=user)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def send_login_link(email: str):
    """A login link would skip the password and the code (and arrive through the tenant's mail):
    never for a platform owner. Quiet, as Frappe is for an unknown address."""
    target = _user_name(email)
    if target and holds_role(target):
        record_refusal("طلب رابط دخول لحساب مالك المنصة", "request a login link for the platform owner's account", "User", target)
        return None
    from frappe.www.login import send_login_link as original

    return original(email=email)
