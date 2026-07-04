/* The drill-down hospital map — three floor plates drawn like a building:
   corridor spine, lift core, rooms with doors and furniture, patients as
   meeples that WALK between stations (and take the lift between floors).
   The A&E plate's crowd is calibrated to the real HK feed; the selected
   patient's whole way through the building is drawn as a trace.
   Zooming is a viewport transform into a rect — never a re-layout. */

import { useEffect, useRef, useState } from 'react'
import { AgentGlyph } from '../ui/AgentGlyph'
import { Chip, type ChipTone } from '../ui/Chip'
import { LoadRing } from '../ui/LoadRing'
import {
  dischargedTodayCount,
  traceFor,
  worldAt,
  type LoadLevel,
  type MapAgent,
} from '../../sim/engine'
import {
  CORRIDOR,
  FLOORS,
  LIFT,
  MAP_H,
  MAP_W,
  areaById,
  deptById,
  deptsOnFloor,
  doorOf,
  slotCenter,
  slotGrid,
  type AreaDef,
  type SlotKind,
} from '../../sim/layout'
import { LIVE_MIN, fmtClock, fmtDur, simToDate } from '../../sim/time'
import { HOSPITAL, hkLive } from '../../data/seed'
import { useStore } from '../../store'
import type { Risk } from '../../types'
import { PlateOrnament } from './PlateOrnament'
import './map.css'

// ---------------------------------------------------------------- constants

const ZOOM_MARGIN = 24
const GLYPH = 16
const TIP_W = 264
const TIP_H = 128

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

// ---------------------------------------------------------------- furniture

/** One furniture glyph per slot — what makes a room read as a room. */
function Furniture({ kind, x, y, s }: { kind: SlotKind; x: number; y: number; s: number }) {
  const u = Math.min(s, 15)
  switch (kind) {
    case 'bed':
    case 'trolley':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.42} y={-u * 0.62} width={u * 0.84} height={u * 1.24} rx={u * 0.16} />
          <line x1={-u * 0.42} y1={-u * 0.3} x2={u * 0.42} y2={-u * 0.3} />
          {kind === 'trolley' && (
            <>
              <circle cx={-u * 0.3} cy={u * 0.72} r={u * 0.08} />
              <circle cx={u * 0.3} cy={u * 0.72} r={u * 0.08} />
            </>
          )}
        </g>
      )
    case 'chair':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.3} y={-u * 0.3} width={u * 0.6} height={u * 0.6} rx={u * 0.12} />
          <line x1={-u * 0.3} y1={-u * 0.34} x2={u * 0.3} y2={-u * 0.34} />
        </g>
      )
    case 'desk':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.5} y={-u * 0.28} width={u} height={u * 0.56} rx={u * 0.1} />
          <line x1={-u * 0.26} y1={-0.02 * u} x2={u * 0.26} y2={-0.02 * u} />
        </g>
      )
    case 'scanner':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <circle cx={0} cy={-u * 0.16} r={u * 0.42} />
          <circle cx={0} cy={-u * 0.16} r={u * 0.16} />
          <rect x={-u * 0.14} y={u * 0.1} width={u * 0.28} height={u * 0.66} rx={u * 0.1} />
        </g>
      )
    case 'plate':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.44} y={-u * 0.56} width={u * 0.88} height={u * 1.12} rx={u * 0.12} />
          <line x1={-u * 0.3} y1={u * 0.4} x2={u * 0.3} y2={-u * 0.4} />
        </g>
      )
    case 'bench':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.62} y={-u * 0.2} width={u * 1.24} height={u * 0.4} rx={u * 0.08} />
          <line x1={-u * 0.36} y1={0} x2={u * 0.36} y2={0} />
        </g>
      )
    case 'table':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.3} y={-u * 0.6} width={u * 0.6} height={u * 1.2} rx={u * 0.12} />
          <circle cx={0} cy={-u * 0.72} r={u * 0.2} />
        </g>
      )
    case 'hatch':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <rect x={-u * 0.5} y={-u * 0.3} width={u} height={u * 0.6} rx={u * 0.1} />
          <line x1={-u * 0.3} y1={0} x2={u * 0.3} y2={0} />
        </g>
      )
    case 'door':
      return (
        <g className="map-furn" transform={`translate(${x} ${y})`}>
          <line x1={-u * 0.4} y1={-u * 0.4} x2={-u * 0.4} y2={u * 0.4} />
          <line x1={u * 0.4} y1={-u * 0.4} x2={u * 0.4} y2={u * 0.4} />
        </g>
      )
    default:
      return null
  }
}

function furnitureSize(a: AreaDef): number {
  const g = slotGrid(a, Math.max(a.capacity, 1))
  return Math.min(15, Math.min(g.w / g.cols, g.h / g.rows) * 0.42)
}

/** Plan-drawing door symbol: an opening in the wall, the leaf, and its
    quarter swing arc. `into` is the leaf direction (+1 opens downward). */
function DoorMark({
  x,
  y,
  into,
  w,
  room,
}: {
  x: number
  y: number
  into: 1 | -1
  w: number
  room?: boolean
}) {
  const hx = x - w / 2 // hinge
  const tipY = y + into * w
  const sweep = into === 1 ? 0 : 1
  return (
    <g className={`map-doorsym${room ? ' map-doorsym--room' : ''}`} aria-hidden="true">
      <line className="map-door__gap" x1={hx} y1={y} x2={x + w / 2} y2={y} />
      <line className="map-door__leaf" x1={hx} y1={y} x2={hx} y2={tipY} />
      <path
        className="map-door__swing"
        d={`M ${hx} ${tipY} A ${w} ${w} 0 0 ${sweep} ${x + w / 2} ${y}`}
      />
    </g>
  )
}

/** Which way a zone's door leaf opens: into the room, away from the corridor. */
const doorInto = (rect: { y: number; h: number }): 1 | -1 =>
  rect.y + rect.h <= CORRIDOR.y1 + 1 ? -1 : 1

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
    ? `Admitted ${fmtClock(a.exitMin)} · in a ward bed`
    : a.handoff
      ? `Admitted ${fmtClock(a.exitMin)} · handed off to the ward`
      : a.exitIsActual
        ? `Exit ${fmtClock(a.exitMin)} · from the feed replay`
        : `Predicted exit ${fmtClock(a.exitMin)}`

/** Tooltip summary as one sentence — doubles as the agent's aria-label. */
function agentSummary(a: MapAgent): string {
  const doing = a.walking ? 'Walking to' : `Waiting ${fmtDur(a.waitMin)} in`
  return `${a.name}, ${a.age}, ${sexLetter(a)}, triage cat ${a.acuity} — ${a.complaint}. ${doing} ${zoneNameFor(a)}. ${exitPhrase(a)}. ${RISK_WORD[a.risk]}.`
}

const plural = (n: number) => (n === 1 ? 'patient' : 'patients')

// ---------------------------------------------------------------- component

export function MapView() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const floorId = useStore((s) => s.floorId)
  const zoomPath = useStore((s) => s.zoomPath)
  const selectedId = useStore((s) => s.selectedId)
  const setFloor = useStore((s) => s.setFloor)
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

  // follow the selected patient: snap on selection, then track their lift
  // rides — but never fight a manual floor change while they sit still
  const selectedAgent = selectedId ? world.agents.find((a) => a.id === selectedId) : null
  const selectedFloor = selectedAgent?.floorId
  const followRef = useRef<{ id: string | null; floor: string | null }>({ id: null, floor: null })
  useEffect(() => {
    const prev = followRef.current
    if (!selectedId || !selectedFloor) {
      followRef.current = { id: selectedId ?? null, floor: null }
      return
    }
    const newSelection = prev.id !== selectedId
    const agentMoved = prev.floor != null && prev.floor !== selectedFloor
    if ((newSelection || agentMoved) && selectedFloor !== useStore.getState().floorId) {
      setFloor(selectedFloor)
    }
    followRef.current = { id: selectedId, floor: selectedFloor }
  }, [selectedId, selectedFloor, setFloor])

  const floorAgents = world.agents.filter((a) => a.floorId === floorId)
  // hero and selected agents paint last (on top); base order is stable by id
  const rank = (a: MapAgent) => (a.id === selectedId ? 2 : a.isHero ? 1 : 0)
  const orderedAgents = [...floorAgents].sort((a, b) => rank(a) - rank(b))

  const trace = selectedId ? traceFor(selectedId, simMin, resolvedAtMin) : []
  const floorTrace = trace.filter((l) => l.floor === floorId)

  const depts = deptsOnFloor(floorId)

  // night falls over the plate (03:00 darkest, daytime clear)
  const hour = simToDate(simMin).getHours() + simToDate(simMin).getMinutes() / 60
  const nightness = Math.max(0, Math.cos(((hour - 3) / 12) * Math.PI))
  const isLiveEdge = simMin >= LIVE_MIN - 8

  // ambulances drawn while an ambulance arrival is at the bay (floor G)
  const bayAmbulances =
    floorId === 'g'
      ? world.agents
          .filter(
            (a) =>
              a.arrivalMode === 'ambulance' &&
              a.deptId === 'ambulance-bay' &&
              !a.exiting,
          )
          .slice(0, 3)
      : []

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

  const liveRow = hkLive.hospitals[HOSPITAL.hospital_slug]

  return (
    <section
      ref={wrapRef}
      className="map-wrap"
      aria-label={`Hospital map — floor ${floorId.toUpperCase()}`}
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
          {/* ---------------- building shell: plate, corridor, lift ---------------- */}
          <rect className="map-plate" x={12} y={84} width={MAP_W - 24} height={MAP_H - 104} rx={22} />
          <rect
            className="map-corridor"
            x={20}
            y={CORRIDOR.y1}
            width={MAP_W - 40}
            height={CORRIDOR.y2 - CORRIDOR.y1}
          />
          <line
            className="map-corridor__mid"
            x1={30}
            y1={(CORRIDOR.y1 + CORRIDOR.y2) / 2}
            x2={MAP_W - 30}
            y2={(CORRIDOR.y1 + CORRIDOR.y2) / 2}
          />
          {/* lift core — the classic plan symbol: shaft, crossed diagonals,
              door opening on the corridor side */}
          <g className="map-lift">
            <rect x={LIFT.x} y={LIFT.y} width={LIFT.w} height={LIFT.h} />
            <line x1={LIFT.x} y1={LIFT.y} x2={LIFT.x + LIFT.w} y2={LIFT.y + LIFT.h} />
            <line x1={LIFT.x + LIFT.w} y1={LIFT.y} x2={LIFT.x} y2={LIFT.y + LIFT.h} />
            <line
              className="map-door__gap"
              x1={LIFT.x + LIFT.w / 2 - 9}
              y1={LIFT.y}
              x2={LIFT.x + LIFT.w / 2 + 9}
              y2={LIFT.y}
            />
            <text
              className="map-lift__label"
              x={LIFT.x + LIFT.w / 2}
              y={LIFT.y + LIFT.h + 14}
              textAnchor="middle"
            >
              LIFT
            </text>
          </g>

          {/* ---------------- drawing-sheet ornament ---------------- */}
          <PlateOrnament floorId={floorId} dimmed={zoomed} />

          {/* ---------------- departments ---------------- */}
          {depts.map((d) => {
            const load = world.zones.depts.get(d.id)
            const count = load?.count ?? 0
            const inDept = focusDept === d.id
            const deptDoor = d.outside ? null : doorOf(d)
            return (
              <g key={d.id} className={`map-zone${d.outside ? ' map-zone--outside' : ''}`}>
                <rect
                  className={`map-zone__rect map-zone__rect--${load?.level ?? 'ok'}`}
                  x={d.x}
                  y={d.y}
                  width={d.w}
                  height={d.h}
                  rx={14}
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
                {deptDoor && <DoorMark x={deptDoor.x} y={deptDoor.y} into={doorInto(d)} w={11} />}

                {d.areas.map((a) => {
                  const areaKey = `${d.id}/${a.id}`
                  const aLoad = world.zones.areas.get(areaKey)
                  const aCount = aLoad?.count ?? 0
                  const isFocused = focusArea === areaKey
                  const grid = slotGrid(a, Math.max(a.capacity, 1))
                  const fSize = furnitureSize(a)
                  const noun = a.noun ?? { chair: 'Seat', bed: 'Bed', trolley: 'Bay', desk: 'Desk', scanner: 'Unit', plate: 'Unit', bench: 'Bench', table: 'Table', hatch: 'Hatch', door: 'Door' }[a.kind]
                  const door = doorOf(a)
                  return (
                    <g key={a.id} className={`map-area ${inDept ? 'map-area--live' : 'map-area--hint'}`}>
                      <rect
                        className={`map-area__rect${(aLoad?.level ?? 'ok') === 'over' ? ' is-over' : ''}`}
                        x={a.x}
                        y={a.y}
                        width={a.w}
                        height={a.h}
                        rx={6}
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
                      <DoorMark x={door.x} y={door.y} into={doorInto(a)} w={7} room />
                      {/* furniture — always there, quieter at hospital level */}
                      <g className={`map-furniture${inDept ? ' is-close' : ''}`} aria-hidden="true">
                        {Array.from({ length: Math.max(a.capacity, 0) }, (_, i) => {
                          const p = slotCenter(a, grid, i)
                          return <Furniture key={i} kind={a.kind} x={p.x} y={p.y} s={fSize} />
                        })}
                      </g>
                      {isFocused && a.capacity > 0 ? (
                        <g className="map-slots" role="list" aria-label={`${a.name} — ${a.capacity} slots`}>
                          {Array.from({ length: a.capacity }, (_, i) => {
                            const p = slotCenter(a, grid, i)
                            return (
                              <text
                                key={i}
                                className="map-slot__name"
                                x={p.x}
                                y={p.y + fSize + 3.4}
                                textAnchor="middle"
                              >
                                {noun} {i + 1}
                              </text>
                            )
                          })}
                        </g>
                      ) : null}
                      <g
                        className="map-area__label map-cs"
                        style={{
                          transform: `translate(${a.x + 6}px, ${a.y + 4}px) scale(${1 / view.k})`,
                          opacity: inDept ? 1 : 0,
                        }}
                        aria-hidden="true"
                      >
                        <text y={10}>
                          {a.name}
                          <tspan className="map-area__count tnum">
                            {' '}
                            · {aCount}
                            {a.capacity > 0 ? `/${a.capacity}` : ''}
                          </tspan>
                        </text>
                      </g>
                    </g>
                  )
                })}

                {/* header LAST so names/status paint above room hairlines
                    (the old truncation bug class); narrow depts get a compact
                    status so text never runs under the load ring */}
                <g
                  className="map-zone__hdr map-cs"
                  style={{ transform: `translate(${d.x + 14}px, ${d.y + 8}px) scale(${1 / view.k})` }}
                >
                  <text className="map-zone__name" y={15}>
                    {d.name}
                  </text>
                  <text className="map-zone__status" y={30}>
                    {d.outside
                      ? `${count > 0 ? `${count} · ` : ''}${LEVEL_WORD[load?.level ?? 'ok']}`
                      : d.w < 200 && count > 0
                        ? `${count} · ${LEVEL_WORD[load?.level ?? 'ok']}`
                        : (load?.status ?? '')}
                    {d.outside ? <tspan className="map-zone__tag"> · outside</tspan> : null}
                  </text>
                </g>
                <g
                  className="map-zone__hdr map-cs"
                  style={{ transform: `translate(${d.x + d.w - 12}px, ${d.y + 8}px) scale(${1 / view.k})` }}
                >
                  <g transform="translate(-30 0)">
                    <LoadRing ratio={load?.ratio ?? 0} level={load?.level ?? 'ok'} count={count} size={30} />
                  </g>
                </g>
              </g>
            )
          })}

          {/* ambulances parked on the street strip above the bay */}
          {bayAmbulances.slice(0, 2).map((a, i) => (
            <g
              key={a.id}
              className="map-amb"
              transform={`translate(${126 + i * 50} ${1.5}) scale(0.62)`}
              aria-hidden="true"
            >
              <rect x={0} y={0} width={44} height={18} rx={4} />
              <rect x={30} y={2.5} width={11} height={8} rx={2} className="map-amb__cab" />
              <line x1={10} y1={9} x2={20} y2={9} className="map-amb__cross" />
              <line x1={15} y1={4} x2={15} y2={14} className="map-amb__cross" />
              <circle cx={10} cy={19.5} r={3} className="map-amb__wheel" />
              <circle cx={34} cy={19.5} r={3} className="map-amb__wheel" />
            </g>
          ))}

          {/* ---------------- the selected patient's way ---------------- */}
          {floorTrace.length > 0 && (
            <g className="map-trace" aria-hidden="true">
              {floorTrace.map((l, i) =>
                l.liftHop ? (
                  <g key={i} className="map-trace__lift" transform={`translate(${l.x2} ${l.y2})`}>
                    <circle r={7} />
                    <text y={3.4} textAnchor="middle">
                      ↕
                    </text>
                  </g>
                ) : (
                  <line
                    key={i}
                    className={`map-trace__leg${l.past ? ' is-past' : ' is-future'}`}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    vectorEffect="non-scaling-stroke"
                  />
                ),
              )}
            </g>
          )}

          {/* ---------------- patients ---------------- */}
          {orderedAgents.map((a) => {
            const dimmed = selectedId != null && a.id !== selectedId
            // discharged glyphs fade off the map over the grace window
            const opacity = a.exiting ? 0 : (a.kind === 'history' ? 0.85 : 1) * (dimmed ? 0.4 : 1)
            return (
              <g
                key={a.id}
                className={`map-agent${a.exiting ? ' is-exiting' : ''}${a.walking ? ' is-walking' : ''}`}
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

      {/* night wash — real clock, the 03:00 floor looks like 03:00 */}
      <div
        className="map-night"
        style={{ opacity: nightness * 0.7 }}
        aria-hidden="true"
      />

      {/* ---------------- floor rail ---------------- */}
      <nav className="map-floors" aria-label="Floors">
        {FLOORS.map((f) => {
          const st = world.status.perFloor[f.id]
          const active = f.id === floorId
          return (
            <button
              key={f.id}
              type="button"
              className={`map-floors__btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={`Floor ${f.short} — ${f.name}, ${st.count} ${plural(st.count)}`}
              onClick={(e) => {
                e.stopPropagation()
                setFloor(f.id)
              }}
            >
              <span className="map-floors__short">{f.short}</span>
              <span className="map-floors__meta">
                <span className="map-floors__name">{f.name}</span>
                <span className="map-floors__count tnum">
                  {st.count}
                  <span className={`map-floors__dot map-floors__dot--${st.worst}`} aria-hidden="true" />
                </span>
              </span>
            </button>
          )
        })}
        <p className="map-floors__note">F cycles floors</p>
      </nav>

      {/* ---------------- live / replay badge ---------------- */}
      <div className={`map-live${isLiveEdge ? ' is-live' : ''}`} role="status">
        {isLiveEdge ? (
          <>
            <span className="map-live__dot" aria-hidden="true" />
            LIVE · {HOSPITAL.hospital} · feed {hkLive.updateTime_raw}
          </>
        ) : (
          <>
            replaying {HOSPITAL.hospital}
            {liveRow?.t45p50_min != null && simMin >= 0 ? (
              <span className="tnum"> · real feed archive</span>
            ) : (
              <span className="tnum"> · real feed archive</span>
            )}
          </>
        )}
      </div>

      <div ref={tipRef} className={`map-tip${hoverAgent ? ' is-on' : ''}`} aria-hidden="true">
        {hoverAgent ? (
          <>
            <div className="map-tip__name">
              {hoverAgent.name}
              <span className="map-tip__meta tnum">
                {' '}
                · {hoverAgent.age} · {sexLetter(hoverAgent)} · cat {hoverAgent.acuity}
              </span>
            </div>
            <div className="map-tip__complaint">{hoverAgent.complaint}</div>
            <div className="map-tip__row tnum">
              {hoverAgent.walking
                ? `Walking to ${zoneNameFor(hoverAgent)}`
                : `${fmtDur(hoverAgent.waitMin)} in ${zoneNameFor(hoverAgent)}`}
            </div>
            {hoverAgent.areaId === 'waiting-hall' && (
              <div className="map-tip__srcnote">wait drawn from the live published p50/p95</div>
            )}
            <div className="map-tip__foot">
              <span className="tnum">{exitPhrase(hoverAgent)}</span>
              <Chip tone={RISK_TONE[hoverAgent.risk]}>{RISK_WORD[hoverAgent.risk]}</Chip>
            </div>
          </>
        ) : null}
      </div>

      {floorAgents.length === 0 ? (
        <div className="map-quiet tnum" role="status">
          {simMin > 0
            ? `Quiet floor · ${dischargedTodayCount(simMin)} discharged today`
            : 'Quiet floor'}
        </div>
      ) : null}
    </section>
  )
}
