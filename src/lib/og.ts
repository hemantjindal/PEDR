import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Fonts for the OpenGraph cards.
 *
 * Satori cannot read woff2, and @fontsource ships plain woff alongside it, so
 * the same two faces the site uses can be reused rather than approximated.
 * Every card is generated at build time (`force-static`), so reading out of
 * node_modules is safe — nothing here runs on a request.
 */
async function face(pkg: string, file: string): Promise<ArrayBuffer> {
  const full = path.join(process.cwd(), 'node_modules', pkg, 'files', file)
  const buf = await readFile(full)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

export async function ogFonts() {
  const [display, mono] = await Promise.all([
    face('@fontsource/familjen-grotesk', 'familjen-grotesk-latin-600-normal.woff'),
    face('@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff'),
  ])
  return [
    { name: 'Familjen Grotesk', data: display, weight: 400 as const, style: 'normal' as const },
    { name: 'IBM Plex Mono', data: mono, weight: 400 as const, style: 'normal' as const },
  ]
}

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_TYPE = 'image/png'

/** The app's own trace, graphite and pen. */
export const OG_INK = '#232019'
export const OG_PAPER = '#f2efe6'
export const OG_SIGNAL = '#1b4d7e'
