/* Top chrome: wordmark, the REAL hospital identity, drill-down breadcrumb
   (doctor view), the live wait readout at the scrubbed moment, the
   Doctor/Administrator switch, Optimize-the-day, theme, About. */

import { Fragment, useState } from 'react'
import { HOSPITAL } from '../../data/seed'
import { heroWaitsAt, fmtWait } from '../../data/live'
import { worldAt } from '../../sim/engine'
import { areaById, deptById, floorById } from '../../sim/layout'
import { LIVE_MIN, fmtDayClock } from '../../sim/time'
import { useStore, type View } from '../../store'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import './chrome.css'

const VIEW_OPTIONS: Array<SegmentedOption<View>> = [
  { id: 'doctor', label: 'Doctor' },
  { id: 'admin', label: 'Administrator' },
]

/** Sparkle-in-a-rounded-square — mirrors public/favicon.svg. */
function Wordmark() {
  return (
    <svg className="chrome-topbar__mark" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" fill="var(--accent)" />
      <path
        d="M16 9.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8-4.8-1.7 4.8-1.7z"
        fill="var(--accent-ink)"
      />
    </svg>
  )
}

/** Hospital / Department / Area — ancestors zoom out, current is plain text. */
function Breadcrumb() {
  const zoomPath = useStore((s) => s.zoomPath)
  const floorId = useStore((s) => s.floorId)
  const zoomTo = useStore((s) => s.zoomTo)

  const dept = zoomPath.length > 0 ? deptById.get(zoomPath[0]) : undefined
  const area =
    dept && zoomPath.length > 1 ? areaById.get(`${zoomPath[0]}/${zoomPath[1]}`)?.area : undefined
  const floor = floorById.get(dept?.floor ?? floorId)

  const crumbs: Array<{ label: string; jump?: () => void }> = [
    { label: `Floor ${floor?.short ?? 'G'}`, jump: () => zoomTo([]) },
  ]
  if (dept) crumbs.push({ label: dept.name, jump: () => zoomTo([dept.id]) })
  if (dept && area) crumbs.push({ label: area.name })

  return (
    <nav className="chrome-topbar__crumbs" aria-label="Location">
      {crumbs.map((c, i) => {
        const isCurrent = i === crumbs.length - 1
        return (
          <Fragment key={c.label}>
            {i > 0 && (
              <span className="chrome-topbar__crumb-sep" aria-hidden="true">
                ›
              </span>
            )}
            {isCurrent && i > 0 ? (
              <span className="chrome-topbar__crumb is-current" aria-current="location">
                {c.label}
              </span>
            ) : (
              <button
                type="button"
                className="chrome-topbar__crumb chrome-topbar__crumb--link"
                onClick={c.jump}
              >
                {c.label}
              </button>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}

/** Sim clock + the REAL published waits at that moment. Never money. */
function StatusLine() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const { status } = worldAt(simMin, resolvedAtMin)
  const w = heroWaitsAt(simMin)
  const live = simMin >= LIVE_MIN - 8
  return (
    <p className="chrome-topbar__status tnum">
      {fmtDayClock(simMin)} HKT · {status.onFloor} in building
      {w && (
        <span className={`chrome-topbar__waits${live ? ' is-live' : ''}`}>
          {' '}
          · cat-3 {fmtWait(w.t3p50)} · cat-4/5 {fmtWait(w.t45p50)}{' '}
          <span className="chrome-topbar__waits-src">{live ? 'live' : 'feed'}</span>
        </span>
      )}
    </p>
  )
}

function ThemeToggle() {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <button
      type="button"
      className="chrome-topbar__icon-btn"
      aria-label={`Switch to ${next} theme`}
      onClick={toggleTheme}
    >
      {theme === 'light' ? (
        // moon — the theme this button switches to
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M17.2 12.6a7.4 7.4 0 0 1-9.8-9.8 7.4 7.4 0 1 0 9.8 9.8z"
            fill="currentColor"
          />
        </svg>
      ) : (
        // sun
        <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.4" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="10" y1="1.4" x2="10" y2="3.6" />
            <line x1="10" y1="16.4" x2="10" y2="18.6" />
            <line x1="1.4" y1="10" x2="3.6" y2="10" />
            <line x1="16.4" y1="10" x2="18.6" y2="10" />
            <line x1="3.9" y1="3.9" x2="5.5" y2="5.5" />
            <line x1="14.5" y1="14.5" x2="16.1" y2="16.1" />
            <line x1="16.1" y1="3.9" x2="14.5" y2="5.5" />
            <line x1="3.9" y1="16.1" x2="5.5" y2="14.5" />
          </g>
        </svg>
      )}
    </button>
  )
}

/** Monad-style announcement strip: the honesty note, one glance, dismissible. */
function AnnouncementBar({ onAbout }: { onAbout: () => void }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="chrome-announce" role="note">
      <span>
        Real hospital, real waits ({HOSPITAL.hospital}, HA live feed) — patients are synthetic
        personas, operational suggestions only
      </span>
      <button type="button" className="chrome-announce__link" onClick={onAbout}>
        how it works →
      </button>
      <button
        type="button"
        className="chrome-announce__close"
        aria-label="Dismiss announcement"
        onClick={() => setDismissed(true)}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export function TopBar() {
  const view = useStore((s) => s.view)
  const simMin = useStore((s) => s.simMin)
  const setView = useStore((s) => s.setView)
  const setAboutOpen = useStore((s) => s.setAboutOpen)
  const setWrapOpen = useStore((s) => s.setWrapOpen)
  const dayNearlyDone = simMin >= 6 * 60 // from the 17:00 real peak onward

  return (
    <div className="chrome">
      <AnnouncementBar onAbout={() => setAboutOpen(true)} />
      <header className="chrome-topbar">
        <div className="chrome-topbar__brand">
          <Wordmark />
          <span className="chrome-topbar__name">FlowTwin</span>
          <span className="chrome-topbar__tagline">
            live twin of {HOSPITAL.hospital} A&amp;E · {HOSPITAL.cluster}
          </span>
        </div>

        {view === 'doctor' && <Breadcrumb />}

        <div className="chrome-topbar__right">
          <StatusLine />
          <button
            type="button"
            className={`chrome-topbar__optimize${dayNearlyDone ? ' is-ready' : ''}`}
            onClick={() => setWrapOpen(true)}
          >
            Optimize the day
          </button>
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="View" />
          <ThemeToggle />
          <button type="button" className="chrome-topbar__about" onClick={() => setAboutOpen(true)}>
            About
          </button>
        </div>
      </header>
    </div>
  )
}
