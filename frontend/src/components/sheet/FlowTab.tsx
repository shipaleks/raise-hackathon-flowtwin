/* Flow tab — the patient's way through the building, as a journey rail:
   where they came from (done stops), where they are NOW (dwell + what they
   are waiting for), and what the model expects next (dashed stops + the
   predicted-exit terminal). The proportional strip keeps the shape of the
   stay; the optimized-path ghost stays framed as timing/sequence, never
   diagnosis. */

import type { FlowSegment, SheetVM } from '../../sim/engine'
import { floorById, floorOfDept } from '../../sim/layout'
import { fmtClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { Chip } from '../ui/Chip'

const ANNO_TONE: Record<string, string> = {
  lab_delay: 'warn',
  dept_overload: 'crit',
  moved_to_observation: 'ok',
  consult_escalated: 'ok',
  waiting: 'neutral',
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

  // While the hero's demo beats are live her track never actually ends by seed.
  const heroPresented = vm.isHero && simMin >= 0
  const departed = vm.departed && vm.kind === 'today' && (!heroPresented || vm.departed)
  const lastActual = [...vm.segments].reverse().find((s) => !s.predicted)
  const closeClock = fmtClock(lastActual ? lastActual.endMin : vm.exitMin)

  const current = vm.segments.find((s) => s.current)
  // dwell counts the contiguous run in this zone — an annotation event
  // (overload, lab delay) must not reset the "here since" clock
  const ANNOTATION_TYPES = new Set(['lab_delay', 'dept_overload', 'consult_escalated'])
  const currentIdx = vm.segments.findIndex((s) => s.current)
  let zoneSince = current?.startMin ?? 0
  for (let i = currentIdx - 1; i >= 0; i--) {
    const s = vm.segments[i]
    if (ANNOTATION_TYPES.has(s.eventType)) continue
    if (current && s.deptId === current.deptId && s.areaId === current.areaId) zoneSince = s.startMin
    else break
  }

  return (
    <div className="sheet-flow">
      {departed && !vm.handoff && !vm.admittedNow && (
        <div className="sheet-flow__banner">
          Discharged <span className="tnum">{closeClock}</span> — record archived, journey below.
        </div>
      )}
      {vm.handoff && (
        <div className="sheet-flow__banner">
          Admitted <span className="tnum">{closeClock}</span> — handed off to the ward, beyond the
          A&amp;E twin's scope.
        </div>
      )}
      {vm.kind === 'history' && (
        <p className="sheet-flow__caption">
          Completed journey from the 48-h feed replay — waits were drawn from the hospital's
          published distribution at that moment.
        </p>
      )}

      {/* the NOW card: where they are, how long, what they're waiting for */}
      {!departed && vm.onFloor && current && (
        <div className="sheet-flow__nowcard">
          <div className="sheet-flow__nowcard-head">
            <span className="sheet-flow__nowcard-kicker">Now</span>
            <span className="sheet-flow__nowcard-zone">{current.zoneLabel}</span>
            <span className="sheet-flow__nowcard-dwell tnum">
              {fmtDur(Math.max(0, simMin - zoneSince))} here
            </span>
          </div>
          {vm.blockerLabel && <p className="sheet-flow__nowcard-wait">{vm.blockerLabel}</p>}
          {vm.pendingSteps.length > 0 && (
            <p className="sheet-flow__nowcard-next">
              next: {vm.pendingSteps.slice(0, 3).join(' → ')}
            </p>
          )}
        </div>
      )}

      {/* proportional strip: durations as widths only — the labels live in the
          rail below, full-length, so nothing ever truncates */}
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

      {/* ---- the journey rail ---- */}
      <ol className="sheet-rail" aria-label="Journey">
        {vm.segments.map((seg, i) => {
          const prev = i > 0 ? vm.segments[i - 1] : null
          const liftHop =
            prev && floorOfDept(prev.deptId) !== floorOfDept(seg.deptId) && !seg.predicted
              ? floorById.get(floorOfDept(seg.deptId))
              : null
          const state = seg.current && !departed ? 'now' : seg.predicted ? 'next' : 'done'
          const dwell =
            state === 'now' ? Math.max(0, simMin - seg.startMin) : seg.minutes
          return (
            <li
              key={i}
              className={`sheet-rail__row is-${state}`}
              style={{ animationDelay: `${i * 28}ms` }}
              aria-label={`${seg.zoneLabel}, ${fmtDur(dwell)}${seg.predicted ? ', predicted' : ''}${state === 'now' ? ', now' : ''}`}
            >
              {liftHop && (
                <span className="sheet-rail__lift" aria-hidden="true">
                  ↕ lift · floor {liftHop.short}
                </span>
              )}
              <span className="sheet-rail__node" aria-hidden="true" />
              <div className="sheet-rail__body">
                <div className="sheet-rail__line">
                  <span className="sheet-rail__time tnum">{fmtClock(seg.startMin)}</span>
                  <span className="sheet-rail__zone">{seg.zoneLabel}</span>
                  <span className="sheet-rail__leader" aria-hidden="true" />
                  <span className="sheet-rail__min tnum">
                    {state === 'now' ? `${fmtMinShort(dwell)} so far` : fmtMinShort(dwell)}
                  </span>
                </div>
                {seg.label !== seg.zoneLabel && (
                  <span className="sheet-rail__event">{seg.label}</span>
                )}
                {seg.note && (
                  <span
                    className={`sheet-rail__note${ANNO_TONE[seg.eventType] ? ` sheet-rail__note--${ANNO_TONE[seg.eventType]}` : ''}`}
                  >
                    {seg.note}
                  </span>
                )}
              </div>
            </li>
          )
        })}

        {/* terminal node */}
        <li
          className={`sheet-rail__row is-terminal${departed ? ' is-done' : ''}`}
          aria-label={
            vm.admittedNow || vm.handoff
              ? `Admitted ${vm.exitClock}`
              : `${vm.exitIsActual || departed ? 'Exit' : 'Predicted exit'} ${vm.exitClock}`
          }
        >
          <span className="sheet-rail__node sheet-rail__node--exit" aria-hidden="true" />
          <div className="sheet-rail__body">
            <div className="sheet-rail__line">
              <span className="sheet-rail__time tnum">{vm.exitClock}</span>
              <span className="sheet-rail__zone">
                {vm.admittedNow || vm.handoff
                  ? 'Admitted to the ward'
                  : vm.exitIsActual || departed
                    ? 'Left the building'
                    : 'Predicted exit'}
              </span>
              {!vm.exitIsActual && !departed && vm.ciLabel && (
                <span className="sheet-rail__ci tnum">{vm.ciLabel}</span>
              )}
            </div>
          </div>
        </li>
      </ol>
      {vm.segments.some((s) => s.predicted) && (
        <p className="sheet-flow__toc-note">Dashed steps are predicted, not yet observed.</p>
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
                {vm.optimizations.map((opt, i) => (
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
