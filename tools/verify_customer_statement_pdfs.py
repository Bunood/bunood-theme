"""Verify the live-data Customer Statement PDFs and their report evidence."""

import json
import sys
from pathlib import Path

import pdfplumber


root = Path(sys.argv[1])
evidence = json.loads((root / "customer-statement-verification.json").read_text(encoding="utf-8"))

expected_vouchers = (
	"ACC-SINV-2026-00001",
	"ACC-PAY-2026-00001",
	"ACC-SINV-2026-00002",
)
results = {}

for language in ("en", "ar"):
	case = f"customer-statement-a4-{language}"
	data = evidence[language]
	assert data["direction"] == ("rtl" if language == "ar" else "ltr"), (case, "direction")
	assert data["row_count"] == data["body_rows"] >= 5, (case, "rows")
	assert not data["console_errors"], (case, "browser errors", data["console_errors"])
	assert data["customer"] == "Bunood Acceptance Customer RC20A", (case, "customer")
	assert all(any(row["voucher_no"] == voucher for row in data["rows"]) for voucher in expected_vouchers), (
		case,
		"source vouchers",
	)

	with pdfplumber.open(root / f"{case}.pdf") as pdf:
		assert len(pdf.pages) == 1, (case, "unexpected page count", len(pdf.pages))
		page = pdf.pages[0]
		assert abs(page.width - 595.28) < 3 and abs(page.height - 841.89) < 3, (
			case,
			"not A4",
			page.width,
			page.height,
		)
		text = page.extract_text() or ""
		assert all(token in text for token in data["customer"].split()), (case, "customer missing")
		assert text.count("ACC-SINV-") >= 2 and "ACC-PAY-" in text, (case, "voucher type missing")
		assert "00001" in text and "00002" in text, (case, "voucher identity missing")
		assert "'Opening'" not in text and "'Total'" not in text and "'Closing" not in text, (
			case,
			"quoted summary label",
		)
		assert all(
			char["x0"] >= -0.5
			and char["x1"] <= page.width + 0.5
			and char["top"] >= -0.5
			and char["bottom"] <= page.height + 0.5
			for char in page.chars
		), (case, "text outside page")
		if language == "ar":
			for forbidden in ("CUSTOMER STATEMENT", "Period", "Debit", "Credit", "Closing balance"):
				assert forbidden not in text, (case, "English label leaked", forbidden)
		else:
			for forbidden in ("كشف حساب عميل", "العميل", "الفترة", "مدين", "دائن", "الرصيد الختامي"):
				assert forbidden not in text, (case, "Arabic label leaked", forbidden)
		results[case] = {
			"pages": len(pdf.pages),
			"width_pt": round(page.width, 2),
			"height_pt": round(page.height, 2),
			"rows": data["row_count"],
			"direction": data["direction"],
		}

print(json.dumps(results, indent=2, ensure_ascii=False))
