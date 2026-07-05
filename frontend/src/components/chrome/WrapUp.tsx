/* Day in review · Optimize the day — the closing overlay.
   Three moves: what happened (real numbers), what FlowTwin changed (the
   Sarah case, before/after), and tomorrow's plan — the exact operational
   changes with the money, every assumption labeled. Money lives here and
   in the Administrator view only. */

import { useEffect, useRef } from 'react'
import { dayReviewAt } from '../../sim/engine'
import { fmtDay, fmtClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { Chip, OpsOnlyBadge } from '../ui/Chip'
import { AgentResultLine } from '../../live/AgentResultLine'
import { OpsChiefSection } from '../../live/OpsChiefSection'
import { ResultBand } from '../../live/ResultBand'
import './chrome.css'

const hkd = (n: number) => `HK$${n.toLocaleString('en-US')}`
const eur = (n: number) => `€${n.toLocaleString('en-US')}`

function WrapDialog({ onClose }: { onClose: () => void }) {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const optimizedAtMin = useStore((s) => s.optimizedAtMin)
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => prev?.focus()
  }, [])

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !cardRef.current) return
    const focusables = cardRef.current.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const r = dayReviewAt(simMin, resolvedAtMin, optimizedAtMin)
  const plan = r.optimizePlan

  return (
    <div className="chrome-about chrome-wrap">
      <div className="chrome-about__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        className="chrome-about__card chrome-wrap__card reg-ticks"
        role="dialog"
        aria-modal="true"
        aria-label="Day in review and tomorrow's plan"
        onKeyDown={trapTab}
      >
        <button
          ref={closeRef}
          type="button"
          className="chrome-about__close"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="chrome-about__scroll">
        <header className="chrome-wrap__head">
          <p className="chrome-wrap__kicker">Day in review · as of {fmtClock(simMin)}</p>
          <h2 className="chrome-wrap__title">
            {fmtDay(Math.max(0, Math.min(simMin, 8 * 60)))} — {r.hospital}
          </h2>
          <p className="chrome-wrap__sub">
            {r.cluster} · {r.district} · numbers from the real HA feed + the calibrated twin
          </p>
        </header>

        <ResultBand r={r} />

        {/* ---------------- 1 · what happened ---------------- */}
        <section className="chrome-about__section">
          <h3 className="chrome-about__h">What happened today</h3>
          <div className="chrome-wrap__stats">
            <div className="chrome-wrap__stat">
              <span className="chrome-wrap__stat-v tnum">{r.arrived}</span>
              <span className="chrome-wrap__stat-l">arrivals</span>
            </div>
            <div className="chrome-wrap__stat">
              <span className="chrome-wrap__stat-v tnum">{r.discharged}</span>
              <span className="chrome-wrap__stat-l">discharged</span>
            </div>
            <div className="chrome-wrap__stat">
              <span className="chrome-wrap__stat-v tnum">{r.admitted}</span>
              <span className="chrome-wrap__stat-l">admitted</span>
            </div>
            <div className="chrome-wrap__stat">
              <span className="chrome-wrap__stat-v tnum">{r.inBuilding}</span>
              <span className="chrome-wrap__stat-l">in building now</span>
            </div>
          </div>
          <p className="chrome-about__body">
            The recurring pattern hit again, on schedule: cat-4/5 median wait climbed from{' '}
            <strong className="tnum">{r.realClimb.fromMin ?? '—'} min</strong> at the morning trough
            to <strong className="tnum">{r.realClimb.toMin ?? '—'} min</strong> by the afternoon peak
            — that is the hospital's own published feed, averaged over the last 7 days.
          </p>
        </section>

        {/* ---------------- 2 · what FlowTwin changed ---------------- */}
        <section className="chrome-about__section">
          <h3 className="chrome-about__h">What FlowTwin changed</h3>
          <div className="chrome-wrap__case">
            <div className="chrome-wrap__case-row">
              <span className="chrome-wrap__case-step">
                <span className="chrome-wrap__case-t tnum">{r.sarah.baselineExit}</span>
                <span className="chrome-wrap__case-l">Sarah's exit, predicted at 11:00</span>
              </span>
              <span className="chrome-wrap__case-arrow" aria-hidden="true">
                →
              </span>
              <span className="chrome-wrap__case-step">
                <span className="chrome-wrap__case-t chrome-wrap__case-t--crit tnum">
                  {r.sarah.slippedExit}
                </span>
                <span className="chrome-wrap__case-l">after the 14:00 consult queue</span>
              </span>
              <span className="chrome-wrap__case-arrow" aria-hidden="true">
                →
              </span>
              <span className="chrome-wrap__case-step">
                <span
                  className={`chrome-wrap__case-t tnum${r.sarah.resolved ? ' chrome-wrap__case-t--ok' : ''}`}
                >
                  {r.sarah.finalExit}
                </span>
                <span className="chrome-wrap__case-l">
                  {r.sarah.resolved
                    ? 'after one op action'
                    : resolvedAtMin != null && simMin < resolvedAtMin
                      ? `action lands ${fmtClock(resolvedAtMin)} — scrub forward`
                      : 'no action taken this run'}
                </span>
              </span>
              {r.sarah.resolved && (
                <Chip tone="ok" className="tnum">
                  −{r.sarah.recoveredMin} min
                </Chip>
              )}
            </div>
            <ul className="chrome-about__bullets">
              <li>
                The twin read the climb out of the live feed as it opened — not from intuition —
                and flagged the slip about two hours before it would have bitten. Sarah is the one
                case we walk end to end; the same watch ran on everyone in the building.
              </li>
              <li>
                {r.sarah.resolved
                  ? 'One operational move (obs-ward bed + escalated consult cover) recovered ~45 minutes and freed a monitored cubicle during the crunch.'
                  : 'The suggested move (obs-ward bed + escalated consult cover) would have recovered ~45 minutes — replay the Resolve beat to see it land.'}
              </li>
              {r.globalOptimize && (
                <li>
                  The rest of the board executed at {r.globalOptimize.atClock}:{' '}
                  {r.globalOptimize.actions} more actions of the same shape —{' '}
                  {r.globalOptimize.minutesSaved} minutes returned,{' '}
                  {r.globalOptimize.patientsOutEarlier} more patients out earlier.
                </li>
              )}
              <li>
                Every suggestion stayed operational — time, beds, queues. Care decisions never left
                the clinicians.
              </li>
            </ul>
            <AgentResultLine />
          </div>
        </section>

        {/* ---------------- 3 · tomorrow's plan ---------------- */}
        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Optimize the day — tomorrow's plan</h3>
          <p className="chrome-wrap__plan-model">{plan.model}</p>
          <table className="chrome-wrap__table">
            <thead>
              <tr>
                <th scope="col">Change</th>
                <th scope="col">Window</th>
                <th scope="col" className="chrome-wrap__num">
                  Saved / day
                </th>
                <th scope="col" className="chrome-wrap__num">
                  Value / day
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <span className="chrome-wrap__change">{it.change}</span>
                    <span className="chrome-wrap__evidence">{it.evidence}</span>
                    <span className="chrome-wrap__basis">{it.basis}</span>
                  </td>
                  <td className="tnum chrome-wrap__win">{it.window}</td>
                  <td className="chrome-wrap__num tnum">{fmtDur(it.saved_min_per_day)}</td>
                  <td className="chrome-wrap__num tnum">
                    {hkd(it.saved_hkd_per_day)}
                    <span className="chrome-wrap__eur"> {eur(it.saved_eur_per_day)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className="chrome-wrap__num tnum">{fmtDur(plan.total_saved_min_per_day)}</td>
                <td className="chrome-wrap__num tnum">
                  {hkd(plan.total_hkd_per_day)}
                  <span className="chrome-wrap__eur"> {eur(plan.total_eur_per_day)}</span>
                </td>
              </tr>
              <tr className="chrome-wrap__annual">
                <td>Extrapolated to a year (×365 — extrapolation, stated)</td>
                <td />
                <td />
                <td className="chrome-wrap__num tnum">
                  {hkd(plan.total_hkd_per_year)}
                  <span className="chrome-wrap__eur"> {eur(plan.total_eur_per_year)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="chrome-wrap__assumption">{plan.assumption_note}</p>
        </section>

        <OpsChiefSection />

        <footer className="chrome-about__footer chrome-wrap__footer">
          <OpsOnlyBadge />
          <span>
            Why it works: the agents remember whole journeys, the predictions carry calibrated
            intervals, and every recommendation is a bed-and-queue move a charge nurse could make
            — not a care decision.
          </span>
        </footer>
        </div>
      </div>
    </div>
  )
}

export function WrapUpOverlay() {
  const wrapOpen = useStore((s) => s.wrapOpen)
  const setWrapOpen = useStore((s) => s.setWrapOpen)
  if (!wrapOpen) return null
  return <WrapDialog onClose={() => setWrapOpen(false)} />
}
