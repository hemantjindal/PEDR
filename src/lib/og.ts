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
  const [black, regular] = await Promise.all([
    face('@fontsource/archivo-black', 'archivo-black-latin-400-normal.woff'),
    face('@fontsource/archivo', 'archivo-latin-400-normal.woff'),
  ])
  return [
    { name: 'Archivo Black', data: black, weight: 400 as const, style: 'normal' as const },
    { name: 'Archivo', data: regular, weight: 400 as const, style: 'normal' as const },
  ]
}

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_TYPE = 'image/png'

/** Matches the app: near-black ground, one signal yellow, hairline rules. */
export const OG_INK = '#0d0c0a'
export const OG_PAPER = '#f4f1ea'
export const OG_SIGNAL = '#ffe14d'
