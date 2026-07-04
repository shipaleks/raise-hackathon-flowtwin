import type { LoadLevel } from '../../sim/engine'
import './ui.css'

const LEVEL_VAR: Record<LoadLevel, string> = {
  ok: 'var(--ok)',
  busy: 'var(--warn)',
  over: 'var(--crit)',
}

export interface LoadRingProps {
  ratio: number
  level: LoadLevel
  count: number
  size?: number
}

/**
 * Zone load donut: arc = occupancy vs capacity, color = status level, and the
 * live agent count sits in the middle so color is never the only signal.
 */
export function LoadRing({ ratio, level, count, size = 30 }: LoadRingProps) {
  const r = 10
  const c = 2 * Math.PI * r
  const frac = Math.max(0.02, Math.min(1, ratio))
  return (
    <svg
      className="load-ring"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      role="img"
      aria-label={`${count} present, ${Math.round(ratio * 100)}% of capacity, ${level === 'ok' ? 'flowing' : level === 'busy' ? 'busy' : 'over capacity'}`}
    >
      <circle cx="13" cy="13" r={r} fill="none" stroke="var(--grid)" strokeWidth="2.5" />
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke={LEVEL_VAR[level]}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform="rotate(-90 13 13)"
        className="load-ring__arc"
      />
      <text
        x="13"
        y="16.6"
        textAnchor="middle"
        fontSize="10.5"
        fontWeight="650"
        fill="var(--ink)"
        className="tnum"
      >
        {count}
      </text>
    </svg>
  )
}
