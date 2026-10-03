# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Machine-translation providers, behind one interface.

THE CONTRACT
    Each provider is a dict of three callables, all taking the settings doc:

    * ``available(settings) -> (bool, reason)`` — can this provider run NOW?
      The reason is shown verbatim in the surface, so "no API key entered" is
      a sentence, not a greyed-out mystery.
    * ``estimate(strings, settings) -> {"chars", "usd"}`` — what a run over
      these strings would cost, BEFORE it runs. The cap compares against this.
    * ``translate(batch, language, settings) -> {source: translated}`` — one
      batch, already sized by the caller.

EVERY RUN PRODUCES PROPOSALS, NEVER TRANSLATIONS. Machine output lands in
``Bunood Translation Proposal`` rows for a human to accept — the runtime
mirror of the PO's ``#, fuzzy`` flag, and the reason a wrong machine guess
cannot reach a desk unreviewed.

KEYS NEVER LEAVE THE SERVER. Each ``translate`` runs in a queue worker and
reads its key via ``get_password``; nothing here is callable with a key as an
argument, so no whitelisted path can be tricked into echoing one.
"""

import json

import frappe
from frappe.utils import flt

#: Rough USD per 1M characters, for the pre-run estimate. Claude is priced per
#: token; ~3.6 chars/token for this mixed Arabic/English workload, priced at
#: sonnet-tier input+output. These are ESTIMATES for the cap — a provider that
#: bills differently bills differently, which is why the cap trips at 80% of
#: itself rather than at 100%.
RATE_USD_PER_MCHAR = {
    "Claude": 2.5,
    "DeepL": 25.0,
    "Google Translate": 20.0,
    "Microsoft Translator": 10.0,
}


def _estimate(provider: str):
    def estimate(strings, settings):
        chars = sum(len(s) for s in strings)
        return {"chars": chars, "usd": round(chars / 1_000_000 * RATE_USD_PER_MCHAR[provider], 4)}

    return estimate


def _needs_key(fieldname: str, label: str):
    def available(settings):
        if not settings.get(fieldname):
            # The placeholder sits at the END deliberately: the build's plural
            # guard refuses `{0} <word>`, and it cannot tell a key name from a
            # count — nor should it have to, when the sentence reads fine this
            # way round.
            return False, frappe._("Bunood Translation Settings has no {0}.").format(label)
        return True, ""

    return available


# ── Claude ──────────────────────────────────────────────────────────────────


def _claude_translate(batch, language, settings):
    """One batch through the Messages API, as strict JSON in and out.

    The glossary constraint rides in the prompt: UI strings, keep {placeholders}
    and product names verbatim, match the platform's existing vocabulary. The
    response is forced to a JSON object keyed by the EXACT source strings, and
    any key the model drops or invents is simply absent from the returned map —
    a missing proposal, never a wrong pairing.
    """
    key = settings.get_password("claude_api_key")
    model = (settings.claude_model or "claude-sonnet-5").strip()
    lang_name = {"ar": "Arabic"}.get(language, language)
    payload = {
        "model": model,
        "max_tokens": 8000,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Translate these ERP user-interface strings to %s.\n"
                    "Rules: keep {placeholders} exactly as written; keep product and "
                    "typeface names (Frappe, ERPNext, Bunood, Ctrl+K) in Latin; short "
                    "labels stay short; use Modern Standard Arabic with Western digits.\n"
                    "Reply with ONLY a JSON object mapping each source string, verbatim, "
                    "to its translation.\n\n%s"
                )
                % (lang_name, json.dumps(batch, ensure_ascii=False)),
            }
        ],
    }
    resp = frappe.make_post_request(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        data=json.dumps(payload),
    )
    text = "".join(b.get("text", "") for b in resp.get("content", []))
    # Tolerate a fenced reply; refuse anything that is not one JSON object.
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    parsed = json.loads(text)
    return {s: parsed[s].strip() for s in batch if isinstance(parsed.get(s), str) and parsed[s].strip()}


# ── DeepL ───────────────────────────────────────────────────────────────────


def _deepl_translate(batch, language, settings):
    key = settings.get_password("deepl_api_key")
    host = "api-free.deepl.com" if key.endswith(":fx") else "api.deepl.com"
    resp = frappe.make_post_request(
        f"https://{host}/v2/translate",
        headers={"Authorization": f"DeepL-Auth-Key {key}", "content-type": "application/json"},
        data=json.dumps({"text": batch, "target_lang": language.upper(), "preserve_formatting": True}),
    )
    out = {}
    for src, item in zip(batch, resp.get("translations", [])):
        text = (item.get("text") or "").strip()
        if text:
            out[src] = text
    return out


# ── Google / Microsoft ──────────────────────────────────────────────────────


def _google_translate(batch, language, settings):
    key = settings.get_password("google_api_key")
    resp = frappe.make_post_request(
        f"https://translation.googleapis.com/language/translate/v2?key={key}",
        headers={"content-type": "application/json"},
        data=json.dumps({"q": batch, "target": language, "format": "text"}),
    )
    items = (resp.get("data") or {}).get("translations") or []
    return {
        src: item["translatedText"].strip()
        for src, item in zip(batch, items)
        if (item.get("translatedText") or "").strip()
    }


def _microsoft_translate(batch, language, settings):
    key = settings.get_password("microsoft_api_key")
    headers = {"Ocp-Apim-Subscription-Key": key, "content-type": "application/json"}
    if settings.microsoft_region:
        headers["Ocp-Apim-Subscription-Region"] = settings.microsoft_region
    resp = frappe.make_post_request(
        f"https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to={language}",
        headers=headers,
        data=json.dumps([{"text": s} for s in batch]),
    )
    out = {}
    for src, item in zip(batch, resp or []):
        translations = item.get("translations") or []
        if translations and (translations[0].get("text") or "").strip():
            out[src] = translations[0]["text"].strip()
    return out


PROVIDERS = {
    "Claude": {
        "available": _needs_key("claude_api_key", "Claude API key"),
        "estimate": _estimate("Claude"),
        "translate": _claude_translate,
    },
    "DeepL": {
        "available": _needs_key("deepl_api_key", "DeepL API key"),
        "estimate": _estimate("DeepL"),
        "translate": _deepl_translate,
    },
    "Google Translate": {
        "available": _needs_key("google_api_key", "Google Translate API key"),
        "estimate": _estimate("Google Translate"),
        "translate": _google_translate,
    },
    "Microsoft Translator": {
        "available": _needs_key("microsoft_api_key", "Microsoft Translator API key"),
        "estimate": _estimate("Microsoft Translator"),
        "translate": _microsoft_translate,
    },
}


def run_provider(scan_name: str, provider: str, limit: int = 0) -> None:
    """The queued job: scan's missing set → Proposal rows, under the cap.

    Strings already holding a PENDING proposal for this language are skipped,
    so re-running after a partial failure continues instead of duplicating.
    The cap is enforced against the ESTIMATE before each batch; the run stops
    cleanly at the boundary and says so, rather than discovering the cap in an
    invoice.
    """
    settings = frappe.get_single("Bunood Translation Settings")
    spec = PROVIDERS[provider]
    ok, reason = spec["available"](settings)
    if not ok:
        frappe.throw(reason)

    doc = frappe.get_doc("Bunood Translation Scan", scan_name)
    missing = json.loads(doc.missing_json or "{}")
    app_of = {m: app for app in missing for m in missing[app]}

    already = set(
        frappe.get_all(
            "Bunood Translation Proposal",
            filters={"language": doc.language, "status": "Pending"},
            pluck="source_text",
        )
    )
    todo = [m for m in app_of if m not in already]
    if limit:
        todo = todo[:limit]

    cap = flt(settings.spend_cap_usd) or 5.0
    batch_size = int(settings.batch_size or 40)
    spent = 0.0
    done = 0

    for i in range(0, len(todo), batch_size):
        batch = todo[i : i + batch_size]
        est = spec["estimate"](batch, settings)["usd"]
        if spent + est > cap * 0.8:
            frappe.publish_realtime(
                "bnd_translation_provider",
                {"scan": scan_name, "capped": True, "done": done, "of": len(todo)},
            )
            break
        translated = spec["translate"](batch, doc.language, settings)
        spent += est
        for source, text in translated.items():
            frappe.get_doc(
                {
                    "doctype": "Bunood Translation Proposal",
                    "language": doc.language,
                    "source_text": source,
                    "proposed_text": text,
                    "provider": provider,
                    "app": app_of.get(source, ""),
                    "scan": scan_name,
                }
            ).insert(ignore_permissions=True)
        done += len(batch)
        frappe.db.commit()
        frappe.publish_realtime(
            "bnd_translation_provider",
            {"scan": scan_name, "done": done, "of": len(todo), "spent": round(spent, 4)},
        )

    frappe.publish_realtime(
        "bnd_translation_provider", {"scan": scan_name, "finished": True, "done": done, "of": len(todo)}
    )
