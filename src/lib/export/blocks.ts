/**
 * One document, three formats.
 *
 * A PEDR gets handed around: pasted into RIBA's online form, emailed to a
 * mentor who wants a Word file they can comment on, and uploaded as a PDF for
 * the Part 3 submission. Writing the layout three times is how the Word
 * version quietly stops matching the PDF, so the sheet is built once as blocks
 * and each renderer only decides how a heading or a table looks.
 *
 * The vocabulary is deliberately small. Anything a renderer cannot express
 * honestly is not in it.
 */

export type Block =
  | { kind: 'title'; text: string; subtitle?: string }
  | { kind: 'heading'; level: 1 | 2; text: string }
  | { kind: 'paragraph'; text: string; tone?: Tone }
  | { kind: 'bullets'; items: string[] }
  /** Label-and-value pairs: the General Information half of the sheet. */
  | { kind: 'facts'; rows: Array<[string, string]> }
  | { kind: 'table'; head: string[]; rows: string[][]; numeric?: number[] }
  /** An empty box for somebody to write in — the appraisal sections. */
  | { kind: 'fill'; label: string; hint?: string; lines: number }
  | { kind: 'rule' }
  | { kind: 'pageBreak' }

/** `quiet` is guidance to the reader; `note` is a boxed caveat. */
export type Tone = 'body' | 'quiet' | 'note'

export interface DocumentMeta {
  /** The filename stem and the PDF/Word title property. */
  name: string
  title: string
  author: string
  /** Printed in the footer of every page. */
  footer?: string
}

export interface ExportDocument {
  meta: DocumentMeta
  blocks: Block[]
}

export { FORMATS, FORMAT_LABELS, MIME, isFormat } from '../pedr/formats'
export type { Format } from '../pedr/formats'
