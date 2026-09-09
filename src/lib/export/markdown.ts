import type { Block, ExportDocument } from './blocks'

/**
 * Markdown. The format you copy out of.
 *
 * RIBA's form is a set of web textareas, so the practical job here is that a
 * section can be selected and pasted without dragging formatting along with
 * it. Tables are the one exception — a pipe table pastes badly, but it reads
 * correctly in every editor and is the only honest way to show hours against
 * stages in plain text.
 */
export function renderMarkdown(doc: ExportDocument): string {
  const out: string[] = []
  for (const block of doc.blocks) out.push(...renderBlock(block))
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

function renderBlock(block: Block): string[] {
  switch (block.kind) {
    case 'title':
      return block.subtitle
        ? [`# ${block.text}`, '', block.subtitle, '']
        : [`# ${block.text}`, '']

    case 'heading':
      return [`${'#'.repeat(block.level + 1)} ${block.text}`, '']

    case 'paragraph':
      return block.tone === 'note'
        ? [`> ${block.text}`, '']
        : block.tone === 'quiet'
          ? [`_${block.text}_`, '']
          : [block.text, '']

    case 'bullets':
      return [...block.items.map((item) => `- ${item}`), '']

    case 'facts':
      return [
        '| | |',
        '|---|---|',
        ...block.rows.map(([label, value]) => `| ${label} | ${escapeCell(value)} |`),
        '',
      ]

    case 'table': {
      const numeric = new Set(block.numeric ?? [])
      return [
        `| ${block.head.join(' | ')} |`,
        `|${block.head.map((_, i) => (numeric.has(i) ? '---:' : '---')).join('|')}|`,
        ...block.rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
        '',
      ]
    }

    case 'fill':
      return [
        `**${block.label}**`,
        '',
        ...(block.hint ? [`_${block.hint}_`, ''] : []),
        // A run of blanks is meaningless in Markdown; say what the space is for.
        '_[ Space for your answer ]_',
        '',
      ]

    case 'rule':
      return ['---', '']

    case 'pageBreak':
      return ['', '---', '']
  }
}

/** A pipe inside a cell would end the column early. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}
