/**
 * The formats, and why anyone would pick one.
 *
 * These live apart from the renderers so the picker can import them without
 * dragging pdf-lib and docx into a browser bundle.
 */

export const FORMATS = ['pdf', 'docx', 'md', 'csv'] as const
export type Format = (typeof FORMATS)[number]

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value)
}

export const FORMAT_LABELS: Record<Format, {
  name: string
  /** How it reads in a sentence: "Download the Word file". */
  noun: string
  extension: string
  note: string
}> = {
  pdf: {
    name: 'PDF',
    noun: 'PDF',
    extension: 'pdf',
    note: 'What Part 3 submissions ask for. Fixed layout, prints exactly as you see it.',
  },
  docx: {
    name: 'Word',
    noun: 'Word file',
    extension: 'docx',
    note: 'Editable, so a mentor can comment in it — and RIBA’s own appraisal template is a Word file.',
  },
  md: {
    name: 'Plain text',
    noun: 'text file',
    extension: 'md',
    note: 'Easiest thing to copy out of, section by section, into RIBA’s online form.',
  },
  csv: {
    name: 'Spreadsheet',
    noun: 'spreadsheet',
    extension: 'csv',
    note: 'One row per entry, with the dates and the hours. For your own arithmetic.',
  },
}

export const MIME: Record<Format, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
}
