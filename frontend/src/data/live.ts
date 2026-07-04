/* Live-layer helpers: the REAL wait-time series for the hero hospital (and
   the whole network), indexed by sim-minute so any scrubbed moment reads the
   feed value that was actually published then. */

import { hkHistory, hkLive, HOSPITAL } from './seed'
import { parseT } from '../sim/time'
import type { HkSeriesPoint } from '../types'

export interface WaitPoint extends HkSeriesPoint {
  tMin: number
}

const seriesCache = new Map<string, WaitPoint[]>()

export function seriesFor(slug: string): WaitPoint[] {
  let s = seriesCache.get(slug)
  if (!s) {
    s = (hkHistory.series[slug] ?? [])
      .map((p) => ({ ...p, tMin: parseT(p.t) }))
      .sort((a, b) => a.tMin - b.tMin)
    seriesCache.set(slug, s)
  }
  return s
}

/** The feed snapshot nearest to a sim-minute (15-min grid; hourly far back). */
export function waitsAt(slug: string, tMin: number): WaitPoint | null {
  const s = seriesFor(slug)
  if (!s.length) return null
  let lo = 0
  let hi = s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid].tMin <= tMin) lo = mid
    else hi = mid
  }
  return Math.abs(s[lo].tMin - tMin) <= Math.abs(s[hi].tMin - tMin) ? s[lo] : s[hi]
}

export const heroWaitsAt = (tMin: number) => waitsAt(HOSPITAL.hospital_slug, tMin)

/** All hospitals, latest snapshot — for the network table. */
export function networkNow() {
  return Object.entries(hkLive.hospitals)
    .map(([slug, row]) => ({
      slug,
      ...row,
      meta: hkLive.meta[slug],
    }))
    .sort((a, b) => (b.t45p50_min ?? 0) - (a.t45p50_min ?? 0))
}

/** The hero hospital's real 7-day hour-of-day pattern. */
export function heroPattern() {
  return hkHistory.hour_pattern_7d[HOSPITAL.hospital_slug] ?? []
}

export const liveFeedLabel = `${hkLive.updateTime_raw} HKT`

/** Short "4h 30m"-style label for a wait in minutes. */
export const fmtWait = (min: number | null | undefined): string => {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const r = Math.round(min % 60)
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`
}
