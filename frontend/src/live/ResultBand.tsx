/* The result band — the head of the Day review, with exactly two states.

   BEFORE: the goal + what's on the board (12 moves, ≈305 min) + one button.
   AFTER:  the measured global result of replaying the day with every move
           executed as it surfaced, plus the live agent's own read and an undo.

   Money for TODAY's board lives here alone; tomorrow's structural plan keeps
   its own table below — the two are different claims and never mix. */

import { boardLedger, type DayReview } from '../sim/engine'
import { fmtDur } from '../sim/time'
import { HERO_ID } from '../data/seed'
import { useStore } from '../store'
import { Chip } from '../components/ui/Chip'
import { useLiveStore } from './liveStore'
import { agentRecoveredMin } from './LiveAgentPanel'
import './live.css'

const hkd = (n: number) => `HK$${Math.round(n).toLocaleString('en-US')}`
const HERO_IMPACT_MIN = 45

export function ResultBand({ r }: { r: DayReview }) {
  const optimizeAll = useStore((s) => s.optimizeAll)
  const undoOptimize = useStore((s) => s.undoOptimize)
  const snap = useLiveStore((s) => s.agents[HERO_ID])
  const liveRecovered = snap ? agentRecoveredMin(snap.history) : null

  const g = r.globalOptimize
  const executed = g != null

  if (!executed) {
    const proposed = boardLedger(null)
    const proposedMin = HERO_IMPACT_MIN + proposed.reduce((s, a) => s + a.savedMin, 0)
    return (
      <section className="live-band reg-ticks" aria-label="The goal">
        <p className="live-band__kicker">The goal — return the minutes the queues steal</p>
        <p className="live-band__total tnum">
          {proposed.length + 1} operational moves on the board · ≈{fmtDur(proposedMin)} if
          executed
        </p>
        <p className="live-band__explain">
          FlowTwin watched every journey against the hospital's live feed and put one
          bed-and-queue move on the board per compressible step — Sarah's plus{' '}
          {proposed.length} more, each listed below with its minutes. Execute the board to
          replay the same day with FlowTwin acting.
        </p>
        <button type="button" className="live-band__execute" onClick={optimizeAll}>
          Execute the board — replay the day with FlowTwin acting →
        </button>
      </section>
    )
  }

  const totalActions = (r.sarah.resolved ? 1 : 0) + g.actions
  const totalMin = (r.sarah.resolved ? r.sarah.recoveredMin : 0) + g.minutesSaved
  const totalHkd = Math.round((totalMin / 60) * r.assumptions.bed_hour_cost_hkd)

  return (
    <section className="live-band reg-ticks" aria-label="The result">
      <p className="live-band__kicker">The result — the same day, with FlowTwin acting</p>
      <p className="live-band__total tnum">
        {totalActions} moves executed · {fmtDur(totalMin)} of patient-time returned ·
        ≈{hkd(totalHkd)} of bed-time
      </p>
      <p className="live-band__explain">
        Same arrivals, same real feed — each move executed as it surfaced: Sarah to the obs
        ward at the 14:00 crunch (−{r.sarah.recoveredMin} min), the other {g.actions} at their
        own moments ({g.patientsOutEarlier} patients out earlier). The per-move minutes are in
        the table below; the map now shows this day.
        {liveRecovered != null && liveRecovered > 0 && (
          <>
            {' '}
            <Chip tone="ok" className="tnum">
              live agent’s own read on Sarah: −{liveRecovered} min
            </Chip>
          </>
        )}
      </p>
      <p className="live-band__basis">
        Basis: each move’s minutes = its step’s excess over the best-quartile duration of the
        same step type in the last 48 h of journeys (benchmark + n cited per patient), capped
        10–45; bed-time priced at {hkd(r.assumptions.bed_hour_cost_hkd)}/bed-hour, stated.
        Measured: the waits, the daily climb, the benchmarks, and the arithmetic.{' '}
        <button type="button" className="live-band__undo" onClick={undoOptimize}>
          revert to the baseline day
        </button>
      </p>
    </section>
  )
}
