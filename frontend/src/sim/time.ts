/* Sim time: minutes relative to the demo anchor (11:00 HKT on the last full
   day inside the real 48-h feed archive). Negative = the recorded past;
   the right edge of the domain is the LIVE feed moment itself.
   All wall-clock labels are HKT — the hospital's own clock. */

import { adminKpis } from '../data/seed'

export const MIN_MS = 60_000
export const DAY_MIN = 1440

export const ANCHOR_MS = new Date(adminKpis.generated_now).getTime()

export const parseT = (iso: string) => (new Date(iso).getTime() - ANCHOR_MS) / MIN_MS

/** Scrubber domain: 00:00 of the day before the demo day → the live moment. */
export const SIM_START_MIN = -(11 * 60 + DAY_MIN)
export const SIM_END_MIN = Math.round(parseT(adminKpis.hk.live_anchor))

/** Sim-minute of the real LIVE feed snapshot (the domain's right edge). */
export const LIVE_MIN = SIM_END_MIN

export const clampSim = (m: number) => Math.min(SIM_END_MIN, Math.max(SIM_START_MIN, m))

export const simToDate = (m: number) => new Date(ANCHOR_MS + m * MIN_MS)

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtClock = (m: number) => {
  const d = simToDate(m)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Day label with real dates: "Fri Jul 4" (the demo day is a real day). */
export const fmtDay = (m: number) => {
  const d = simToDate(m)
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export const fmtDayClock = (m: number) => `${fmtDay(m)} ${fmtClock(m)}`

/** True on the demo day (the anchor's calendar day). */
export const isDemoDay = (m: number) => {
  const d = simToDate(m)
  const a = simToDate(0)
  return d.getDate() === a.getDate() && d.getMonth() === a.getMonth()
}

/** "45 min" | "1h 20m" */
export const fmtDur = (min: number) => {
  const v = Math.max(0, Math.round(min))
  if (v < 60) return `${v} min`
  const h = Math.floor(v / 60)
  const r = v % 60
  return r === 0 ? `${h}h` : `${h}h ${pad(r)}m`
}

/** Signed minutes: "+45 min" | "−35 min" (typographic minus). */
export const fmtDelta = (min: number) =>
  `${min < 0 ? '−' : '+'}${fmtDur(Math.abs(min))}`

/** Preset jumps — pinned to real recorded moments that read differently. */
export const PRESETS: Array<{ id: string; label: string; simMin: number }> = [
  { id: 'night', label: 'Night 03:30', simMin: -(11 * 60) + 3.5 * 60 },
  { id: 'trough', label: 'Morning trough', simMin: -3 * 60 },
  { id: 'peak', label: 'Afternoon climb', simMin: 6 * 60 },
  { id: 'live', label: 'LIVE', simMin: SIM_END_MIN },
]
