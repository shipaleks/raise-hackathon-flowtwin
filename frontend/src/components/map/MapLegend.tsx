/* Legend card in the free canvas region (hospital level only). */

import { AgentGlyph } from '../ui/AgentGlyph'
import { LEGEND_RECT } from '../../sim/layout'

const SEXES = [
  ['male', 'Male'],
  ['female', 'Female'],
  ['unknown', 'Unknown'],
] as const

const RINGS = [
  ['ok', 'On track'],
  ['warn', 'At risk'],
  ['crit', 'Blocked'],
] as const

export function MapLegend({ hidden }: { hidden: boolean }) {
  const { x, y, w, h } = LEGEND_RECT
  const rowY = (i: number) => y + 46 + i * 23
  return (
    <g className="map-legend" style={{ opacity: hidden ? 0 : 1 }} aria-hidden={hidden || undefined}>
      <rect className="map-legend__card" x={x} y={y} width={w} height={h} rx={12} />
      <text className="map-legend__title" x={x + 20} y={y + 26}>
        Legend
      </text>

      {SEXES.map(([sex, label], i) => (
        <g key={sex} transform={`translate(${x + 20} ${rowY(i) - 8})`}>
          <AgentGlyph sex={sex} risk="on_track" size={16} variant="map" />
          <text className="map-legend__label" x={24} y={12}>
            {label}
          </text>
        </g>
      ))}

      {RINGS.map(([tone, label], i) => (
        <g key={tone} transform={`translate(${x + 150} ${rowY(i)})`}>
          <circle className={`map-legend__ring map-legend__ring--${tone}`} cx={8} cy={0} r={6} />
          <text className="map-legend__label" x={24} y={4}>
            {label}
          </text>
        </g>
      ))}

      <text className="map-legend__caption" x={x + 20} y={y + 120}>
        Color is never the only signal — every token carries its letter.
      </text>
      <text className="map-legend__caption map-legend__caption--src" x={x + 20} y={y + 137}>
        Seeded from Synthea + HF HospitalAdmissions — see About.
      </text>
    </g>
  )
}
