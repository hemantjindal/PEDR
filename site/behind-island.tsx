/**
 * The one part of the static site that has to actually run.
 *
 * Everything else on the page is HTML Next already rendered. This is the
 * triage and the calendar recovery, which are the point of the page, and they
 * are the real components — not a re-implementation that could drift away from
 * what the app does.
 */
import { createRoot } from 'react-dom/client'
import { Triage } from '@/components/triage'

function mount() {
  const el = document.getElementById('behind-root')
  if (el) createRoot(el).render(<Triage />)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
