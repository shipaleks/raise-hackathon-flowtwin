/* Day in review · Optimize the day — the closing overlay.
   Three moves: what happened (real numbers), what FlowTwin changed (the
   Sarah case, before/after), and tomorrow's plan — the exact operational
   changes with the money, every assumption labeled. Money lives here and
   in the Administrator view only. */

import { useEffect, useRef } from 'react'
import { boardLedger, dayReviewAt, trackedTodayCount, type DayReview } from '../../sim/engine'
import { LIVE_MIN, fmtDay, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { Chip, OpsOnlyBadge } from '../ui/Chip'
import { AgentResultLine } from '../../live/AgentResultLine'
import { OpsChiefSection } from '../../live/OpsChiefSection'
import { ResultBand } from '../../live/ResultBand'
import './chrome.css'

const hkd = (n: number) => `HK$${n.toLocaleString('en-US')}`
const eur = (n: number) => `€${n.toLocaleString('en-US')}`

/** Rows shown in full before the rest collapses into one summary line. */
const BOARD_SHOWN = 10

/** The board, move by move — the section the result band's numbers add up. */
function BoardTable({ r, optimizedAtMin }: { r: DayReview; optimizedAtMin: number | null }) {
  const executed = r.globalOptimize != null
  const rows = boardLedger(optimizedAtMin)
  const shown = rows.slice(0, BOARD_SHOWN)
  const rest = rows.slice(BOARD_SHOWN)
  const restMin = rest.reduce((s, a) => s + a.savedMin, 0)
  return (
    <section className="chrome-about__section">
      <h3 className="chrome-about__h">The board — every move, with its minutes</h3>
      <p className="chrome-about__body">
        The twin tracked <strong className="tnum">{trackedTodayCount}</strong> journeys today and
        found an actionable operational blocker in{' '}
        <strong className="tnum">{rows.length + 1}</strong> of them — the rest ran on pathway and
        were left alone (monitor-only). One bed-and-queue move per blocker:
      </p>
      <table className="chrome-wrap__table">
        <thead>
          <tr>
            <th scope="col">Patient</th>
            <th scope="col">Move the agent proposed</th>
            <th scope="col" className="chrome-wrap__num">
              {executed ? 'Returned' : 'If executed'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sarah M. — the walked case</td>
            <td>Obs-ward bed + escalated consult cover, at the 14:00 crunch</td>
            <td className="chrome-wrap__num tnum">
              {executed && !r.sarah.resolved ? '—' : `${r.sarah.recoveredMin || 45} min`}
            </td>
          </tr>
          {shown.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.title}</td>
              <td className="chrome-wrap__num tnum">{a.savedMin} min</td>
            </tr>
          ))}
          {rest.length > 0 && (
            <tr>
              <td>… and {rest.length} more patients</td>
              <td>same move types — consults, labs, imaging, dispositions</td>
              <td className="chrome-wrap__num tnum">{fmtDur(restMin)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td>Total{executed ? ' — measured on the replayed day' : ' — proposed'}</td>
            <td />
            <td className="chrome-wrap__num tnum">
              {fmtDur(
                ((executed && !r.sarah.resolved ? 0 : r.sarah.recoveredMin || 45) as number) +
                  rows.reduce((s, a) => s + a.savedMin, 0),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="chrome-wrap__assumption">
        Personas are synthetic (the feed publishes no patient-level data); each move’s minutes
        is bounded by half its queue step’s length and capped per blocker type (10–45 min,
        stated).
      </p>
    </section>
  )
}

function WrapDialog({ onClose }: { onClose: () => void }) {
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

  // the review judges the whole demo day, not the scrubbed instant — the
  // only inputs that matter are which actions were taken
  const r = dayReviewAt(LIVE_MIN, resolvedAtMin, optimizedAtMin)
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
          <p className="chrome-wrap__kicker">Day in review · the full day, to the live edge</p>
          <h2 className="chrome-wrap__title">{fmtDay(240)} — {r.hospital}</h2>
          <p className="chrome-wrap__sub">
            {r.cluster} · {r.district} · numbers from the real HA feed + the calibrated twin
          </p>
        </header>

        <ResultBand r={r} />

        <BoardTable r={r} optimizedAtMin={optimizedAtMin} />

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
              <span className="chrome-wrap__stat-l">in building at the live edge</span>
            </div>
          </div>
          <p className="chrome-about__body">
            The recurring pattern hit again, on schedule: cat-4/5 median wait climbed from{' '}
            <strong className="tnum">{r.realClimb.fromMin ?? '—'} min</strong> at the morning trough
            to <strong className="tnum">{r.realClimb.toMin ?? '—'} min</strong> by the afternoon peak
            — that is the hospital's own published feed, averaged over the last 7 days.
          </p>
        </section>

        {/* ---------------- 2 · the walked case ---------------- */}
        <section className="chrome-about__section">
          <h3 className="chrome-about__h">The walked case — Sarah, end to end</h3>
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
                  {r.sarah.resolved ? 'after her one move — the obs-ward bed' : 'her move not taken this run'}
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
