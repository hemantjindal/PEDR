import type { ExportDocument, Format } from './blocks'
import { FORMAT_LABELS, MIME } from './blocks'
import { renderDocx } from './docx'
import { renderMarkdown } from './markdown'
import { renderPdf } from './pdf'

export * from './blocks'
export { buildSheetDocument } from './sheet-document'
export { buildAppraisalDocument } from './appraisal'
export type { AppraisalRole } from './appraisal'
export { renderMarkdown } from './markdown'

export interface RenderedFile {
  body: Uint8Array | string
  filename: string
  contentType: string
}

/**
 * One document, whichever format was asked for.
 *
 * The choice belongs to whoever is submitting: a PSA who wants to comment
 * needs Word, a Part 3 upload wants PDF, and the person copying section by
 * section into RIBA's form wants plain text. Guessing on their behalf just
 * means they convert it themselves.
 *
 * CSV is not a document — it is a row per entry — so it is produced elsewhere
 * and rejected here rather than faked.
 */
export async function renderDocument(
  doc: ExportDocument,
  format: Exclude<Format, 'csv'>,
): Promise<RenderedFile> {
  const filename = `${doc.meta.name}.${FORMAT_LABELS[format].extension}`
  const contentType = MIME[format]

  switch (format) {
    case 'pdf':
      return { body: await renderPdf(doc), filename, contentType }
    case 'docx':
      return { body: await renderDocx(doc), filename, contentType }
    case 'md':
      return { body: renderMarkdown(doc), filename, contentType }
  }
}

/** A download response with the headers a browser needs to save it properly. */
export function fileResponse(file: RenderedFile): Response {
  const body: BodyInit = typeof file.body === 'string'
    ? file.body
    // A fresh ArrayBuffer: a Uint8Array view over a pooled buffer would send
    // whatever else happened to be in it.
    : new Uint8Array(file.body).buffer as ArrayBuffer

  return new Response(body, {
    headers: {
      'content-type': file.contentType,
      'content-disposition': `attachment; filename="${file.filename}"`,
      'cache-control': 'no-store',
    },
  })
}
