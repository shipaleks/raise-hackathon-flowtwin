/* THE result — the whole demo compressed into one band of three numbers:
   what the action recovered (script + the live agent's own read), what it
   freed at the peak, and what the plan is worth tomorrow. This is the one
   line the stage closes on. */

import { actionBoardAt, type DayReview } from '../sim/engine'
import { HERO_ID } from '../data/seed'
import { useStore } from '../store'
import { Chip } from '../components/ui/Chip'
import { useLiveStore } from './liveStore'
import { agentRecoveredMin } from './LiveAgentPanel'
import './live.css'

const hkd = (n: number) => `HK$${Math.round(n).toLocaleString('en-US')}`

export function ResultBand({ r }: { r: DayReview }) {
  const simMin = useStore((s) => s.simMin)
  const optimizeAll = useStore((s) => s.optimizeAll)
  const snap = useLiveStore((s) => s.agents[HERO_ID])
  const liveRecovered = snap ? agentRecoveredMin(snap.history) : null
  const plan = r.optimizePlan
  const resolved = r.sarah.resolved
  const board = actionBoardAt(simMin)
  const g = r.globalOptimize

  // the one end-of-day number: hero action + the executed board, added up
  const totalActions = (resolved ? 1 : 0) + (g?.actions ?? 0)
  const totalMin = (resolved ? r.sarah.recoveredMin : 0) + (g?.minutesSaved ?? 0)
  const totalHkd =
    (g?.hkdFreed ?? 0) +
    (resolved ? Math.round((r.sarah.recoveredMin / 60) * r.assumptions.bed_hour_cost_hkd) : 0)

  return (
    <section className="live-band reg-ticks" aria-label="The result">
      <p className="live-band__kicker">
        {g
          ? `The day's result — board executed at ${g.atClock}`
          : 'The result — one action executed, a board full of them, one plan'}
      </p>
      {g && totalActions > 0 && (
        <p className="live-band__total tnum">
          {totalActions} operational actions · {totalMin} min of patient-time returned ·
          ≈{hkd(totalHkd)} of bed-time today
        </p>
      )}
      <div className="live-band__stats">
        <div className="live-band__stat">
          <span className="live-band__v tnum">{resolved ? `−${r.sarah.recoveredMin} min` : '—'}</span>
          <span className="live-band__l">
            {resolved
              ? 'the hero action: Sarah to the obs ward — exit recovered, one monitored cubicle freed at the real 14:00 climb'
              : 'replay the Resolve beat to land the hero action'}
          </span>
          {resolved && liveRecovered != null && liveRecovered > 0 && (
            <Chip tone="ok" className="tnum">
              live agent’s own read: −{liveRecovered} min
            </Chip>
          )}
        </div>
        <div className="live-band__stat">
          {g ? (
            <>
              <span className="live-band__v tnum">
                {g.actions} actions · −{g.minutesSaved} min
              </span>
              <span className="live-band__l">
                the rest of the board, executed: {g.patientsOutEarlier} patients out up to 30 min
                earlier, ≈{hkd(g.hkdFreed)} of bed-time returned today (HK$400/bed-hour, stated)
              </span>
            </>
          ) : (
            <>
              <span className="live-band__v tnum">
                {board.count} more · {board.totalMin} min
              </span>
              <span className="live-band__l">
                same-shape moves the twin surfaced today — imaging slots, discharge confirms, bed
                assigns ({board.openNow} still open)
              </span>
              <button type="button" className="live-band__execute" onClick={optimizeAll}>
                Execute the whole board →
              </button>
            </>
          )}
        </div>
        <div className="live-band__stat">
          <span className="live-band__v tnum">{hkd(plan.total_hkd_per_day)}/day</span>
          <span className="live-band__l">
            tomorrow’s plan at scale · ≈{hkd(plan.total_hkd_per_year)}/yr — assumptions stated
            below
          </span>
        </div>
      </div>
    </section>
  )
}
