import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib'
import type { Block, ExportDocument } from './blocks'

/**
 * PDF. The format Part 3 submissions ask for.
 *
 * pdf-lib rather than a printing browser: this has to run on a serverless
 * function with no Chromium and no filesystem, and the standard PDF fonts need
 * neither. The cost is that there is no layout engine, so there is a small one
 * here — measure, wrap, break, repeat — which is about two hundred lines and
 * behaves identically everywhere, rather than depending on which fonts a host
 * happens to have installed.
 */

const A4 = { width: 595.28, height: 841.89 }
const MARGIN = { top: 56, bottom: 64, left: 56, right: 56 }
const INK = rgb(0.07, 0.07, 0.07)
const QUIET = rgb(0.42, 0.42, 0.42)
const RULE = rgb(0.8, 0.8, 0.8)
/** WinAnsi has a bullet at 0x95, so the real glyph is safe to draw. */
const BULLET = '\u2022'

interface Fonts {
  body: PDFFont
  bold: PDFFont
  italic: PDFFont
}

/**
 * The layout state, mutated in place as blocks are drawn.
 *
 * It has to be one object rather than a value passed around: a block that
 * starts a new page has to move every later block onto it, and a snapshot
 * taken before the break would keep writing onto the page that is now full.
 */
class Layout {
  page: PDFPage
  y: number
  readonly width: number

  constructor(
    private readonly pdf: PDFDocument,
    readonly fonts: Fonts,
  ) {
    this.page = pdf.addPage([A4.width, A4.height])
    this.y = A4.height - MARGIN.top
    this.width = A4.width - MARGIN.left - MARGIN.right
  }

  break(): void {
    this.page = this.pdf.addPage([A4.width, A4.height])
    this.y = A4.height - MARGIN.top
  }

  /** Start a page when there is not room for `points` more. */
  need(points: number): void {
    if (this.y - points < MARGIN.bottom) this.break()
  }
}

export async function renderPdf(doc: ExportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(doc.meta.title)
  pdf.setAuthor(doc.meta.author)
  pdf.setCreator('PEDR')
  pdf.setProducer('PEDR')

  const fonts: Fonts = {
    body: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  }

  const layout = new Layout(pdf, fonts)
  for (const block of doc.blocks) drawBlock(block, layout)

  // Footers last, so the page count is known.
  if (doc.meta.footer) {
    const pages = pdf.getPages()
    const stem = sanitise(doc.meta.footer)
    pages.forEach((page, index) => {
      const label = `${stem}  -  ${index + 1} of ${pages.length}`
      const size = 7.5
      const w = fonts.body.widthOfTextAtSize(label, size)
      page.drawText(label, {
        x: A4.width - MARGIN.right - w,
        y: MARGIN.bottom - 28,
        size,
        font: fonts.body,
        color: QUIET,
      })
    })
  }

  return pdf.save()
}

function drawBlock(block: Block, ctx: Layout): void {
  const { fonts, width } = ctx

  switch (block.kind) {
    case 'title': {
      ctx.need(60)
      text(ctx, block.text, { font: fonts.bold, size: 20, colour: INK, leading: 24 })
      if (block.subtitle) {
        gap(ctx, 4)
        text(ctx, block.subtitle, { font: fonts.body, size: 10, colour: QUIET, leading: 13 })
      }
      gap(ctx, 14)
      return
    }

    case 'heading': {
      const size = block.level === 1 ? 13 : 10.5
      // A heading alone at the foot of a page is a heading on the wrong page.
      ctx.need(size + 34)
      gap(ctx, block.level === 1 ? 14 : 10)
      text(ctx, block.text, { font: fonts.bold, size, colour: INK, leading: size + 4 })
      if (block.level === 1) {
        gap(ctx, 5)
        line(ctx)
      }
      gap(ctx, 7)
      return
    }

    case 'paragraph': {
      const font = block.tone === 'quiet' ? fonts.italic : fonts.body
      const colour = block.tone === 'quiet' ? QUIET : INK
      if (block.tone === 'note') {
        // A rule down the left, so a caveat is not mistaken for the record.
        const start = ctx.page
        const startY = ctx.y
        text(ctx, block.text, { font, size: 9, colour, leading: 13, indent: 12 })
        if (ctx.page === start) {
          start.drawRectangle({
            x: MARGIN.left, y: ctx.y + 2, width: 2,
            height: startY - ctx.y, color: INK,
          })
        }
      } else {
        text(ctx, block.text, { font, size: 9.5, colour, leading: 13 })
      }
      gap(ctx, 8)
      return
    }

    case 'bullets': {
      for (const item of block.items) {
        ctx.need(14)
        const y = ctx.y
        ctx.page.drawText(BULLET, {
          x: MARGIN.left, y: y - 9, size: 9.5, font: fonts.body, color: QUIET,
        })
        text(ctx, item, { font: fonts.body, size: 9.5, colour: INK, leading: 13, indent: 12 })
        gap(ctx, 2)
      }
      gap(ctx, 6)
      return
    }

    case 'facts': {
      const labelWidth = Math.min(160, width * 0.34)
      for (const [label, value] of block.rows) {
        const lines = wrap(value, fonts.body, 9.5, width - labelWidth - 10)
        ctx.need(lines.length * 13 + 6)
        const top = ctx.y
        ctx.page.drawText(sanitise(label), {
          x: MARGIN.left, y: top - 9, size: 8, font: fonts.bold, color: QUIET,
        })
        lines.forEach((l, i) => {
          ctx.page.drawText(l, {
            x: MARGIN.left + labelWidth, y: top - 9 - i * 13, size: 9.5,
            font: fonts.body, color: INK,
          })
        })
        ctx.y = top - lines.length * 13 - 3
      }
      gap(ctx, 8)
      return
    }

    case 'table': {
      const columns = columnWidths(block, fonts, width)
      drawRow(ctx, block.head, columns, { font: fonts.bold, size: 8, colour: QUIET, numeric: block.numeric })
      line(ctx)
      gap(ctx, 3)
      for (const row of block.rows) {
        drawRow(ctx, row, columns, {
          font: fonts.body, size: 9, colour: INK, numeric: block.numeric,
          // Repeat the head when a long table runs onto the next page.
          onBreak: () => {
            drawRow(ctx, block.head, columns, {
              font: fonts.bold, size: 8, colour: QUIET, numeric: block.numeric,
            })
            line(ctx)
            gap(ctx, 3)
          },
        })
      }
      gap(ctx, 8)
      return
    }

    case 'fill': {
      ctx.need(30 + block.lines * 20)
      gap(ctx, 8)
      text(ctx, block.label, { font: fonts.bold, size: 10, colour: INK, leading: 13 })
      if (block.hint) {
        gap(ctx, 2)
        text(ctx, block.hint, { font: fonts.italic, size: 8, colour: QUIET, leading: 11 })
      }
      gap(ctx, 8)
      for (let i = 0; i < block.lines; i++) {
        ctx.need(20)
        ctx.y -= 18
        ctx.page.drawRectangle({
          x: MARGIN.left, y: ctx.y, width, height: 0.5, color: RULE,
        })
      }
      gap(ctx, 12)
      return
    }

    case 'rule':
      gap(ctx, 10)
      line(ctx)
      gap(ctx, 10)
      return

    case 'pageBreak':
      ctx.break()
      return
  }
}

// --- The layout primitives ---------------------------------------------------

function text(
  ctx: Layout,
  value: string,
  opts: { font: PDFFont; size: number; colour: ReturnType<typeof rgb>; leading: number; indent?: number },
): void {
  const indent = opts.indent ?? 0
  const lines = wrap(value, opts.font, opts.size, ctx.width - indent)
  for (const line of lines) {
    ctx.need(opts.leading)
    ctx.y -= opts.leading
    ctx.page.drawText(line, {
      x: MARGIN.left + indent,
      y: ctx.y + opts.leading - opts.size - 1,
      size: opts.size,
      font: opts.font,
      color: opts.colour,
    })
  }
}

function gap(ctx: Layout, points: number): void {
  ctx.y -= points
}

function line(ctx: Layout): void {
  ctx.need(4)
  ctx.page.drawRectangle({
    x: MARGIN.left, y: ctx.y, width: ctx.width, height: 0.75, color: RULE,
  })
  ctx.y -= 1
}

function drawRow(
  ctx: Layout,
  cells: string[],
  columns: number[],
  opts: {
    font: PDFFont
    size: number
    colour: ReturnType<typeof rgb>
    numeric?: number[]
    onBreak?: () => void
  },
): void {
  const numeric = new Set(opts.numeric ?? [])
  const wrapped = cells.map((cell, i) => wrap(cell, opts.font, opts.size, columns[i] - 8))
  const height = Math.max(...wrapped.map((w) => w.length)) * (opts.size + 3.5) + 5

  if (ctx.y - height < MARGIN.bottom) {
    ctx.break()
    opts.onBreak?.()
  }

  const top = ctx.y
  let x = MARGIN.left
  wrapped.forEach((lines, i) => {
    lines.forEach((lineText, row) => {
      const w = opts.font.widthOfTextAtSize(lineText, opts.size)
      ctx.page.drawText(lineText, {
        x: numeric.has(i) ? x + columns[i] - 8 - w : x,
        y: top - opts.size - 2 - row * (opts.size + 3.5),
        size: opts.size,
        font: opts.font,
        color: opts.colour,
      })
    })
    x += columns[i]
  })
  ctx.y = top - height
}

/**
 * Column widths from the content: every column gets what its widest cell needs,
 * then the surplus or shortfall is shared out proportionally. Fixed fractions
 * would leave "Manufacturing and Construction" wrapping in a narrow column
 * beside an empty one.
 */
function columnWidths(
  block: Extract<Block, { kind: 'table' }>,
  fonts: Fonts,
  total: number,
): number[] {
  const natural = block.head.map((head, i) => {
    const widest = Math.max(
      fonts.bold.widthOfTextAtSize(head, 8),
      ...block.rows.map((row) => fonts.body.widthOfTextAtSize(row[i] ?? '', 9)),
    )
    return widest + 14
  })
  const sum = natural.reduce((a, b) => a + b, 0)
  if (sum <= total) {
    // Spare room goes to the widest column, which is the descriptive one.
    const widest = natural.indexOf(Math.max(...natural))
    const out = [...natural]
    out[widest] += total - sum
    return out
  }
  // Too wide: shrink, but never below what a short word needs.
  const floor = 44
  const flexible = natural.map((w) => Math.max(0, w - floor))
  const flexTotal = flexible.reduce((a, b) => a + b, 0) || 1
  const excess = sum - total
  return natural.map((w, i) => Math.max(floor, w - (flexible[i] / flexTotal) * excess))
}

/**
 * Greedy word wrap. A single word longer than the column is broken rather than
 * allowed to run off the page — a URL in a project note should not lose the
 * right-hand edge of the table.
 */
export function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const paragraph of sanitise(value).split('\n')) {
    if (!paragraph) { out.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
        continue
      }
      if (line) out.push(line)
      if (font.widthOfTextAtSize(word, size) <= width) {
        line = word
        continue
      }
      // One word wider than the column.
      let chunk = ''
      for (const character of word) {
        if (font.widthOfTextAtSize(chunk + character, size) > width && chunk) {
          out.push(chunk)
          chunk = character
        } else {
          chunk += character
        }
      }
      line = chunk
    }
    out.push(line)
  }
  return out.length > 0 ? out : ['']
}

/**
 * The standard PDF fonts are WinAnsi, which has no curly quotes, dashes or
 * ellipses — pdf-lib throws on them rather than dropping them. Everything the
 * app writes in prose gets folded down to what the encoding can hold.
 */
export function sanitise(value: string): string {
  return value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[•]/g, '-')
    .replace(/·/g, '-')
    .replace(/\r\n?/g, '\n')
    // Anything left outside Latin-1 would still throw, so it goes.
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, '')
}
