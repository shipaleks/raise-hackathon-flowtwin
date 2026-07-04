/* Bottom time scrubber — transport, the 7-day + today track (census
   silhouette, day ticks, beat markers), readout, preset jumps, and the
   presenter demo cluster. With a patient sheet open in Doctor view the
   track re-scopes to that patient's journey. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { HERO_ID, history7d, todayCast } from '../../data/seed'
import { BEAT_MIN, eventLabel, getTrack } from '../../sim/engine'
import {
  DAY_MIN,
  PRESETS,
  SIM_END_MIN,
  SIM_START_MIN,
  fmtClock,
  fmtDay,
  fmtDayClock,
  parseT,
} from '../../sim/time'
import { useStore } from '../../store'
import { SegmentedControl } from '../ui/SegmentedControl'
import { DemoControls } from './DemoControls'
import './scrubber.css'

/* ---- census silhouette: hourly on-floor count straight from the seed ---- */

const CENSUS = (() => {
  const spans = [
    ...history7d.journeys.map((j) => {
      const a = parseT(j.arrival)
      return { a, b: a + j.los_min }
    }),
    ...todayCast.map((p) => {
      const a = parseT(p.arrival_time)
      return { a, b: a + p.predicted_los_min }
    }),
  ]
  const countAt = (h: number) => {
    let n = 0
    for (const s of spans) if (s.a <= h && h < s.b) n++
    return n
  }
  const pts: Array<[number, number]> = []
  for (let h = SIM_START_MIN; h < SIM_END_MIN; h += 60) pts.push([h, countAt(h)])
  pts.push([SIM_END_MIN, countAt(SIM_END_MIN)])
  const max = Math.max(1, ...pts.map((p) => p[1]))
  const w = SIM_END_MIN - SIM_START_MIN
  let d = 'M0,1'
  for (const [h, c] of pts) d += ` L${h - SIM_START_MIN},${(1 - c / max).toFixed(4)}`
  d += ` L${w},1 Z`
  return { d, w }
})()

const BEATS = [
  { key: 'meet', name: 'Meet Sarah' },
  { key: 'labDelay', name: 'Lab delay' },
  { key: 'overload', name: 'Cardiology overload' },
  { key: 'resolveSuggested', name: 'Resolve suggested' },
] as const

const SPEED_OPTIONS = [
  { id: '10', label: '10×' },
  { id: '30', label: '30×' },
  { id: '120', label: '120×' },
]

const PlayIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3.4 1.8v8.4a.5.5 0 0 0 .76.43l6.6-4.2a.5.5 0 0 0 0-.86l-6.6-4.2a.5.5 0 0 0-.76.43Z" fill="currentColor" />
  </svg>
)

const PauseIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <rect x="2.4" y="1.8" width="2.6" height="8.4" rx="1" fill="currentColor" />
    <rect x="7" y="1.8" width="2.6" height="8.4" rx="1" fill="currentColor" />
  </svg>
)

export function TimeScrubber() {
  const simMin = useStore((s) => s.simMin)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const view = useStore((s) => s.view)
  const selectedId = useStore((s) => s.selectedId)
  const setPlaying = useStore((s) => s.setPlaying)
  const setSpeed = useStore((s) => s.setSpeed)
  const setSimMin = useStore((s) => s.setSimMin)
  const select = useStore((s) => s.select)
  const jumpToBeat = useStore((s) => s.jumpToBeat)

  // ---- per-patient scope: automatic while a sheet is open in Doctor view
  const scopeTrack = selectedId && view === 'doctor' ? getTrack(selectedId) : null
  const hi = scopeTrack
    ? Math.min(
        SIM_END_MIN,
        Math.min(SIM_END_MIN, Math.max(scopeTrack.endMin, scopeTrack.arrivalMin + 90)) + 15,
      )
    : SIM_END_MIN
  const lo = scopeTrack
    ? Math.max(SIM_START_MIN, Math.min(scopeTrack.arrivalMin - 15, hi - 30))
    : SIM_START_MIN
  const span = hi - lo
  const xPct = (m: number) => Math.min(100, Math.max(0, ((m - lo) / span) * 100))

  // entering a scope pulls the clock inside it
  const scopeId = scopeTrack ? scopeTrack.id : null
  useEffect(() => {
    if (!scopeId) return
    const s = useStore.getState()
    if (s.simMin < lo) s.setSimMin(lo)
    else if (s.simMin > hi) s.setSimMin(hi)
  }, [scopeId, lo, hi])

  // ---- measured track width (labels skip when cramped; ticks always stay)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [trackW, setTrackW] = useState(0)
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth))
    ro.observe(el)
    setTrackW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const dayTicks = useMemo(() => {
    const out: number[] = []
    for (let m = SIM_START_MIN; m <= hi; m += DAY_MIN) {
      if (m >= lo && m <= hi) out.push(m)
    }
    return out
  }, [lo, hi])

  const dayLabels = useMemo(() => {
    if (trackW < 120) return []
    const out: Array<{ xPct: number; text: string }> = []
    let lastPx = -Infinity
    for (let m = SIM_START_MIN; m <= hi; m += DAY_MIN) {
      const noon = m + DAY_MIN / 2
      if (noon < lo || noon > hi) continue
      let px = ((noon - lo) / span) * trackW
      px = Math.min(Math.max(px, 34), trackW - 34)
      if (px - lastPx < 76) continue
      out.push({ xPct: (px / trackW) * 100, text: fmtDay(noon) })
      lastPx = px
    }
    return out
  }, [lo, hi, span, trackW])

  // today's tinted segment, clipped to the current domain
  const todayLo = Math.max(0, lo)
  const todayHi = Math.min(SIM_END_MIN, hi)
  const hasToday = todayLo < todayHi

  const showBeats = !scopeTrack || selectedId === HERO_ID
  const trackLabel = scopeTrack
    ? `Time scrubber — scoped to ${scopeTrack.name}'s journey`
    : 'Time scrubber — 7 days of history plus today'

  return (
    <footer className="scrub" aria-label="Time controls">
      {/* ---------------- transport ---------------- */}
      <div className="scrub-transport">
        <button
          type="button"
          className={`scrub-play${playing ? ' is-playing' : ''}`}
          aria-label={playing ? 'Pause the simulation clock' : 'Play the simulation clock'}
          aria-pressed={playing}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? PauseIcon : PlayIcon}
        </button>
        <SegmentedControl
          size="sm"
          options={SPEED_OPTIONS}
          value={String(speed)}
          onChange={(v) => setSpeed(Number(v))}
          ariaLabel="Playback speed — sim-minutes per second"
        />
      </div>

      {/* ---------------- track ---------------- */}
      <div className="scrub-track" ref={trackRef}>
        {!scopeTrack && (
          <svg
            className="scrub-track__census"
            viewBox={`0 0 ${CENSUS.w} 1`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={CENSUS.d} />
          </svg>
        )}

        {hasToday && (
          <div
            className="scrub-track__today"
            style={{ left: `${xPct(todayLo)}%`, width: `${xPct(todayHi) - xPct(todayLo)}%` }}
            aria-hidden="true"
          />
        )}

        {dayTicks.map((m) => (
          <div key={m} className="scrub-track__tick" style={{ left: `${xPct(m)}%` }} aria-hidden="true" />
        ))}
        {dayLabels.map((l) => (
          <span key={l.text} className="scrub-track__day" style={{ left: `${l.xPct}%` }} aria-hidden="true">
            {l.text}
          </span>
        ))}

        <div className="scrub-track__rail" aria-hidden="true" />
        <div className="scrub-track__fill" style={{ width: `${xPct(simMin)}%` }} aria-hidden="true" />

        {lo <= 0 && hi >= 0 && (
          <div
            className="scrub-track__anchor"
            style={{ left: `${xPct(0)}%` }}
            title="Today 11:00 — anchor"
            aria-hidden="true"
          />
        )}

        <input
          type="range"
          className="scrub-track__input"
          min={lo}
          max={hi}
          step={1}
          value={Math.round(Math.min(hi, Math.max(lo, simMin)))}
          aria-label={trackLabel}
          aria-valuetext={fmtDayClock(simMin)}
          onChange={(e) => setSimMin(Number(e.currentTarget.value))}
          onPointerDown={() => setPlaying(false)}
        />

        {scopeTrack &&
          scopeTrack.events
            .filter((e) => e.tMin >= lo && e.tMin <= hi)
            // the hero's seed future is replaced by the demo beats — showing
            // her pre-scripted discharge tick would contradict the story
            .filter((e) => scopeTrack.id !== HERO_ID || e.tMin <= 0)
            .map((e, i) => {
              const label = `${eventLabel(e.type)} · ${fmtClock(e.tMin)}`
              return (
                <button
                  key={`${e.type}-${i}`}
                  type="button"
                  className="scrub-track__event"
                  style={{ left: `${xPct(e.tMin)}%` }}
                  title={label}
                  aria-label={`Jump to event: ${label}`}
                  onClick={() => setSimMin(e.tMin)}
                >
                  <span aria-hidden="true" />
                </button>
              )
            })}

        {showBeats &&
          BEATS.filter((b) => BEAT_MIN[b.key] >= lo && BEAT_MIN[b.key] <= hi).map((b) => {
            const t = BEAT_MIN[b.key]
            const done = simMin > t
            const label = `${b.name} — ${fmtClock(t)}`
            return (
              <button
                key={b.key}
                type="button"
                className={`scrub-track__beat${done ? ' is-done' : ''}`}
                style={{ left: `${xPct(t)}%` }}
                title={label}
                aria-label={`Jump to beat: ${label}`}
                onClick={() => jumpToBeat(b.key)}
              >
                <span className="scrub-track__beat-diamond" aria-hidden="true" />
              </button>
            )
          })}

        <div className="scrub-track__thumb" style={{ left: `${xPct(simMin)}%` }} aria-hidden="true" />
      </div>

      {/* ---------------- readout · presets/scope · demo ---------------- */}
      <div className="scrub-side">
        <div className="scrub-readout tnum">{fmtDayClock(simMin)}</div>

        {scopeTrack ? (
          <div className="scrub-scope" role="status">
            <span className="scrub-scope__text">
              Scoped to {scopeTrack.name} — their journey
            </span>
            <button
              type="button"
              className="scrub-scope__close"
              aria-label="Exit patient scope — back to the full 7-day timeline"
              title="Back to the full timeline"
              onClick={() => select(null)}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                <path d="M1.2 1.2 6.8 6.8M6.8 1.2 1.2 6.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="scrub-presets" role="group" aria-label="Preset jumps into the 7-day history">
            {PRESETS.map((p) => {
              const active = Math.abs(simMin - p.simMin) < 15
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`scrub-preset${active ? ' is-active' : ''}`}
                  title={fmtDayClock(p.simMin)}
                  aria-label={`Jump to ${fmtDayClock(p.simMin)} — ${p.label}`}
                  aria-pressed={active}
                  onClick={() => setSimMin(p.simMin)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        )}

        <DemoControls />
      </div>
    </footer>
  )
}
