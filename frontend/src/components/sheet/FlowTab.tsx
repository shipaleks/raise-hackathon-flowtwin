/* Flow tab — the journey timeline (actual + optimized-path ghost overlay).
   Every optimization callout is framed as timing/sequence, never diagnosis. */

import type { FlowSegment, SheetVM } from '../../sim/engine'
import { fmtClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { Chip } from '../ui/Chip'

/** Key events worth calling out under the bar — selective, not every segment. */
const KEY_EVENTS = new Set([
  'labs_ordered',
  'ecg',
  'consult_requested',
  'lab_delay',
  'dept_overload',
  'moved_to_observation',
])

const ANNO_TONE: Record<string, string> = {
  lab_delay: 'warn',
  dept_overload: 'crit',
  moved_to_observation: 'ok',
  consult_escalated: 'ok',
}

/** Compact minutes for inside a segment: "42m", "1h 20m". */
const fmtMinShort = (m: number) => {
  const v = Math.max(0, Math.round(m))
  if (v < 60) return `${v}m`
  const h = Math.floor(v / 60)
  const r = v % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

const isWearableCallout = (why: string) => /wearable|arrhythmia|tracker/i.test(why)

export function FlowTab({ vm, simMin }: { vm: SheetVM; simMin: number }) {
  const showOptimized = useStore((s) => s.showOptimized)
  const setShowOptimized = useStore((s) => s.setShowOptimized)

  // Scheduled-arrival edge state: the agent doesn't exist on the floor yet.
  // (History journeys always render complete — they are the calibration set.)
  if (vm.notArrivedYet && vm.kind === 'today') {
    return (
      <div className="sheet-flow__empty">
        <div className="sheet-flow__empty-mark" aria-hidden="true" />
        <p>
          Scheduled arrival <strong className="tnum">{fmtClock(vm.arrivalMin)}</strong> — the agent
          spins up on arrival.
        </p>
      </div>
    )
  }

  // While the hero's demo beats are live her track never actually ends,
  // so the raw `departed` flag (from the seed track) must not archive her.
  const heroPresented = vm.isHero && simMin >= 0
  const departed = vm.departed && vm.kind === 'today' && !heroPresented
  const lastActual = [...vm.segments].reverse().find((s) => !s.predicted)
  const dischargeClock = fmtClock(lastActual ? lastActual.endMin : vm.exitMin)

  const annotations = vm.segments.filter(
    (s) => !s.predicted && (s.note || KEY_EVENTS.has(s.eventType)),
  )
  // callouts come from the raw optimization list — one row per finding,
  // independent of how the savings anchor onto (and get capped by) segments
  const callouts = vm.optimizations

  return (
    <div className="sheet-flow">
      {departed && (
        <div className="sheet-flow__banner">
          Discharged <span className="tnum">{dischargeClock}</span> — record archived, journey
          below.
        </div>
      )}
      {vm.kind === 'history' && (
        <p className="sheet-flow__caption">
          Completed journey from the 7-day log — part of the calibration set.
        </p>
      )}

      {/* proportional strip: durations as widths only — the labels live in the
          index below, full-length, so nothing ever truncates */}
      <div className="sheet-flow__strip" aria-hidden="true">
        {vm.segments.map((seg, i) => (
          <div
            key={i}
            className={`sheet-flow__strip-seg${seg.current ? ' is-current' : ''}${seg.predicted ? ' is-predicted' : ''}`}
            style={{ flexGrow: Math.max(seg.minutes, 0), animationDelay: `${i * 30}ms` }}
            title={`${seg.zoneLabel} · ${fmtDur(seg.minutes)}${seg.predicted ? ' · predicted' : ''}`}
          >
            {seg.current && !departed && (
              <span className="sheet-flow__now" aria-hidden="true">
                now
              </span>
            )}
          </div>
        ))}
      </div>

      <ol className="sheet-flow__toc" aria-label="Journey timeline">
        {vm.segments.map((seg, i) => (
          <li
            key={i}
            className={`sheet-flow__toc-row${seg.current && !departed ? ' is-current' : ''}${seg.predicted ? ' is-predicted' : ''}`}
            style={{ animationDelay: `${i * 35}ms` }}
            aria-label={`${seg.zoneLabel}, ${fmtDur(seg.minutes)}${seg.predicted ? ', predicted' : ''}${seg.current ? ', now' : ''}`}
          >
            <span className="sheet-flow__toc-time tnum">{fmtClock(seg.startMin)}</span>
            <span className="sheet-flow__toc-zone">{seg.zoneLabel}</span>
            <span className="sheet-flow__toc-leader" aria-hidden="true" />
            <span className="sheet-flow__toc-min tnum">{fmtMinShort(seg.minutes)}</span>
          </li>
        ))}
      </ol>
      {vm.segments.some((s) => s.predicted) && (
        <p className="sheet-flow__toc-note">Italic steps are predicted, not yet observed.</p>
      )}

      {annotations.length > 0 && (
        <ul className="sheet-flow__annos">
          {annotations.map((seg, i) => (
            <li key={i} className="sheet-flow__anno">
              <span
                className={`sheet-flow__anno-dot${ANNO_TONE[seg.eventType] ? ` sheet-flow__anno-dot--${ANNO_TONE[seg.eventType]}` : ''}`}
                aria-hidden="true"
              />
              <span className="sheet-flow__anno-time tnum">{fmtClock(seg.startMin)}</span>
              <span className="sheet-flow__anno-text">{seg.note ?? seg.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="sheet-flow__opt">
        <button
          type="button"
          role="switch"
          aria-checked={showOptimized}
          className="sheet-flow__switch"
          onClick={() => setShowOptimized(!showOptimized)}
        >
          <span className="sheet-flow__switch-track" aria-hidden="true">
            <span className="sheet-flow__switch-knob" />
          </span>
          Optimized path
        </button>

        {showOptimized &&
          (vm.totalSavedMin > 0 ? (
            <>
              <GhostBar segments={vm.segments} />
              <ul className="sheet-flow__callouts">
                {callouts.map((opt, i) => (
                  <li key={i} className="sheet-flow__callout">
                    <Chip tone="ok" className="tnum">
                      −{Math.round(opt.saving_min)} min
                    </Chip>
                    <span className="sheet-flow__callout-text">
                      {opt.issue}
                      {isWearableCallout(`${opt.issue} ${opt.tag}`) && (
                        <Chip tone="ghost">illustrative source — mention only</Chip>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="sheet-flow__total">
                Optimized path: <strong className="tnum">−{fmtDur(vm.totalSavedMin)}</strong> ·
                same care, better sequence.
              </p>
            </>
          ) : vm.nearOptimal ? (
            <div className="sheet-flow__optnote">
              <Chip tone="ok">Near-optimal journey — no wasted steps found.</Chip>
            </div>
          ) : (
            <p className="sheet-flow__none">
              No timing or sequence improvements found on this journey.
            </p>
          ))}
      </div>
    </div>
  )
}

function GhostBar({ segments }: { segments: FlowSegment[] }) {
  // appliedMin is capped at the segment's real length — the ghost strip never
  // claims to compress a stop by more time than it contained
  const actualTotal = segments.reduce((sum, s) => sum + Math.max(0, s.minutes), 0)
  const ghostTotal = segments.reduce((sum, s) => sum + Math.max(0, s.minutes - s.appliedMin), 0)
  const savedMin = Math.round(actualTotal - ghostTotal)
  // the compressed strip is proportionally shorter — its width IS the saving
  const widthPct = actualTotal > 0 ? (ghostTotal / actualTotal) * 100 : 100

  return (
    <div
      className="sheet-flow__ghost"
      role="img"
      aria-label={`Optimized path — same journey compressed to ${fmtDur(ghostTotal)}, ${savedMin} minutes shorter`}
    >
      <div className="sheet-flow__ghost-track">
        <div
          className="sheet-flow__strip sheet-flow__strip--ghost"
          style={{ width: `${widthPct}%` }}
          aria-hidden="true"
        >
          {segments.map((seg, i) => {
            const minutes = Math.max(0, seg.minutes - seg.appliedMin)
            return (
              <div
                key={i}
                className={`sheet-flow__strip-seg${seg.appliedMin > 0 ? ' is-saved' : ''}`}
                style={{ flexGrow: minutes, animationDelay: `${i * 30}ms` }}
                title={
                  seg.appliedMin > 0
                    ? `${seg.zoneLabel} · compressed by ${Math.round(seg.appliedMin)} min here`
                    : `${seg.zoneLabel} · ${fmtDur(minutes)}`
                }
              />
            )
          })}
        </div>
      </div>
      <span className="sheet-flow__ghost-delta" aria-hidden="true">
        the shorter strip is the same journey re-sequenced — dashed stops give the time back
      </span>
    </div>
  )
}
