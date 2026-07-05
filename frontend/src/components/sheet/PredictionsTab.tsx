/* Predictions tab — the model's numbers, always with a named model, a CI,
   pending steps, the current blocker, and one operational recommendation. */

import type { SheetVM } from '../../sim/engine'
import { fmtClock, fmtDelta, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { Chip, OpsOnlyBadge } from '../ui/Chip'
import { LiveAgentPanel } from '../../live/LiveAgentPanel'

/** |actual − p50| within this many minutes reads as "the model was close". */
const DELTA_OK_MIN = 30

export function PredictionsTab({ vm }: { vm: SheetVM }) {
  const resolveNow = useStore((s) => s.resolveNow)
  const isHistory = vm.kind === 'history'
  const delta = vm.losActualMin != null ? vm.losActualMin - vm.losPredictedMin : 0
  const rec = vm.recommendation
  const blockerTone = vm.risk === 'high' ? 'crit' : vm.risk === 'elevated' ? 'warn' : 'quiet'

  return (
    <div className="sheet-pred">
      <div className="sheet-pred__hero">
        <span className="sheet-pred__hero-label">
          {vm.admittedNow ? 'Admitted' : vm.exitIsActual ? 'Exited · actual' : 'Predicted exit'}
        </span>
        <span key={vm.exitClock} className="sheet-pred__hero-time tnum">
          {vm.exitClock}
        </span>
        {vm.admittedNow && (
          <span className="sheet-pred__hero-ci">ward care continues — ED prediction closed</span>
        )}
        {!vm.admittedNow && vm.ciLabel && <span className="sheet-pred__hero-ci">{vm.ciLabel}</span>}
        <p className="sheet-pred__hero-model">{vm.modelLine}</p>
        {vm.notArrivedYet && vm.kind === 'today' && (
          <p className="sheet-pred__hero-note">
            Scheduled arrival <span className="tnum">{fmtClock(vm.arrivalMin)}</span> — projection
            from the pathway prior.
          </p>
        )}
      </div>

      {isHistory ? (
        <div className="sheet-pred__los">
          <p>
            Actual <strong className="tnum">{fmtDur(vm.losActualMin ?? 0)}</strong> vs model p50{' '}
            <span className="tnum">{fmtDur(vm.losPredictedMin)}</span>{' '}
            <Chip tone={Math.abs(delta) <= DELTA_OK_MIN ? 'ok' : 'warn'} className="tnum">
              {fmtDelta(delta)}
            </Chip>
          </p>
          <p className="sheet-pred__known">Known outcome — part of the calibration set.</p>
        </div>
      ) : (
        <div className="sheet-pred__los">
          <p>
            Predicted LOS <strong className="tnum">{fmtDur(vm.losPredictedMin)}</strong> · pathway
            benchmark <span className="tnum">{fmtDur(vm.losBenchmarkMin)}</span>
          </p>
        </div>
      )}

      <section className="sheet-pred__steps" aria-label="Pending steps">
        <h3 className="sheet-h3">Pending steps</h3>
        {vm.pendingSteps.length > 0 ? (
          <ul className="sheet-pred__steps-list">
            {vm.pendingSteps.map((step) => (
              <li key={step} className="sheet-pred__step">
                <span className="sheet-pred__step-dot" aria-hidden="true" />
                {step}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sheet-pred__none">
            {isHistory ? 'Journey complete — nothing was left pending.' : 'Nothing pending.'}
          </p>
        )}
      </section>

      {vm.blockerLabel && (
        <div className={`sheet-pred__blocker sheet-pred__blocker--${blockerTone}`}>
          <span className="sheet-pred__blocker-dot" aria-hidden="true" />
          <div>
            <span className="sheet-pred__blocker-title">Current blocker</span>
            <p className="sheet-pred__blocker-text">{vm.blockerLabel}</p>
          </div>
        </div>
      )}

      {rec && (
        <div className={`sheet-pred__rec sheet-pred__rec--${rec.kind}`}>
          <div className="sheet-pred__rec-head">
            <h3 className="sheet-pred__rec-title">
              {rec.kind === 'done' ? 'Action taken ✓' : rec.title}
            </h3>
            {rec.impactMin > 0 && (
              <Chip tone="ok" className="tnum">
                ≈ saves {rec.impactMin} min
              </Chip>
            )}
          </div>
          <p className="sheet-pred__rec-text">{rec.explanation}</p>
          <div className="sheet-pred__rec-foot">
            <OpsOnlyBadge />
            {rec.canResolve && (
              <button type="button" className="sheet-pred__resolve" onClick={resolveNow}>
                Resolve — move to the obs ward
              </button>
            )}
          </div>
        </div>
      )}

      <LiveAgentPanel vm={vm} />

      <div className="sheet-pred__cal">
        <p className="sheet-pred__cal-line">{vm.calibrationLine}</p>
        <p className="sheet-pred__cal-why">
          Because the 7-day log has known outcomes, the model shows its track record.
        </p>
      </div>
    </div>
  )
}
