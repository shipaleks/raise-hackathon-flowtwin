/* The drill-down hospital map: one SVG floor-plate, three zoom levels
   (hospital → department → room), live agents from the sim engine.
   Zooming is a viewport transform into a rect — never a re-layout. */

import { useRef, useState } from 'react'
import { AgentGlyph } from '../ui/AgentGlyph'
import { Chip, type ChipTone } from '../ui/Chip'
import { LoadRing } from '../ui/LoadRing'
import { dischargedTodayCount, worldAt, type LoadLevel, type MapAgent } from '../../sim/engine'
import { DEPTS, MAP_H, MAP_W, areaById, deptById, type AreaDef } from '../../sim/layout'
import { fmtClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import type { Risk } from '../../types'
import { MapLegend } from './MapLegend'
import './map.css'

// ---------------------------------------------------------------- constants

const ZOOM_MARGIN = 24
const GLYPH = 16
const TIP_W = 252
const TIP_H = 118

const RISK_WORD: Record<Risk, string> = { on_track: 'On track', elevated: 'At risk', high: 'Blocked' }
const RISK_TONE: Record<Risk, ChipTone> = { on_track: 'ok', elevated: 'warn', high: 'crit' }
const LEVEL_WORD: Record<LoadLevel, string> = { ok: 'calm', busy: 'busy', over: 'over capacity' }

// ---------------------------------------------------------------- geometry

interface ViewTransform {
  k: number
  tx: number
  ty: number
}

/** Viewport transform for the current zoom path (identity at hospital level). */
function viewTransform(zoomPath: string[]): ViewTransform {
  let r: { x: number; y: number; w: number; h: number } | null = null
  if (zoomPath.length >= 2) {
    const hit = areaById.get(`${zoomPath[0]}/${zoomPath[1]}`)
    if (hit) r = hit.area
  }
  if (!r && zoomPath.length >= 1) {
    const d = deptById.get(zoomPath[0])
    if (d) r = d
  }
  if (!r) return { k: 1, tx: 0, ty: 0 }
  const k = Math.min(MAP_W / (r.w + ZOOM_MARGIN * 2), MAP_H / (r.h + ZOOM_MARGIN * 2))
  return {
    k,
    tx: MAP_W / 2 - k * (r.x + r.w / 2),
    ty: MAP_H / 2 - k * (r.y + r.h / 2),
  }
}

/** Counter-scale so a glyph reads ~16px at hospital level, up to ~22px deep in. */
function glyphScale(k: number, isHero: boolean): number {
  const target = Math.min(22, GLYPH * Math.pow(k, 0.35))
  return (target / (GLYPH * k)) * (isHero ? 1.25 : 1)
}

/** Same grid math as layout.placeOccupants — so bays render under the agents. */
function slotGrid(a: AreaDef) {
  const pad = 10
  const w = Math.max(a.w - pad * 2, 8)
  const h = Math.max(a.h - pad * 2, 8)
  const n = Math.max(a.capacity, 1)
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)) || 1)
  const rows = Math.ceil(n / cols)
  return { pad, w, h, cols, rows }
}

function slotCenters(a: AreaDef): Array<{ x: number; y: number }> {
  const { pad, w, h, cols, rows } = slotGrid(a)
  const out: Array<{ x: number; y: number }> = []
  for (let s = 0; s < cols * rows; s++) {
    const c = s % cols
    const r = Math.floor(s / cols)
    out.push({ x: a.x + pad + ((c + 0.5) * w) / cols, y: a.y + pad + ((r + 0.5) * h) / rows })
  }
  return out
}

function slotRadius(a: AreaDef): number {
  const { w, h, cols, rows } = slotGrid(a)
  return Math.min(16, Math.min(w / cols, h / rows) * 0.32)
}

/** What one slot in this area is called — the room-level naming. */
const SLOT_NOUN: Record<string, string> = {
  'er-bay': 'Bay',
  observation: 'Obs',
  waiting: 'Seat',
  consult: 'Slot',
  telemetry: 'Tele',
  'medical-ward': 'Bed',
  'surgical-ward': 'Bed',
  chemistry: 'Bench',
  microbiology: 'Bench',
  toxicology: 'Bench',
  recovery: 'Bed',
}
const slotNoun = (areaId: string) => SLOT_NOUN[areaId] ?? 'Spot'

// ---------------------------------------------------------------- copy

function zoneNameFor(a: MapAgent): string {
  if (a.areaId) {
    const hit = areaById.get(`${a.deptId}/${a.areaId}`)
    if (hit) return hit.area.name
  }
  return deptById.get(a.deptId)?.name ?? a.deptId
}

const sexLetter = (a: MapAgent) => (a.sex === 'male' ? 'M' : 'F')

const exitPhrase = (a: MapAgent) =>
  a.onWard
    ? `Admitted ${fmtClock(a.exitMin)} · on the ward`
    : a.exitIsActual
      ? `Exit ${fmtClock(a.exitMin)} · from the log`
      : `Predicted exit ${fmtClock(a.exitMin)}`

/** Tooltip summary as one sentence — doubles as the agent's aria-label. */
function agentSummary(a: MapAgent): string {
  return `${a.name}, ${a.age}, ${sexLetter(a)} — ${a.complaint}. Waiting ${fmtDur(a.waitMin)} in ${zoneNameFor(a)}. ${exitPhrase(a)}. ${RISK_WORD[a.risk]}.`
}

const plural = (n: number) => (n === 1 ? 'patient' : 'patients')

// ---------------------------------------------------------------- component

export function MapView() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const zoomPath = useStore((s) => s.zoomPath)
  const selectedId = useStore((s) => s.selectedId)
  const zoomTo = useStore((s) => s.zoomTo)
  const zoomOut = useStore((s) => s.zoomOut)
  const select = useStore((s) => s.select)
  const setHovered = useStore((s) => s.setHovered)

  const world = worldAt(simMin, resolvedAtMin)
  const view = viewTransform(zoomPath)
  const zoomed = zoomPath.length > 0
  const focusDept = zoomPath.length >= 1 ? zoomPath[0] : null
  const focusArea = zoomPath.length >= 2 ? `${zoomPath[0]}/${zoomPath[1]}` : null

  const wrapRef = useRef<HTMLElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const hoverAgent = (hoverId && world.agents.find((a) => a.id === hoverId)) || null

  // hero and selected agents paint last (on top); base order is stable by id
  const rank = (a: MapAgent) => (a.id === selectedId ? 2 : a.isHero ? 1 : 0)
  const orderedAgents = [...world.agents].sort((a, b) => rank(a) - rank(b))

  // --- tooltip position (direct DOM writes — no re-render per mousemove) ---
  const moveTip = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current
    const tip = tipRef.current
    if (!wrap || !tip) return
    const r = wrap.getBoundingClientRect()
    let x = clientX - r.left + 16
    let y = clientY - r.top + 14
    if (x + TIP_W > r.width - 8) x = clientX - r.left - TIP_W - 14
    if (y + TIP_H > r.height - 8) y = clientY - r.top - TIP_H - 12
    tip.style.left = `${Math.max(8, x)}px`
    tip.style.top = `${Math.max(8, y)}px`
  }

  /** Keyboard focus gets the same preview, anchored to the agent's map spot. */
  const moveTipToAgent = (a: MapAgent) => {
    const svg = svgRef.current
    if (!svg) return
    const sr = svg.getBoundingClientRect()
    const fit = Math.min(sr.width / MAP_W, sr.height / MAP_H)
    const ox = sr.left + (sr.width - MAP_W * fit) / 2
    const oy = sr.top + (sr.height - MAP_H * fit) / 2
    moveTip(ox + fit * (view.tx + view.k * a.x), oy + fit * (view.ty + view.k * a.y))
  }

  const hoverOn = (id: string) => {
    setHoverId(id)
    setHovered(id)
  }
  const hoverOff = () => {
    setHoverId(null)
    setHovered(null)
  }

  // --- interaction ---
  const onBackgroundClick = () => {
    if (selectedId) select(null)
    else if (zoomPath.length) zoomOut()
  }

  const onActionKey = (e: React.KeyboardEvent<SVGElement>, fn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
  }

  const toggleDept = (d: { id: string }) => {
    if (focusDept === d.id && zoomPath.length === 1) zoomOut()
    else zoomTo([d.id])
  }
  const toggleArea = (deptId: string, areaId: string) => {
    if (focusArea === `${deptId}/${areaId}`) zoomOut()
    else zoomTo([deptId, areaId])
  }

  return (
    <section
      ref={wrapRef}
      className="map-wrap"
      aria-label="Hospital map"
      onClick={onBackgroundClick}
      onMouseMove={(e) => {
        if (hoverId) moveTip(e.clientX, e.clientY)
      }}
      onMouseLeave={hoverOff}
    >
      <svg
        ref={svgRef}
        className="map-svg"
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <g
          className="map-viewport"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})` }}
        >
          {DEPTS.map((d) => {
            const load = world.zones.depts.get(d.id)
            const count = load?.count ?? 0
            const inDept = focusDept === d.id
            return (
              <g key={d.id} className={`map-zone${d.outside ? ' map-zone--outside' : ''}`}>
                <rect
                  className="map-zone__rect"
                  x={d.x}
                  y={d.y}
                  width={d.w}
                  height={d.h}
                  rx={12}
                  vectorEffect="non-scaling-stroke"
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.name} — ${count} ${plural(count)}, ${LEVEL_WORD[load?.level ?? 'ok']}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleDept(d)
                  }}
                  onKeyDown={(e) => onActionKey(e, () => toggleDept(d))}
                />
                <g
                  className="map-zone__hdr map-cs"
                  style={{ transform: `translate(${d.x + 14}px, ${d.y + 10}px) scale(${1 / view.k})` }}
                >
                  <text className="map-zone__name" y={13}>
                    {d.name}
                    {d.id === 'ambulance-bay' ? <tspan className="map-zone__tag"> · outside</tspan> : null}
                  </text>
                  <text className="map-zone__status" y={29}>
                    {load?.status ?? ''}
                  </text>
                </g>
                <g
                  className="map-zone__hdr map-cs"
                  style={{ transform: `translate(${d.x + d.w - 12}px, ${d.y + 10}px) scale(${1 / view.k})` }}
                >
                  <g transform="translate(-30 0)">
                    <LoadRing ratio={load?.ratio ?? 0} level={load?.level ?? 'ok'} count={count} size={30} />
                  </g>
                </g>
                {d.areas.map((a) => {
                  const areaKey = `${d.id}/${a.id}`
                  const aCount = world.zones.areas.get(areaKey)?.count ?? 0
                  const isFocused = focusArea === areaKey
                  return (
                    <g key={a.id} className={`map-area ${inDept ? 'map-area--live' : 'map-area--hint'}`}>
                      <rect
                        className="map-area__rect"
                        x={a.x}
                        y={a.y}
                        width={a.w}
                        height={a.h}
                        rx={8}
                        vectorEffect="non-scaling-stroke"
                        role={inDept ? 'button' : undefined}
                        tabIndex={inDept ? 0 : undefined}
                        aria-label={inDept ? `${a.name} — ${aCount} ${plural(aCount)}` : undefined}
                        aria-hidden={inDept ? undefined : true}
                        onClick={
                          inDept
                            ? (e) => {
                                e.stopPropagation()
                                toggleArea(d.id, a.id)
                              }
                            : undefined
                        }
                        onKeyDown={inDept ? (e) => onActionKey(e, () => toggleArea(d.id, a.id)) : undefined}
                      />
                      {isFocused ? (
                        <g
                          className="map-slots"
                          role="list"
                          aria-label={`${a.name} — ${a.capacity} ${slotNoun(a.id).toLowerCase()}s`}
                        >
                          {slotCenters(a)
                            .slice(0, a.capacity)
                            .map((p, i) => (
                              <g key={i} role="listitem" aria-label={`${slotNoun(a.id)} ${i + 1}`}>
                                <circle
                                  className="map-slot"
                                  cx={p.x}
                                  cy={p.y}
                                  r={slotRadius(a)}
                                  vectorEffect="non-scaling-stroke"
                                />
                                <text
                                  className="map-slot__name"
                                  x={p.x}
                                  y={p.y + slotRadius(a) + 3.6}
                                  textAnchor="middle"
                                >
                                  {slotNoun(a.id)} {i + 1}
                                </text>
                              </g>
                            ))}
                        </g>
                      ) : null}
                      <g
                        className="map-area__label map-cs"
                        style={{
                          transform: `translate(${a.x + 8}px, ${a.y + 6}px) scale(${1 / view.k})`,
                          opacity: inDept ? 1 : 0,
                        }}
                        aria-hidden="true"
                      >
                        <text y={11}>
                          {a.name}
                          <tspan className="map-area__count tnum"> · {aCount}</tspan>
                        </text>
                      </g>
                    </g>
                  )
                })}
              </g>
            )
          })}

          <MapLegend hidden={zoomed} />

          {orderedAgents.map((a) => {
            const dimmed = selectedId != null && a.id !== selectedId
            // discharged glyphs fade off the map over the grace window
            const opacity = a.exiting ? 0 : (a.kind === 'history' ? 0.85 : 1) * (dimmed ? 0.45 : 1)
            return (
              <g
                key={a.id}
                className={`map-agent${a.exiting ? ' is-exiting' : ''}`}
                style={{
                  transform: `translate(${a.x}px, ${a.y}px) scale(${glyphScale(view.k, a.isHero)})`,
                  opacity,
                }}
                role={a.exiting ? undefined : 'button'}
                tabIndex={a.exiting ? -1 : 0}
                aria-hidden={a.exiting || undefined}
                aria-label={a.exiting ? undefined : agentSummary(a)}
                aria-pressed={a.exiting ? undefined : a.id === selectedId}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!a.exiting) select(a.id)
                }}
                onKeyDown={(e) => onActionKey(e, () => select(a.id))}
                onMouseEnter={(e) => {
                  if (a.exiting) return
                  hoverOn(a.id)
                  moveTip(e.clientX, e.clientY)
                }}
                onMouseLeave={hoverOff}
                onFocus={() => {
                  hoverOn(a.id)
                  moveTipToAgent(a)
                }}
                onBlur={hoverOff}
              >
                <circle className="map-agent__hit" r={12} />
                {a.isHero ? <circle className="map-agent__halo" r={13.5} /> : null}
                {a.id === selectedId ? <circle className="map-agent__selected" r={12.5} /> : null}
                <g transform="translate(-8 -8)">
                  <AgentGlyph sex={a.sex} risk={a.risk} size={GLYPH} variant="map" pulse={a.blocked} />
                </g>
              </g>
            )
          })}
        </g>
      </svg>

      <div ref={tipRef} className={`map-tip${hoverAgent ? ' is-on' : ''}`} aria-hidden="true">
        {hoverAgent ? (
          <>
            <div className="map-tip__name">
              {hoverAgent.name}
              <span className="map-tip__meta tnum">
                {' '}
                · {hoverAgent.age} · {sexLetter(hoverAgent)}
              </span>
            </div>
            <div className="map-tip__complaint">{hoverAgent.complaint}</div>
            <div className="map-tip__row tnum">
              Waiting {fmtDur(hoverAgent.waitMin)} in {zoneNameFor(hoverAgent)}
            </div>
            <div className="map-tip__foot">
              <span className="tnum">{exitPhrase(hoverAgent)}</span>
              <Chip tone={RISK_TONE[hoverAgent.risk]}>{RISK_WORD[hoverAgent.risk]}</Chip>
            </div>
          </>
        ) : null}
      </div>

      {world.agents.length === 0 ? (
        <div className="map-quiet tnum" role="status">
          {simMin > 0 ? `Quiet floor · ${dischargedTodayCount(simMin)} discharged today` : 'Quiet floor'}
        </div>
      ) : null}
    </section>
  )
}
