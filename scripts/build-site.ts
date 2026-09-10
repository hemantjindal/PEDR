/**
 * Build the public site as one HTML file.
 *
 * Not a rewrite of the site: the pages are fetched from a running production
 * build and used as they came out, so what this publishes is byte-for-byte
 * what the Next app renders. The build only does four things to them — strips
 * the Next runtime, turns routes into hashes, inlines the stylesheet, and
 * mounts the one component that has to actually run (the triage and the
 * calendar recovery).
 *
 * It exists because this session cannot reach vercel.com — the egress policy
 * refuses the host outright — and a content surface nobody can open is not a
 * content surface. Publish the output as an artifact and the pages exist.
 *
 *   npm run build && npm run start &     # a production server on :3000
 *   npm run site
 */
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDES } from '../src/lib/content/guides'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const siteDir = join(root, 'site')
const outDir = join(siteDir, 'dist')
const base = process.env.SITE_BASE ?? 'http://localhost:3000'

interface Page {
  /** The app route, which becomes the hash. */
  path: string
  /** Shown in the top bar; omitted from it when absent. */
  nav?: string
}

// /behind and / are the same tool, so the static site carries it once.
const PAGES: Page[] = [
  { path: '/' },
  { path: '/what-is-a-pedr', nav: 'What a PEDR is' },
  { path: '/guides', nav: 'Answers' },
  ...GUIDES.map((g) => ({ path: `/guides/${g.slug}` })),
]

/** The tool is React; its server markup is the empty state and is no use here. */
const TOOL_PAGE = `
<div class="wrap" style="padding-block:34px">
  <div class="stack-l">
    <div data-tool></div>
    <div class="strip">
      <a href="#/what-is-a-pedr">What a PEDR actually is</a>
      <a href="#/guides">Answers</a>
    </div>
  </div>
</div>`

/** Everything between <main> and </main>, which is the page minus the shell. */
function mainOf(html: string, path: string): string {
  const open = html.indexOf('<main')
  const close = html.lastIndexOf('</main>')
  if (open === -1 || close === -1) throw new Error(`No <main> in ${path}`)
  const inner = html.slice(html.indexOf('>', open) + 1, close)
  return strip(inner)
}

/**
 * Take out everything that only means something inside a Next runtime.
 *
 * The hydration payload and the chunk tags would both try to boot a router
 * that is not here. The JSON-LD stays: it is the page's own content, and it is
 * as true on this copy as on the real one.
 */
function strip(html: string): string {
  return html
    .replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<template[^>]*>[\s\S]*?<\/template>/g, '')
}

/** Routes become hashes. */
function rewriteLinks(html: string): string {
  return html.replace(/href="(\/[^"#]*)"/g, (whole, href: string) => {
    if (href.startsWith('/_next') || href.startsWith('/icons') || href === '/manifest.webmanifest') {
      return whole
    }
    return `href="#${href}"`
  })
}

async function fetchPage(path: string): Promise<string> {
  const res = await fetch(`${base}${path}`, { redirect: 'manual' })
  if (res.status !== 200) throw new Error(`${path} → ${res.status}. Is \`npm run start\` running?`)
  return res.text()
}

async function main() {
  const island = await build({
    entryPoints: [join(siteDir, 'behind-island.tsx')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    platform: 'browser',
    jsx: 'automatic',
    // The page has no Next router under it, and `process.env.NODE_ENV` has to
    // be a literal or React ships its development build.
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      '@': join(root, 'src'),
      'next/link': join(siteDir, 'link-shim.tsx'),
    },
    write: false,
  })

  const js = island.outputFiles[0].text
  if (js.includes('</script')) throw new Error('Bundle would close its own script tag.')

  const pages: Array<{ path: string; nav?: string; html: string }> = []
  for (const page of PAGES) {
    const raw = await fetchPage(page.path)
    // The tool is rendered by React on the client; its server markup is the
    // pre-interaction state and would only have to be thrown away.
    const html = page.path === '/'
      ? TOOL_PAGE
      : rewriteLinks(mainOf(raw, page.path))
    pages.push({ ...page, html })
    process.stdout.write(`  ${page.path} — ${(html.length / 1024).toFixed(0)} kB\n`)
  }

  const appCss = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
    .replace(/^@import\s+"tailwindcss";\s*/m, '')
  const siteCss = readFileSync(join(siteDir, 'site.css'), 'utf8')

  const nav = pages
    .filter((p) => p.nav)
    .map((p) => `<a href="#${p.path}" data-nav="${p.path}">${p.nav}</a>`)
    .join('')

  const body = [
    '<div class="shell">',
    '<header class="topbar no-print"><div class="wrap topbar-inner">',
    '<a class="brand" href="#/"><span class="brand-mark">P</span><span>PEDR</span></a>',
    `<nav class="nav nav-public" aria-label="Sections">${nav}</nav>`,
    '<span class="spacer"></span>',
    '<a class="btn btn-ghost btn-sm" href="#/">Check yours</a>',
    '</div></header>',
    '<div style="flex:1">',
    ...pages.map((p) => `<section class="page" data-page="${p.path}">${p.html}</section>`),
    '</div>',
    '<footer class="wrap no-print" style="padding-block:24px">',
    '<p class="tiny faint">Not the official record — RIBA&rsquo;s system at ',
    'register.architecture.com/pedr is, and that is where your mentor and PSA sign.</p>',
    '</footer>',
    '</div>',
  ].join('\n')

  const router = `
(function () {
  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
  function show() {
    var path = (location.hash || '#/').slice(1) || '/';
    var found = pages.some(function (el) { return el.dataset.page === path; });
    if (!found) path = '/';
    pages.forEach(function (el) { el.dataset.active = String(el.dataset.page === path); });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.dataset.nav === path) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', show);
  show();
})();`

  const head = [
    // A name, not a headline: this is what a browser tab and a gallery card
    // have to be picked out by.
    '<title>Behind On Your PEDR</title>',
    '<meta name="description" content="Straight answers about the RIBA PEDR, and a tool that ' +
      'rebuilds the months you never wrote down from your calendar. No account.">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600&family=Figtree:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">',
  ].join('\n')

  const fragment = [
    head,
    `<style>\n${siteCss}\n${appCss}\n</style>`,
    body,
    `<script>\n${js}\n</script>`,
    `<script>${router}</script>`,
  ].join('\n')

  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'pedr-site.html')
  writeFileSync(out, fragment)
  console.log(
    `${out} — ${(fragment.length / 1024).toFixed(0)} kB ` +
    `(${pages.length} pages, island ${(js.length / 1024).toFixed(0)} kB)`,
  )
}

main().catch((error) => {
  console.error(String(error))
  process.exit(1)
})
