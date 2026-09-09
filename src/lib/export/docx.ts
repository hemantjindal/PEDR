import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageBreak,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import type { Block, ExportDocument } from './blocks'

/**
 * Word. The format a mentor comments in.
 *
 * This is not a nicety: RIBA does not let the appraisal be completed online —
 * it hands you a Word file to fill in and upload. So a .docx that already
 * carries the quarter's content, in the right order, is the file that actually
 * moves through the process.
 *
 * Styling is restrained on purpose. A document somebody else will edit and
 * track changes in should use real Word headings rather than hand-sized text,
 * so their outline pane, navigation and comments all work.
 */

const INK = '111111'
const QUIET = '666666'
const RULE = 'CCCCCC'

export async function renderDocx(doc: ExportDocument): Promise<Uint8Array> {
  const children: Array<Paragraph | Table> = []
  for (const block of doc.blocks) children.push(...renderBlock(block))

  const document = new Document({
    title: doc.meta.title,
    creator: doc.meta.author,
    description: 'Generated draft of a PEDR quarterly record sheet.',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 21 } }, // 10.5pt
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } }, // 20mm
        },
        footers: doc.meta.footer
          ? {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: doc.meta.footer, size: 16, color: QUIET })],
                  }),
                ],
              }),
            }
          : undefined,
        children,
      },
    ],
  })

  return pack(document)
}

/**
 * Bytes, on whichever platform this is running on.
 *
 * `Packer.toBuffer` asks JSZip for a nodebuffer, which throws outright in a
 * browser — and this renderer runs in one, in the standalone demo, where a
 * "download Word" button that silently fails is worse than not offering it.
 * `toBlob` is the browser path and gives the same zip.
 */
async function pack(document: Document): Promise<Uint8Array> {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(await Packer.toBuffer(document))
  }
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}

function renderBlock(block: Block): Array<Paragraph | Table> {
  switch (block.kind) {
    case 'title': {
      const out: Paragraph[] = [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 80 },
          children: [new TextRun({ text: block.text, bold: true, size: 34, color: INK })],
        }),
      ]
      if (block.subtitle) {
        out.push(new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: block.subtitle, size: 20, color: QUIET })],
        }))
      }
      return out
    }

    case 'heading':
      return [new Paragraph({
        heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        spacing: { before: block.level === 1 ? 320 : 200, after: 100 },
        children: [new TextRun({
          text: block.text,
          bold: true,
          size: block.level === 1 ? 26 : 22,
          color: INK,
        })],
      })]

    case 'paragraph':
      return [new Paragraph({
        spacing: { after: 140 },
        // A boxed caveat, so it does not read as part of the record itself.
        border: block.tone === 'note'
          ? {
              top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 },
              left: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 8 },
            }
          : undefined,
        children: [new TextRun({
          text: block.text,
          italics: block.tone === 'quiet',
          color: block.tone === 'quiet' ? QUIET : INK,
        })],
      })]

    case 'bullets':
      return block.items.map((item, i) => new Paragraph({
        bullet: { level: 0 },
        spacing: { after: i === block.items.length - 1 ? 140 : 40 },
        children: [new TextRun({ text: item, color: INK })],
      }))

    case 'facts':
      return [table(
        null,
        block.rows.map(([label, value]) => [label, value]),
        { numeric: new Set<number>(), labelColumn: true },
      )]

    case 'table':
      return [table(block.head, block.rows, { numeric: new Set(block.numeric ?? []) })]

    case 'fill': {
      const out: Paragraph[] = [
        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [new TextRun({ text: block.label, bold: true, color: INK })],
        }),
      ]
      if (block.hint) {
        out.push(new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: block.hint, italics: true, size: 18, color: QUIET })],
        }))
      }
      // Ruled lines rather than blank paragraphs, so it is obvious where to
      // type and the box does not collapse when it is left empty.
      for (let i = 0; i < block.lines; i++) {
        out.push(new Paragraph({
          spacing: { after: 0, line: 360 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
          children: [new TextRun({ text: '' })],
        }))
      }
      out.push(new Paragraph({ spacing: { after: 160 }, children: [] }))
      return out
    }

    case 'rule':
      return [new Paragraph({
        spacing: { before: 200, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } },
        children: [],
      })]

    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })]
  }
}

function table(
  head: string[] | null,
  rows: string[][],
  opts: { numeric: Set<number>; labelColumn?: boolean },
): Table {
  const body: TableRow[] = []

  if (head) {
    body.push(new TableRow({
      tableHeader: true,
      children: head.map((text, i) => new TableCell({
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [new Paragraph({
          alignment: opts.numeric.has(i) ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: true, size: 18, color: INK })],
        })],
      })),
    }))
  }

  for (const row of rows) {
    body.push(new TableRow({
      children: row.map((text, i) => new TableCell({
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [new Paragraph({
          alignment: opts.numeric.has(i) ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({
            text,
            bold: Boolean(opts.labelColumn && i === 0),
            color: opts.labelColumn && i === 0 ? QUIET : INK,
          })],
        })],
      })),
    }))
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.NONE, size: 0, color: RULE },
      right: { style: BorderStyle.NONE, size: 0, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: RULE },
    },
    rows: body,
  })
}
