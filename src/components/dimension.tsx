'use client'

/**
 * A dimension line.
 *
 * The single most recognisable piece of drawing grammar there is: extension
 * lines at each end, tick marks on the diagonal, and the figure sitting in a
 * gap in the middle of the run. Architects read one without being told what it
 * is, which is exactly why it is the right way to state how much of two years
 * somebody has served.
 *
 * The measured run is drawn over the full length, so the page says "this much,
 * out of that much" in one glance and without a sentence.
 */
export function Dimension({
  value,
  max,
  label,
  animate = true,
}: {
  value: number
  max: number
  label: string
  animate?: boolean
}) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0

  return (
    <div className="dim-line" role="img" aria-label={`${label}: ${value} of ${max}`}>
      <div className="dim-run">
        <span className="dim-ext" />
        <span className="dim-track" />
        <span
          className="dim-measured"
          style={{ width: `${share * 100}%`, transitionDuration: animate ? '1100ms' : '0ms' }}
        >
          <span className="dim-tick" />
          <span className="dim-tick dim-tick-end" />
        </span>
        <span className="dim-ext dim-ext-end" />
      </div>
      <div className="dim-read">
        <span className="dim-value">{value}</span>
        <span className="dim-label">{label}</span>
        <span className="dim-of">of {max}</span>
      </div>
    </div>
  )
}
