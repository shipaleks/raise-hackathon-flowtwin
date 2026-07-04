/* The drawing-sheet ornament: hairline frame with registration crosshairs,
   grid references along the sheet edges, and the title block — hospital
   name, floor, legend, data credits, scale bar, north arrow — drawn INTO
   the plate like a printed architectural folio. Replaces the floating
   HTML legend (which used to overflow the viewport). */

import { AgentGlyph } from '../ui/AgentGlyph'
import { HOSPITAL } from '../../data/seed'
import { MAP_H, MAP_W, NOTES_RECT, floorById, type FloorId } from '../../sim/layout'

const SHEET = { x: 4, y: 4, w: MAP_W - 8, h: MAP_H - 8 }

/** Drawing-set grid letters (I is skipped, as on real sheets). */
const GRID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']

const PLATE_CODE: Record<FloorId, string> = { g: 'PL-00', f1: 'PL-01', f2: 'PL-02' }

function Crosshair({ x, y }: { x: number; y: number }) {
  return (
    <g className="orn-cross">
      <line x1={x - 7} y1={y} x2={x + 7} y2={y} />
      <line x1={x} y1={y - 7} x2={x} y2={y + 7} />
    </g>
  )
}

function EdgeTicks() {
  const ticks = []
  // bottom + right edges only — the top strip belongs to the street on G
  for (let x = 50; x < MAP_W - 8; x += 50) {
    const major = x % 100 === 0
    ticks.push(
      <line
        key={`b${x}`}
        x1={x}
        y1={SHEET.y + SHEET.h}
        x2={x}
        y2={SHEET.y + SHEET.h - (major ? 6 : 3.5)}
      />,
    )
  }
  for (let y = 50; y < MAP_H - 8; y += 50) {
    const major = y % 100 === 0
    ticks.push(
      <line
        key={`r${y}`}
        x1={SHEET.x + SHEET.w}
        y1={y}
        x2={SHEET.x + SHEET.w - (major ? 6 : 3.5)}
        y2={y}
      />,
    )
  }
  return <g className="orn-ticks">{ticks}</g>
}

function GridRefs() {
  return (
    <g className="orn-refs" aria-hidden="true">
      {GRID_LETTERS.map((ch, i) => (
        <text key={ch} x={50 + i * 100} y={SHEET.y + SHEET.h - 10} textAnchor="middle">
          {ch}
        </text>
      ))}
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <text key={n} x={SHEET.x + SHEET.w - 11} y={n * 100 + 2} textAnchor="middle">
          {n}
        </text>
      ))}
    </g>
  )
}

function ScaleBar({ x, y }: { x: number; y: number }) {
  // three 28-unit segments, alternating fills — nominal metres
  return (
    <g className="orn-scale" transform={`translate(${x} ${y})`}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 28} y={0} width={28} height={3.5} className={i % 2 ? 'is-open' : 'is-fill'} />
      ))}
      <text x={0} y={-3.5} textAnchor="middle">0</text>
      <text x={42} y={-3.5} textAnchor="middle">10</text>
      <text x={84} y={-3.5} textAnchor="middle">20 m</text>
    </g>
  )
}

function NorthArrow({ x, y }: { x: number; y: number }) {
  return (
    <g className="orn-north" transform={`translate(${x} ${y})`}>
      <circle r={13} />
      <path d="M0 -9 L4 7 L0 4 L-4 7 Z" />
      <text y={-17} textAnchor="middle">N</text>
    </g>
  )
}

const LEGEND_RINGS = [
  ['ok', 'On track'],
  ['warn', 'At risk'],
  ['crit', 'Blocked'],
] as const

/** The title block — hospital, floor, legend, credits. */
function TitleBlock({ floorId }: { floorId: FloorId }) {
  const floor = floorById.get(floorId)
  const tb = NOTES_RECT
  const pad = 16
  return (
    <g className="orn-tb" transform={`translate(${tb.x} ${tb.y})`}>
      <rect className="orn-tb__frame" x={0} y={0} width={tb.w} height={tb.h} />
      <line className="orn-tb__rule" x1={pad} y1={70} x2={tb.w - pad} y2={70} />
      <line className="orn-tb__rule" x1={pad} y1={130} x2={tb.w - pad} y2={130} />

      <text className="orn-tb__eyebrow" x={pad} y={25}>
        {HOSPITAL.hospital.toUpperCase()} · {HOSPITAL.cluster.toUpperCase()}
      </text>
      <text className="orn-tb__code" x={tb.w - pad} y={25} textAnchor="end">
        {PLATE_CODE[floorId]} · 1:200
      </text>

      <text className="orn-tb__floor" x={pad} y={56}>
        Floor {floor?.short ?? '—'}
        <tspan className="orn-tb__floorname"> — {floor?.name ?? ''}</tspan>
      </text>

      {/* legend: people + status rings */}
      <g transform={`translate(${pad} ${86})`}>
        <g transform="translate(0 -8)">
          <AgentGlyph sex="male" risk="on_track" size={13} variant="map" />
        </g>
        <text className="orn-tb__item" x={19} y={2}>Male</text>
        <g transform="translate(0 16)">
          <AgentGlyph sex="female" risk="on_track" size={13} variant="map" />
        </g>
        <text className="orn-tb__item" x={19} y={26}>Female</text>
      </g>
      <g transform={`translate(${pad + 110} ${86})`}>
        {LEGEND_RINGS.map(([tone, label], i) => (
          <g key={tone} transform={`translate(0 ${i * 15 - 2})`}>
            <circle className={`orn-tb__ring orn-tb__ring--${tone}`} cx={5} cy={0} r={4.2} />
            <text className="orn-tb__item" x={17} y={3}>{label}</text>
          </g>
        ))}
      </g>

      <NorthArrow x={tb.w - 42} y={97} />

      <text className="orn-tb__credit" x={pad} y={146}>
        WAITS &amp; LOAD — REAL · HA LIVE FEED
      </text>
      <text className="orn-tb__credit" x={pad} y={158}>
        PEOPLE — SYNTHETIC PERSONAS · MIMIC-IV-ED · SEE ABOUT
      </text>
      <ScaleBar x={tb.w - pad - 84} y={149} />
    </g>
  )
}

export function PlateOrnament({ floorId, dimmed }: { floorId: FloorId; dimmed: boolean }) {
  return (
    <g className={`plate-orn${dimmed ? ' is-dimmed' : ''}`} aria-hidden="true">
      <rect className="orn-frame" x={SHEET.x} y={SHEET.y} width={SHEET.w} height={SHEET.h} />
      <EdgeTicks />
      <GridRefs />
      <Crosshair x={SHEET.x} y={SHEET.y} />
      <Crosshair x={SHEET.x + SHEET.w} y={SHEET.y} />
      <Crosshair x={SHEET.x} y={SHEET.y + SHEET.h} />
      <Crosshair x={SHEET.x + SHEET.w} y={SHEET.y + SHEET.h} />
      {floorId === 'g' ? (
        <g className="orn-street">
          {/* the kerb — ambulances pull up along this line */}
          <line x1={24} y1={16} x2={440} y2={16} />
          <text x={446} y={13.5}>STREET · AMBULANCE APPROACH</text>
        </g>
      ) : null}
      <TitleBlock floorId={floorId} />
    </g>
  )
}
