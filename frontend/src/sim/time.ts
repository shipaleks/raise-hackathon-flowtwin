/* Sim time: minutes relative to the seed anchor (2026-07-04T11:00 local).
   Negative = the 7-day history; positive = today's demo-beat window. */

import { adminKpis } from '../data/seed'

export const MIN_MS = 60_000
export const DAY_MIN = 1440

export const ANCHOR_MS = new Date(adminKpis.generated_now).getTime()

/** Scrubber domain: from 00:00 seven days ago to 14:45 today. */
export const SIM_START_MIN = -(7 * DAY_MIN + 11 * 60)
export const SIM_END_MIN = 225

export const clampSim = (m: number) => Math.min(SIM_END_MIN, Math.max(SIM_START_MIN, m))

export const parseT = (iso: string) => (new Date(iso).getTime() - ANCHOR_MS) / MIN_MS

export const simToDate = (m: number) => new Date(ANCHOR_MS + m * MIN_MS)

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtClock = (m: number) => {
  const d = simToDate(m)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Day-of-sim label: "Today", "Yesterday", or "Mon Jun 29". */
export const fmtDay = (m: number) => {
  const d = simToDate(m)
  const anchor = simToDate(0)
  const dayDiff = Math.floor(
    (new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      (DAY_MIN * MIN_MS),
  )
  if (dayDiff === 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export const fmtDayClock = (m: number) => `${fmtDay(m)} ${fmtClock(m)}`

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

/** Preset jumps are pinned to the history moments that best show each state
    (today hasn't reached these hours yet): a dead-quiet 2 AM, a brisk
    mid-morning, a full lunchtime floor, and the post-backup 18:00 hand-off. */
export const PRESETS: Array<{ id: string; label: string; simMin: number }> = [
  { id: 'night', label: '2 AM', simMin: -2 * DAY_MIN + (2 - 11) * 60 },
  { id: 'rounds', label: 'Morning rounds', simMin: -2 * DAY_MIN + (9.5 - 11) * 60 },
  { id: 'lunch', label: 'Lunchtime', simMin: -DAY_MIN + (12.5 - 11) * 60 },
  { id: 'shift', label: 'Shift change 18:00', simMin: -DAY_MIN + (18 - 11) * 60 },
]
