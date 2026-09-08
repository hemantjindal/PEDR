import type { DateKey } from '../pedr/week'
import {
  isDateOnlyLine, resolveDatePhrase, resolveWeekHeader, stripDatePhrase, type DateContext,
} from './dates'

/**
 * Reading a dump the way people write them.
 *
 * The target is whatever someone types into a box on their phone on a Friday:
 * a week heading, some day headings, some bullets, some prose, in any order and
 * with no consistency. The rules are simple and the failure mode is safe — if
 * a line has no date we attach it to the last date we saw, and if we never saw
 * one we attach it to the day the dump was written, and we say so.
 */

export interface FreeformSegment {
  text: string
  date: DateKey
  dateConfidence: number
  /** Where in the input this came from, so a user can check our working. */
  provenance: string
  line: number
}

export interface FreeformParse {
  segments: FreeformSegment[]
  warnings: string[]
  /** True when no date was found anywhere and everything defaulted. */
  undated: boolean
}

const BULLET = /^\s*(?:[-*•·–—>]+|\d{1,2}[.)])\s+/
const NOT_WORK = /^\s*(?:n\/?a|none|nothing|tbc|\.|-{1,3})\s*$/i

export function parseFreeform(raw: string, ctx: DateContext): FreeformParse {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const segments: FreeformSegment[] = []
  const warnings: string[] = []

  let weekStart: DateKey | null = ctx.weekStart ?? null
  let currentDate: DateKey | null = null
  let currentConfidence = 0
  let sawAnyDate = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.replace(BULLET, '').trim()
    if (!line || NOT_WORK.test(line)) continue

    const scope: DateContext = { reference: ctx.reference, weekStart }

    // "w/c 7 Sep" — sets the week that bare weekday names belong to.
    const header = resolveWeekHeader(line, scope)
    if (header.isWeekHeader && header.weekStart) {
      weekStart = header.weekStart
      currentDate = null
      currentConfidence = 0
      sawAnyDate = true
      continue
    }

    // A date on its own line heads the lines under it.
    if (isDateOnlyLine(line, scope)) {
      const resolved = resolveDatePhrase(line, scope)
      if (resolved.date) {
        currentDate = resolved.date
        currentConfidence = resolved.confidence
        sawAnyDate = true
        continue
      }
    }

    // A date at the start of a line applies to that line, and to the lines
    // under it until something says otherwise.
    const inline = resolveDatePhrase(line, scope)
    let text = line
    let date = currentDate
    let confidence = currentConfidence

    if (inline.date && inline.matchedText && startsWithDate(line, inline.matchedText)) {
      date = inline.date
      confidence = inline.confidence
      currentDate = inline.date
      currentConfidence = inline.confidence
      sawAnyDate = true
      text = stripDatePhrase(line, inline.matchedText)
    }

    if (!text.trim()) continue

    if (!date) {
      date = ctx.reference
      confidence = 0.3
    }

    for (const part of splitActivities(text)) {
      segments.push({
        text: part,
        date,
        dateConfidence: confidence,
        provenance: `line ${i + 1}: ${truncate(rawLine.trim(), 80)}`,
        line: i + 1,
      })
    }
  }

  if (!sawAnyDate && segments.length > 0) {
    warnings.push(
      'No dates found, so everything was filed under the day of the dump. Add a day or a date and it will split properly.',
    )
  }

  return { segments, warnings, undated: !sawAnyDate }
}

/**
 * One line can hold several activities. Split on semicolons and on " then ",
 * which is how people actually chain them, but never on full stops — prose
 * sentences about one task are not separate tasks.
 */
function splitActivities(text: string): string[] {
  return text
    .split(/\s*;\s*|\s+\bthen\b\s+/i)
    .map((s) => s.trim().replace(/^[,\-–—]\s*/, ''))
    .filter((s) => s.length > 1)
}

function startsWithDate(line: string, matched: string): boolean {
  // Within the first few characters, allowing for a bullet or a bracket.
  return line.toLowerCase().indexOf(matched.toLowerCase()) <= 2
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
