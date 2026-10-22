import { boot } from './boot'

// Latin digits in both languages, two decimals, grouped by thousands:
// 1,355,750.00. The riyal sign follows the number after a thin space.
const amount = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const integer = new Intl.NumberFormat('en-US')

export const RIYAL = '\u20C1'

// A date or a percentage inside an Arabic sentence is a left-to-right island:
// without the isolate, the bidi algorithm reorders 22-10-2026 into 2026-10-22
// and puts the % before 36.8. LRI … PDI, invisible and copy-safe.
const LRI = '\u2066'
const PDI = '\u2069'
const isolate = (s) => `${LRI}${s}${PDI}`

export function money(value) {
  return amount.format(Number(value || 0))
}

export function number(value) {
  return integer.format(Number(value || 0))
}

// Dates the way the site writes them: 22-10-2026.
export function day(value) {
  if (!value) return ''
  const [y, m, d] = String(value).slice(0, 10).split('-')
  // Word joiners keep a narrow screen from breaking the line inside the date.
  return isolate([d, m, y].join('\u2060-\u2060'))
}

export function percent(value) {
  return isolate(`${value}%`)
}

export function weekday(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(boot.lang, { weekday: 'long' })
}

export function initials(name) {
  return (name || '?')
    .replace(/^(م|د|أ)\.\s*/, '')
    .trim()
    .charAt(0)
}
