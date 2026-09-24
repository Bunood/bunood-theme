"""Verify the customer-facing launch family from rendered HTML and real PDFs."""

import json
import re
import sys
from pathlib import Path

import pdfplumber
from lxml import html


def members(node, class_name):
    return node.xpath(
        'descendant-or-self::*[contains(concat(" ", normalize-space(@class), " "), '
        f'" {class_name} ")]'
    )


def clean(value):
    return " ".join((value or "").split())


ROOT = Path(sys.argv[1])
CASES = {
    "quotation-a4": ("SAL-QTN-2026-00002", "a4"),
    "payment-receipt-a4": ("ACC-PAY-2026-00001", "a4"),
    "tax-invoice-a4": ("ACC-SINV-2026-00003", "a4"),
    "simplified-invoice-a4": ("ACC-SINV-2026-00006", "a4"),
    "tax-invoice-thermal": ("ACC-SINV-2026-00003", "thermal"),
    "simplified-invoice-thermal": ("ACC-SINV-2026-00006", "thermal"),
}

results = {}
for language in ("en", "ar"):
    arabic = language == "ar"
    for case, (document_id, paper) in CASES.items():
        key = f"{case}-{language}"
        tree = html.fromstring((ROOT / f"{key}.html").read_text(encoding="utf-8"))
        document = members(tree, "bnd-p")[0]
        assert document.get("lang") == language, (key, "wrong language attribute")
        assert document.get("dir") == ("rtl" if arabic else "ltr"), (key, "wrong direction")

        label_nodes = (
            members(document, "bnd-p-title")
            + document.xpath('.//table[contains(@class,"bnd-p-meta")]//td[1]')
            + document.xpath('.//table[contains(@class,"bnd-p-items")]//th')
            + document.xpath('.//table[contains(@class,"bnd-p-totals")]//td[1]')
            + members(document, "bnd-p-amountbox__l")
        )
        if paper == "thermal":
            label_nodes += members(document, "bnd-p-th-title")
            label_nodes += document.xpath('.//table[contains(@class,"bnd-p-th-l")]//td[1]')
        labels = [clean(node.text_content()) for node in label_nodes]
        labels = [
            label
            for label in labels
            if label
            and label != "#"
            and re.search(r"[A-Za-z\u0600-\u06ff]", label)
        ]
        assert labels, (key, "no labels found")
        for label in labels:
            has_arabic = bool(re.search(r"[\u0600-\u06ff]", label))
            assert has_arabic == arabic, (key, "mixed label language", label)

        if case.startswith("simplified-invoice"):
            assert members(document, "bnd-p-qr"), (key, "required QR image missing")
            assert not members(document, "bnd-p-qr-missing"), (key, "QR warning printed")

        with pdfplumber.open(ROOT / f"{key}.pdf") as pdf:
            assert len(pdf.pages) == 1, (key, "unexpected page count", len(pdf.pages))
            page = pdf.pages[0]
            if paper == "a4":
                assert abs(page.width - 595) < 3 and abs(page.height - 842) < 3, (
                    key,
                    "not A4",
                    page.width,
                    page.height,
                )
            else:
                assert abs(page.width - 226.77) < 3 and abs(page.height - 841.89) < 3, (
                    key,
                    "not 80x297mm",
                    page.width,
                    page.height,
                )
            text = page.extract_text() or ""
            assert document_id in text, (key, "document identity missing")
            assert all(
                char["x0"] >= -0.5
                and char["x1"] <= page.width + 0.5
                and char["top"] >= -0.5
                and char["bottom"] <= page.height + 0.5
                for char in page.chars
            ), (key, "text outside page")
            if arabic:
                for forbidden in (
                    "Quotation number",
                    "Voucher number",
                    "Invoice number",
                    "Grand total",
                    "Thank you for your business",
                ):
                    assert forbidden not in text, (key, "English label leaked", forbidden)
            else:
                for forbidden in ("رقم عرض السعر", "رقم السند", "رقم الفاتورة", "الإجمالي المستحق", "شكراً لتعاملكم معنا"):
                    assert forbidden not in text, (key, "Arabic label leaked", forbidden)
            results[key] = {
                "pages": len(pdf.pages),
                "width_pt": round(page.width, 2),
                "height_pt": round(page.height, 2),
                "direction": document.get("dir"),
                "labels": len(labels),
            }

(ROOT / "commercial-document-verification.json").write_text(
    json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8"
)
print(json.dumps(results, indent=2, ensure_ascii=False))
