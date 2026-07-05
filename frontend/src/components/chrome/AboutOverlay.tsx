/* The closing/architecture surface — and the full honesty ledger.
   A real hospital's live feed drives the twin; this dialog says exactly
   which layer is real, which is real-statistics, which is synthetic, and
   which is a stated assumption — field by field, model by model.
   Esc is handled globally (store.escapeStep); this file owns focus. */

import { useEffect, useRef } from 'react'
import { adminKpis, hkLive, HOSPITAL } from '../../data/seed'
import { useStore } from '../../store'
import { OpsOnlyBadge } from '../ui/Chip'
import { ArchDiagram } from './ArchDiagram'
import './chrome.css'

const KEYS: Array<{ keys: string; does: string }> = [
  { keys: 'Esc', does: 'close / zoom out' },
  { keys: 'Space', does: 'play / pause' },
  { keys: '← / →', does: '±5 min (Shift ±30)' },
  { keys: 'F', does: 'cycle floors' },
  { keys: 'B', does: 'building view' },
  { keys: 'V', does: 'switch view' },
  { keys: '1–4', does: 'presets' },
]

type LedgerStatus = 'real' | 'real-stats' | 'synthetic' | 'assumption' | 'live-model'

const STATUS_LABEL: Record<LedgerStatus, string> = {
  real: 'REAL · live',
  'real-stats': 'REAL statistics',
  synthetic: 'synthetic · labeled',
  assumption: 'stated assumption',
  'live-model': 'LIVE model call',
}

const LEDGER: Array<{ layer: string; source: string; status: LedgerStatus }> = [
  {
    layer: 'The hospital & its waits — Queen Mary Hospital; cat-2/3/4-5 p50/p95, the daily climb',
    source: 'HA open-data feed, every 15 min · 48 h full-resolution + 7-day archive · all 18 A&E sites',
    status: 'real',
  },
  {
    layer: 'Arrival shape · LOS tails by acuity · admit ordering · triage vitals ranges',
    source: 'MIMIC-IV-ED — real de-identified ED stays (open demo subset bundled; full set drops in unchanged)',
    status: 'real-stats',
  },
  {
    layer: 'Scale — triage mix · ~27% admission share · ~300 attendances/day · HK$400/bed-hour',
    source: 'HA-published approximate levels + stated rates',
    status: 'assumption',
  },
  {
    layer: 'Individual patients (Synthea names), station rooms & minutes, the floor plan',
    source: 'synthetic by design — the feed publishes no patient-level data, and that is the point',
    status: 'synthetic',
  },
  {
    layer: "Sarah's demo beats (lab delay · overload · resolve)",
    source: 'scripted so the guided story is deterministic — labeled where it touches',
    status: 'synthetic',
  },
  {
    layer: 'The action board — one move per journey, minutes per move',
    source: 'excess over the same step type’s best-quartile duration in the last 48 h (n cited per patient), capped 10–45',
    status: 'assumption',
  },
  {
    layer: 'Patient agents — a stateful chain per patient, memory held server-side',
    source: 'Gemini 3.5 Flash · Interactions API (previous_interaction_id) — when keys are configured',
    status: 'live-model',
  },
  {
    layer: 'The Ops Chief — real pandas over the census CSV in a persistent sandbox',
    source: 'antigravity-preview-05-2026 · environment reused across runs (Day review)',
    status: 'live-model',
  },
  {
    layer: 'Next-12 h wait forecast (Administrator view)',
    source: 'Nemotron 3 Nano 30B-A3B, zero-shot over the real 48 h feed — p10/p50/p90',
    status: 'live-model',
  },
]

function AboutDialog({ onClose }: { onClose: () => void }) {
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

  const cal = adminKpis.eta_calibration
  const live = hkLive.hospitals[HOSPITAL.hospital_slug]

  return (
    <div className="chrome-about">
      <div className="chrome-about__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        className="chrome-about__card reg-ticks"
        role="dialog"
        aria-modal="true"
        aria-label="About FlowTwin"
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
            <path
              d="M3 3l8 8M11 3l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="chrome-about__scroll">
        <p className="folio-eyebrow chrome-about__masthead">FlowTwin · the honesty ledger</p>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">What this is</h3>
          <p className="chrome-about__body">
            FlowTwin is a live operational twin of a real hospital's A&amp;E —{' '}
            <strong>{HOSPITAL.hospital}</strong>, plugged into the Hong Kong Hospital Authority's
            public waiting-time feed (updated every 15 minutes; last fetch{' '}
            <span className="tnum">{hkLive.updateTime_raw} HKT</span>: cat-3 median{' '}
            <span className="tnum">{live?.raw?.t3p50 ?? '—'}</span>, cat-4/5 median{' '}
            <span className="tnum">{live?.raw?.t45p50 ?? '—'}</span>). Every patient on the floor
            gets a stateful AI agent that shadows the journey, predicts exit times with a
            confidence interval, and suggests the next operational move. Operations only — time,
            beds, queues. Care stays with clinicians.
          </p>
          <div className="chrome-about__badge-row">
            <OpsOnlyBadge />
          </div>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">How it works — one picture</h3>
          <ArchDiagram />
          <p className="chrome-about__body">
            Real public data becomes a deterministic twin — a pure function of the scrubbed
            minute, so replaying the day can never desync. With API keys configured
            (server-side only, behind the /api proxy), a <strong>live plane</strong> switches on
            top of it: a stateful Gemini chain per patient, the Antigravity Ops Chief running
            real pandas, and a Nemotron forecast of the real wait curve. Without keys, the twin
            runs alone. <em>Gemini runs the agents. Nemotron forecasts the hospital. The feed
            keeps it honest.</em>
          </p>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">The honesty ledger — layer by layer</h3>
          <table className="chrome-about__ledger">
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Source</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {LEDGER.map((row) => (
                <tr key={row.layer}>
                  <td>{row.layer}</td>
                  <td>{row.source}</td>
                  <td>
                    <span className={`chrome-about__status chrome-about__status--${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Every model, named</h3>
          <ul className="chrome-about__bullets">
            <li>
              <strong>Wait sampler</strong> — lognormal through the feed's real p50/p95 per triage
              category, per 15-min snapshot: individual waits are draws from the hospital's own
              published distribution.
            </li>
            <li>
              <strong>FlowTwin ETA</strong> — LOS quantiles from {cal.n} real MIMIC-IV-ED stays,
              escalating up the quantile ladder when a stay outruns its estimate (calibration
              in-sample on the demo subset, labeled).
            </li>
            <li>
              <strong>Arrival model</strong> — MIMIC's hour-of-day shape scaled to a stated ~
              {adminKpis.hk.attendance_per_day_assumption}/day · <strong>risk states</strong> at
              the pathway's p50/p80.
            </li>
            <li>
              <strong>Board recommendations</strong> — each move's minutes is the step's excess
              over the best-quartile duration of the same step type in the last 48 h, capped
              10–45 per blocker (benchmark + n cited per patient).
            </li>
            <li>
              <strong>Live plane</strong> — Gemini 3.5 Flash (Interactions chains) ·
              antigravity-preview-05-2026 (Ops Chief) · Nemotron 3 Nano 30B-A3B (forecast) — all
              labeled on the surfaces they touch.
            </li>
          </ul>
          <p className="chrome-about__body">
            Sovereignty: the frontier cloud sees de-identified operational metadata only — and
            here even that layer is built from public + open data. As on-device open models
            mature, the agent layer runs fully in-hospital.
          </p>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Keyboard</h3>
          <ul className="chrome-about__keys">
            {KEYS.map((k) => (
              <li key={k.keys} className="chrome-about__key">
                <kbd>{k.keys}</kbd>
                <span>{k.does}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="chrome-about__footer">
          RAISE hackathon prototype — Google DeepMind track × NVIDIA Nemotron. Live data: Hong
          Kong Hospital Authority A&amp;E waiting times (data.gov.hk). Patient statistics:
          MIMIC-IV-ED (PhysioNet). Identities: Synthea. Live models (key-gated, server-side):
          Gemini Interactions chains · Antigravity · Nemotron 3 Nano — the deterministic twin
          runs fully without them.
        </p>
        </div>
      </div>
    </div>
  )
}

export function AboutOverlay() {
  const aboutOpen = useStore((s) => s.aboutOpen)
  const setAboutOpen = useStore((s) => s.setAboutOpen)
  if (!aboutOpen) return null
  return <AboutDialog onClose={() => setAboutOpen(false)} />
}
