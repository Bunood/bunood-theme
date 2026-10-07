/** Export a real Studio workbook and reopen it with a spreadsheet parser. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { goto, openDesk } from "./session.mjs";

const python = process.env.BND_PYTHON || "python";
const output = resolve("artifacts", "studio-xlsx");
mkdirSync(output, { recursive: true });
const session = await openDesk({ width: 1440, height: 900 });
try {
	await goto(session.page, "/desk/bnd-report-studio/sales-register", ".bnd-studio--viewer-open", { settle: 500 });
	const label = await session.page.evaluate(() => __("Export Excel"));
	const downloadPromise = session.page.waitForEvent("download", { timeout: 60000 });
	await session.page.getByRole("button", { name: label, exact: true }).click();
	const download = await downloadPromise;
	assert.match(download.suggestedFilename(), /\.xlsx$/i);
	const file = join(output, "sales-register.xlsx");
	await download.saveAs(file);
	const result = JSON.parse(execFileSync(python, ["-c", [
		"import json, openpyxl, sys",
		"book = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)",
		"sheets = []",
		"for sheet in book.worksheets:",
		"    rows = list(sheet.iter_rows(values_only=True))",
		"    sheets.append({'name': sheet.title, 'rows': len(rows), 'columns': max((len(row) for row in rows), default=0), 'has_data': any(any(cell is not None for cell in row) for row in rows)})",
		"assert sheets and any(sheet['has_data'] for sheet in sheets)",
		"print(json.dumps(sheets))",
	].join("\n"), file], { encoding: "utf8" }).trim());
	assert.deepEqual(session.errors, [], `browser errors: ${session.errors.join(" | ")}`);
	console.log(`PASS Studio XLSX reopened: ${JSON.stringify(result)}`);
} finally {
	await session.close();
}
