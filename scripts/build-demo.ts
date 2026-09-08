/**
 * Build the standalone demo: one HTML file with the real parser inlined.
 *
 * Output goes to demo/dist/pedr-demo.html and runs from a file:// URL with no
 * server, no database and no network. Run:  npm run demo
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

  const html = [
    readFileSync(join(demo, 'head.html'), 'utf8'),
    readFileSync(join(demo, 'body.html'), 'utf8'),
    `<script>\n${engine}\n</script>`,
    `<script>\n${readFileSync(join(demo, 'app.js'), 'utf8')}\n</script>`,
  ].join('\n')

  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'pedr-demo.html')
  writeFileSync(out, html)
  console.log(`${out} — ${(html.length / 1024).toFixed(0)} kB (engine ${(engine.length / 1024).toFixed(0)} kB)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
