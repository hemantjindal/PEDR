import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

/**
 * The app icon, drawn from the same mark the header uses.
 *
 * A home-screen icon is the only thing most people will ever see of this on a
 * phone, so it is generated from the palette rather than dropped in as a
 * binary nobody can regenerate. Run `npx tsx scripts/icons.ts` after changing
 * the mark.
 *
 * Two shapes, because platforms disagree:
 *  - `any`: the mark on its ground, edge to edge. Android draws it as-is,
 *    iOS rounds the corners itself.
 *  - `maskable`: the same mark inside the 80% safe circle, so Android can crop
 *    it to whatever shape the launcher uses without eating the letter.
 */

const INK = '#0d0c0a'
const SIGNAL = '#e8b10a'

const SIZES = [
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-192.png', size: 192, purpose: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable' },
  // iOS ignores the manifest icons and uses this one.
  { file: 'apple-touch-icon.png', size: 180, purpose: 'ios' },
] as const

type Purpose = (typeof SIZES)[number]['purpose']

function markup(size: number, purpose: Purpose): string {
  // Maskable icons must survive a circular crop, so the mark shrinks and the
  // ground grows. iOS applies its own rounding and squeezes nothing.
  const inset = purpose === 'maskable' ? size * 0.19 : 0
  const inner = size - inset * 2
  const letter = inner * (purpose === 'ios' ? 0.62 : 0.66)
  const bar = Math.max(2, size * 0.035)

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {
      font-family: 'Archivo Black';
      src: url('data:font/woff2;base64,${''}') format('woff2');
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${size}px; height: ${size}px; }
    .ground {
      width: ${size}px; height: ${size}px; background: ${SIGNAL};
      display: grid; place-items: center;
    }
    .mark {
      width: ${inner}px; height: ${inner}px; background: ${SIGNAL};
      display: grid; place-items: center; position: relative;
    }
    .letter {
      font: 900 ${letter}px/1 'Archivo Black', 'Helvetica Neue', Arial, sans-serif;
      color: ${INK}; letter-spacing: -0.04em;
      transform: translateY(-2%);
    }
    /* The rule under the mark is the one piece of the app's furniture that
       still reads at 48 pixels. */
    .rule {
      position: absolute; left: 18%; right: 18%; bottom: 14%;
      height: ${bar}px; background: ${INK};
    }
  </style></head><body>
    <div class="ground"><div class="mark"><span class="letter">P</span><span class="rule"></span></div></div>
  </body></html>`
}

async function main() {
  const out = 'public/icons'
  mkdirSync(out, { recursive: true })

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  })
  try {
    for (const { file, size, purpose } of SIZES) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      })
      await page.setContent(markup(size, purpose), { waitUntil: 'load' })
      const png = await page.screenshot({ omitBackground: false })
      writeFileSync(`${out}/${file}`, png)
      await page.close()
      console.log(`${out}/${file}  ${size}×${size}  ${png.length} bytes`)
    }
  } finally {
    await browser.close()
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('Could not draw the icons:', error)
    process.exit(1)
  },
)
