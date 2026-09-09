'use client'

import { useEffect, useState } from 'react'

/**
 * Putting it on a phone.
 *
 * This is a web app that installs to the home screen, not an App Store build,
 * and that difference is worth stating plainly rather than glossing: there is
 * no app to search for, and Apple gives web apps no install prompt at all — on
 * iOS somebody has to go through the Share menu themselves, which is exactly
 * why nobody ever does it unless they are told how.
 *
 * Android and desktop Chrome do fire an install event, so where one is offered
 * it is used, and where it is not the steps are written out.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Platform = 'ios' | 'android' | 'desktop' | 'installed'

export function InstallPanel() {
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari's own flag, which predates the standard one.
      (window.navigator as { standalone?: boolean }).standalone === true
    if (standalone) {
      setPlatform('installed')
      return
    }
    const ua = navigator.userAgent
    setPlatform(
      /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)
        ? 'ios'
        : /Android/.test(ua)
          ? 'android'
          : 'desktop',
    )

    const capture = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', capture)
    return () => window.removeEventListener('beforeinstallprompt', capture)
  }, [])

  if (platform === null) return null

  if (platform === 'installed') {
    return (
      <section className="sheet stack-s">
        <div className="sheet-head">
          <div>
            <span className="label">Installed</span>
            <h2 style={{ marginTop: 3 }}>It is on your home screen</h2>
          </div>
        </div>
        <p className="small dim">
          Pages you have opened stay readable with no signal, and anything you write on site is
          kept on the phone until you are back.
        </p>
      </section>
    )
  }

  return (
    <section className="sheet stack-s">
      <div className="sheet-head">
        <div>
          <span className="label">On your phone</span>
          <h2 style={{ marginTop: 3 }}>Put it on the home screen</h2>
        </div>
      </div>

      <p className="small dim">
        It opens like an app — its own icon, no browser bar — and the box for writing today down
        keeps working with no signal.
      </p>

      {prompt && (
        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await prompt.prompt()
              const choice = await prompt.userChoice
              setOutcome(
                choice.outcome === 'accepted'
                  ? 'Installed. Look for the yellow P.'
                  : 'No problem — the browser works just as well.',
              )
              setPrompt(null)
            }}
          >
            Install it
          </button>
          {outcome && <span className="small dim">{outcome}</span>}
        </div>
      )}
      {outcome && !prompt && <p className="small dim">{outcome}</p>}

      {platform === 'ios' && (
        <ol className="small dim" style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 4, listStyleType: 'decimal' }}>
          <li>Tap the Share button — the square with the arrow out of it.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap Add.</li>
        </ol>
      )}

      {platform === 'android' && !prompt && (
        <ol className="small dim" style={{ paddingLeft: 20, margin: 0, display: 'grid', gap: 4, listStyleType: 'decimal' }}>
          <li>Tap the three dots in Chrome.</li>
          <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        </ol>
      )}

      {platform === 'desktop' && !prompt && (
        <p className="small dim">
          In Chrome or Edge, the install button sits at the right-hand end of the address bar.
          Safari has it under File → Add to Dock.
        </p>
      )}

      <p className="tiny faint">
        Worth being straight about what this is: a web app you install, not an App Store download.
        It gets an icon, its own window and offline notes. It does not get push notifications on
        an iPhone unless it is installed this way, and it never gets the things only a native app
        can do. For what a PEDR needs, that is the whole list.
      </p>
    </section>
  )
}
