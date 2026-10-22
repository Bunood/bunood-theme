import { boot } from './boot'

// Every string the app shows carries this context, so the word stays ours
// whatever else the site has installed, and the page can send only its own
// translations (`www/people.py::app_messages`).
export const CONTEXT = 'Zero One HR'

function fill(text, replace) {
  if (!replace) return text
  return text.replace(/\{(\d+)\}/g, (_, i) => (replace[i] ?? '').toString())
}

/**
 * Translate, Frappe-style: `__('Draft')`, `__('{0} days', [3])`.
 * Frappe keys a context translation as `text:context`; the plain key is the
 * fallback it also writes for a context-only translation.
 */
export function __(text, replace, context = CONTEXT) {
  const m = boot.messages
  const translated = m[`${text}:${context}`] ?? m[text] ?? text
  return fill(translated, replace)
}

const rules = new Intl.PluralRules(boot.lang)

/**
 * Count the language's way. Arabic has six forms (no employees, one employee,
 * two employees, 3-10 employees, 11+ employees, and the rest), each its own
 * string: the source is English (`'{0} employees'`) and the plural CATEGORY is
 * part of the context, so a translator writes each form once.
 *
 *   count(14, '{0} employees')  ->  "14 موظفًا"
 */
export function count(n, text) {
  const category = rules.select(n)
  return __(text, [n], `${CONTEXT} count:${category}`)
}
