"""Pure reconciliation for Frappe's persisted onboarding steps."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any


def derive_create_entry_progress(
    steps: Iterable[dict[str, Any]],
    record_exists: Callable[[str], bool | None],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Derive Create Entry completion from the record the step promises.

    Manual actions such as viewing a report or reviewing settings keep their
    native persisted state. A failed lookup is explicit and leaves that native
    state intact, allowing the client to offer a retry without lying.
    """

    result = list(steps)
    errors = []
    for step in result:
        reference = step.get("reference_document")
        if step.get("action") != "Create Entry" or not reference:
            continue
        exists = record_exists(reference)
        if exists is None:
            errors.append(step.get("name") or reference)
            continue
        step["is_complete"] = int(exists)
    return result, errors
