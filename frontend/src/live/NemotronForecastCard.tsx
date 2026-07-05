/* Nemotron forecast card — the next 12 h of the real cat-4/5 wait curve,
   projected by Nemotron 3 Nano from the last 48 h of the published feed.
   The band is p10–p90, the dashes are p50; the solid tail is the real feed. */

import { useEffect } from 'react'
import { fmtWait } from '../data/live'
import { simToDate } from '../sim/time'
import { useLiveStore } from './liveStore'
import { runForecast } from './forecast'
import './live.css'

const TAIL_HOURS = 12

export function NemotronForecastCard() {
  const nvidia = useLiveStore((s) => s.nvidia)
  const fc = useLiveStore((s) => s.forecast)

  useEffect(() => {
    if (nvidia) runForecast()
  }, [nvidia])

  if (!nvidia) return null

  const tail = fc.history.slice(-TAIL_HOURS)
  const pts = fc.points
  const all = [...tail.map((p) => p.v), ...pts.flatMap((p) => [p.p10, p.p90])]
  const max = Math.max(60, ...all) * 1.1
  const W = 336
  const H = 92
  const t0 = tail[0]?.tMin ?? 0
  const t1 = pts.length ? pts[pts.length - 1].tMin : t0 + 1
  const x = (tMin: number) => ((tMin - t0) / (t1 - t0)) * W
  const y = (v: number) => H - (v / max) * H
  const nowX = tail.length ? x(tail[tail.length - 1].tMin) : 0

  const histPath = tail.map((p, i) => `${i ? 'L' : 'M'}${x(p.tMin).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const p50Path = pts.length
    ? `M${nowX.toFixed(1)},${y(tail[tail.length - 1].v).toFixed(1)} ` +
      pts.map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p50).toFixed(1)}`).join(' ')
    : ''
  const bandPath = pts.length
    ? `M${nowX.toFixed(1)},${y(tail[tail.length - 1].v).toFixed(1)} ` +
      pts.map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p90).toFixed(1)}`).join(' ') +
      ' ' +
      [...pts].reverse().map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p10).toFixed(1)}`).join(' ') +
      ' Z'
    : ''

  const hourLabel = (tMin: number) => `${String(simToDate(tMin).getHours()).padStart(2, '0')}`

  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">Next 12 h — Nemotron forecast</h2>
      {fc.status === 'done' && pts.length > 0 ? (
        <svg
          className="admin-pattern"
          viewBox={`0 0 ${W} ${H + 18}`}
          role="img"
          aria-label={`Nemotron 3 Nano forecast of the cat-4/5 median wait for the next 12 hours, p50 peaking at ${fmtWait(Math.max(...pts.map((p) => p.p50)))}`}
        >
          <path className="live-fc__band" d={bandPath} />
          <path className="live-fc__hist" d={histPath} />
          <path className="live-fc__p50" d={p50Path} />
          <line className="live-fc__nowline" x1={nowX} y1={0} x2={nowX} y2={H} />
          {[tail[0], ...pts.filter((_, i) => i % 3 === 2)].filter(Boolean).map((p) => (
            <text key={p.tMin} className="live-fc__tick" x={Math.min(x(p.tMin), W - 12)} y={H + 13}>
              {hourLabel(p.tMin)}
            </text>
          ))}
        </svg>
      ) : (
        <p className="admin-card__caption">
          {fc.status === 'error'
            ? `Forecast call failed — the real 7-day pattern above still carries the story. ${fc.error ?? ''}`
            : 'Nemotron 3 Nano is reading the last 48 h of the feed…'}
        </p>
      )}
      <p className="admin-card__caption">
        Solid: the hospital's real published feed (last {TAIL_HOURS} h). Dashed + band: p50 and
        p10–p90 from <strong>Nemotron 3 Nano (30B-A3B)</strong> reading the last 48 h zero-shot —
        a live model call, labeled as such, not the seed.
      </p>
    </section>
  )
}
