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
  const snap = useLiveStore((s) => s.agents[HERO_ID])
  const liveRecovered = snap ? agentRecoveredMin(snap.history) : null
  const plan = r.optimizePlan
  const resolved = r.sarah.resolved
  const board = actionBoardAt(simMin)

  return (
    <section className="live-band reg-ticks" aria-label="The result">
      <p className="live-band__kicker">
        The result — one action executed, a board full of them, one plan
      </p>
      <div className="live-band__stats">
        <div className="live-band__stat">
          <span className="live-band__v tnum">{resolved ? `−${r.sarah.recoveredMin} min` : '—'}</span>
          <span className="live-band__l">
            {resolved
              ? 'the executed action: Sarah to the obs ward — exit recovered, one monitored cubicle freed at the real 14:00 climb'
              : 'replay the Resolve beat to land the action'}
          </span>
          {resolved && liveRecovered != null && liveRecovered > 0 && (
            <Chip tone="ok" className="tnum">
              live agent’s own read: −{liveRecovered} min
            </Chip>
          )}
        </div>
        <div className="live-band__stat">
          <span className="live-band__v tnum">
            {board.count} more · {board.totalMin} min
          </span>
          <span className="live-band__l">
            same-shape moves the twin surfaced today — imaging slots, discharge confirms, bed
            assigns ({board.openNow} still open). Each is one tap in a real deployment; the demo
            executes the hero’s.
          </span>
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
