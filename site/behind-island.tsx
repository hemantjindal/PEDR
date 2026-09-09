/**
 * The one part of the static site that has to actually run.
 *
 * Everything else on the page is HTML Next already rendered. This is the tool,
 * and it is the real component — not a re-implementation that could drift away
 * from what the app does.
 */
import { createRoot } from 'react-dom/client'
import { CatchUpTool } from '@/components/catch-up-tool'

function mount() {
  for (const el of document.querySelectorAll('[data-tool]')) {
    createRoot(el).render(<CatchUpTool />)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
