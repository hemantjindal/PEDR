/**
 * Build the standalone demo: one HTML file with the real app inlined.
 *
 * The engine is bundled from `src/lib`, the stylesheet is the app's own
 * `globals.css` read verbatim, and the record is the same one `npm run seed`
 * writes into the database. Nothing here is a copy, so the page cannot drift
 * into being a flattering mock-up of the app.
 *
 * Output goes to demo/dist/pedr-demo.html and runs from a file:// URL with no
 * server and no database. Run:  npm run demo
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const demo = join(root, 'demo')
const outDir = join(demo, 'dist')

async function main() {
  const bundled = await build({
    entryPoints: [join(demo, 'entry.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'PEDR',
    minify: true,
    target: 'es2020',
    platform: 'browser',
    alias: { '@': join(root, 'src') },
    write: false,
  })

  const engine = bundled.outputFiles[0].text
  if (engine.includes('</script')) {
    // Would close the inline script tag early and silently break the page.
    throw new Error('Bundle contains a closing script tag; it cannot be inlined as-is.')
  }

  // The app's own stylesheet, minus the Tailwind directive a browser cannot
  // resolve. demo.css supplies the reset that directive was providing.
  const appCss = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
    .replace(/^@import\s+"tailwindcss";\s*/m, '')
  const demoCss = readFileSync(join(demo, 'demo.css'), 'utf8')

  const html = [
    '<!doctype html>',
    '<html lang="en-GB">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="theme-color" content="#0d0c0a">',
    readFileSync(join(demo, 'head.html'), 'utf8'),
    `<style>\n${demoCss}\n${appCss}\n</style>`,
    '</head>',
    '<body>',
    readFileSync(join(demo, 'body.html'), 'utf8'),
    `<script>\n${engine}\n</script>`,
    `<script>\n${readFileSync(join(demo, 'app.js'), 'utf8')}\n</script>`,
    '</body>',
    '</html>',
  ].join('\n')

  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'pedr-demo.html')
  writeFileSync(out, html)
  console.log(`${out} — ${(html.length / 1024).toFixed(0)} kB (engine ${(engine.length / 1024).toFixed(0)} kB)`)

  // The same page without its document wrapper, for hosts that supply their
  // own <head> and <body>. Same content, so the two cannot disagree.
  const fragment = [
    readFileSync(join(demo, 'head.html'), 'utf8'),
    `<style>\n${demoCss}\n${appCss}\n</style>`,
    readFileSync(join(demo, 'body.html'), 'utf8'),
    `<script>\n${engine}\n</script>`,
    `<script>\n${readFileSync(join(demo, 'app.js'), 'utf8')}\n</script>`,
  ].join('\n')
  const fragmentOut = join(outDir, 'pedr-demo.fragment.html')
  writeFileSync(fragmentOut, fragment)
  console.log(`${fragmentOut} — ${(fragment.length / 1024).toFixed(0)} kB (no document wrapper)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
