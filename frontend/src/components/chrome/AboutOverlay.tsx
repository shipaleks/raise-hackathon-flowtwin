/* The closing/architecture surface: what FlowTwin is, the two-plane model
   split, the sovereignty roadmap, data honesty, and the keyboard map.
   Esc is handled globally (store.escapeStep); this file owns focus. */

import { useEffect, useRef } from 'react'
import { adminKpis } from '../../data/seed'
import { useStore } from '../../store'
import { OpsOnlyBadge, Chip } from '../ui/Chip'
import './chrome.css'

const KEYS: Array<{ keys: string; does: string }> = [
  { keys: 'Esc', does: 'close / zoom out' },
  { keys: 'Space', does: 'play / pause' },
  { keys: '← / →', does: '±5 min (Shift ±30)' },
  { keys: 'V', does: 'switch view' },
  { keys: 'T', does: 'theme' },
  { keys: '1–4', does: 'presets' },
]

function AboutDialog({ onClose }: { onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // focus the close button on open; hand focus back on close
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => prev?.focus()
  }, [])

  // keep Tab inside the dialog while it is open
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

  return (
    <div className="chrome-about">
      <div className="chrome-about__scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={cardRef}
        className="chrome-about__card"
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

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">What this is</h3>
          <p className="chrome-about__body">
            FlowTwin gives every patient a stateful AI agent that shadows the journey from arrival
            to discharge, predicts exit times with a confidence interval, and suggests the next
            operational move. Operations only — time, beds, queues. Care stays with clinicians.
          </p>
          <div className="chrome-about__badge-row">
            <OpsOnlyBadge />
          </div>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Architecture — two planes</h3>
          <div className="chrome-about__planes">
            <div className="chrome-about__plane">
              <div className="chrome-about__plane-title">On-prem, open models</div>
              <ul className="chrome-about__plane-list">
                <li>PersonaPlex — patient voice</li>
                <li>Nemotron Nano fleet — department sim</li>
                <li>NemoGuard — ops-only topic gate</li>
              </ul>
              <Chip tone="accent" className="chrome-about__plane-chip">
                voice + PHI never leave the building
              </Chip>
            </div>
            <div className="chrome-about__arrow" aria-hidden="true" />
            <div className="chrome-about__plane chrome-about__plane--cloud">
              <div className="chrome-about__plane-title">Frontier cloud</div>
              <ul className="chrome-about__plane-list">
                <li>Gemini — stateful patient agents (Interactions chains)</li>
                <li>Antigravity — Ops Chief analysis over the event log</li>
              </ul>
              <Chip tone="neutral" className="chrome-about__plane-chip">
                sees de-identified operational metadata only
              </Chip>
            </div>
            <p className="chrome-about__arrow-label">
              timings · queue states · counts — no names, no clinical detail
            </p>
          </div>
          <p className="chrome-about__planes-note">
            Gemini runs the agents. Nemotron runs the hospital.
          </p>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Sovereignty roadmap</h3>
          <p className="chrome-about__body">
            As on-device open models (Gemma) mature, the entire agent layer runs fully in-hospital
            — swap the reasoning endpoint from cloud Gemini to local Gemma and nothing leaves the
            building at all.
          </p>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Data honesty</h3>
          <ul className="chrome-about__bullets">
            <li>
              Identities, complaints and arrival patterns: Synthea open synthetic records (817 ED
              encounters).
            </li>
            <li>Admitted LOS benchmark: HF infinite-dataset-hub/HospitalAdmissions (n=91).</li>
            <li>
              Station-level times, vitals and the afternoon cardiology backup: synthesized and
              labeled per-record — no open source records ED boarding at station level (MIMIC-IV-ED
              planned).
            </li>
            <li>Every model-derived number names its model in the UI.</li>
          </ul>
          <p className="chrome-about__cal tnum">
            80% interval covered {cal.coverage_pct}% of {cal.n} past journeys · median error ±
            {cal.median_abs_error_min} min
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
          RAISE hackathon prototype — Google DeepMind track × NVIDIA Nemotron. Interactive
          simulation over open datasets; no live API calls in this build.
        </p>
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
