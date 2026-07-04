/* The right-hand patient sheet: header (identity + predicted exit hero number)
   and three tabs (Flow / Predictions / Intake & Signals). No backdrop — the
   map stays visible and interactive while the sheet is open. */

import { useEffect, useRef } from 'react'
import { sheetModelFor, type SheetVM } from '../../sim/engine'
import { useStore, type SheetTab } from '../../store'
import type { Risk } from '../../types'
import { AgentGlyph } from '../ui/AgentGlyph'
import { Chip, OpsOnlyBadge, type ChipTone } from '../ui/Chip'
import { SegmentedControl } from '../ui/SegmentedControl'
import { FlowTab } from './FlowTab'
import { PredictionsTab } from './PredictionsTab'
import { IntakeTab } from './IntakeTab'
import './sheet.css'

const RISK_CHIP: Record<Risk, { label: string; tone: ChipTone }> = {
  on_track: { label: 'On track', tone: 'ok' },
  elevated: { label: 'At risk', tone: 'warn' },
  high: { label: 'Blocked', tone: 'crit' },
}

const TAB_OPTIONS: Array<{ id: SheetTab; label: string }> = [
  { id: 'flow', label: 'Flow' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'intake', label: 'Intake & Signals' },
]

const TAB_NAMES: Record<SheetTab, string> = {
  flow: 'Flow',
  predictions: 'Predictions',
  intake: 'Intake & Signals',
}

export function PatientSheet() {
  const view = useStore((s) => s.view)
  const selectedId = useStore((s) => s.selectedId)
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)

  if (view !== 'doctor' || !selectedId) return null
  const vm = sheetModelFor(selectedId, simMin, resolvedAtMin)
  if (!vm) return null

  return <SheetPanel vm={vm} simMin={simMin} />
}

function SheetPanel({ vm, simMin }: { vm: SheetVM; simMin: number }) {
  const sheetTab = useStore((s) => s.sheetTab)
  const setSheetTab = useStore((s) => s.setSheetTab)
  const select = useStore((s) => s.select)
  const closeRef = useRef<HTMLButtonElement>(null)

  // On open: focus the close button; on close: hand focus back where it was.
  useEffect(() => {
    const prev = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (prev instanceof HTMLElement && document.contains(prev)) prev.focus()
    }
  }, [])

  const risk = RISK_CHIP[vm.risk]
  const sexLetter = vm.sex === 'female' ? 'F' : 'M'

  return (
    <aside className="sheet" role="complementary" aria-label={`Patient sheet: ${vm.name}`}>
      <header className="sheet-head">
        <button
          ref={closeRef}
          type="button"
          className="sheet-close"
          aria-label="Close patient sheet"
          onClick={() => select(null)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        <div className="sheet-head__row">
          <AgentGlyph
            variant="large"
            size={44}
            sex={vm.sex}
            risk={vm.risk}
            pulse={vm.risk === 'high'}
            title={`${vm.name} — ${risk.label}`}
          />
          <div className="sheet-head__id">
            <h2 className="sheet-head__name">{vm.name}</h2>
            <p className="sheet-head__meta">
              {vm.age} · {sexLetter} · {vm.arrivalMode} · ESI {vm.acuity}
            </p>
          </div>
        </div>

        <div className="sheet-head__chips">
          <Chip>{vm.complaint}</Chip>
          <Chip>{vm.pathway}</Chip>
        </div>

        <div className="sheet-exit">
          <div className="sheet-exit__info">
            <span className="sheet-exit__label">
              {vm.exitIsActual ? (vm.departed ? 'Exited' : 'Exit') : 'Predicted exit'}
            </span>
            {/* keyed on the value so a prediction shift gets a quick fade/slide swap */}
            <span key={vm.exitClock} className="sheet-exit__time tnum">
              {vm.exitClock}
            </span>
            <span className="sheet-exit__sub">
              {vm.exitIsActual ? 'actual · from the 7-day log' : (vm.ciLabel ?? '')}
            </span>
          </div>
          <div className="sheet-exit__side">
            <Chip tone={risk.tone}>{risk.label}</Chip>
            <OpsOnlyBadge />
          </div>
        </div>

        <SegmentedControl
          size="sm"
          options={TAB_OPTIONS}
          value={sheetTab}
          onChange={setSheetTab}
          ariaLabel="Patient sheet tabs"
        />
      </header>

      <div className="sheet-body" role="tabpanel" aria-label={TAB_NAMES[sheetTab]}>
        {sheetTab === 'flow' && <FlowTab vm={vm} simMin={simMin} />}
        {sheetTab === 'predictions' && <PredictionsTab vm={vm} />}
        {sheetTab === 'intake' && <IntakeTab vm={vm} />}
      </div>
    </aside>
  )
}
