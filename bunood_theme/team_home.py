"""Read-only team Home dashboard over native, permission-filtered ERP documents.

No cache, bootstrap, preference writes or accounting mutations. A missing,
forbidden or failed source is unavailable, never an invented zero.
"""
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from bunood_theme.home_scope import ALL_COMPANIES, HOME_PERIODS, HOME_VIEWS, default_view, period_bounds
from bunood_theme.home_metrics import base_outstanding, build_home_kpis, home_metric_contract

PERIOD_LABELS = dict(zip(HOME_PERIODS, ("Today", "Last 7 days", "Month to date", "Last 30 days", "All time")))
ROW_CAP = 10000
COMPANY_CAP = 50


def _can(doctype):
    return bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read"))


def _rows(doctype, filters, fields, errors):
    from bunood_theme.accounting_desk import read_native_rows
    return read_native_rows(doctype, errors, filters=filters, fields=fields)


def _count(doctype, filters, errors):
    rows = _rows(doctype, filters, ["name"], errors)
    return len(rows) if rows is not None else None


def _scope(company, period, sales_person, view):
    for value in (company, period, sales_person, view):
        if value is not None and not isinstance(value, str):
            frappe.throw(_("Unsupported dashboard scope"), frappe.ValidationError)
    if period and period not in HOME_PERIODS:
        frappe.throw(_("Unsupported dashboard period"), frappe.ValidationError)
    if view and view not in HOME_VIEWS:
        frappe.throw(_("Dashboard view is not available for this role"), frappe.PermissionError)
    errors = []
    companies = _rows("Company", {}, ["name", "default_currency"], errors) or []
    allowed = {row["name"]: row for row in companies}
    owned = frappe.defaults.get_defaults_for(frappe.session.user)
    saved_company = frappe.defaults.get_user_default("bnd_home_company", user=frappe.session.user) if "bnd_home_company" in owned else None
    saved_period = frappe.defaults.get_user_default("bnd_home_period", user=frappe.session.user) if "bnd_home_period" in owned else None
    saved_person = frappe.defaults.get_user_default("bnd_home_sales_person", user=frappe.session.user) if "bnd_home_sales_person" in owned else None
    saved_view = frappe.defaults.get_user_default("bnd_home_view", user=frappe.session.user) if "bnd_home_view" in owned else None
    selected = company if company is not None else saved_company or frappe.defaults.get_user_default("Company")
    if company and company != ALL_COMPANIES and company not in allowed:
        frappe.throw(_("Company is not available for this dashboard"), frappe.PermissionError)
    if selected != ALL_COMPANIES and selected not in allowed:
        selected = next(iter(allowed), "")
    if selected and selected != ALL_COMPANIES:
        frappe.get_doc("Company", selected).check_permission("read")
    people = _rows("Sales Person", {"enabled": 1}, ["name"], errors) or []
    names = [row["name"] for row in people]
    if sales_person and sales_person not in names:
        frappe.throw(_("Sales person is not available for this dashboard"), frappe.PermissionError)
    views = ["overview"]
    if any(_can(dt) for dt in ("Journal Entry", "GL Entry", "Account", "Payment Entry")):
        views.append("accountant")
    if any(_can(dt) for dt in ("Sales Order", "Quotation")):
        views.append("sales")
    if _can("Sales Invoice"):
        views.append("collections")
    if _can("POS Profile") and any(_can(dt) for dt in ("POS Invoice", "Sales Invoice")):
        views.append("cashier")
    if view and view not in views:
        frappe.throw(_("Dashboard view is not available for this role"), frappe.PermissionError)
    preferred = default_view(set(frappe.get_roles()), set(views), administrator=frappe.session.user == "Administrator")
    selected_view = view or (saved_view if saved_view in views else preferred)
    selected_person = sales_person if sales_person is not None else saved_person
    selected_period = period or (saved_period if saved_period in HOME_PERIODS else "month_to_date")
    return companies, {"company": selected, "companies": list(allowed), "period": selected_period,
                       "sales_person": "" if selected_view in ("accountant", "cashier") or selected_person not in names else selected_person, "sales_people": names,
                       "view": selected_view, "default_view": preferred, "views": views}, errors


def _sum_outstanding(rows, currency, errors, doctype):
    if rows is None:
        return None
    try:
        return sum(base_outstanding(row, currency) for row in rows)
    except (ValueError, TypeError):
        if doctype not in errors:
            errors.append(doctype)
        return None


def _stock_attention(company, errors):
    """Missing Bin is zero only with a complete native permission scope."""
    empty = {"key":"stock_below_reorder","label":"Stock below reorder","doctype":"Item","filters":{"name":["in",["__none__"]]},"count":None,"amount":None,"available":False}
    try:
        from frappe.model.db_query import DatabaseQuery
        from frappe.model import get_permitted_fields
        from bunood_theme.home_metrics import stock_reorder_names
        for doctype in ("Warehouse","Bin"):
            if not _can(doctype) or DatabaseQuery(doctype,user=frappe.session.user).build_match_conditions():
                return empty
        items=_rows("Item",{"disabled":0,"is_stock_item":1},["name"],errors)
        warehouses=_rows("Warehouse",{"company":company,"disabled":0},["name","parent_warehouse","is_group"],errors)
        if items is None or warehouses is None or len(items)>1000:
            return empty
        meta=frappe.get_meta("Item")
        table=meta.get_field("reorder_levels")
        child_fields={"parent","warehouse","warehouse_group","warehouse_reorder_level","warehouse_reorder_qty"}
        if not table or table.permlevel not in meta.get_permlevel_access("read") or not child_fields <= set(get_permitted_fields("Item Reorder",parenttype="Item",permission_type="read")):
            return empty
        bins=_rows("Bin",{"warehouse":["in",[r["name"] for r in warehouses] or ["__none__"]],"item_code":["in",[r["name"] for r in items] or ["__none__"]]},["name","item_code","warehouse","projected_qty"],errors)
        if bins is None:
            return empty
        levels=[]
        for row in items:
            item=frappe.get_doc("Item",row["name"])
            item.check_permission("read")
            levels.extend({key:level.get(key) for key in child_fields} for level in item.get("reorder_levels",[]))
            if len(levels)>ROW_CAP:
                return empty
        names=stock_reorder_names(levels,warehouses,bins)
        return {**empty,"filters":{"name":["in",names or ["__none__"]]},"count":len(names),"available":True}
    except Exception:
        if "Stock reorder" not in errors:
            errors.append("Stock reorder")
        return empty


def _zatca_attention(company, team_filter, errors):
    invoices=_rows("Sales Invoice",{"company":company,"docstatus":1,**team_filter},["name"],errors)
    filters={"invoice_doctype":"Sales Invoice","invoice_reference":["in",[row["name"] for row in invoices or []] or ["__none__"]],"status":["in",["Rejected","Resend"]]}
    count=_count("ZATCA Integration Log",filters,errors) if invoices is not None else None
    return {"key":"zatca_exceptions","label":"VAT and ZATCA exceptions","doctype":"ZATCA Integration Log","filters":filters,"count":count,"amount":None,"available":count is not None}


def _record_fact(doctype, filters, errors):
    available=bool(frappe.db.exists("DocType",doctype))
    can_read=_can(doctype)
    rows=_rows(doctype,filters,["name"],errors) if can_read else None
    return {"available":available,"can_read":can_read,"exists":bool(rows),"query_error":can_read and rows is None,
            "can_create":available and bool(frappe.has_permission(doctype,"create")),
            "can_change":available and bool(frappe.has_permission(doctype,"write") or frappe.has_permission(doctype,"create")),
            "route":["List",doctype,filters] if can_read and rows is not None else []}


def _combined_fact(*facts, route=None, require_all=True):
    return {"available":all(f["available"] for f in facts),"can_read":all(f["can_read"] for f in facts),
            "exists":all(f["exists"] for f in facts) if require_all else any(f["exists"] for f in facts),
            "query_error":any(f.get("query_error") for f in facts),"can_change":any(f.get("can_change") for f in facts),"route":route or []}


def _observations(company, today, errors):
    """Native observations only; never create readiness work or launch decisions."""
    from bunood_theme.start_readiness import derive_start_readiness
    from bunood_theme.launch_readiness import derive_launch_readiness
    company_filter={"company":company} if company else {"name":["=","__none__"]}
    fact=lambda dt,filters: _record_fact(dt,filters,errors)
    sales_filter={**company_filter,"docstatus":1,"posting_date":["<=",today.isoformat()]}
    payment_filter={**company_filter,"docstatus":1,"payment_type":"Receive","posting_date":["<=",today.isoformat()]}
    first={"company":fact("Company",{"name":company or "__none__"}),"customer":fact("Customer",{"disabled":0}),
           "item":fact("Item",{"disabled":0}),"invoice":fact("Sales Invoice",sales_filter),"payment":fact("Payment Entry",payment_filter)}
    start=derive_start_readiness(first)
    for step in start["steps"]:
        if step["state"] not in ("blocked","waiting"):
            step["route"]=first[step["key"]]["route"]
    identity=_rows("Company",{"name":company or "__none__"},["name","default_currency","country"],errors)
    company_fact={**first["company"],"exists":bool(identity and identity[0]["default_currency"] and identity[0]["country"]),"query_error":first["company"]["can_read"] and identity is None}
    facts={"company":company_fact,
           "accounting":_combined_fact(fact("Account",{**company_filter,"is_group":0,"disabled":0}),fact("Cost Center",{**company_filter,"is_group":0,"disabled":0}),route=["List","Account",company_filter]),
           "stock":fact("Warehouse",{**company_filter,"is_group":0,"disabled":0}),
           "commercial":_combined_fact(first["item"],fact("Price List",{"selling":1,"enabled":1}),route=["List","Price List",{"selling":1,"enabled":1}]),
           "parties":_combined_fact(first["customer"],fact("Supplier",{"disabled":0}),route=["List","Customer"]),
           "payments":_combined_fact(fact("Mode of Payment",{"enabled":1}),fact("POS Profile",{**company_filter,"disabled":0}),require_all=False,route=["List","Mode of Payment"]),
           "access":fact("User",{"enabled":1,"user_type":"System User"}),
           "output":fact("Print Format",{"doc_type":"Sales Invoice"}),
           "operations":{"available":True,"can_read":True,"exists":False},
           "integrations":{"available":True,"can_read":True,"exists":False},
           "first_transaction":_combined_fact(first["invoice"],first["payment"],route=["List","Sales Invoice",sales_filter])}
    tax=fact("Sales Taxes and Charges Template",company_filter)
    zatca={"available":True,"can_read":False,"can_change":False,"exists":False,"query_error":False}
    # The unsaved-invoice facade requires both permissions. A caught
    # frappe.throw still queues a client dialog, so denied optional evidence
    # must remain unavailable without invoking that facade in the first place.
    if company and _can("Sales Invoice") and frappe.has_permission("Sales Invoice", "create"):
        try:
            from bunood_theme.zatca.status import get_invoice_status
            status=get_invoice_status(company=company)
            route=(status.get("settings") or {}).get("route") or []
            zatca.update(can_read=True,exists=status.get("state")=="ready",route=route)
        except frappe.PermissionError:
            pass
        except Exception:
            zatca.update(can_read=True,query_error=True)
    facts["tax_zatca"]=_combined_fact(tax,zatca,route=zatca.get("route") or tax.get("route"))
    return start,derive_launch_readiness(facts)
def _cashier(company, start, today, errors):
    from bunood_theme.pos import HELD_FIELD, _invoice_type
    sources, recent, held = [], [], []
    daily_count = daily_amount = returns = 0
    available = True
    for dt in ("POS Invoice", "Sales Invoice"):
        if not _can(dt):
            continue
        filters = {"company": company, "docstatus": 1, "is_pos": 1,
                   "posting_date": ["between", [start.isoformat(), today.isoformat()]] if start else ["<=", today.isoformat()]}
        if dt == "Sales Invoice" and frappe.get_meta(dt).has_field("is_consolidated"):
            filters["is_consolidated"] = 0
        rows = _rows(dt, filters, ["name", "posting_date", "modified", "base_grand_total", "is_return"], errors)
        sources.append({"doctype": dt, "filters": filters, "count": len(rows) if rows is not None else None,
                        "amount": sum(float(r["base_grand_total"] or 0) for r in rows) if rows is not None else None})
        if rows is None:
            available = False
        else:
            for row in rows:
                if getdate(row["posting_date"]) == today:
                    if row["is_return"]:
                        returns += 1
                    else:
                        daily_count += 1
                        daily_amount += float(row["base_grand_total"] or 0)
                recent.append({"doctype": dt, "name": row["name"], "posting_date": str(row["posting_date"]),
                               "modified": str(row["modified"]), "amount": float(row["base_grand_total"] or 0), "is_return": bool(row["is_return"])})
        if frappe.get_meta(dt).has_field(HELD_FIELD):
            held_filters = {"company": company, "docstatus": 0, "is_pos": 1, HELD_FIELD: 1, "owner": frappe.session.user}
            held.append({"doctype": dt, "filters": held_filters, "count": _count(dt, held_filters, errors)})
    profiles, shift = [], {"state": "unavailable", "name": "", "profile": ""}
    profile_state = "unavailable"
    try:
        profile_rows = _rows("POS Profile", {"company":company,"disabled":0}, ["name"], errors)
        for row in profile_rows or []:
            doc=frappe.get_doc("POS Profile",row["name"])
            doc.check_permission("read")
            assigned=[r.user for r in doc.get("applicable_for_users",[]) if r.user]
            if not assigned or frappe.session.user in assigned:
                profiles.append(row)
        if profile_rows is not None:
            profile_state = "assigned" if profiles else "unassigned"
        entries = _rows("POS Opening Entry",{"company":company,"user":frappe.session.user,"docstatus":1,"pos_closing_entry":["in",["",None]]},["name","pos_profile","period_start_date"],errors)
        if entries is not None:
            shift["state"] = "needs_opening"
            if entries:
                row = max(entries,key=lambda r:str(r["period_start_date"]))
                shift = {"state": "open" if getdate(row["period_start_date"]) == today else "stale", "name": row["name"], "profile": row["pos_profile"]}
    except Exception:
        errors.append("POS Profile")
    valid = available and bool(sources)
    return {"available": valid and bool(profiles), "profile_state": profile_state, "invoice_type": _invoice_type(), "from_date": start.isoformat() if start else "", "as_of": today.isoformat(),
            "sales_count": sum(r["count"] for r in sources) if valid else None,
            "sales_amount": sum(r["amount"] for r in sources) if valid else None,
            "today_count": daily_count if valid else None, "today_amount": daily_amount if valid else None,
            "returns_today": returns if valid else None,
            "held_count": sum(r["count"] for r in held) if held and all(r["count"] is not None for r in held) else None,
            "sources": sources, "held_sources": held, "recent": sorted(recent, key=lambda r:(r["posting_date"],r["modified"]), reverse=True)[:5] if valid else None,
            "shift": shift, "profile": shift["profile"] or (profiles[0]["name"] if profiles else "")}


@frappe.whitelist(methods=["GET"])
def get_home_dashboard(company=None, period=None, sales_person=None, view=None):
    if frappe.session.user == "Guest" or frappe.get_cached_value("User", frappe.session.user, "user_type") != "System User":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    companies, scope, errors = _scope(company, period, sales_person, view)
    today = getdate(nowdate())
    start, _end = period_bounds(today, scope["period"])
    scope.update(period_label=PERIOD_LABELS[scope["period"]], from_date=start.isoformat() if start else "", to_date=today.isoformat())
    selected = scope["company"]
    if selected == ALL_COMPANIES:
        if len(companies)>COMPANY_CAP:
            return {"profile":"erp","company":selected,"currency":"","scope":scope,"company_overview":None,"query_errors":["Company overview exceeds interactive dashboard cap"]}
        overview = []
        for row in companies:
            frappe.get_doc("Company",row["name"]).check_permission("read")
            local_errors=[]
            team={"sales_team.sales_person":scope["sales_person"]} if scope["sales_person"] else {}
            filters={"company":row["name"],"docstatus":1,"posting_date":["between",[start.isoformat(),today.isoformat()]] if start else ["<=",today.isoformat()],**team}
            sales=_rows("Sales Invoice",filters,["name","base_grand_total"],local_errors)
            overdue_filters={"company":row["name"],"docstatus":1,"posting_date":["<=",today.isoformat()],"due_date":["<",today.isoformat()],"outstanding_amount":[">",0],**team}
            symbols=_rows("Currency",{"name":row["default_currency"]},["name","symbol","symbol_on_right"],local_errors)
            sign=symbols[0] if symbols else {}
            overview.append({"company": row["name"], "currency":row["default_currency"], "currency_symbol":sign.get("symbol") or row["default_currency"],
                             "currency_symbol_on_right":bool(sign.get("symbol_on_right")), "sales_amount":sum(float(r["base_grand_total"] or 0) for r in sales) if sales is not None else None,
                             "sales_count":len(sales) if sales is not None else None,"sales_filters":filters,"overdue_filters":overdue_filters,
                             "overdue_count":_count("Sales Invoice",overdue_filters,local_errors),
                             "journal_drafts":_count("Journal Entry",{"company":row["name"],"docstatus":0},local_errors),"query_errors":local_errors})
        return {"profile":"erp", "company":selected, "currency":"", "scope":scope, "company_overview":overview, "query_errors":errors}
    currency = next((r["default_currency"] for r in companies if r["name"] == selected), "")
    result = {"profile":"erp", "company":selected, "scope":scope, "currency":currency,
              "currency_symbol":currency, "currency_symbol_on_right":False, "query_errors":errors,
              "metrics":dict.fromkeys(("cash_balance","sales_month","receivables","payables","overdue")),
              "drafts":dict.fromkeys(("sales","purchase","quotation","payment","journal")),
              "kpis":[], "trend":None, "attention":[], "recent":None, "collections":{}, "cashier":{"available":False},
              "invoice_status":dict.fromkeys(("paid","open","overdue")), "sales_count":None,
              "invoice_scope":{"company":selected,"from_date":scope["from_date"],"to_date":scope["to_date"],"as_of":scope["to_date"],"sales_person":scope["sales_person"]}}
    if not selected:
        result["start_readiness"],result["launch_readiness"]=_observations("",today,errors)
        return result
    if _can("Currency"):
        symbols = _rows("Currency", {"name":currency}, ["name","symbol","symbol_on_right"], errors)
        if symbols:
            result.update(currency_symbol=symbols[0]["symbol"] or currency,currency_symbol_on_right=bool(symbols[0]["symbol_on_right"]))
    contract = home_metric_contract(company=selected, month_start=start, as_of=today, period_label=scope["period_label"], period=scope["period"], sales_person=scope["sales_person"])
    orders = _rows("Sales Order", contract[0]["filters"], ["name","base_grand_total"], errors)
    sales = _rows("Sales Invoice", contract[2]["filters"], ["name","customer_name","posting_date","due_date","base_grand_total","grand_total","currency","outstanding_amount","party_account_currency","conversion_rate"], errors)
    receivables = _rows("Sales Invoice", contract[3]["filters"], ["name","customer","customer_name","due_date","outstanding_amount","party_account_currency","conversion_rate","currency"], errors)
    purchases = _rows("Purchase Invoice", {"company":selected,"docstatus":1,"posting_date":["<=",today.isoformat()]}, ["name","supplier_name","posting_date","due_date","grand_total","currency","outstanding_amount","party_account_currency","conversion_rate"], errors)
    result["metrics"]["receivables"] = _sum_outstanding(receivables,currency,errors,"Sales Invoice")
    result["metrics"]["payables"] = _sum_outstanding(purchases,currency,errors,"Purchase Invoice")
    cards = build_home_kpis(contract,order_rows=orders or [],invoice_rows=sales or [],outstanding_value=result["metrics"]["receivables"] or 0)
    for card in cards:
        valid = orders is not None if card["doctype"] == "Sales Order" else sales is not None
        if card["key"] == "outstanding_value":
            valid = result["metrics"]["receivables"] is not None
        card["available"] = valid
        if not valid:
            card["value"] = None
    result["kpis"] = cards
    if sales is not None:
        result["sales_count"] = len(sales)
        result["metrics"]["sales_month"] = sum(float(row["base_grand_total"] or 0) for row in sales)
        status = {"paid":0,"open":0,"overdue":0}
        status_names = {"paid":[],"open":[],"overdue":[]}
        buckets = {}
        for row in sales:
            day = getdate(row["posting_date"])
            key = day.isoformat() if start else day.strftime("%Y-%m")
            first = day if start else day.replace(day=1)
            last = day if start else min(today,(first.replace(day=28)+timedelta(days=4)).replace(day=1)-timedelta(days=1))
            bucket = buckets.setdefault(key,{"label":key,"value":0,"from_date":first.isoformat(),"to_date":last.isoformat()})
            bucket["value"] += float(row["base_grand_total"] or 0)
            state="paid" if float(row["outstanding_amount"] or 0)<=0 else "overdue" if row["due_date"] and getdate(row["due_date"])<today else "open"
            status[state] += 1
            status_names[state].append(row["name"])
        result["invoice_status"] = status
        result["invoice_status_filters"] = {key:{**contract[2]["filters"],"name":["in",names or ["__none__"]]} for key,names in status_names.items()}
        for bucket in buckets.values():
            bucket.update(doctype="Sales Invoice",filters={**contract[2]["filters"],"posting_date":["between",[bucket["from_date"],bucket["to_date"]]]})
        result["trend"] = [buckets[key] for key in sorted(buckets)]
    for key, soon in (("overdue",False),("due_soon",True)):
        filters = {**contract[3]["filters"],"outstanding_amount":[">",0],"due_date":["between",[today.isoformat(),(today+timedelta(days=7)).isoformat()]] if soon else ["<",today.isoformat()]}
        rows = None if receivables is None else [r for r in receivables if float(r["outstanding_amount"] or 0)>0 and r["due_date"] and (today<=getdate(r["due_date"])<=today+timedelta(days=7) if soon else getdate(r["due_date"])<today)]
        amount = _sum_outstanding(rows,currency,errors,"Sales Invoice")
        result["collections"][key] = {"available":amount is not None,"count":len(rows) if amount is not None else None,"amount":amount,"filters":filters,"rows":[]}
        if amount is not None:
            result["collections"][key]["rows"] = [{"name":r["name"],"customer":r["customer"],"customer_name":r["customer_name"],"due_date":str(r["due_date"]),"days":abs((today-getdate(r["due_date"])).days),"amount":base_outstanding(r,currency)} for r in sorted(rows,key=lambda r:(str(r["due_date"]),r["name"]))[:5]]
    result["metrics"]["overdue"] = result["collections"]["overdue"]["amount"]
    team = {"sales_team.sales_person":scope["sales_person"]} if scope["sales_person"] else {}
    for dt,key,label in (("Sales Invoice","sales","Sales drafts"),("Purchase Invoice","purchase","Purchase drafts"),("Quotation","quotation","Quotation drafts"),("Payment Entry","payment","Payment drafts"),("Journal Entry","journal","Journal drafts")):
        filters = {"company":selected,"docstatus":0,**(team if dt in ("Sales Invoice","Quotation") else {})}
        count = _count(dt,filters,errors)
        result["drafts"][key] = count
        result["attention"].append({"key":key+"_drafts","label":label,"count":count,"amount":None,"doctype":dt,"filters":filters,"available":count is not None})
    for key,label in (("overdue","Overdue receivables"),("due_soon","Receivables due soon")):
        row=result["collections"][key]
        result["attention"].append({"key":key,"label":label,"doctype":"Sales Invoice",**{k:row[k] for k in ("count","amount","filters","available")}})
    quotation_filters={"company":selected,"docstatus":1,"status":["in",["Open","Replied"]],**team}
    quotation_count=_count("Quotation",quotation_filters,errors)
    result["attention"].append({"key":"open_quotations","label":"Open quotations","doctype":"Quotation","filters":quotation_filters,"count":quotation_count,"amount":None,"available":quotation_count is not None})
    due_filters={"company":selected,"docstatus":1,"posting_date":["<=",today.isoformat()],"outstanding_amount":[">",0],"due_date":["between",[today.isoformat(),(today+timedelta(days=7)).isoformat()]]}
    due_rows=None if purchases is None else [r for r in purchases if float(r["outstanding_amount"] or 0)>0 and r["due_date"] and today<=getdate(r["due_date"])<=today+timedelta(days=7)]
    due_amount=_sum_outstanding(due_rows,currency,errors,"Purchase Invoice")
    result["attention"].append({"key":"payables_due","label":"Payables due soon","doctype":"Purchase Invoice","filters":due_filters,"count":len(due_rows) if due_amount is not None else None,"amount":due_amount,"available":due_amount is not None})
    result["attention"].extend((_stock_attention(selected,errors),_zatca_attention(selected,team,errors)))
    if "System Manager" in frappe.get_roles():
        result["admin_health"]={}
        for dt,key,label,filters in (("Scheduled Job Log","failed_jobs_today","Failed scheduled jobs",{"status":"Failed","creation":[">=",today.isoformat()]}),("Error Log","error_logs_today","Error logs",{"creation":[">=",today.isoformat()]})):
            count=_count(dt,filters,errors)
            result["admin_health"][key]=count
            result["attention"].append({"key":key,"label":label,"doctype":dt,"filters":filters,"count":count,"amount":None,"available":count is not None})
    accounts = _rows("Account",{"company":selected,"account_type":["in",["Bank","Cash"]],"is_group":0,"disabled":0},["name"],errors)
    if accounts is not None:
        ledger = _rows("GL Entry",{"company":selected,"docstatus":1,"is_cancelled":0,"posting_date":["<=",today.isoformat()],"account":["in",[r["name"] for r in accounts] or ["__none__"]]},["name","debit","credit"],errors)
        if ledger is not None:
            result["metrics"]["cash_balance"] = sum(float(r["debit"] or 0)-float(r["credit"] or 0) for r in ledger)
    result["accounting"]={"as_of":today.isoformat(),"query_errors":errors,"available":{k:v is not None for k,v in result["metrics"].items()}}
    recent=[]
    for dt,rows,party in (("Sales Invoice",sales,"customer_name"),("Purchase Invoice",purchases,"supplier_name")):
        for row in rows or []:
            if getdate(row["posting_date"])>today or (start and getdate(row["posting_date"])<start):
                continue
            recent.append({"doctype":dt,"name":row["name"],"party":row[party],"date":str(row["posting_date"]),"amount":float(row["grand_total"] or 0)*(1 if dt=="Sales Invoice" else -1),"currency":row["currency"]})
    result["recent"] = sorted(recent,key=lambda r:(r["date"],r["name"]),reverse=True)[:6] if sales is not None or purchases is not None else None
    if scope["view"] == "cashier":
        result["cashier"] = _cashier(selected,start,today,errors)
    if scope["view"] == "accountant":
        from bunood_theme.accounting_desk import get_accounting_desk
        from bunood_theme.finance_close import get_finance_close_cockpit
        result["accountant_desk"] = get_accounting_desk(selected,currency,today)
        result["accountant_desk"]["close"] = get_finance_close_cockpit(selected,today.replace(day=1).isoformat(),today.isoformat())
    result["start_readiness"],result["launch_readiness"]=_observations(selected,today,errors)
    return result


@frappe.whitelist(methods=["POST"])
def save_home_preferences(company, period, sales_person, view):
    """Explicit personal scope save; never change globals or another user's rows."""
    if frappe.session.user == "Guest" or frappe.get_cached_value("User",frappe.session.user,"user_type") != "System User":
        frappe.throw(_("Not permitted"),frappe.PermissionError)
    if not all(isinstance(value,str) for value in (company,period,sales_person,view)) or not company or not period or not view:
        frappe.throw(_("Unsupported dashboard scope"),frappe.ValidationError)
    # Construct and authorize the entire live response before the first write.
    payload=get_home_dashboard(company=company,period=period,sales_person=sales_person,view=view)
    scope=payload["scope"]
    frappe.defaults.set_default("bnd_home_company",scope["company"],parent=frappe.session.user)
    frappe.defaults.set_default("bnd_home_period",scope["period"],parent=frappe.session.user)
    if scope["sales_person"]:
        frappe.defaults.set_default("bnd_home_sales_person",scope["sales_person"],parent=frappe.session.user)
    else:
        frappe.defaults.clear_default("bnd_home_sales_person",parent=frappe.session.user)
    frappe.defaults.set_default("bnd_home_view",scope["view"],parent=frappe.session.user)
    return payload
