/* Intake & Signals tab — the real intake fields, synthesized vitals with
   provenance, and the pluggable-signal vision (wearable / vocal biomarkers,
   mention-only). */

import type { ReactNode } from 'react'
import type { SheetVM } from '../../sim/engine'
import { fmtDayClock } from '../../sim/time'
import { Chip } from '../ui/Chip'

const MODE_SWATCH: Record<string, string> = {
  ambulance: 'var(--cat-1)',
  'walk-in': 'var(--cat-2)',
  referral: 'var(--cat-3)',
}

const PROV_KEY: Record<string, string> = {
  stations_and_times: 'station times',
  eta: 'ETA',
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sheet-intake__cell">
      <span className="sheet-intake__cell-label">{label}</span>
      <span className="sheet-intake__cell-value">{children}</span>
    </div>
  )
}

export function IntakeTab({ vm }: { vm: SheetVM }) {
  const vitals = vm.vitals
  const wearable = vm.wearable
  const provText = vm.provenance
    ? Object.entries(vm.provenance)
        .map(([k, v]) => `${PROV_KEY[k] ?? k.replace(/_/g, ' ')}: ${v}`)
        .join(' · ')
    : 'source: 7-day synthesized log — part of the calibration set'

  return (
    <div className="sheet-intake">
      <section aria-label="Intake">
        <h3 className="sheet-h3">Intake</h3>
        <div className="sheet-intake__grid">
          <Cell label="Arrival mode">
            <Chip>
              <span
                className="sheet-intake__swatch"
                style={{ background: MODE_SWATCH[vm.arrivalMode] ?? 'var(--ink-3)' }}
                aria-hidden="true"
              />
              {vm.arrivalMode}
            </Chip>
          </Cell>
          <Cell label="Triage acuity">ESI {vm.acuity}</Cell>
          <Cell label="Chief complaint">{vm.complaint}</Cell>
          <Cell label="Pathway">{vm.pathway}</Cell>
          <Cell label="Arrival">
            <span className="tnum">{fmtDayClock(vm.arrivalMin)}</span>
          </Cell>
        </div>
      </section>

      {vitals && (
        <section aria-label="Vitals">
          <h3 className="sheet-h3">Vitals</h3>
          <div className="sheet-intake__vitals">
            <Vital label="HR bpm" value={vitals.hr} />
            <Vital label="BP sbp" value={vitals.sbp} />
            <Vital label="SpO₂ %" value={vitals.spo2} />
            <Vital label="RR" value={vitals.rr} />
            <Vital label="Temp °C" value={vitals.temp_c.toFixed(1)} />
            <Vital label="Pain /10" value={vitals.pain} />
          </div>
          <p className="sheet-intake__caption">Vitals synthesized — see provenance.</p>
        </section>
      )}

      {wearable && (
        <section className="sheet-intake__wear" aria-label="Fitness tracker signals">
          <h3 className="sheet-intake__wear-title">Fitness tracker — shared at intake</h3>
          {wearable.overnight_arrhythmia_flag && (
            <Chip tone="warn">⚑ overnight arrhythmia flag</Chip>
          )}
          <p className="sheet-intake__wear-rows">
            Resting HR <span className="tnum">{wearable.resting_hr_7d_avg}</span> bpm · HRV{' '}
            {wearable.hrv_trend}
          </p>
          <Chip tone="ghost">screening, not diagnosis</Chip>
          <p className="sheet-intake__wear-impact">
            → FlowTwin would pre-order the cardiology consult at arrival (−50 min).
          </p>
        </section>
      )}

      <section aria-label="Additional sources">
        <h3 className="sheet-h3">Additional sources</h3>
        <div className="sheet-intake__sources">
          <Chip tone="ghost">Wearable / fitness tracker · available</Chip>
          <Chip tone="ghost">Vocal biomarkers · screening, not diagnosis · available</Chip>
        </div>
        <p className="sheet-intake__caption">
          Example pluggable inputs — shown to convey the vision, not active in this demo.
        </p>
      </section>

      <p className="sheet-intake__prov">{provText}</p>
    </div>
  )
}

function Vital({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="sheet-intake__vital">
      <span className="sheet-intake__vital-label">{label}</span>
      <span className="sheet-intake__vital-value tnum">{value}</span>
    </div>
  )
}
