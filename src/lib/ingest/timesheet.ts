import { RIBA_STAGES, type StageId } from '../pedr/constants'
import { isDateKey, type DateKey } from '../pedr/week'
import { resolveDatePhrase, type DateContext } from './dates'

/**
 * Importing a practice timesheet export.
 *
 * This is the most valuable input there is. The record sheet wants hours
 * attributed to RIBA work stages, and reconstructed from memory those numbers
 * are fiction that everyone recognises as fiction. If your practice logs hours
 * by project and phase, that data is contemporaneous, already exists, and can
 * be signed off honestly by a mentor.
 *
 * Column names differ per practice, so headers are matched by synonym rather
 * than position, and anything unrecognised is reported instead of dropped.
 */

export interface TimesheetRow {
  date: DateKey
  project: string | null
  stage: StageId | null
  minutes: number
  description: string
  line: number
}

export interface TimesheetParse {
  rows: TimesheetRow[]
  /** Header text we could not place, so the user can see what was ignored. */
  unmappedColumns: string[]
  skipped: number
  warnings: string[]
}

const HEADERS: Record<string, string[]> = {
  date: ['date', 'day', 'work date', 'entry date', 'timesheet date', 'week', 'date worked'],
  project: ['project', 'job', 'job no', 'job number', 'project code', 'project name', 'job name', 'matter', 'client project', 'code'],
  hours: ['hours', 'hrs', 'time', 'duration', 'qty', 'quantity', 'units', 'total hours', 'time spent'],
  minutes: ['minutes', 'mins', 'duration (mins)', 'duration minutes'],
  stage: ['stage', 'phase', 'work stage', 'riba stage', 'riba', 'workstage', 'stage code'],
  description: ['description', 'notes', 'note', 'comment', 'comments', 'narrative', 'details', 'detail', 'task', 'activity', 'activity description', 'work done'],
}

export function parseTimesheet(raw: string, ctx: DateContext): TimesheetParse {
  const table = parseDelimited(raw)
  const warnings: string[] = []

  if (table.length < 2) {
    return {
      rows: [], unmappedColumns: [], skipped: 0,
      warnings: ['Could not find a header row and at least one row of data.'],
    }
  }

  const header = table[0].map((h) => h.trim())
  const map = mapHeaders(header)

  if (map.date === -1) {
    return {
      rows: [], unmappedColumns: header, skipped: table.length - 1,
      warnings: ['No date column found. Expected a column called Date, Day or similar.'],
    }
  }
  if (map.hours === -1 && map.minutes === -1) {
    warnings.push('No hours column found — entries will be imported without durations.')
  }

  const unmapped = header.filter((_, i) => !Object.values(map).includes(i))
  const rows: TimesheetRow[] = []
  let skipped = 0

  for (let r = 1; r < table.length; r++) {
    const cells = table[r]
    if (cells.every((c) => !c.trim())) continue

    const rawDate = cells[map.date]?.trim() ?? ''
    const date = isDateKey(rawDate) ? rawDate : resolveDatePhrase(rawDate, ctx).date
    if (!date) {
      skipped++
      continue
    }

    const minutes = readMinutes(
      map.hours >= 0 ? cells[map.hours] : undefined,
      map.minutes >= 0 ? cells[map.minutes] : undefined,
    )

    rows.push({
      date,
      project: map.project >= 0 ? nullable(cells[map.project]) : null,
      stage: map.stage >= 0 ? readStage(cells[map.stage]) : null,
      minutes,
      description: map.description >= 0 ? (cells[map.description] ?? '').trim() : '',
      line: r + 1,
    })
  }

  if (skipped > 0) {
    warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped: no readable date.`)
  }

  return { rows, unmappedColumns: unmapped, skipped, warnings }
}

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {
    date: -1, project: -1, hours: -1, minutes: -1, stage: -1, description: -1,
  }
  const normalised = header.map((h) => h.toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim())

  for (const [field, synonyms] of Object.entries(HEADERS)) {
    // Exact synonym first, so "date" beats "date worked" for the date column
    // and "activity description" is not claimed by the stage matcher.
    let index = normalised.findIndex((h) => synonyms.includes(h))
    if (index === -1) {
      index = normalised.findIndex((h) => synonyms.some((s) => h.includes(s)))
    }
    if (index !== -1 && !Object.values(map).includes(index)) map[field] = index
  }
  return map
}

/** "7.5", "7:30", "7h30", "450" in a minutes column. */
function readMinutes(hours?: string, minutes?: string): number {
  if (minutes !== undefined && minutes.trim()) {
    const m = Number(minutes.replace(/[^\d.]/g, ''))
    if (Number.isFinite(m) && m > 0) return Math.round(m)
  }
  if (hours === undefined) return 0
  const text = hours.trim()
  if (!text) return 0

  const clock = /^(\d{1,2})[:h](\d{2})$/i.exec(text)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])

  const decimal = Number(text.replace(',', '.').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(decimal) || decimal <= 0) return 0
  // A "hours" column holding 450 is minutes mislabelled; 24 hours in a day.
  return decimal > 24 ? Math.round(decimal) : Math.round(decimal * 60)
}

function readStage(value: string | undefined): StageId | null {
  if (!value) return null
  const text = value.trim()
  if (!text) return null

  const digit = /(?:^|stage\s*|riba\s*)(\d)(?!\d)/i.exec(text)
  if (digit) {
    const id = Number(digit[1])
    if (id >= 0 && id <= 7) return id as StageId
  }
  const lower = text.toLowerCase()
  const named = RIBA_STAGES.find(
    (s) => lower === s.name.toLowerCase() || lower === s.short.toLowerCase(),
  )
  return named ? (named.id as StageId) : null
}

function nullable(value: string | undefined): string | null {
  const t = (value ?? '').trim()
  return t ? t : null
}

/**
 * A small CSV/TSV reader. Handles quoted fields, doubled quotes inside them and
 * newlines inside quotes — the three things that break a naive split(',').
 */
export function parseDelimited(raw: string): string[][] {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const delimiter = detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.length > 0 && !r.every((c) => c.trim() === ''))
}

function detectDelimiter(text: string): string {
  const sample = text.split('\n').slice(0, 5).join('\n')
  const counts: Array<[string, number]> = [
    ['\t', (sample.match(/\t/g) ?? []).length],
    [',', (sample.match(/,/g) ?? []).length],
    [';', (sample.match(/;/g) ?? []).length],
  ]
  const best = counts.sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

/** True when the text looks like a delimited export rather than prose. */
export function looksLikeTimesheet(raw: string): boolean {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim()).slice(0, 10)
  if (lines.length < 2) return false

  const delimiter = detectDelimiter(lines.join('\n'))
  const counts = lines.map((l) => (l.match(new RegExp(escapeRegExp(delimiter), 'g')) ?? []).length)
  if (counts[0] < 2) return false

  // A table has a consistent number of separators per line; prose does not.
  const consistent = counts.filter((c) => Math.abs(c - counts[0]) <= 1).length
  if (consistent / counts.length < 0.8) return false

  const header = lines[0].toLowerCase()
  const known = Object.values(HEADERS).flat()
  return known.some((h) => header.includes(h))
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
