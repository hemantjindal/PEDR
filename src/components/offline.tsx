'use client'

import { useEffect, useState } from 'react'

/**
 * Registering the service worker, and saying when the network is gone.
 *
 * The banner matters more than it looks. Once a page is being served from a
 * cache, everything on it is as old as the last time it loaded — and a
 * dashboard quietly showing last week's figures, with a deadline that has
 * since passed, is worse than no dashboard. So when the network is down the
 * app says so, in the one place nothing else competes with.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Nothing to gain from caching a build that changes on every save.
    if (process.env.NODE_ENV !== 'production') return
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A refused registration means no offline support, not a broken app.
      })
    }
    // After load, so it never competes with the first paint.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}

export function OfflineBanner() {
  // Assume online until told otherwise: rendering "offline" for a frame on a
  // perfectly good connection trains people to ignore it.
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="offline-banner no-print" role="status">
      <strong>No signal.</strong>{' '}
      Anything on screen is as old as the last time it loaded. You can still write today down —
      it will be kept on this phone until you are back.
    </div>
  )
}
