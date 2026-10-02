"""Pure first-use progress derived from native records and permissions.

The Home surface consumes this shape, but the rules live outside Frappe so they can
be tested without a site.  It is intentionally not a release or compliance score:
it only answers which persisted first-use record should be created next.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

START_STEP_KEYS = ("company", "customer", "item", "invoice", "payment")


def derive_start_readiness(
    facts: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Return a deterministic, fail-closed first-use sequence.

    A step is complete only when its native record exists inside the current user's
    readable scope.  The first incomplete step is actionable only when its DocType is
    available and the current user can both read and create it.  Later steps wait for
    dependency order, rather than presenting five competing calls to action.
    """

    steps: list[dict[str, Any]] = []
    first_incomplete_seen = False

    for key in START_STEP_KEYS:
        fact = facts.get(key) or {}
        exists = bool(fact.get("exists"))
        step: dict[str, Any] = {"key": key}

        if exists:
            step["state"] = "complete"
        elif first_incomplete_seen:
            step["state"] = "waiting"
        else:
            first_incomplete_seen = True
            if not fact.get("available", True):
                step.update(state="blocked", reason="unavailable")
            elif not fact.get("can_read"):
                step.update(state="blocked", reason="no-read")
            elif fact.get("query_error"):
                step.update(state="blocked", reason="query-error")
            elif not fact.get("can_create"):
                step.update(state="blocked", reason="no-create")
            else:
                step["state"] = "next"
        steps.append(step)

    complete_count = sum(step["state"] == "complete" for step in steps)
    current = next((step for step in steps if step["state"] != "complete"), None)
    if current is None:
        state = "first-use-complete"
    elif current["state"] == "blocked":
        state = "blocked"
    else:
        state = "in-progress"

    return {
        "state": state,
        "source": "persisted-permission-filtered-records",
        "complete_count": complete_count,
        "total_count": len(START_STEP_KEYS),
        "current_step": current["key"] if current else "",
        "steps": steps,
    }
