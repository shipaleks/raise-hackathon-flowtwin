/* The live patient-agent panel — renders the Gemini Interactions chain's own
   ops-state next to the deterministic twin's numbers, including the agent's
   prediction trail across the day. The hero's agent wakes on sheet-open; any
   other patient's agent wakes on demand. */

import { useEffect } from 'react'
import type { SheetVM } from '../sim/engine'
import { useStore } from '../store'
import { Chip } from '../components/ui/Chip'
import { useLiveStore, IDLE_AGENT } from './liveStore'
import { hasChain, wakeAgent, type LivePhase } from './patientAgent'
import { BEAT_MIN } from '../sim/beats'
import './live.css'

/** Demo phase at a sim-minute — mirrors the beat thresholds. */
export function phaseAt(simMin: number, resolvedAtMin: number | null): LivePhase {
  if (resolvedAtMin != null && simMin >= resolvedAtMin) return 'resolved'
  if (simMin >= BEAT_MIN.overload) return 'overload'
  if (simMin >= BEAT_MIN.labDelay) return 'lab_delay'
  return 'baseline'
}

const RISK_TONE = { low: 'ok', elevated: 'warn', high: 'crit' } as const

const TRAIL_LABEL: Record<string, string> = {
  baseline: 'intake',
  lab_delay: 'lab delay',
  overload: 'overload',
  resolved: 'after action',
}

const clockToMin = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Minutes the agent's own prediction recovered after the action —
    worst predicted exit before the resolve minus the exit after it. */
export function agentRecoveredMin(history: { phase: string; exit: string }[]): number | null {
  const resolved = history.find((h) => h.phase === 'resolved')
  if (!resolved) return null
  const before = history.filter((h) => h.phase !== 'resolved').map((h) => clockToMin(h.exit))
  const after = clockToMin(resolved.exit)
  if (!before.length || !Number.isFinite(after)) return null
  const worst = Math.max(...before.filter(Number.isFinite))
  return worst > after ? worst - after : 0
}

export function LiveAgentPanel({ vm }: { vm: SheetVM }) {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const gemini = useLiveStore((s) => s.gemini)
  const snap = useLiveStore((s) => s.agents[vm.id]) ?? IDLE_AGENT
  const recovered = agentRecoveredMin(snap.history)

  const canRun = gemini && vm.kind === 'today' && !vm.notArrivedYet && !vm.departed

  // the hero's agent wakes itself the moment her sheet renders live
  useEffect(() => {
    if (canRun && vm.isHero && !hasChain(vm.id)) {
      wakeAgent(vm, simMin, phaseAt(simMin, resolvedAtMin))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, vm.id])

  if (!canRun) return null

  const dotClass =
    snap.status === 'thinking'
      ? 'live-dot live-dot--thinking'
      : snap.status === 'error'
        ? 'live-dot live-dot--error'
        : 'live-dot'

  return (
    <div className="live-panel" aria-label="Live patient agent">
      <div className="live-panel__head">
        <span className="live-panel__title">
          <span className={dotClass} aria-hidden="true" />
          Live agent — stateful chain
        </span>
        <span className="live-panel__model">Gemini 3.5 Flash · Interactions API</span>
      </div>

      {snap.status === 'idle' && (
        <button
          type="button"
          className="live-wake"
          onClick={() => wakeAgent(vm, simMin, phaseAt(simMin, resolvedAtMin))}
        >
          Wake this patient's agent
        </button>
      )}

      {snap.status === 'thinking' && !snap.ops && (
        <p className="live-panel__note">The agent is reading the journey…</p>
      )}

      {snap.ops && (
        <>
          <div className="live-panel__exit">
            <span className="live-panel__exit-time tnum">{snap.ops.predicted_exit}</span>
            <Chip tone={RISK_TONE[snap.ops.delay_risk] ?? 'ghost'}>
              {snap.ops.delay_risk} risk
            </Chip>
            {snap.ops.blocker && <Chip tone="ghost">{snap.ops.blocker}</Chip>}
          </div>
          <p className="live-panel__note">{snap.ops.agent_note}</p>
          {snap.ops.next_action && (
            <div className="live-panel__action">
              <strong>{snap.ops.next_action.title}</strong>
              {snap.ops.next_action.impact_min > 0 && (
                <>
                  {' '}
                  <Chip tone="ok" className="tnum">
                    ≈ saves {snap.ops.next_action.impact_min} min
                  </Chip>
                </>
              )}
              <br />
              {snap.ops.next_action.explanation}
            </div>
          )}
          {snap.history.length > 1 && (
            <div className="live-trail" aria-label="The agent's own prediction, turn by turn">
              {snap.history.map((h, i) => (
                <span key={`${h.phase}-${i}`} className="live-trail__step">
                  {i > 0 && (
                    <span className="live-trail__arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                  <span className={`live-trail__exit live-trail__exit--${h.risk} tnum`}>
                    {h.exit}
                  </span>
                  <span className="live-trail__phase">{TRAIL_LABEL[h.phase] ?? h.phase}</span>
                </span>
              ))}
              {recovered != null && recovered > 0 && (
                <Chip tone="ok" className="tnum">
                  −{recovered} min — the agent's own numbers
                </Chip>
              )}
            </div>
          )}
          <div className="live-panel__foot">
            <span className="live-panel__meta tnum">
              {snap.turns} turn{snap.turns === 1 ? '' : 's'} in chain · memory server-side
            </span>
          </div>
        </>
      )}

      {snap.status === 'error' && (
        <p className="live-error">Agent call failed — the deterministic twin carries the demo. {snap.error}</p>
      )}
    </div>
  )
}
