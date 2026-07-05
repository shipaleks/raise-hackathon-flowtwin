/* The NVIDIA prediction plane — Nemotron 3 Nano (30B-A3B MoE) as a zero-shot
   quantile forecaster over the hospital's REAL published wait series. No
   hosted time-series foundation model exists in the API catalog, so the
   reasoning model reads the last 48 h of the feed and projects the next 12 h
   with p10/p50/p90 — labeled as exactly that wherever it renders. */

import { seriesFor } from '../data/live'
import { HOSPITAL } from '../data/seed'
import { lastJsonObject, liveFlags, nvidiaChat } from './client'
import { useLiveStore } from './liveStore'
import type { ForecastPoint } from './types'

const HOURS_AHEAD = 12
const HOURS_BACK = 48

const SYSTEM = `You are a careful time-series forecaster. You receive an hourly series of A&E cat-4/5 median waiting times (minutes) for a real hospital. The series has a strong daily cycle (overnight backlog, morning trough, afternoon climb).
Return ONLY JSON, no prose: {"forecast":[{"h":1,"p50":n,"p10":n,"p90":n}, ... ]} with exactly ${HOURS_AHEAD} entries, h=1..${HOURS_AHEAD} hours after the last observation. Quantiles must be plausible minutes, p10<p50<p90.`

interface RawForecast {
  forecast: Array<{ h: number; p50: number; p10: number; p90: number }>
}

/** Real 15-min series → hourly means for the trailing window. */
function hourlySeries(): Array<{ tMin: number; v: number }> {
  const pts = seriesFor(HOSPITAL.hospital_slug).filter((p) => p.t45p50 != null)
  const byHour = new Map<number, { sum: number; n: number }>()
  for (const p of pts) {
    const h = Math.floor(p.tMin / 60)
    const b = byHour.get(h) ?? { sum: 0, n: 0 }
    b.sum += p.t45p50 as number
    b.n += 1
    byHour.set(h, b)
  }
  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, b]) => ({ tMin: h * 60, v: Math.round(b.sum / b.n) }))
    .slice(-HOURS_BACK)
}

export async function runForecast(): Promise<void> {
  const { forecast, setForecast } = useLiveStore.getState()
  if (!liveFlags().nvidia || forecast.status === 'running' || forecast.status === 'done') return
  const hist = hourlySeries()
  if (hist.length < 12) return
  setForecast({ status: 'running', history: hist, error: undefined })

  try {
    const reply = await nvidiaChat({
      model: 'nvidia/nemotron-3-nano-30b-a3b',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Hourly cat-4/5 median wait (min), oldest→newest, last ${hist.length}h: ${hist.map((p) => p.v).join(',')}`,
        },
      ],
      max_tokens: 4096,
    })
    const raw = lastJsonObject<RawForecast>(reply)
    const last = hist[hist.length - 1]
    const points: ForecastPoint[] = raw.forecast
      .filter((f) => Number.isFinite(f.p50))
      .slice(0, HOURS_AHEAD)
      .map((f) => ({
        tMin: last.tMin + f.h * 60,
        p10: Math.round(Math.min(f.p10, f.p50)),
        p50: Math.round(f.p50),
        p90: Math.round(Math.max(f.p90, f.p50)),
      }))
    if (!points.length) throw new Error('empty forecast')
    useLiveStore.getState().setForecast({ status: 'done', points })
  } catch (e) {
    useLiveStore.getState().setForecast({ status: 'error', error: String(e) })
  }
}
