# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Writing translations, and moving them in and out as files.

EVERYTHING LANDS IN FRAPPE'S OWN ``Translation`` DOCTYPE. Database rows beat
every app file in the merge, survive migrate and upgrade, and are backed up
with the site — where writing into ``apps/<app>/`` would be destroyed by the
next ``bench update`` and is not ours to touch anyway.

UPSERT, NEVER INSERT. ``Translation`` has no uniqueness constraint: N rows for
one ``(language, source_text)`` are legal and the merge resolves them by
arbitrary query order — the 7(e) negative control hit exactly that, when a
planted duplicate lost to an existing row and a test "failed to fail".
"""

import csv
import io

import frappe


def upsert_translation(language: str, source_text: str, translated_text: str) -> str:
    """Create or update the one Translation row for this (language, source).

    Returns "updated", "created" or "unchanged". ``contributed=0`` scopes the
    lookup to locally-authored rows, matching the defense in ``setup.py``.

    THE MATCH MUST BE EXACT, NOT WHATEVER THE DATABASE COLLATION DECIDES.
    MariaDB's default text collation is case-INSENSITIVE, so a same-language
    filter on one differently-cased word also matches a row already storing
    the lowercase spelling of that word — and ``set_value`` on THAT row's
    translated_text leaves its source lowercase forever. Frappe's runtime
    dictionary is a plain Python dict, which is case-SENSITIVE, so the
    correctly-cased lookup then never finds it: the write looked like a clean
    "updated" and silently translated the wrong key. 65 of the 6,721-row
    cross-app Arabic fill vanished exactly this way (2026-08-13), each
    colliding with an unrelated differently-cased row already in the table.
    The row the database hands back is therefore re-checked byte-for-byte in
    Python before being trusted as "the same source" — a near-miss is treated
    as no match, and a fresh row is created for the exact key, on both
    MariaDB and Postgres alike.

    A NOTE FOR WHOEVER NEXT DOCUMENTS THIS FILE: do not write an ``_()`` call
    inside a docstring as an example, even in prose — ``tools/i18n.mjs`` scans
    every ``.py`` file for exactly that pattern with no way to tell an
    illustration from a real call site, and two such examples in this file's
    docstrings (this one, and the whitespace note below) briefly broke
    ``npm run build``'s coverage gate for strings nobody's UI ever shows.
    """
    candidate = frappe.db.get_value(
        "Translation",
        {"language": language, "source_text": source_text, "contributed": 0},
        ["name", "source_text", "translated_text"],
        as_dict=True,
    )
    existing = candidate if candidate and candidate.source_text == source_text else None
    if existing:
        if existing.translated_text == translated_text:
            return "unchanged"
        frappe.db.set_value("Translation", existing.name, "translated_text", translated_text)
        return "updated"
    frappe.get_doc(
        {
            "doctype": "Translation",
            "language": language,
            "source_text": source_text,
            "translated_text": translated_text,
        }
    ).insert(ignore_permissions=True)
    return "created"


def export_untranslated_csv(scan_name: str) -> str:
    """The scan's missing set as a two-column CSV, ready for a translator.

    Two columns and not three: Frappe's reader treats a non-empty third column
    as a CONTEXT that becomes part of the lookup key, so putting the app name
    there — tempting, informative, wrong — would make every reimported row
    unreachable. The app lives in the export's ORDER instead: rows are grouped
    app by app, which a human translating top-to-bottom experiences as
    context anyway.
    """
    import json

    doc = frappe.get_doc("Bunood Translation Scan", scan_name)
    missing = json.loads(doc.missing_json or "{}")
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    for app in missing:
        for msgid in missing[app]:
            writer.writerow([msgid, ""])
    return out.getvalue()


def import_translations_csv(language: str, content: str) -> dict:
    """Apply a filled CSV: every row with a non-empty second column upserts.

    Direct application, not proposals: a file someone filled and chose to
    upload IS the review — the proposal queue exists for machine output,
    where nobody has looked yet. Returns counts, including how many rows were
    skipped for having no translation, so a half-filled file reports itself
    honestly instead of looking fully applied.

    SOURCE IS STORED EXACTLY AS THE ROW CARRIES IT — NEVER .strip()PED.
    Frappe's dictionary is an exact-match lookup, so a source that carries a
    leading or trailing space needs its Translation row keyed with that space
    intact, byte for byte. `.strip()` on `row[0]` used to normalise that away
    before storing — a silently DIFFERENT key that the real lookup, space and
    all, never finds, so the desk renders English forever with no error
    anywhere. Caught auditing the 6,721-row cross-app Arabic fill
    (2026-08-13): 55 rows carried meaningful whitespace this way. `.strip()`
    is still the right test for "is this cell empty" — CSV editors leave
    stray blank cells — it just must never touch what gets STORED.
    """
    counts = {"created": 0, "updated": 0, "unchanged": 0, "skipped_empty": 0}
    for row in csv.reader(io.StringIO(content)):
        if not row or not (row[0] or "").strip():
            continue
        source = row[0]
        translated = row[1] if len(row) > 1 else ""
        if not translated.strip():
            counts["skipped_empty"] += 1
            continue
        counts[upsert_translation(language, source, translated)] += 1
    if counts["created"] or counts["updated"]:
        frappe.db.commit()
        frappe.translate.clear_cache()
    return counts


def accept_proposal(name: str) -> str:
    """Accept one proposal: upsert its text, mark it Accepted."""
    doc = frappe.get_doc("Bunood Translation Proposal", name)
    if not (doc.proposed_text or "").strip():
        frappe.throw(frappe._("This proposal has no text to accept."))
    outcome = upsert_translation(doc.language, doc.source_text, doc.proposed_text.strip())
    doc.db_set("status", "Accepted", update_modified=False)
    frappe.db.commit()
    frappe.translate.clear_cache()
    return outcome


def reject_proposal(name: str) -> None:
    frappe.db.set_value("Bunood Translation Proposal", name, "status", "Rejected")
    frappe.db.commit()
