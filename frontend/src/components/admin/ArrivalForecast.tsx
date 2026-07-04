import { useEffect, useRef, useState } from 'react'
import type { AdminKpis } from '../../types'

/* Grouped-bar arrival forecast: 3 hour groups × 3 entry modes, in the fixed
   series order ambulance / walk-in / referral. Geometry is computed from the
   measured container width so bars stay ≤20px thick at any layout width. */

type Forecast = AdminKpis['arrival_forecast_next_3h']

const MODES = [
  { key: 'ambulance', label: 'ambulance', color: 'var(--cat-1)' },
  { key: 'walk-in', label: 'walk-in', color: 'var(--cat-2)' },
  { key: 'referral', label: 'referral', color: 'var(--cat-3)' },
] as const

const H = 196
const PAD_T = 22
const PAD_B = 26
const PAD_L = 28
const PAD_R = 12
const PLOT_H = H - PAD_T - PAD_B
const GAP = 2
const MAX_BAR = 20

/** A rect with rounded top corners and a square baseline. */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h))
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width)
    })
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function ArrivalForecast({ forecast }: { forecast: Forecast }) {
  const [ref, W] = useMeasuredWidth()
  const [hover, setHover] = useState<{ gi: number; mi: number } | null>(null)

  let maxMode = 0
  for (const g of forecast) for (const m of MODES) maxMode = Math.max(maxMode, g.by_mode[m.key] ?? 0)
  const yMax = Math.max(2, Math.ceil(maxMode))
  const ticks = Array.from({ length: yMax + 1 }, (_, i) => i)

  const plotW = Math.max(0, W - PAD_L - PAD_R)
  const groupSlot = forecast.length ? plotW / forecast.length : 0
  const barW = Math.max(4, Math.min(MAX_BAR, (groupSlot * 0.64 - GAP * 2) / 3))
  const barsBlock = barW * 3 + GAP * 2
  const baselineY = PAD_T + PLOT_H
  const valH = (v: number) => (v / yMax) * PLOT_H
  const groupX = (gi: number) => PAD_L + gi * groupSlot
  const barX = (gi: number, mi: number) => groupX(gi) + (groupSlot - barsBlock) / 2 + mi * (barW + GAP)

  const summary =
    'Expected arrivals over the next 3 hours by entry mode. ' +
    forecast
      .map(
        (g) =>
          `${g.hour}: ${g.expected_arrivals.toFixed(1)} total (` +
          MODES.map((m) => `${m.label} ${(g.by_mode[m.key] ?? 0).toFixed(1)}`).join(', ') +
          ')',
      )
      .join('; ')

  const hg = hover ? forecast[hover.gi] : null
  const tip = hover && hg
    ? {
        x: barX(hover.gi, hover.mi) + barW / 2,
        y: baselineY - valH(hg.by_mode[MODES[hover.mi].key] ?? 0),
        text: `${MODES[hover.mi].label} · ${(hg.by_mode[MODES[hover.mi].key] ?? 0).toFixed(1)} expected`,
      }
    : null

  return (
    <div className="admin-chart">
      <div className="admin-chart__plot" ref={ref}>
        {W > 0 ? (
          <svg className="admin-chart__svg" width={W} height={H} role="img" aria-label={summary}>
            {ticks.map((t) => {
              const y = baselineY - (t / yMax) * PLOT_H
              return (
                <g key={t}>
                  <line className="admin-chart__grid" x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} />
                  <text className="admin-chart__tick" x={PAD_L - 7} y={y + 3.5} textAnchor="end">
                    {t}
                  </text>
                </g>
              )
            })}

            {forecast.map((g, gi) => {
              const cx = groupX(gi) + groupSlot / 2
              return (
                <g key={g.hour}>
                  <text className="admin-chart__total tnum" x={cx} y={14} textAnchor="middle">
                    {g.expected_arrivals.toFixed(1)}
                  </text>
                  {MODES.map((m, mi) => {
                    const v = g.by_mode[m.key] ?? 0
                    const h = valH(v)
                    const x = barX(gi, mi)
                    const active = hover?.gi === gi && hover?.mi === mi
                    return (
                      <g key={m.key}>
                        {h > 0.5 ? (
                          <path
                            d={topRoundedRect(x, baselineY - h, barW, h, 4)}
                            fill={m.color}
                            opacity={hover && !active ? 0.5 : 1}
                          />
                        ) : null}
                        <rect
                          className="admin-chart__hit"
                          x={x - GAP / 2}
                          y={PAD_T}
                          width={barW + GAP}
                          height={PLOT_H}
                          aria-label={`${g.hour} ${m.label}: ${v.toFixed(1)} expected`}
                          onMouseEnter={() => setHover({ gi, mi })}
                          onMouseLeave={() => setHover(null)}
                        >
                          <title>{`${m.label} · ${v.toFixed(1)} expected`}</title>
                        </rect>
                      </g>
                    )
                  })}
                  <text className="admin-chart__hour" x={cx} y={baselineY + 17} textAnchor="middle">
                    {g.hour}
                  </text>
                </g>
              )
            })}
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}

        {tip ? (
          <div className="admin-chart__tip" style={{ left: tip.x, top: tip.y - 8 }}>
            {tip.text}
          </div>
        ) : null}
      </div>

      <div className="admin-chart__legend">
        {MODES.map((m) => (
          <span className="admin-chart__legend-item" key={m.key}>
            <span className="admin-chart__swatch" style={{ background: m.color }} />
            {m.label}
          </span>
        ))}
      </div>

      <p className="admin-chart__caption">
        FlowTwin Arrival Forecast — historical rate by hour-of-day over the 7-day log.
      </p>
    </div>
  )
}
