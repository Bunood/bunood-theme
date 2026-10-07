/** Strip ONLY explicit screen-only blocks from the legacy PDF compatibility scan.
 * Both native PDF renderers use print media. Mixed/negated media stay checked.
 * CSS is Sass's compiled output; the scanner honours strings and comments so a
 * brace in content/url text cannot swallow a following print rule.
 */
export function pdfMediaCss(css) {
	let result = "", i = 0, atRuleAllowed = true;
	while (i < css.length) {
		if (css.startsWith("/*", i)) {
			const end = css.indexOf("*/", i + 2);
			if (end < 0) throw new Error("Unclosed CSS comment");
			i = end + 2;
			continue;
		}
		const match = atRuleAllowed && css.slice(i).match(/^@media\s+(?:only\s+)?screen\s*\{/i);
		if (match) {
			i += match[0].length;
			let depth = 1;
			while (i < css.length && depth) {
				if (css.startsWith("/*", i)) {
					const end = css.indexOf("*/", i + 2);
					if (end < 0) throw new Error("Unclosed CSS comment");
					i = end + 2;
				} else if (css[i] === "\\") {
					// Escaped braces in selectors/custom values do not nest blocks.
					i += 2;
				} else if (css[i] === '"' || css[i] === "'") {
					const quote = css[i++];
					while (i < css.length && css[i] !== quote) i += css[i] === "\\" ? 2 : 1;
					i++;
				} else {
					if (css[i] === "{") depth++;
					if (css[i] === "}") depth--;
					i++;
				}
			}
			if (depth) throw new Error("Unclosed screen-only CSS block");
			continue;
		}
		// Do not interpret an @media literal inside an ordinary CSS string.
		if (css[i] === "\\") {
			// An escaped @ in a selector is not an at-rule.
			result += css.slice(i, i + 2);
			i += 2;
			atRuleAllowed = false;
		} else if (css[i] === '"' || css[i] === "'") {
			const start = i, quote = css[i++];
			while (i < css.length && css[i] !== quote) i += css[i] === "\\" ? 2 : 1;
			result += css.slice(start, ++i);
			atRuleAllowed = false;
		} else {
			if (!/\s/.test(css[i])) atRuleAllowed = "{};".includes(css[i]);
			result += css[i++];
		}
	}
	return result;
}
