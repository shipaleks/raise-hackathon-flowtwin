/* The closing/architecture surface — and the full honesty ledger.
   A real hospital's live feed drives the twin; this dialog says exactly
   which layer is real, which is real-statistics, which is synthetic, and
   which is a stated assumption — field by field, model by model.
   Esc is handled globally (store.escapeStep); this file owns focus. */

import { useEffect, useRef } from 'react'
import { adminKpis, hkLive, HOSPITAL } from '../../data/seed'
import { useStore } from '../../store'
import { OpsOnlyBadge, Chip } from '../ui/Chip'
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

type LedgerStatus = 'real' | 'real-stats' | 'synthetic' | 'assumption'

const STATUS_LABEL: Record<LedgerStatus, string> = {
  real: 'REAL · live',
  'real-stats': 'REAL statistics',
  synthetic: 'synthetic · labeled',
  assumption: 'stated assumption',
}

const LEDGER: Array<{ layer: string; source: string; status: LedgerStatus }> = [
  {
    layer: 'The hospital — Queen Mary Hospital, Hong Kong West cluster',
    source: 'Hospital Authority (18 A&E sites in the feed)',
    status: 'real',
  },
  {
    layer: 'Waiting times by triage category — cat-2, cat-3 p50/p95, cat-4/5 p50/p95',
    source: 'HA open-data feed, updated every 15 min; 48 h at full resolution + 7 days hourly via the data.gov.hk archive',
    status: 'real',
  },
  {
    layer: 'The recurring daily climb (and the overnight backlog that never clears)',
    source: 'computed from that same archive — 7-day mean by hour',
    status: 'real',
  },
  {
    layer: 'Arrival diurnal shape · acuity-conditional LOS tails · admit ordering · triage vitals ranges',
    source: 'MIMIC-IV-ED (real de-identified ED stays; open demo subset n=222 bundled — the full dataset drops in unchanged)',
    status: 'real-stats',
  },
  {
    layer: 'Triage mix (1/3/44/48/4%) · ~27% admission share · ~300 attendances/day',
    source: 'HA-published approximate levels, used to scale the shapes',
    status: 'assumption',
  },
  {
    layer: 'Individual patients — names (Synthea registry), station-level rooms and minutes, the floor plan',
    source: 'synthetic by design: the feed publishes no patient-level data, and that is the point (privacy)',
    status: 'synthetic',
  },
  {
    layer: "Sarah's four demo beats (lab delay · overload · resolve)",
    source: 'scripted so the guided story is deterministic — labeled on every surface it touches',
    status: 'synthetic',
  },
  {
    layer: 'Money — HK$400/bed-hour (≈€47), recoverable shares per optimizer line',
    source: 'stated assumptions; every plan line carries its own basis label',
    status: 'assumption',
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
          <h3 className="chrome-about__h">How the twin is built</h3>
          <ol className="chrome-about__pipeline">
            <li>
              <strong>fetch_hk.py</strong> pulls the live HA feed plus its full 15-minute archive
              from data.gov.hk — 48 h at full resolution, 7 days hourly, all 18 A&amp;E sites.
            </li>
            <li>
              <strong>build_mimic_stats.py</strong> extracts real patient-level distributions from
              MIMIC-IV-ED: arrival hour weights, acuity mix, LOS quantiles by acuity ×
              disposition, transport mix, triage-vitals quartiles.
            </li>
            <li>
              <strong>build_seed.py</strong> (fixed seed 42) casts synthetic personas whose{' '}
              <em>wait is a lognormal draw through the hospital's real published p50/p95 at their
              arrival snapshot</em>, with MIMIC treatment tails — so scrubbing the clock replays
              the hospital's actual day, person by person.
            </li>
            <li>
              The browser runs a pure function <code>worldAt(t)</code> over that seed — fully
              deterministic, perfectly reversible, no live API calls in this build. Before a demo,
              one command re-fetches the feed and re-anchors the whole twin to "now".
            </li>
          </ol>
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
          <h3 className="chrome-about__h">Every model in this build, named</h3>
          <ul className="chrome-about__bullets">
            <li>
              <strong>Wait sampler</strong> — a lognormal fitted through the feed's real median and
              95th percentile per triage category, per 15-minute snapshot. Individual waits are
              draws from the hospital's own published distribution.
            </li>
            <li>
              <strong>FlowTwin ETA</strong> — empirical LOS quantiles (p10/p50/p80/p90) from{' '}
              {cal.n} real MIMIC-IV-ED stays, keyed by pathway band; when a stay outruns an
              estimate the prediction escalates up the quantile ladder, exactly as a live model
              would. Calibration is in-sample on the demo subset — the out-of-sample readout needs
              the full dataset and is labeled as such.
            </li>
            <li>
              <strong>Arrival model</strong> — MIMIC's hour-of-day shape scaled to a stated ~
              {adminKpis.hk.attendance_per_day_assumption}/day.
            </li>
            <li>
              <strong>Risk states</strong> — on-track / at-risk / blocked when elapsed time crosses
              the pathway's p50 / p80.
            </li>
            <li>
              <strong>FlowTwin Optimizer</strong> — measured climbs and sequence gaps × labeled
              "recoverable" shares × the HK$400/bed-hour assumption. Every line in the plan
              carries its own basis tag.
            </li>
          </ul>
        </section>

        <section className="chrome-about__section">
          <h3 className="chrome-about__h">Architecture — two planes (production design)</h3>
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
            Gemini runs the agents. Nemotron runs the hospital. In this prototype both are played
            by the deterministic engine — the interfaces are what you are looking at.
          </p>
          <p className="chrome-about__body">
            Sovereignty roadmap: as on-device open models (Gemma) mature, the entire agent layer
            runs fully in-hospital — swap the reasoning endpoint and nothing leaves the building.
            The HA feed is already public; the patient layer never existed outside it.
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
          MIMIC-IV-ED (PhysioNet). Identities: Synthea. No live API calls in this build.
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
