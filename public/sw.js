/* eslint-disable no-restricted-globals */

/**
 * The service worker.
 *
 * The job it exists for is narrow and worth being clear about: a site visit
 * with no signal, on a Friday, when the thing you did that morning is still in
 * your head. Everything else it does is in service of the app opening at all
 * when the network does not answer.
 *
 * What it deliberately does not do is cache your record and serve it back as
 * if it were current. A stale dashboard that says you are up to date, when a
 * quarter is overdue, is worse than a page that admits it cannot reach the
 * server. So pages are network-first with an honest offline fallback, and the
 * cached copy is only ever a last resort.
 */

const VERSION = 'v2'
const SHELL = `pedr-shell-${VERSION}`
const PAGES = `pedr-pages-${VERSION}`
const ASSETS = `pedr-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'

/** Everything needed to render *something* with no network at all. */
const SHELL_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // One at a time, not addAll: addAll rejects as a unit, so one missing
      // icon would leave the offline page uncached and the worker useless at
      // the only moment it matters.
      .then((cache) => Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)),
      ))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('pedr-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache anything from the API. A cached answer about somebody's record
  // is a wrong answer the moment they add an entry, and a cached export is a
  // document with yesterday's hours in it.
  if (url.pathname.startsWith('/api/')) return

  // Build output is content-hashed, so it can be cached hard and forever.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(pageOrOffline(request))
  }
})

/** Immutable things: answer from the cache, fill it on a miss. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

/**
 * Pages: the network first, always. The cached copy is shown only when the
 * network fails, and the page itself says so — see the banner in the app.
 */
async function pageOrOffline(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(PAGES)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true })
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline ?? new Response(
      'You are offline and this page has not been opened before.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }
}
