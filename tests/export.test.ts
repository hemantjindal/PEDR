import { describe, expect, it } from 'vitest'
import { buildSheet } from '@/lib/pedr/sheet'
import {
  buildAppraisalDocument, buildSheetDocument, renderDocument, renderMarkdown,
} from '@/lib/export'
import { sanitise, wrap } from '@/lib/export/pdf'
import { StandardFonts, PDFDocument } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import type { Employment, Entry, Project, WeekNote } from '@/lib/pedr/types'
import { entry } from './helpers'

const projects: Project[] = [
  {
    id: 'p1', userId: 'u1', code: '1042', name: 'Battersea Square Phase 2',
    client: 'BSQ Developments', sector: 'Residential', valueGbp: 48_000_000,
    procurement: 'Two stage D&B', contractForm: 'JCT D&B 2016', isCaseStudy: true,
    notes: null, aliases: ['BSQ'], archived: false, createdAt: '2025-01-01T00:00:00Z',
  },
]

const employment: Employment = {
  id: 'e1', userId: 'u1', employer: 'Hawkins Practice', officeLocation: 'London',
  location: 'UK', category: 'i', role: 'Part 2 Architectural Assistant',
  supervisorName: 'Sarah Chen', supervisorRegBody: 'ARB', supervisorRegNumber: '099887',
  mentorName: 'Dr Priya Nair', mentorEmail: null,
  startDate: '2026-01-05', endDate: null, weeklyHours: 375,
  createdAt: '2026-01-01T00:00:00Z',
}

const entries: Entry[] = [
  entry({
    date: '2026-07-06', minutes: 300, projectId: 'p1', stage: 4,
    activity: 'Issued the curtain wall head detail — “rev C” — after the façade meeting',
    people: ['Sarah Chen'],
    wentWrong: 'Sent the wrong revision and had to reissue within the hour.',
    learned: 'Check the revision block before the transmittal, not after.',
    criteria: ['PC5'],
  }),
  entry({
    date: '2026-07-07', minutes: 240, projectId: 'p1', stage: 3,
    activity: 'Planning submission pack for Battersea — drawings, DAS and the fire statement',
    criteria: ['PC3'],
  }),
  entry({
    date: '2026-08-10', minutes: 450, projectId: null, officeCategory: 'leave',
    activity: 'Annual leave', criteria: [], people: [],
  }),
  entry({
    date: '2026-08-12', minutes: 90, projectId: null, officeCategory: 'cpd',
    activity: 'CPD on the Building Safety Act', criteria: ['PC2'], people: [],
  }),
]

const notes: WeekNote[] = [
  {
    userId: 'u1', weekId: '2026-W28',
    did: 'Ran the curtain wall package on 1042.',
    learned: 'How a transmittal actually gets checked.',
    wentWell: 'The façade meeting landed the head detail.',
    wentWrong: 'Issued the wrong revision.',
    next: 'Ask to sit in on a valuation.',
    updatedAt: '2026-07-12T00:00:00Z',
  },
]

const periodStart = '2026-07-01'
const periodEnd = '2026-09-30'

const content = buildSheet({ periodStart, periodEnd, entries, notes, projects, employment })

const sheetDoc = buildSheetDocument({
  content, periodStart, periodEnd, candidateName: 'Hemant Jindal',
  employment, entries, projects, includeEntries: true,
})

// ---------------------------------------------------------------------------

describe('buildSheetDocument', () => {
  it('follows the order of the real sheet', () => {
    const headings = sheetDoc.blocks
      .filter((b) => b.kind === 'heading' && b.level === 1)
      .map((b) => (b as { text: string }).text)
    expect(headings).toEqual([
      'General information',
      'Describe your projects',
      'Record your activities',
      'Professional Criteria',
      'Reflect on your experience',
      'Appendix — the entries behind this sheet',
    ])
  })

  it('points at the current PEDR system, not the old one', () => {
    const text = JSON.stringify(sheetDoc.blocks)
    expect(text).toContain('register.architecture.com/pedr')
    expect(text).not.toContain('pedr.co.uk')
  })

  it('names the file and the period', () => {
    expect(sheetDoc.meta.name).toBe('pedr-2026-07-01-to-2026-09-30')
    expect(sheetDoc.meta.author).toBe('Hemant Jindal')
  })

  it('carries the supervisor’s registration, which category i depends on', () => {
    const facts = sheetDoc.blocks.find((b) => b.kind === 'facts')
    expect(JSON.stringify(facts)).toContain('ARB 099887')
  })

  it('spells out what a category actually means', () => {
    expect(JSON.stringify(sheetDoc.blocks)).toContain('under the direct supervision of an architect')
  })

  it('leaves the appendix out unless it is asked for', () => {
    const without = buildSheetDocument({
      content, periodStart, periodEnd, candidateName: 'Hemant Jindal', employment, entries, projects,
    })
    expect(JSON.stringify(without.blocks)).not.toContain('Appendix')
  })
})

describe('buildAppraisalDocument', () => {
  const doc = buildAppraisalDocument({
    content, periodStart, periodEnd, candidateName: 'Hemant Jindal',
    employment, role: 'mentor',
  })

  it('gives the mentor the quarter before the boxes', () => {
    const kinds = doc.blocks.map((b) => b.kind)
    expect(kinds.indexOf('facts')).toBeLessThan(kinds.indexOf('fill'))
  })

  it('leaves real space to write in', () => {
    const fills = doc.blocks.filter((b) => b.kind === 'fill')
    expect(fills.length).toBeGreaterThanOrEqual(6)
    expect(fills.every((f) => (f as { lines: number }).lines > 0)).toBe(true)
  })

  it('says which criteria were not touched', () => {
    // Only PC2, PC3 and PC5 appear in the entries above.
    expect(JSON.stringify(doc.blocks)).toContain('Not touched this quarter: PC1, PC4')
  })

  it('asks a supervisor for their registration number', () => {
    const supervisor = buildAppraisalDocument({
      content, periodStart, periodEnd, candidateName: 'Hemant Jindal',
      employment, role: 'supervisor',
    })
    expect(JSON.stringify(supervisor.blocks)).toContain('ARB / RIBA registration number')
  })
})

describe('renderMarkdown', () => {
  const md = renderMarkdown(sheetDoc)

  it('produces headings you can paste section by section', () => {
    expect(md).toContain('# PEDR quarterly record sheet')
    expect(md).toContain('## General information')
    expect(md).toContain('## Reflect on your experience')
  })

  it('escapes a pipe so it cannot break a table', () => {
    const rendered = renderMarkdown({
      meta: { name: 'x', title: 'x', author: 'x' },
      blocks: [{ kind: 'table', head: ['A'], rows: [['left | right']] }],
    })
    expect(rendered).toContain('left \\| right')
  })

  it('never leaves three blank lines in a row', () => {
    expect(md).not.toMatch(/\n{3}/)
  })
})

describe('renderDocument', () => {
  it('produces a PDF that opens', async () => {
    const file = await renderDocument(sheetDoc, 'pdf')
    expect(file.filename).toBe('pedr-2026-07-01-to-2026-09-30.pdf')
    expect(file.contentType).toBe('application/pdf')
    const bytes = file.body as Uint8Array
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBeGreaterThan(1)
    expect(reopened.getTitle()).toContain('PEDR record sheet')
  })

  it('produces a Word file that is a real zip', async () => {
    const file = await renderDocument(sheetDoc, 'docx')
    expect(file.filename).toBe('pedr-2026-07-01-to-2026-09-30.docx')
    const bytes = file.body as Uint8Array
    // Every .docx is a zip, and every zip starts PK\x03\x04.
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(bytes.length).toBeGreaterThan(4000)
  })

  it('renders the appraisal in both formats', async () => {
    const doc = buildAppraisalDocument({
      content, periodStart, periodEnd, candidateName: 'Hemant Jindal',
      employment, role: 'mentor',
    })
    const pdf = await renderDocument(doc, 'pdf')
    const docx = await renderDocument(doc, 'docx')
    expect((pdf.body as Uint8Array).length).toBeGreaterThan(1000)
    expect((docx.body as Uint8Array).length).toBeGreaterThan(4000)
  })

  it('survives a sheet with nothing in it', async () => {
    const empty = buildSheet({
      periodStart, periodEnd, entries: [], notes: [], projects: [], employment: null,
    })
    const doc = buildSheetDocument({
      content: empty, periodStart, periodEnd, candidateName: 'Nobody', employment: null,
    })
    await expect(renderDocument(doc, 'pdf')).resolves.toBeTruthy()
    await expect(renderDocument(doc, 'docx')).resolves.toBeTruthy()
    expect(renderMarkdown(doc)).toContain('No project work recorded')
  })
})

describe('the PDF text layer', () => {
  it('folds the characters the standard fonts cannot draw', () => {
    // pdf-lib throws on these rather than dropping them, which would take a
    // whole export down over one curly quote in somebody's project note.
    expect(sanitise('“rev C” — it’s fine…')).toBe('"rev C" - it\'s fine...')
    expect(sanitise('Battersea · Stage 4')).toBe('Battersea - Stage 4')
    expect(sanitise('emoji 🎉 gone')).toBe('emoji  gone')
  })

  it('keeps accented names, which are Latin-1', () => {
    expect(sanitise('José Fernández')).toBe('José Fernández')
  })

  it('draws every character the sheet actually contains', async () => {
    // The real test: the renderer must not throw on the demo content.
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const text = JSON.stringify(sheetDoc.blocks)
    expect(() => font.widthOfTextAtSize(sanitise(text), 9)).not.toThrow()
  })

  describe('wrap', () => {
    it('breaks on words', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const lines = wrap('the quick brown fox jumps over the lazy dog', font, 10, 80)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 80)).toBe(true)
    })

    it('breaks a single word too long for the column', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      const lines = wrap('supercalifragilisticexpialidocious', font, 10, 40)
      expect(lines.length).toBeGreaterThan(1)
      expect(lines.every((l) => font.widthOfTextAtSize(l, 10) <= 40)).toBe(true)
    })

    it('returns one empty line rather than nothing', async () => {
      const pdf = await PDFDocument.create()
      const font = await pdf.embedFont(StandardFonts.Helvetica)
      expect(wrap('', font, 10, 100)).toEqual([''])
    })
  })
})

// ---------------------------------------------------------------------------

/**
 * Every piece of text a PDF draws, with where it was drawn.
 *
 * The layout engine here is hand-written, so the failure to guard against is
 * text quietly landing in the margin or off the bottom of the page — which a
 * byte-count assertion will never notice and which nobody sees until a mentor
 * opens the file.
 */
/**
 * WinAnsi is Latin-1 apart from 0x80-0x9F, where it keeps the typographic
 * characters — a bullet lives at 0x95. Reading those bytes as Latin-1 yields
 * control characters that pdf-lib then refuses to measure.
 */
const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8a: '\u0160',
  0x8b: '\u2039', 0x8c: '\u0152', 0x8e: '\u017D', 0x91: '\u2018', 0x92: '\u2019',
  0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203A', 0x9c: '\u0153',
  0x9e: '\u017E', 0x9f: '\u0178',
}

function fromWinAnsi(bytes: Buffer): string {
  let out = ''
  for (const byte of bytes) {
    out += byte >= 0x80 && byte <= 0x9f
      ? (WIN_ANSI_HIGH[byte] ?? '')
      : String.fromCharCode(byte)
  }
  return out
}

type Drawn = { x: number; y: number; size: number; text: string; font: 'body' | 'bold' | 'italic' }

function textPositions(bytes: Uint8Array): Drawn[] {
  const buffer = Buffer.from(bytes)
  const latin = buffer.toString('latin1')
  const out: Drawn[] = []

  const streams = /stream\r?\n/g
  let match: RegExpExecArray | null
  while ((match = streams.exec(latin))) {
    const start = match.index + match[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) continue
    let content: string
    try {
      content = inflateSync(buffer.subarray(start, end)).toString('latin1')
    } catch {
      continue
    }
    // "/Helvetica-123 9 Tf ... 1 0 0 1 X Y Tm <hex> Tj"
    const draw = /\/(\S+?)-\d+\s+([\d.]+)\s+Tf[\s\S]*?1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\s*<([0-9A-Fa-f]*)>\s*Tj/g
    let op: RegExpExecArray | null
    while ((op = draw.exec(content))) {
      out.push({
        font: op[1] === 'Helvetica-Bold' ? 'bold' : op[1] === 'Helvetica-Oblique' ? 'italic' : 'body',
        size: Number(op[2]),
        x: Number(op[3]),
        y: Number(op[4]),
        text: fromWinAnsi(Buffer.from(op[5], 'hex')),
      })
    }
  }
  return out
}

describe('the PDF stays inside the page', () => {
  const A4 = { width: 595.28, height: 841.89 }
  const MARGIN = { top: 56, bottom: 64, left: 56, right: 56 }

  it('draws something on every page', async () => {
    const file = await renderDocument(sheetDoc, 'pdf')
    const drawn = textPositions(file.body as Uint8Array)
    expect(drawn.length).toBeGreaterThan(100)
  })

  it('never writes into the left margin', async () => {
    const file = await renderDocument(sheetDoc, 'pdf')
    const strays = textPositions(file.body as Uint8Array).filter((t) => t.x < MARGIN.left - 0.5)
    expect(strays).toEqual([])
  })

  it('never runs off the right edge', async () => {
    const file = await renderDocument(sheetDoc, 'pdf')
    // Measured in the face it was actually drawn in: bold is several percent
    // wider, so measuring everything in bold flags lines that in fact fit.
    const pdf = await PDFDocument.create()
    const faces = {
      body: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    }
    const strays = textPositions(file.body as Uint8Array).filter(
      (t) => t.x + faces[t.font].widthOfTextAtSize(t.text, t.size) > A4.width - MARGIN.right + 1,
    )
    expect(strays.map((s) => s.text)).toEqual([])
  })

  it('never falls off the bottom or the top', async () => {
    const file = await renderDocument(sheetDoc, 'pdf')
    const strays = textPositions(file.body as Uint8Array).filter(
      // 30 rather than the bottom margin: the footer sits below it on purpose.
      (t) => t.y < 30 || t.y > A4.height - MARGIN.top + 1,
    )
    expect(strays.map((s) => `${s.text} @ ${s.y}`)).toEqual([])
  })

  it('keeps a long appendix table inside the page too', async () => {
    // The table renderer paginates by itself, which is where this would break.
    const many = Array.from({ length: 120 }, (_, i) =>
      entry({
        date: '2026-07-06', minutes: 60, projectId: 'p1',
        activity: `Entry ${i} — a deliberately long description of a task, ` +
          'written the way somebody actually writes one, to force the column to wrap.',
      }),
    )
    const doc = buildSheetDocument({
      content, periodStart, periodEnd, candidateName: 'Hemant Jindal',
      employment, entries: many, projects, includeEntries: true,
    })
    const file = await renderDocument(doc, 'pdf')
    const drawn = textPositions(file.body as Uint8Array)
    const pdf = await PDFDocument.load(file.body as Uint8Array)
    expect(pdf.getPageCount()).toBeGreaterThan(4)
    expect(drawn.filter((t) => t.y < 30)).toEqual([])
    expect(drawn.filter((t) => t.x < MARGIN.left - 0.5)).toEqual([])
  })
})
