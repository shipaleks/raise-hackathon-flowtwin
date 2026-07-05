/* TFT forecast card — the next 24 h of the real cat-4/5 wait curve, from a
   Temporal Fusion Transformer (the reference model of NVIDIA's Time Series
   Prediction Platform) trained offline on 60 days of the real HA feed.

   Unlike the Nemotron card (a live zero-shot LLM read), this is a purpose-
   trained forecaster: its forecast + a real held-out backtest are baked into
   the seed, so the card always renders and its accuracy is a measured number,
   not a claim. Solid tail = real feed; dashes = p50; band = p10–p90. */

import { tftForecast, HOSPITAL } from '../data/seed'
import { seriesFor } from '../data/live'
import { parseT, simToDate } from '../sim/time'
import { fmtWait } from '../data/live'
import './live.css'

const TAIL_HOURS = 12

export function TftForecastCard() {
  const fc = tftForecast
  const pts = (fc.forecast[HOSPITAL.hospital_slug] ?? []).map((p) => ({
    tMin: parseT(p.t),
    p10: p.p10,
    p50: p.p50,
    p90: p.p90,
  }))
  if (!pts.length) return null

  // real feed tail leading up to the forecast anchor
  const anchorMin = parseT(fc.anchor_hkt)
  const tail = seriesFor(HOSPITAL.hospital_slug)
    .filter((p) => p.t45p50 != null && p.tMin <= anchorMin && p.tMin >= anchorMin - TAIL_HOURS * 60)
    .map((p) => ({ tMin: p.tMin, v: p.t45p50 as number }))

  const all = [...tail.map((p) => p.v), ...pts.flatMap((p) => [p.p10, p.p90])]
  const max = Math.max(60, ...all) * 1.1
  const W = 336
  const H = 92
  const t0 = tail[0]?.tMin ?? anchorMin
  const t1 = pts[pts.length - 1].tMin
  const x = (tMin: number) => ((tMin - t0) / (t1 - t0)) * W
  const y = (v: number) => H - (v / max) * H
  const joinV = tail.length ? tail[tail.length - 1].v : pts[0].p50
  const nowX = x(anchorMin)

  const histPath = tail
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.tMin).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join(' ')
  const p50Path =
    `M${nowX.toFixed(1)},${y(joinV).toFixed(1)} ` +
    pts.map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p50).toFixed(1)}`).join(' ')
  const bandPath =
    `M${nowX.toFixed(1)},${y(joinV).toFixed(1)} ` +
    pts.map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p90).toFixed(1)}`).join(' ') +
    ' ' +
    [...pts].reverse().map((p) => `L${x(p.tMin).toFixed(1)},${y(p.p10).toFixed(1)}`).join(' ') +
    ' Z'

  const hourLabel = (tMin: number) => `${String(simToDate(tMin).getHours()).padStart(2, '0')}`
  const bt = fc.backtest
  const heroTft = bt.hero_tft_mae_min ?? bt.tft_mae_min
  const heroNaive = bt.hero_naive24_mae_min ?? bt.naive24_mae_min
  const beatsNaive = heroTft < heroNaive

  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">Next 24 h — TFT forecast (NVIDIA TSPP)</h2>
      <svg
        className="admin-pattern"
        viewBox={`0 0 ${W} ${H + 18}`}
        role="img"
        aria-label={`Temporal Fusion Transformer forecast of the cat-4/5 median wait for the next 24 hours, p50 peaking at ${fmtWait(Math.max(...pts.map((p) => p.p50)))}`}
      >
        <path className="live-fc__band" d={bandPath} />
        <path className="live-fc__hist" d={histPath} />
        <path className="live-fc__p50" d={p50Path} />
        <line className="live-fc__nowline" x1={nowX} y1={0} x2={nowX} y2={H} />
        {[tail[0], ...pts.filter((_, i) => i % 4 === 3)].filter(Boolean).map((p) => {
          const tMin = 'tMin' in p ? p.tMin : 0
          return (
            <text key={tMin} className="live-fc__tick" x={Math.min(x(tMin), W - 12)} y={H + 13}>
              {hourLabel(tMin)}
            </text>
          )
        })}
      </svg>
      <div className="tft-backtest">
        <span className={`tft-backtest__badge${beatsNaive ? ' tft-backtest__badge--win' : ''}`}>
          backtest · held-out 24 h
        </span>
        <span className="tft-backtest__num tnum">
          TFT ±{heroTft} min vs seasonal-naive ±{heroNaive} min
        </span>
      </div>
      <p className="admin-card__caption">
        Solid: the real published feed (last {TAIL_HOURS} h). Dashed + band: p50 and p10–p90 from a{' '}
        <strong>Temporal Fusion Transformer</strong> — the reference model of NVIDIA's Time Series
        Prediction Platform — trained on {fc.trained_on.replace(/^\d+ /, '').split('(')[0].trim()}.
        The badge is a real hold-out backtest, not a claim: mean absolute error over the last 24 h
        vs a same-hour-yesterday baseline.
      </p>
    </section>
  )
}
