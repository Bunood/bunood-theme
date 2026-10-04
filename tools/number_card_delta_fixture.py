"""Disposable native Number Card data; executed only by the smoke helper."""
import json
import re


def validate_receipt(receipt):
    token = receipt.get("token", "")
    if not re.fullmatch(r"[a-f0-9]{32}", token):
        raise ValueError("Invalid delta fixture token")
    stem = "BND-AA-" + token
    expected = {"dashboard": stem, "card": stem + "-card", "chart": stem + "-chart", "marker": "[" + stem + "]"}
    if any(receipt.get(key) != value for key, value in expected.items()):
        raise ValueError("Invalid delta fixture identity")
    todos = receipt.get("todos", [])
    if len(todos) != 2 or len(set(todos)) != 2 or not all(isinstance(n, str) and n for n in todos):
        raise ValueError("Invalid delta fixture ToDos")
    return expected


def guard(expected_site):
    import frappe
    if expected_site not in {"demo.bunood.test", "team-rc.localhost", "official-native-acceptance.localhost"}:
        raise RuntimeError("Delta fixtures require an explicitly disposable site")
    if frappe.local.site != expected_site or not frappe.conf.get("allow_tests"):
        raise RuntimeError("Delta fixtures require exact site and allow_tests")
    if frappe.session.user != "Administrator":
        raise RuntimeError("Delta fixtures require the isolated Administrator test session")


def create_fixture(token, expected_site):
    import frappe
    from frappe.utils import add_days, now_datetime
    from frappe.desk.doctype.number_card.number_card import get_result, get_percentage_difference
    guard(expected_site)
    if not re.fullmatch(r"[a-f0-9]{32}", token):
        raise ValueError("Invalid delta fixture token")
    stem = "BND-AA-" + token
    marker = "[" + stem + "]"
    filters = [["ToDo", "description", "=", marker]]
    receipt = {"token": token, "dashboard": stem, "card": stem + "-card", "chart": stem + "-chart", "marker": marker, "todos": []}
    # Never overwrite a pre-existing name or adopt someone else's marker.
    if any(frappe.db.exists(dt, receipt[key]) for dt, key in (("Dashboard", "dashboard"), ("Number Card", "card"), ("Dashboard Chart", "chart"))) or frappe.db.exists("ToDo", {"description": marker}):
        raise RuntimeError("Delta fixture collision")
    try:
        for creation in (add_days(now_datetime(), -8), now_datetime()):
            todo = frappe.get_doc({"doctype": "ToDo", "description": marker, "status": "Open", "creation": creation}).insert()
            # Creation is immutable through save. Only this newly inserted, marker-owned
            # synthetic ToDo gets historical test metadata; financial documents are untouched.
            if todo.description != marker or todo.owner != "Administrator":
                raise RuntimeError("Unexpected synthetic ToDo ownership")
            todo.db_set("creation", creation, update_modified=False)
            receipt["todos"].append(todo.name)
        card = frappe.get_doc({"doctype": "Number Card", "label": receipt["card"], "type": "Document Type", "document_type": "ToDo", "function": "Count", "filters_json": json.dumps(filters), "show_percentage_stats": 1, "stats_time_interval": "Weekly", "is_standard": 0, "is_public": 0}).insert()
        chart = frappe.get_doc({"doctype": "Dashboard Chart", "chart_name": receipt["chart"], "chart_type": "Count", "document_type": "ToDo", "based_on": "creation", "type": "Bar", "timeseries": 1, "timespan": "Last Month", "time_interval": "Weekly", "filters_json": json.dumps(filters), "is_standard": 0, "is_public": 0}).insert()
        dashboard = frappe.get_doc({"doctype": "Dashboard", "dashboard_name": receipt["dashboard"], "is_standard": 0, "is_default": 0, "cards": [{"card": card.name}], "charts": [{"chart": chart.name}]}).insert()
        if (card.name, chart.name, dashboard.name) != (receipt["card"], receipt["chart"], receipt["dashboard"]):
            raise RuntimeError("Unexpected native fixture identity")
        current = get_result(card.as_dict(), json.dumps(filters))
        percentage = get_percentage_difference(card.as_dict(), json.dumps(filters), current)
        if current != 2 or percentage != 100:
            raise RuntimeError("Native Number Card did not prove current=2, previous=1, delta=100")
        validate_receipt(receipt)
        frappe.db.commit()
        return receipt
    except Exception:
        frappe.db.rollback()
        raise


def clear_fixture(receipt, expected_site):
    import frappe
    guard(expected_site)
    expected = validate_receipt(receipt)
    filters = [["ToDo", "description", "=", expected["marker"]]]
    # Validate every parent and exact child link BEFORE the first deletion.
    dashboard = frappe.get_doc("Dashboard", expected["dashboard"])
    card = frappe.get_doc("Number Card", expected["card"])
    chart = frappe.get_doc("Dashboard Chart", expected["chart"])
    todos = [frappe.get_doc("ToDo", name) for name in receipt["todos"]]
    if any(doc.owner != "Administrator" for doc in [dashboard, card, chart, *todos]):
        raise RuntimeError("Fixture owner changed; refusing cleanup")
    if dashboard.dashboard_name != expected["dashboard"] or dashboard.is_standard or dashboard.is_default or [r.card for r in dashboard.cards] != [card.name] or [r.chart for r in dashboard.charts] != [chart.name]:
        raise RuntimeError("Fixture dashboard changed; refusing cleanup")
    if card.label != expected["card"] or card.document_type != "ToDo" or card.function != "Count" or card.is_standard or card.is_public or json.loads(card.filters_json) != filters:
        raise RuntimeError("Fixture card changed; refusing cleanup")
    if chart.chart_name != expected["chart"] or chart.document_type != "ToDo" or chart.chart_type != "Count" or chart.is_standard or chart.is_public or json.loads(chart.filters_json) != filters:
        raise RuntimeError("Fixture chart changed; refusing cleanup")
    if any(doc.description != expected["marker"] or doc.allocated_to or doc.reference_type or doc.reference_name for doc in todos):
        raise RuntimeError("Fixture ToDo changed; refusing cleanup")
    if set(frappe.get_all("ToDo", filters={"description": expected["marker"]}, pluck="name")) != set(receipt["todos"]):
        raise RuntimeError("Fixture marker ownership changed; refusing cleanup")
    try:
        for doc in [dashboard, card, chart, *todos]:
            frappe.delete_doc(doc.doctype, doc.name)
        frappe.db.commit()
    except Exception:
        frappe.db.rollback()
        raise
