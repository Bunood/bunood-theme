"""«مالك المنصة» — the platform owner, above every tenant's System Manager.

THE OWNER (2026-10-17): «اريد ان يكون معي مستخدم خاص بصاحب النظام بحيث يستطيع ان يدخل يدير الربط مع
زاتكا للمرحله الثانيه عن طريق صاحب النظام فقط. كمان تغيير الرقم الضريبي للشركه مايكون الا عن طريق
هذا المستخدم الخاص بصاحب النظام». One user, the same on every tenant site (bunood_erpnext's
``ops/platform_owner.py`` makes it), holds the ``Platform Owner`` role. Only that user:

- manages ZATCA Phase 2: ``ZATCA Business Settings`` and ``ZATCA EGS`` (insert, delete, any change);
- sets or changes the company's VAT number, its commercial registration and its legal names in
  Arabic and English (``Company`` fields, the company's own name, and Phase 1's VAT number, which may
  only ever repeat the company's own);
- grants, edits or removes the role and the users who hold it.

The national address and Phase 1 activation stay with the tenant.

WHO COUNTS (``is_platform_owner``)
    - a user holding the role;
    - Administrator, only with no HTTP request and outside a background job: bench console,
      migrate, install, a patch, the ops script. Over HTTP, Administrator is a TENANT here: the
      tenant may know that password. In a background job too: a job runs as whoever queued it, and
      Administrator queues the scheduler's jobs and anything Administrator started over HTTP (a Data
      Import, a scheduled Notification that sets a field), so a job is not the console.
      The platform owner works under their own named user, never Administrator, so nothing they do
      depends on this branch.
    - the framework's own passes: install, migrate, a patch (flags a request cannot set), and
      ksa_compliance's own background jobs (none of them writes these records today; the exemption
      keeps them working if one ever does).

THE LOCKS are server-side, so they hold against Role Permissions, the Desk, ``frappe.client.*`` and
the REST API alike: doc_events here, the wrapped whitelisted methods in
``platform_owner_methods.py``, a sign-in guard, and the User list's hiding. Every refusal answers in
Arabic first, then English, with a 403, and notifies the platform owner users (who tried what, when,
on which site). An allowed change is recorded by Frappe's own Version where the DocType tracks
changes, and by a Comment where it does not (Phase 1).

TESTS stand the locks aside under ``frappe.in_test`` unless a test asks for them
(``frappe.flags.bnd_enforce_platform_owner``), as ``invoice_rules`` does: other apps' suites create
companies and users freely. Production never runs in test mode.
"""

from __future__ import annotations

import datetime

import frappe
from frappe.model import display_fieldtypes, no_value_fields, numeric_fieldtypes, table_fields
from frappe.utils import cint, cstr, flt, get_fullname, now_datetime

ROLE = "Platform Owner"
ROLE_AR = "مالك المنصة"
PHASE2 = "ZATCA Business Settings"
EGS = "ZATCA EGS"
PHASE1 = "ZATCA Phase 1 Business Settings"
#: The company's legal identity: the VAT number, the commercial registration (ours, and ERPNext's
#: free-text registration details the print header falls back to), the legal names the documents
#: print, and the name itself (a rename moves it too, before_rename).
COMPANY_FIELDS = (
    "tax_id",
    "bnd_commercial_registration",
    "registration_details",
    "bnd_company_name_ar",
    "bnd_company_name_en",
    "company_name",
)
COMPANY_LABELS = {
    "tax_id": ("الرقم الضريبي", "the VAT number"),
    "bnd_commercial_registration": ("السجل التجاري", "the commercial registration"),
    "registration_details": ("السجل التجاري", "the commercial registration"),
    "bnd_company_name_ar": ("اسم الشركة بالعربية", "the company name in Arabic"),
    "bnd_company_name_en": ("اسم الشركة بالإنجليزية", "the company name in English"),
    "company_name": ("اسم الشركة", "the company name"),
}
#: System Settings that would switch the platform owner's second factor off, move its code to a
#: channel the tenant reads (email, SMS through the tenant's gateway), or lock password sign-in out.
SECURITY_SETTINGS = ("enable_two_factor_auth", "two_factor_method", "disable_user_pass_login")
TITLE = "مالك المنصة فقط · Platform owner only"
#: Field types that hold no value of their own.
SKIP_TYPES = frozenset(no_value_fields) | frozenset(display_fieldtypes)
STANDARD_USERS = ("Administrator", "Guest")
#: frappe.local keys for the refusals of this request, and whether any was written.
PENDING = "bnd_platform_refusals"
WRITTEN = "bnd_platform_refusals_written"


# --- who ------------------------------------------------------------------------------------------


def _enforced() -> bool:
    """The locks hold everywhere but another app's test run (see the module docstring)."""
    in_test = bool(getattr(frappe, "in_test", False) or frappe.flags.in_test)
    return not in_test or bool(frappe.flags.bnd_enforce_platform_owner)


def _in_request() -> bool:
    return getattr(frappe.local, "request", None) is not None


def _job():
    return getattr(frappe.local, "job", None)


def _system_context() -> bool:
    """The framework's own passes, not a person editing."""
    flags = frappe.flags
    if flags.in_install or flags.in_install_app or flags.in_install_db or flags.in_migrate or flags.in_patch or flags.in_uninstall:
        return True
    job = _job()
    return bool(job and cstr(job.get("method")).startswith("ksa_compliance."))


def holds_role(user: str | None) -> bool:
    """Whether this user record holds the role (Administrator and Guest never do: Frappe hands
    Administrator every role, so it is asked through ``is_platform_owner`` instead)."""
    if not user or user in STANDARD_USERS:
        return False
    return bool(frappe.db.exists("Has Role", {"parenttype": "User", "parent": user, "role": ROLE}))


def platform_users(enabled_only: bool = False) -> list[str]:
    """The users holding the role, on this site."""
    if not frappe.db.table_exists("Has Role"):
        return []
    names = sorted(
        set(frappe.get_all("Has Role", filters={"parenttype": "User", "role": ROLE}, pluck="parent"))
        - set(STANDARD_USERS)
    )
    if enabled_only and names:
        names = frappe.get_all("User", filters={"name": ["in", names], "enabled": 1}, pluck="name", order_by="name asc")
    return names


def is_platform_owner(user: str | None = None) -> bool:
    """Whether the one acting now (or ``user``) may do what only the platform owner does."""
    user = user or frappe.session.user
    if _system_context():
        return True
    if user == "Administrator":
        return not _in_request() and _job() is None
    return holds_role(user)


# --- refusing, and telling the platform owner -------------------------------------------------------


def refuse(what_ar: str, what_en: str, doctype: str | None = None, name: str | None = None):
    """Refuse with a 403, in Arabic first and then English, and notify the platform owner."""
    record_refusal(what_ar, what_en, doctype, name)
    frappe.throw(
        f"«{what_ar}» يتم عن طريق مالك المنصة فقط.<br>Only the platform owner can {what_en}.",
        frappe.PermissionError,
        title=TITLE,
    )


def record_refusal(what_ar: str, what_en: str, doctype: str | None = None, name: str | None = None) -> None:
    """Keep a refused attempt for the platform owner's notifications.

    The refusal rolls the request back, and a Notification Log written beside it would roll back
    with it. So it is written after the rollback (``after_rollback``: the request's own, or a
    background job's), and committed by ``after_request`` (a job commits its error log itself). A
    refusal that was never rolled back (a quiet refusal, or a caller that caught the error) is
    written by ``after_request`` the same way."""
    user = frappe.session.user if getattr(frappe.local, "session", None) else "Guest"
    payload = {
        "user": user,
        "full_name": get_fullname(user) if user else "",
        "what_ar": what_ar,
        "what_en": what_en,
        "doctype": doctype,
        "name": cstr(name) if name else None,
        "site": cstr(getattr(frappe.local, "site", "")),
        "when": now_datetime().strftime("%Y-%m-%d %H:%M:%S"),
        "ip": cstr(getattr(frappe.local, "request_ip", "")) if _in_request() else "",
    }
    pending = getattr(frappe.local, PENDING, None)
    if pending is None:
        pending = []
        setattr(frappe.local, PENDING, pending)
    pending.append(payload)
    if getattr(frappe.local, "db", None):
        frappe.db.after_rollback.add(write_refusals)


def write_refusals() -> int:
    """Write the pending refusals as Notification Logs to every enabled platform owner user."""
    pending = getattr(frappe.local, PENDING, None) or []
    written = 0
    while pending:
        payload = pending.pop(0)
        try:
            written += _notify(payload)
        except Exception:
            frappe.logger("bunood_theme").error("platform owner: a refusal could not be recorded", exc_info=True)
    if written:
        setattr(frappe.local, WRITTEN, True)
    return written


def _notify(payload: dict) -> int:
    users = platform_users(enabled_only=True)
    if not users:
        return 0
    who = payload.get("full_name") or payload.get("user") or "Guest"
    where = f" ({payload['doctype']}{' · ' + payload['name'] if payload.get('name') else ''})" if payload.get("doctype") else ""
    subject = (
        f"محاولة مرفوضة: {who} حاول «{payload['what_ar']}»{where} على {payload['site']} في {payload['when']}"
        f" · Refused: {who} tried to {payload['what_en']}{where} on {payload['site']} at {payload['when']}"
    )
    content = "<br>".join(
        frappe.utils.escape_html(line)
        for line in (
            f"المستخدم: {payload.get('user')} ({who})",
            f"المحاولة: {payload['what_ar']} · {payload['what_en']}",
            f"المستند: {payload.get('doctype') or '—'} {payload.get('name') or ''}",
            f"الموقع: {payload['site']}",
            f"الوقت: {payload['when']}",
            f"العنوان: {payload.get('ip') or '—'}",
        )
    )
    from_user = payload.get("user") if frappe.db.exists("User", payload.get("user")) else None
    for user in users:
        doc = frappe.new_doc("Notification Log")
        doc.update(
            {
                "for_user": user,
                "from_user": from_user,
                "type": "Alert",
                "subject": subject[:1000],
                "email_content": content,
            }
        )
        if payload.get("doctype") and payload.get("name") and frappe.db.exists(payload["doctype"], payload["name"]):
            doc.document_type, doc.document_name = payload["doctype"], payload["name"]
        doc.insert(ignore_permissions=True)
    return len(users)


def after_request(response=None, request=None) -> None:
    """``after_request``: write what this request refused and commit it.

    Runs after Frappe has committed a successful POST or rolled the request back, so the only rows
    left to commit are these notifications. A refusal still pending here was never rolled back (a
    quiet refusal, or one caught on the way): roll the request back first, as Frappe would for a
    failed or a GET request, so nothing else rides on this commit."""
    if getattr(frappe.local, PENDING, None):
        frappe.db.rollback()
        write_refusals()
    if getattr(frappe.local, WRITTEN, False):
        setattr(frappe.local, WRITTEN, False)
        frappe.db.commit()


# --- comparing a document with what it was --------------------------------------------------------------


def _norm(df, value):
    if value is None or value == "":
        return ""
    if df is not None and df.fieldtype in numeric_fieldtypes:
        number = flt(value)
        return "" if not number else repr(number)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time, datetime.timedelta)):
        return str(value)
    return cstr(value).strip()


def _rows(rows, child_doctype: str) -> list[tuple]:
    meta = frappe.get_meta(child_doctype)
    fields = [df for df in meta.fields if df.fieldtype not in SKIP_TYPES]
    return [tuple(_norm(df, row.get(df.fieldname)) for df in fields) for row in rows or []]


def changed_fields(doc, fields: list[str] | tuple[str, ...] | None = None, before=None) -> list[str]:
    """The fields whose value differs from the saved document (every value field, child tables
    included, by default). A new document is compared with nothing: every field it fills counts."""
    if before is None and not doc.is_new():
        before = doc.get_doc_before_save()
    meta = doc.meta
    names = list(fields) if fields else [df.fieldname for df in meta.fields if df.fieldtype not in SKIP_TYPES or df.fieldtype in table_fields]
    changed = []
    for fieldname in names:
        df = meta.get_field(fieldname)
        if df is None:
            continue
        if df.fieldtype in table_fields:
            old = _rows(before.get(fieldname) if before else [], df.options)
            if _rows(doc.get(fieldname), df.options) != old:
                changed.append(fieldname)
            continue
        old = _norm(df, before.get(fieldname)) if before else ""
        if _norm(df, doc.get(fieldname)) != old:
            changed.append(fieldname)
    return changed


def _labels(fields: list[str]) -> tuple[str, str]:
    ar = "، ".join(dict.fromkeys(COMPANY_LABELS.get(f, (f, f))[0] for f in fields))
    en = ", ".join(dict.fromkeys(COMPANY_LABELS.get(f, (f, f))[1] for f in fields))
    return ar, en


# --- ZATCA Phase 2 and its devices --------------------------------------------------------------------


def guard_zatca_record(doc, method=None, *args, **kwargs) -> None:
    """``ZATCA Business Settings`` and ``ZATCA EGS``: insert, delete, rename and any change.

    Registered on before_insert, before_validate, on_update (before_validate runs even under
    ``flags.ignore_validate``, and on_update sees the record as saved), on_trash and
    before_rename."""
    if not _enforced() or is_platform_owner():
        return
    kind_ar, kind_en = ("إعدادات زاتكا للمرحلة الثانية", "the ZATCA Phase 2 settings") if doc.doctype == PHASE2 else ("أجهزة زاتكا (EGS)", "the ZATCA devices (EGS)")
    if method == "on_trash":
        refuse(f"حذف {kind_ar}", f"delete {kind_en}", doc.doctype, doc.name)
    if method == "before_rename":
        refuse(f"إعادة تسمية {kind_ar}", f"rename {kind_en}", doc.doctype, doc.name)
    if method == "before_insert" or doc.is_new():
        refuse(f"إنشاء {kind_ar}", f"create {kind_en}", doc.doctype, None)
    changed = changed_fields(doc)
    if changed:
        refuse(f"تعديل {kind_ar}", f"change {kind_en} ({', '.join(changed)})", doc.doctype, doc.name)


# --- ZATCA Phase 1: activation is the tenant's, the VAT number is not ----------------------------------


def guard_phase1(doc, method=None, *args, **kwargs) -> None:
    """Phase 1's VAT number may only ever be the company's own (``Company.tax_id``, which only the
    platform owner sets): activating, switching off, the address and the invoice types stay with the
    tenant; typing another number does not. Phase 1 has no seller name of its own."""
    if not _enforced() or is_platform_owner():
        return
    before = None if doc.is_new() else doc.get_doc_before_save()
    new = cstr(doc.get("vat_registration_number")).strip()
    old = cstr(before.get("vat_registration_number")).strip() if before else ""
    moved = bool(before and before.get("company") != doc.get("company"))
    if new == old and not moved:
        return
    company_vat = cstr(frappe.db.get_value("Company", doc.get("company"), "tax_id")).strip() if doc.get("company") else ""
    if new != company_vat:
        refuse(
            "تغيير الرقم الضريبي في إعدادات زاتكا للمرحلة الأولى",
            "change the VAT number in the ZATCA Phase 1 settings (it is always the company's own)",
            doc.doctype,
            doc.name,
        )


def audit_phase1(doc, method=None, *args, **kwargs) -> None:
    """Phase 1 does not track changes, so an allowed change of its VAT number is a Comment:
    old → new, by whom, when."""
    before = doc.get_doc_before_save()
    if not before:
        return
    old, new = cstr(before.get("vat_registration_number")).strip(), cstr(doc.get("vat_registration_number")).strip()
    if old == new:
        return
    doc.add_comment(
        "Info",
        frappe.utils.escape_html(
            f"الرقم الضريبي (المرحلة الأولى): {old or '—'} ← {new or '—'} · VAT number (Phase 1): {old or '—'} → {new or '—'}"
            f" · {frappe.session.user} · {now_datetime().strftime('%Y-%m-%d %H:%M:%S')}"
        ),
    )


# --- the company's legal identity ---------------------------------------------------------------------


def guard_company(doc, method=None, *args, **kwargs) -> None:
    """The VAT number, the CR, the legal names and the name: never set, changed or cleared by a
    tenant, not even on a new company (a tenant still creates a company, without them)."""
    if not _enforced() or is_platform_owner():
        return
    if method == "before_rename":
        refuse("إعادة تسمية الشركة", "rename the company", doc.doctype, doc.name)
    fields = [f for f in COMPANY_FIELDS if doc.meta.has_field(f)]
    changed = changed_fields(doc, fields)
    if doc.is_new() or method == "before_insert":
        # Creating a company names it; that much is the tenant's.
        changed = [f for f in changed if f != "company_name"]
    if changed:
        ar, en = _labels(changed)
        refuse(f"تعديل {ar}", f"set or change {en}", doc.doctype, None if doc.is_new() else doc.name)


# --- the role and the users who hold it ---------------------------------------------------------------


def _roles_of(doc) -> set[str]:
    return {row.role for row in (doc.get("roles") or [])}


def guard_user(doc, method=None, *args, **kwargs) -> None:
    """A tenant never grants or removes the role, and never edits, disables, renames, deletes or
    sets the password of a user who holds it (any field, so the email, the API keys, the sign-in
    restrictions and the roles too)."""
    if not _enforced() or is_platform_owner():
        return
    if method in ("on_trash", "before_rename"):
        if holds_role(doc.name):
            if method == "on_trash":
                refuse("حذف حساب مالك المنصة", "delete the platform owner's account", "User", doc.name)
            refuse("إعادة تسمية حساب مالك المنصة", "rename the platform owner's account (its email)", "User", doc.name)
        return
    before = None if doc.is_new() else doc.get_doc_before_save()
    had = ROLE in _roles_of(before) if before else False
    has = ROLE in _roles_of(doc)
    if has and not had:
        refuse("منح دور مالك المنصة", "grant the Platform Owner role", "User", None if doc.is_new() else doc.name)
    if had and not has:
        refuse("سحب دور مالك المنصة", "take the Platform Owner role away", "User", doc.name)
    if not had:
        return
    if getattr(doc, "_User__new_password", None) or doc.get("new_password"):
        refuse("تعيين كلمة مرور مالك المنصة", "set the platform owner's password", "User", doc.name)
    changed = changed_fields(doc, before=before)
    if changed:
        refuse("تعديل حساب مالك المنصة", f"change the platform owner's account ({', '.join(changed)})", "User", doc.name)


def guard_role(doc, method=None, *args, **kwargs) -> None:
    """The ``Platform Owner`` role record itself: its two-factor switch, its desk access, its name."""
    if doc.name != ROLE and cstr(doc.get("role_name")) != ROLE:
        return
    if not _enforced() or is_platform_owner():
        return
    if method == "on_trash":
        refuse("حذف دور مالك المنصة", "delete the Platform Owner role", "Role", doc.name)
    if method == "before_rename":
        refuse("إعادة تسمية دور مالك المنصة", "rename the Platform Owner role", "Role", doc.name)
    if doc.is_new() or changed_fields(doc):
        refuse("تعديل دور مالك المنصة", "change the Platform Owner role", "Role", None if doc.is_new() else doc.name)


def guard_role_profile(doc, method=None, *args, **kwargs) -> None:
    """A job (Role Profile) that holds the role would grant it to every holder: tenants never put it
    in one, take it out of one, or change or delete one that holds it."""
    if not _enforced() or is_platform_owner():
        return
    before = None if doc.is_new() else doc.get_doc_before_save()
    involved = ROLE in _roles_of(doc) or (before is not None and ROLE in _roles_of(before))
    if method == "on_trash":
        involved = ROLE in _roles_of(doc)
        if involved:
            refuse("حذف وظيفة تحمل دور مالك المنصة", "delete a job that holds the Platform Owner role", "Role Profile", doc.name)
        return
    if involved and (doc.is_new() or changed_fields(doc, before=before)):
        refuse("منح دور مالك المنصة عبر وظيفة", "put the Platform Owner role in a job", "Role Profile", None if doc.is_new() else doc.name)


def guard_user_permission(doc, method=None, *args, **kwargs) -> None:
    """Restricting the platform owner to a company or a branch is the platform owner's business."""
    if not _enforced() or is_platform_owner():
        return
    users = {doc.get("user")}
    before = None if doc.is_new() else doc.get_doc_before_save()
    if before:
        users.add(before.get("user"))
    if any(holds_role(user) for user in users if user):
        refuse("تقييد حساب مالك المنصة", "restrict the platform owner's account", "User Permission", None if doc.is_new() else doc.name)


def guard_system_settings(doc, method=None, *args, **kwargs) -> None:
    """While a platform owner exists, a tenant does not switch two-factor sign-in off, move its code
    to email or SMS (channels the tenant reads), or switch password sign-in off (a lock-out)."""
    if not _enforced() or is_platform_owner() or not platform_users():
        return
    before = doc.get_doc_before_save()
    if not before:
        return
    if cint(before.get("enable_two_factor_auth")) and not cint(doc.get("enable_two_factor_auth")):
        refuse("إيقاف التحقق بخطوتين", "switch two-factor sign-in off", "System Settings", "System Settings")
    if cint(before.get("enable_two_factor_auth")) and cstr(before.get("two_factor_method")) != cstr(doc.get("two_factor_method")):
        refuse("تغيير طريقة التحقق بخطوتين", "change the two-factor method", "System Settings", "System Settings")
    if not cint(before.get("disable_user_pass_login")) and cint(doc.get("disable_user_pass_login")):
        refuse("إيقاف الدخول بكلمة المرور", "switch password sign-in off", "System Settings", "System Settings")


# --- the User list ----------------------------------------------------------------------------------------


def user_query_conditions(user: str | None = None, doctype: str | None = None) -> str:
    """``permission_query_conditions`` for User: a non-platform reader's lists, link searches,
    assignment and share pickers leave the platform owner users out. A literal name list (never a
    subquery): the role has one or two holders."""
    if is_platform_owner(user):
        return ""
    hidden = platform_users()
    if not hidden:
        return ""
    return "(`tabUser`.`name` not in ({}))".format(", ".join(frappe.db.escape(name) for name in hidden))


def user_has_permission(doc, ptype=None, user=None, debug=False) -> bool:
    """``has_permission`` for User: a non-platform reader cannot open a platform owner's record.
    (Controller hooks only deny: True leaves Frappe's own answer standing.)"""
    name = doc if isinstance(doc, str) else getattr(doc, "name", None)
    if not name or not holds_role(name):
        return True
    return is_platform_owner(user)


# --- signing in ---------------------------------------------------------------------------------------------


def before_login(login_manager=None) -> None:
    """``before_login`` runs only on the password sign-in (``LoginManager.login``)."""
    frappe.flags.bnd_password_login = True


def on_login(login_manager=None) -> None:
    """A platform owner signs in over HTTP only with the password AND the second factor.

    Every other way Frappe signs someone in goes through ``login_as`` and lands here without
    ``before_login``: impersonation, a login link by email, a password-reset link, a social or LDAP
    login. Each of those is something a tenant's System Manager can arrange (an email the site
    sends, an OAuth client the tenant configures), so none of them opens a platform owner session.
    Frappe's password path has already checked the code when it reaches here; a site where the
    second factor is not in force refuses the sign-in instead of letting the password alone in."""
    user = getattr(login_manager, "user", None)
    if not _enforced() or not _in_request() or not holds_role(user):
        return
    from frappe.twofactor import two_factor_is_enabled

    if not frappe.flags.bnd_password_login:
        _refuse_sign_in(user, "الدخول إلى حساب مالك المنصة بغير كلمة المرور والرمز", "sign in to the platform owner's account without the password and the code")
    if not two_factor_is_enabled(user=user):
        _refuse_sign_in(user, "الدخول إلى حساب مالك المنصة دون التحقق بخطوتين", "sign in to the platform owner's account while two-factor sign-in is off")


def _refuse_sign_in(user: str, what_ar: str, what_en: str):
    record_refusal(what_ar, what_en, "User", user)
    frappe.throw(
        f"«{what_ar}» غير مسموح.<br>Not allowed: {what_en}.",
        frappe.AuthenticationError,
        title=TITLE,
    )


# --- the role, created by the installer ------------------------------------------------------------------


def ensure_role() -> bool:
    """Create the role, or hold it to its contract: desk access and two-factor sign-in on.

    Unlike the theme's marker roles (``roles.py``), an existing record is corrected, not respected:
    the role's second factor is part of what it is. Runs from install, migrate and the ops script,
    which are the platform owner's (``is_platform_owner``)."""
    if not frappe.db.exists("DocType", "Role"):
        return False
    if not frappe.db.exists("Role", ROLE):
        frappe.get_doc(
            {"doctype": "Role", "role_name": ROLE, "desk_access": 1, "two_factor_auth": 1, "is_custom": 1}
        ).insert(ignore_permissions=True)
        frappe.clear_cache()
        return True
    row = frappe.db.get_value("Role", ROLE, ["desk_access", "two_factor_auth", "disabled"], as_dict=True)
    if not (cint(row.desk_access) and cint(row.two_factor_auth)) or cint(row.disabled):
        role = frappe.get_doc("Role", ROLE)
        role.desk_access, role.two_factor_auth, role.disabled = 1, 1, 0
        role.save(ignore_permissions=True)
        frappe.clear_cache()
        return True
    return False


# --- permissions: defence in depth (the guards above are the lock) --------------------------------------

#: The rights a Custom DocPerm row carries, from pos_permissions (one list).
READ_ONLY = frozenset({"select", "read", "report", "print", "export"})
FULL = frozenset({"select", "read", "write", "create", "delete", "report", "print", "email", "export", "share", "import"})
#: Per DocType: the Platform Owner's rights, and the roles a tenant holds that keep READ only.
ZATCA_PERMISSIONS = {
    PHASE2: (FULL, ("System Manager",)),
    EGS: (FULL, ("System Manager",)),
    PHASE1: (FULL, ()),
    "ZATCA Integration Log": (READ_ONLY, ()),
}


def ensure_zatca_permissions() -> list[str]:
    """Give the role its rows on the ZATCA DocTypes, and leave the tenant's System Manager READ only
    on Phase 2 and the devices. Once per DocType: a DocType that already has a Platform Owner row is
    left as it stands (a later choice holds). Standard rows are copied first, so no other role loses
    the DocType (pos_permissions' lesson). The Desk then offers no Save to a tenant; the doc_events
    are what refuses one anyway."""
    from bunood_theme.pos_permissions import STANDARD_RIGHTS, _seed_standard_permissions

    if not frappe.db.exists("DocType", "Custom DocPerm"):
        return []
    ensure_role()
    done = []
    for doctype, (rights, read_only_roles) in ZATCA_PERMISSIONS.items():
        if not frappe.db.exists("DocType", doctype):
            continue
        if frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": ROLE}):
            continue
        _seed_standard_permissions(doctype)
        for name in frappe.get_all("Custom DocPerm", filters={"parent": doctype, "role": ["in", list(read_only_roles) or [""]]}, pluck="name"):
            frappe.db.set_value("Custom DocPerm", name, {right: int(right in READ_ONLY) for right in STANDARD_RIGHTS}, update_modified=False)
        perm = frappe.new_doc("Custom DocPerm")
        perm.update({"parent": doctype, "role": ROLE, "permlevel": 0, "if_owner": 0})
        perm.update({right: int(right in rights) for right in STANDARD_RIGHTS})
        perm.insert(ignore_permissions=True)
        done.append(doctype)
    if done:
        frappe.clear_cache()
    return done


def install() -> None:
    """after_install and after_migrate: the role, then its ZATCA rows where ksa_compliance is."""
    try:
        ensure_role()
        ensure_zatca_permissions()
    except Exception:
        frappe.log_error("bunood_theme: platform owner setup failed")
