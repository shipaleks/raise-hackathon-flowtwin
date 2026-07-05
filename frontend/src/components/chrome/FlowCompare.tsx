/* Before / after — the executed board, drawn.
   One shared clock. On top, the whole building breathing: the census under
   the baseline day (ink outline) against the replayed day (blue), the gap
   between them shaded green — that band IS the work. Below, every compressed
   journey as a lane: the muted bar is how the patient actually moved, the
   blue bar is the same journey with their one move executed, and the hatched
   green tail is the time handed back. The blue bars mount at baseline length
   and visibly compress — the optimization happens in front of you. */

import { useEffect, useMemo, useState } from 'react'
import { flowComparison, type PatientCompare } from '../../sim/engine'
import { fmtClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import './flowcompare.css'

const LANES_SHOWN = 7

export function FlowCompare() {
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const optimizedAtMin = useStore((s) => s.optimizedAtMin)
  const vm = useMemo(
    () => flowComparison(resolvedAtMin, optimizedAtMin),
    [resolvedAtMin, optimizedAtMin],
  )

  // the compress animation: lanes mount at their baseline geometry, then a
  // frame later settle into the optimized one — CSS transitions do the rest
  const [settled, setSettled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [runId, setRunId] = useState(0)
  useEffect(() => {
    if (!vm) return
    setSettled(false)
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setSettled(true)),
    )
    return () => cancelAnimationFrame(raf)
  }, [vm, runId])

  if (!vm) return null

  const span = vm.axisEndMin - vm.axisStartMin
  const pct = (m: number) => ((m - vm.axisStartMin) / span) * 100

  // hour ruler: a tick every 2 h keeps the labels breathable
  const ticks: number[] = []
  for (let t = vm.axisStartMin; t <= vm.axisEndMin; t += 120) ticks.push(t)

  const lanes = expanded ? vm.patients : vm.patients.slice(0, LANES_SHOWN)
  const hidden = vm.patients.length - lanes.length
  const hiddenMin = vm.patients.slice(LANES_SHOWN).reduce((s, p) => s + p.savedMin, 0)

  return (
    <div className="fcomp" role="img" aria-label={`Before and after the executed board: ${vm.patients.length} journeys compressed, ${fmtDur(vm.totalSavedMin)} returned in total`}>
      <div className="fcomp__legend">
        <span className="fcomp__key">
          <i className="fcomp__swatch fcomp__swatch--before" /> baseline day
        </span>
        <span className="fcomp__key">
          <i className="fcomp__swatch fcomp__swatch--after" /> with FlowTwin acting
        </span>
        <span className="fcomp__key">
          <i className="fcomp__swatch fcomp__swatch--saved" /> time returned
        </span>
        <button
          type="button"
          className="fcomp__replay"
          onClick={() => setRunId((n) => n + 1)}
        >
          replay the compression ↺
        </button>
      </div>

      <CensusChart vm={vm} pct={pct} settled={settled} />

      <div className="fcomp__grid">
        <div className="fcomp__gridlines" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="fcomp__gridline" style={{ left: `${pct(t)}%` }} />
          ))}
        </div>

        {lanes.map((p, i) => (
          <Lane key={`${p.id}-${runId}`} p={p} pct={pct} settled={settled} index={i} />
        ))}

        {hidden > 0 && (
          <button type="button" className="fcomp__more" onClick={() => setExpanded(true)}>
            + {hidden} more journeys compressed the same way · {fmtDur(hiddenMin)} ↓
          </button>
        )}
        {expanded && (
          <button type="button" className="fcomp__more" onClick={() => setExpanded(false)}>
            Collapse ↑
          </button>
        )}

        <div className="fcomp__ruler" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="fcomp__tick tnum" style={{ left: `${pct(t)}%` }}>
              {fmtClock(t)}
            </span>
          ))}
        </div>
      </div>

      <p className="fcomp__foot">
        Every lane is one patient's real seed journey; stop boundaries are their actual moves
        between zones. The blue lane replays the identical journey with that patient's one
        bed-and-queue move executed — hover any bar for the zone and minutes.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- census */

function CensusChart({
  vm,
  pct,
  settled,
}: {
  vm: NonNullable<ReturnType<typeof flowComparison>>
  pct: (m: number) => number
  settled: boolean
}) {
  const W = 1000
  const H = 120
  const PAD_TOP = 14
  // zoomed to the working range (stated in the caption) — a zero-based axis
  // would flatten the two runs into one indistinguishable line
  const max = Math.max(...vm.census.map((c) => c.before), 1)
  const min = Math.max(0, Math.floor(Math.min(...vm.census.map((c) => c.after)) * 0.85))
  const x = (m: number) => (pct(m) / 100) * W
  const y = (n: number) => H - ((H - PAD_TOP) * (n - min)) / Math.max(1, max - min)

  const line = (key: 'before' | 'after') =>
    vm.census.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.tMin).toFixed(1)},${y(c[key]).toFixed(1)}`).join(' ')
  const area = (key: 'before' | 'after') =>
    `${line(key)} L${W},${H} L0,${H} Z`
  // the band between the two runs — beds breathing
  const gap = `${line('before')} ${[...vm.census]
    .reverse()
    .map((c) => `L${x(c.tMin).toFixed(1)},${y(c.after).toFixed(1)}`)
    .join(' ')} Z`

  const peakX = pct(vm.peakGap.tMin)

  return (
    <div className="fcomp__census">
      <div className="fcomp__census-head">
        <span className="fcomp__census-title">
          People in the building, through the day
          <span className="fcomp__census-note"> · axis zoomed to the working range</span>
        </span>
        {vm.peakGap.count > 0 && (
          <span className="fcomp__census-peak tnum">
            ◆ {vm.peakGap.count} fewer inside at {fmtClock(vm.peakGap.tMin)}
          </span>
        )}
      </div>
      <div className={`fcomp__census-plot${settled ? ' is-settled' : ''}`}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="fcomp__census-area-before" d={area('before')} />
          <path className="fcomp__census-gap" d={gap} />
          <path className="fcomp__census-area-after" d={area('after')} />
          <path className="fcomp__census-line-before" d={line('before')} vectorEffect="non-scaling-stroke" />
          <path className="fcomp__census-line-after" d={line('after')} vectorEffect="non-scaling-stroke" />
        </svg>
        {vm.peakGap.count > 0 && (
          <span className="fcomp__census-peakline" style={{ left: `${peakX}%` }} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- lanes */

function Lane({
  p,
  pct,
  settled,
  index,
}: {
  p: PatientCompare
  pct: (m: number) => number
  settled: boolean
  index: number
}) {
  const beforeDur = p.beforeExitMin - p.arrivalMin
  const afterDur = p.afterExitMin - p.arrivalMin
  const spanPct = (a: number, b: number) => pct(b) - pct(a)
  const delay = `${140 + index * 90}ms`

  // while un-settled the after-bar wears the baseline geometry — the
  // transition to its true (shorter) width is the visible act of optimizing
  const afterWidth = spanPct(p.arrivalMin, settled ? p.afterExitMin : p.beforeExitMin)

  return (
    <div className={`fcomp__lane${p.isHero ? ' is-hero' : ''}`}>
      <div className="fcomp__lane-label">
        <span className="fcomp__lane-name">{p.name}</span>
        <span className={`fcomp__lane-delta tnum${settled ? ' is-in' : ''}`} style={{ transitionDelay: delay }}>
          −{p.savedMin} min
        </span>
      </div>
      <div className="fcomp__lane-track">
        {/* baseline run */}
        <div
          className="fcomp__bar fcomp__bar--before"
          style={{ left: `${pct(p.arrivalMin)}%`, width: `${spanPct(p.arrivalMin, p.beforeExitMin)}%` }}
          title={`Baseline: ${fmtClock(p.arrivalMin)} → ${fmtClock(p.beforeExitMin)} · ${fmtDur(beforeDur)}`}
        >
          {p.before.map((s, i) => (
            <span
              key={i}
              className="fcomp__stop"
              style={{ flexGrow: Math.max(1, s.endMin - s.startMin) }}
              title={`${s.zoneLabel} · ${fmtClock(s.startMin)}–${fmtClock(s.endMin)} · ${fmtDur(s.endMin - s.startMin)}`}
            />
          ))}
        </div>
        {/* the reclaimed tail — sits where the baseline still ran */}
        <div
          className={`fcomp__bar fcomp__bar--saved${settled ? ' is-in' : ''}`}
          style={{
            left: `${pct(p.afterExitMin)}%`,
            width: `${spanPct(p.afterExitMin, p.beforeExitMin)}%`,
            transitionDelay: delay,
          }}
          title={`${fmtDur(p.savedMin)} returned — out at ${fmtClock(p.afterExitMin)} instead of ${fmtClock(p.beforeExitMin)}`}
        />
        {/* replayed run — compresses on mount */}
        <div
          className="fcomp__bar fcomp__bar--after"
          style={{
            left: `${pct(p.arrivalMin)}%`,
            width: `${afterWidth}%`,
            transitionDelay: delay,
          }}
          title={`With FlowTwin: ${fmtClock(p.arrivalMin)} → ${fmtClock(p.afterExitMin)} · ${fmtDur(afterDur)}`}
        >
          {p.after.map((s, i) => (
            <span
              key={i}
              className={`fcomp__stop${s.compressedMin > 0 ? ' is-compressed' : ''}`}
              style={{ flexGrow: Math.max(1, s.endMin - s.startMin) }}
              title={`${s.zoneLabel} · ${fmtClock(s.startMin)}–${fmtClock(s.endMin)} · ${fmtDur(s.endMin - s.startMin)}${
                s.compressedMin > 0 ? ` · ${s.compressedMin} min shorter here` : ''
              }`}
            />
          ))}
        </div>
        {/* exit clocks */}
        <span
          className="fcomp__exit fcomp__exit--before tnum"
          style={{ left: `${pct(p.beforeExitMin)}%` }}
          aria-hidden="true"
        >
          {fmtClock(p.beforeExitMin)}
        </span>
        {/* both clocks hang off the baseline exit, stacked — read as one delta */}
        <span
          className={`fcomp__exit fcomp__exit--after tnum${settled ? ' is-in' : ''}`}
          style={{ left: `${pct(p.beforeExitMin)}%`, transitionDelay: delay }}
          aria-hidden="true"
        >
          {fmtClock(p.afterExitMin)}
        </span>
      </div>
    </div>
  )
}
