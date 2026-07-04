/* Legend overlay (bottom-right) — reads the encoding and states the data
   split in one glance: load & waits real, personas synthetic. */

import { AgentGlyph } from '../ui/AgentGlyph'
import { HOSPITAL } from '../../data/seed'

const SEXES = [
  ['male', 'Male'],
  ['female', 'Female'],
] as const

const RINGS = [
  ['ok', 'On track'],
  ['warn', 'At risk'],
  ['crit', 'Blocked'],
] as const

export function MapLegend({ hidden }: { hidden: boolean }) {
  return (
    <aside className={`map-legend${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden || undefined}>
      <p className="map-legend__title">Legend</p>
      <div className="map-legend__rows">
        <div className="map-legend__col">
          {SEXES.map(([sex, label]) => (
            <span key={sex} className="map-legend__item">
              <AgentGlyph sex={sex} risk="on_track" size={15} variant="map" />
              {label}
            </span>
          ))}
        </div>
        <div className="map-legend__col">
          {RINGS.map(([tone, label]) => (
            <span key={tone} className="map-legend__item">
              <span className={`map-legend__ring map-legend__ring--${tone}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>
      <p className="map-legend__caption">
        Waits &amp; load: <strong>real</strong> — {HOSPITAL.hospital} live feed.
      </p>
      <p className="map-legend__caption map-legend__caption--src">
        People: synthetic personas on MIMIC-IV-ED statistics — see About.
      </p>
    </aside>
  )
}
