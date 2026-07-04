/* The sim engine: pure functions from (simMinute, resolvedAt) → world state.
   The cast replays the seed built against the REAL HK feed: every wait was
   drawn from the hospital's published p50/p95 at that moment, so scrubbing
   the clock replays the hospital's actual day. Nothing here is random —
   scrubbing is perfectly reversible. */

import { adminKpis, HERO_ID, history7d, todayCast } from '../data/seed'
import type { JourneyEvent, OpsPatient, Optimization, Risk, Sex } from '../types'
import { BEAT_MIN, sarahAt, sarahBaseEvents, type SarahPresentation } from './beats'
import {
  DEPTS,
  areaById,
  deptById,
  floorOfDept,
  placeOccupants,
  pointOnRoute,
  roughSlot,
  routeBetween,
  zoneIdsFor,
  type FloorId,
  type RoutePoint,
} from './layout'
import { LIVE_MIN, SIM_END_MIN, fmtClock, fmtDur, parseT, simToDate } from './time'

// ---------------------------------------------------------------- tracks

interface TrackEvent {
  tMin: number
  type: string
  deptId: string
  areaId: string | null
  rawDept: string
  rawArea: string
}

interface Track {
  id: string
  name: string
  age: number
  sex: Sex
  pathway: string
  complaint: string
  acuity: number
  arrivalMode: string
  arrivalMin: number
  endMin: number
  admitted: boolean
  /** admitted but NOT part of the seeded ward cast — leaves the twin's scope */
  handoff: boolean
  inpatient: boolean
  kind: 'today' | 'history'
  events: TrackEvent[]
  patient?: OpsPatient
}

/** Admitted flow patients linger this long at the ward door before the twin
    stops following them (hand-off out of A&E scope). */
const HANDOFF_LINGER_MIN = 6

function toTrackEvents(events: JourneyEvent[], arrivalMode: string): TrackEvent[] {
  return events.map((e) => {
    // pathway templates route every arrival through the ambulance bay;
    // walk-ins and referrals enter through the walk-in entrance instead
    const viaEntrance = e.type === 'arrival' && arrivalMode !== 'ambulance'
    const { deptId, areaId } = viaEntrance
      ? { deptId: 'walk-in', areaId: 'reception' }
      : zoneIdsFor(e.dept, e.area)
    return { tMin: parseT(e.t), type: e.type, deptId, areaId, rawDept: e.dept, rawArea: e.area }
  })
}

function endRuleFor(
  events: TrackEvent[],
  isHero: boolean,
  inpatient: boolean,
): { endMin: number; admitted: boolean; handoff: boolean } {
  const last = events[events.length - 1]
  const admitted = last.type === 'admit'
  if (isHero) return { endMin: SIM_END_MIN + 1, admitted: false, handoff: false }
  if (admitted && inpatient) return { endMin: SIM_END_MIN + 1, admitted, handoff: false }
  if (admitted) return { endMin: last.tMin + HANDOFF_LINGER_MIN, admitted, handoff: true }
  return { endMin: last.tMin, admitted, handoff: false }
}

const todayTracks: Track[] = todayCast.map((p) => {
  const events = toTrackEvents(p.events, p.arrival_mode)
  const rule = endRuleFor(events, p.patient_id === HERO_ID, !!p.inpatient)
  return {
    id: p.patient_id,
    name: p.name,
    age: p.age,
    sex: p.sex,
    pathway: p.pathway,
    complaint: p.complaint,
    acuity: p.acuity,
    arrivalMode: p.arrival_mode,
    arrivalMin: parseT(p.arrival_time),
    endMin: rule.endMin,
    admitted: rule.admitted,
    handoff: rule.handoff,
    inpatient: !!p.inpatient,
    kind: 'today',
    events,
    patient: p,
  }
})

const historyTracks: Track[] = history7d.journeys.map((j) => {
  const events = toTrackEvents(j.events, j.arrival_mode)
  const rule = endRuleFor(events, false, false)
  return {
    id: j.patient_id,
    name: j.name,
    age: j.age,
    sex: j.sex,
    pathway: j.pathway,
    complaint: j.complaint,
    acuity: j.acuity,
    arrivalMode: j.arrival_mode,
    arrivalMin: parseT(j.arrival),
    endMin: rule.endMin,
    admitted: rule.admitted,
    handoff: rule.handoff,
    inpatient: false,
    kind: 'history',
    events,
  }
})

const trackById = new Map<string, Track>([
  ...todayTracks.map((t) => [t.id, t] as const),
  ...historyTracks.map((t) => [t.id, t] as const),
])

export const getTrack = (id: string) => trackById.get(id) ?? null

const quantiles = adminKpis.eta_model_quantiles_min

// ---------------------------------------------------------------- agents

export interface MapAgent {
  id: string
  name: string
  age: number
  sex: Sex
  acuity: number
  risk: Risk
  x: number
  y: number
  floorId: FloorId
  deptId: string
  areaId: string | null
  kind: 'today' | 'history'
  isHero: boolean
  complaint: string
  pathway: string
  arrivalMode: string
  /** dwell in the current station */
  waitMin: number
  elapsedMin: number
  /** sim-minute of predicted (today) or actual (history) exit */
  exitMin: number
  exitIsActual: boolean
  blocked: boolean
  /** discharged within the last few sim-minutes — fading off the map */
  exiting: boolean
  /** settled in a seeded ward bed (prediction closed) */
  onWard: boolean
  /** admitted and being handed off beyond the A&E twin's scope */
  handoff: boolean
  /** mid-walk between stations (corridor / lift) */
  walking: boolean
}

function eventIndexAt(events: TrackEvent[], tMin: number): number {
  let i = -1
  for (let k = 0; k < events.length; k++) {
    if (events[k].tMin <= tMin) i = k
    else break
  }
  return i
}

const RESTING_TYPES = new Set(['admit', 'boarding'])

function riskFor(track: Track, tMin: number, cur: TrackEvent): Risk {
  if (cur.deptId === 'discharge' || RESTING_TYPES.has(cur.type) || track.inpatient) return 'on_track'
  const q = quantiles[track.pathway]
  if (!q) return 'on_track'
  const elapsed = tMin - track.arrivalMin
  if (elapsed > q.p80) return 'high'
  if (elapsed > q.p50) return 'elevated'
  return 'on_track'
}

/** Prediction that never sits in the past: escalate up the quantile ladder as
    the stay outruns each estimate — exactly what a live model would do. */
function predictedExitMin(track: Track, tMin: number): number {
  const q = quantiles[track.pathway]
  if (!q) {
    // no pathway model (seeded inpatients) — the planned end is the estimate
    return track.endMin > track.arrivalMin && track.endMin <= SIM_END_MIN
      ? track.endMin
      : Math.max(track.arrivalMin + 120, tMin + 10)
  }
  const elapsed = tMin - track.arrivalMin
  let est = q.p50
  if (elapsed > q.p90) est = elapsed + 15
  else if (elapsed > q.p80) est = q.p90
  else if (elapsed > q.p50) est = q.p80
  return track.arrivalMin + est
}

// the hero's dwell anchor = her last real move in the seed (consult request)
const heroBaseEvents = sarahBaseEvents()
const heroLastMoveMin = heroBaseEvents.length
  ? parseT(heroBaseEvents[heroBaseEvents.length - 1].t)
  : 0

/** Discharged glyphs linger this long while they fade off the map. */
export const EXIT_GRACE_MIN = 8

/** Walking time between stations (visible in corridors and the lift). */
export const TRAVEL_MIN = 5

/** All agents in the building at sim-minute t, positioned (all floors). */
export function agentsAt(tMin: number, resolvedAtMin: number | null): MapAgent[] {
  const sarah = tMin >= 0 ? sarahAt(tMin, resolvedAtMin) : null
  interface RawAgent extends Omit<MapAgent, 'x' | 'y' | 'floorId' | 'walking'> {
    track: Track
    eventIdx: number
    sinceMin: number
  }
  const raw: RawAgent[] = []

  for (const track of [...todayTracks, ...historyTracks]) {
    if (track.arrivalMin > tMin) continue
    const isHero = track.id === HERO_ID

    let effectiveEnd = track.endMin
    if (isHero && sarah) effectiveEnd = sarah.departed ? sarah.exitMin : SIM_END_MIN + 1
    if (effectiveEnd + EXIT_GRACE_MIN <= tMin) continue
    const exiting = tMin >= effectiveEnd

    let deptId: string
    let areaId: string | null
    let since: number
    let risk: Risk
    let exitMin: number
    let onWard = false
    let eventIdx = -1
    const exitIsActual = track.kind === 'history'

    if (isHero && sarah) {
      const { deptId: d, areaId: a } = zoneIdsFor(sarah.position.dept, sarah.position.area)
      deptId = d
      areaId = a
      risk = sarah.risk
      exitMin = sarah.exitMin
      since = sarah.resolved && resolvedAtMin != null ? resolvedAtMin : heroLastMoveMin
    } else if (isHero) {
      // before the anchor the hero plays her seed intake straight
      const idx = eventIndexAt(track.events, tMin)
      if (idx < 0) continue
      const cur = track.events[idx]
      deptId = cur.deptId
      areaId = cur.areaId
      since = cur.tMin
      risk = riskFor(track, tMin, cur)
      exitMin = predictedExitMin(track, tMin)
      eventIdx = idx
    } else {
      const idx = eventIndexAt(track.events, tMin)
      if (idx < 0) continue
      const cur = track.events[idx]
      deptId = cur.deptId
      areaId = cur.areaId
      since = cur.tMin
      risk = riskFor(track, tMin, cur)
      exitMin = track.kind === 'history' ? track.endMin : predictedExitMin(track, tMin)
      eventIdx = idx
      // settled in a seeded ward bed = the A&E prediction is closed
      if (track.admitted && idx === track.events.length - 1) {
        risk = 'on_track'
        if (track.inpatient) {
          onWard = true
          exitMin = cur.tMin
        } else {
          exitMin = cur.tMin // hand-off moment
        }
      }
    }

    raw.push({
      id: track.id,
      name: track.name,
      age: track.age,
      sex: track.sex,
      acuity: track.acuity,
      risk,
      deptId,
      areaId,
      kind: track.kind,
      isHero,
      complaint: track.complaint,
      pathway: track.pathway,
      arrivalMode: track.arrivalMode,
      waitMin: Math.max(0, tMin - since),
      elapsedMin: Math.max(0, Math.min(tMin, effectiveEnd) - track.arrivalMin),
      exitMin,
      exitIsActual,
      blocked: risk === 'high' && !exiting,
      exiting,
      onWard,
      handoff: track.handoff && tMin >= track.events[track.events.length - 1].tMin,
      track,
      eventIdx,
      sinceMin: since,
    })
  }

  // position: group per zone, deterministic slot per occupant
  const byZone = new Map<string, RawAgent[]>()
  for (const a of raw) {
    const key = `${a.deptId}/${a.areaId ?? ''}`
    const list = byZone.get(key) ?? []
    list.push(a)
    byZone.set(key, list)
  }

  const out: MapAgent[] = []
  for (const [key, list] of byZone) {
    const [deptId, areaId] = key.split('/')
    const dept = deptById.get(deptId)
    if (!dept) continue
    const zone = areaId ? areaById.get(`${deptId}/${areaId}`)?.area : null
    const rect = zone ?? { x: dept.x + 8, y: dept.y + 44, w: dept.w - 16, h: dept.h - 52 }
    const cap = zone?.capacity ?? 4
    const placed = placeOccupants(rect, list.map((a) => a.id), cap)
    for (const a of list) {
      const p = placed.get(a.id)!
      const { track, eventIdx, sinceMin, ...agent } = a
      let x = p.x
      let y = p.y
      let floorId = floorOfDept(a.deptId)
      let walking = false

      // walking interpolation: for TRAVEL_MIN after a zone change the agent
      // is en route from the previous station (corridors + lift)
      const walkT = (tMin - sinceMin) / TRAVEL_MIN
      if (walkT >= 0 && walkT < 1 && eventIdx > 0) {
        const prev = track.events[eventIdx - 1]
        const curEv = track.events[eventIdx]
        const zoneChanged = prev.deptId !== curEv.deptId || prev.areaId !== curEv.areaId
        if (zoneChanged) {
          const prevZone = prev.areaId ? areaById.get(`${prev.deptId}/${prev.areaId}`)?.area : null
          const prevDept = deptById.get(prev.deptId)
          const prevRect =
            prevZone ??
            (prevDept
              ? { x: prevDept.x + 8, y: prevDept.y + 44, w: prevDept.w - 16, h: prevDept.h - 52 }
              : rect)
          const from = roughSlot(prevRect, a.id, prevZone?.capacity ?? 4)
          const route = routeBetween(
            { deptId: prev.deptId, areaId: prev.areaId, x: from.x, y: from.y },
            { deptId: curEv.deptId, areaId: curEv.areaId, x: p.x, y: p.y },
          )
          const pt = pointOnRoute(route, walkT)
          x = pt.x
          y = pt.y
          floorId = pt.floor
          walking = true
        }
      }

      out.push({ ...agent, x, y, floorId, walking })
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1))
}

// ---------------------------------------------------------------- journey trace

export interface TraceLeg {
  x1: number
  y1: number
  x2: number
  y2: number
  floor: FloorId
  past: boolean
  /** the leg enters/leaves the lift — draw the floor-change marker */
  liftHop: boolean
}

/** The selected patient's way through the building: where they came from
    (solid) and where they are headed (dashed) — drawn on the map. */
export function traceFor(id: string, tMin: number, resolvedAtMin: number | null): TraceLeg[] {
  const track = trackById.get(id)
  if (!track) return []
  let events = track.events
  if (id === HERO_ID && tMin >= 0) {
    const sarah = sarahAt(tMin, resolvedAtMin)
    events = toTrackEvents(
      [...sarahBaseEvents(), ...sarah.extraEvents].sort((a, b) => parseT(a.t) - parseT(b.t)),
      track.arrivalMode,
    )
  }
  const legs: TraceLeg[] = []
  let prevPt: { x: number; y: number; deptId: string; areaId: string | null } | null = null
  // beat annotations are state changes, not walks — they must not draw as moves
  const ANNOTATIONS = new Set(['lab_delay', 'dept_overload', 'consult_escalated'])
  for (const e of events) {
    if (ANNOTATIONS.has(e.type)) continue
    const zone = e.areaId ? areaById.get(`${e.deptId}/${e.areaId}`)?.area : null
    const dept = deptById.get(e.deptId)
    if (!dept) continue
    const rect = zone ?? { x: dept.x + 8, y: dept.y + 44, w: dept.w - 16, h: dept.h - 52 }
    const pt = roughSlot(rect, id, zone?.capacity ?? 4)
    if (prevPt && (prevPt.deptId !== e.deptId || prevPt.areaId !== e.areaId)) {
      const route = routeBetween(
        { deptId: prevPt.deptId, areaId: prevPt.areaId, x: prevPt.x, y: prevPt.y },
        { deptId: e.deptId, areaId: e.areaId, x: pt.x, y: pt.y },
      )
      const past = e.tMin <= tMin
      for (let i = 1; i < route.length; i++) {
        const a: RoutePoint = route[i - 1]
        const b: RoutePoint = route[i]
        legs.push({
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          floor: b.floor,
          past,
          liftHop: a.floor !== b.floor,
        })
      }
    }
    prevPt = { x: pt.x, y: pt.y, deptId: e.deptId, areaId: e.areaId }
  }
  return legs
}

// ---------------------------------------------------------------- zone loads

export type LoadLevel = 'ok' | 'busy' | 'over'

export interface ZoneLoad {
  count: number
  capacity: number
  ratio: number
  level: LoadLevel
  status: string
  longestWaitMin: number
}

export interface ZoneLoads {
  depts: Map<string, ZoneLoad>
  areas: Map<string, ZoneLoad> // key: 'dept/area'
}

function loadOf(count: number, capacity: number, longest: number, outside: boolean, extra?: string): ZoneLoad {
  const ratio = capacity > 0 ? count / capacity : 0
  const level: LoadLevel = outside ? 'ok' : ratio > 1 ? 'over' : ratio > 0.5 ? 'busy' : 'ok'
  const status = extra
    ? extra
    : count === 0
      ? 'Quiet'
      : level === 'over'
        ? `${count} inside · longest ${fmtDur(longest)}`
        : level === 'busy'
          ? `${count} inside · longest ${fmtDur(longest)}`
          : `${count} inside · flowing`
  return { count, capacity, ratio, level, status, longestWaitMin: longest }
}

export function zoneLoadsAt(agents: MapAgent[], tMin: number, resolvedAtMin: number | null): ZoneLoads {
  const areaCount = new Map<string, { count: number; longest: number }>()
  const deptCount = new Map<string, { count: number; longest: number }>()
  for (const a of agents) {
    if (a.exiting) continue // fading glyphs no longer occupy capacity
    const dk = a.deptId
    const d = deptCount.get(dk) ?? { count: 0, longest: 0 }
    d.count++
    d.longest = Math.max(d.longest, a.waitMin)
    deptCount.set(dk, d)
    if (a.areaId) {
      const ak = `${a.deptId}/${a.areaId}`
      const e = areaCount.get(ak) ?? { count: 0, longest: 0 }
      e.count++
      e.longest = Math.max(e.longest, a.waitMin)
      areaCount.set(ak, e)
    }
  }

  const escalated = resolvedAtMin != null && tMin >= resolvedAtMin && tMin < resolvedAtMin + 60

  const areas = new Map<string, ZoneLoad>()
  const depts = new Map<string, ZoneLoad>()
  const rank: Record<LoadLevel, number> = { ok: 0, busy: 1, over: 2 }
  for (const dept of DEPTS) {
    let cap = 0
    let worstArea: LoadLevel = 'ok'
    for (const area of dept.areas) {
      let c = area.capacity
      // the resolve action escalates consult coverage for 60 min
      if (escalated && dept.id === 'cardiology' && area.id === 'consult') c += 1
      cap += c
      const k = `${dept.id}/${area.id}`
      const got = areaCount.get(k) ?? { count: 0, longest: 0 }
      const load = loadOf(got.count, c, got.longest, !!dept.outside)
      areas.set(k, load)
      if (rank[load.level] > rank[worstArea]) worstArea = load.level
    }
    const got = deptCount.get(dept.id) ?? { count: 0, longest: 0 }
    const extra =
      dept.id === 'discharge' && tMin >= 0
        ? `${dischargedTodayCount(tMin)} discharged today`
        : undefined
    const load = loadOf(got.count, cap, got.longest, !!dept.outside, extra)
    // a department with an over-capacity room is itself in trouble — the dept
    // ring must not read calm while its consult queue burns
    if (rank[worstArea] > rank[load.level]) {
      load.level = worstArea
      if (!extra && load.count > 0) {
        load.status =
          worstArea === 'over'
            ? `${load.count} inside · a room over capacity`
            : `${load.count} inside · longest ${fmtDur(load.longestWaitMin)}`
      }
    }
    depts.set(dept.id, load)
  }
  return { depts, areas }
}

export function dischargedTodayCount(tMin: number): number {
  if (tMin < 0) return 0
  const midnight = -11 * 60 // 00:00 of the demo day, in sim-minutes
  let n = 0
  // journeys that completed earlier today live in the history file — the
  // counter must see them too, or 11:00 opens on a bogus zero
  for (const t of [...todayTracks, ...historyTracks]) {
    if (t.inpatient) continue
    if (t.endMin <= tMin && t.endMin >= midnight) n++
  }
  return n
}

// ---------------------------------------------------------------- global status

export interface FloorStatus {
  count: number
  worst: LoadLevel
}

export interface HospitalStatus {
  onFloor: number
  blocked: number
  atRisk: number
  waitingHall: number
  line: string
  perFloor: Record<FloorId, FloorStatus>
}

export function hospitalStatusAt(agents: MapAgent[], zones: ZoneLoads): HospitalStatus {
  const present = agents.filter((a) => !a.exiting)
  const blocked = present.filter((a) => a.risk === 'high').length
  const atRisk = present.filter((a) => a.risk === 'elevated').length
  const waitingHall = zones.areas.get('emergency/waiting-hall')?.count ?? 0
  const perFloor: Record<FloorId, FloorStatus> = {
    g: { count: 0, worst: 'ok' },
    f1: { count: 0, worst: 'ok' },
    f2: { count: 0, worst: 'ok' },
  }
  for (const a of present) perFloor[a.floorId].count++
  const rank: Record<LoadLevel, number> = { ok: 0, busy: 1, over: 2 }
  for (const dept of DEPTS) {
    const z = zones.depts.get(dept.id)
    if (!z) continue
    const f = perFloor[dept.floor]
    if (rank[z.level] > rank[f.worst]) f.worst = z.level
  }
  return {
    onFloor: present.length,
    blocked,
    atRisk,
    waitingHall,
    line: `${present.length} in building · ${waitingHall} in waiting hall · ${blocked} blocked`,
    perFloor,
  }
}

// ---------------------------------------------------------------- patient sheet VM

const EVENT_LABELS: Record<string, string> = {
  arrival: 'Arrived',
  triage: 'Triage assessment',
  waiting: 'In the queue — first consultation ahead',
  bed_assigned: 'Cubicle assigned',
  labs_ordered: 'Bloods drawn → lab',
  ecg: 'ECG taken',
  consult_requested: 'Cardiology consult requested',
  consult_done: 'Doctor consultation',
  observation: 'Observation',
  telemetry: 'On telemetry',
  decision: 'Disposition decision',
  discharge: 'Discharged',
  imaging: 'Imaging',
  treatment: 'Treatment',
  resus: 'Resus bay',
  pre_op: 'Pre-op preparation',
  surgery: 'In theatre',
  recovery: 'Recovery',
  endoscopy: 'Endoscopy',
  pharmacy: 'Pharmacy pick-up',
  boarding: 'Boarding — waiting for the ward bed',
  admit: 'Admitted — handed off to the ward',
  lab_delay: 'Lab delay — troponin re-run queued',
  dept_overload: 'Cardiology overload — consults queued past capacity',
  moved_to_observation: 'Moved to the obs ward (bed O-6)',
  consult_escalated: 'Consult coverage escalated',
}

export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type.replace(/_/g, ' ')

export interface FlowSegment {
  /** zone shown to the user, e.g. "Cubicles" */
  zoneLabel: string
  deptId: string
  areaId: string | null
  startMin: number
  endMin: number
  minutes: number
  eventType: string
  /** what happened at the start of this segment */
  label: string
  note?: string
  current: boolean
  predicted: boolean
  /** minutes the optimized path claims for this segment (the callout figure) */
  savedMin: number
  /** the compression actually drawable here: min(savedMin, minutes) — a ghost
      bar must never claim to save more time than the stop contained */
  appliedMin: number
  savedWhy?: string
}

export interface SheetVM {
  kind: 'today' | 'history'
  isHero: boolean
  id: string
  name: string
  age: number
  sex: Sex
  complaint: string
  pathway: string
  acuity: number
  arrivalMode: string
  arrivalMin: number
  onFloor: boolean
  notArrivedYet: boolean
  departed: boolean
  /** admitted and settled in a seeded ward bed */
  admittedNow: boolean
  /** admitted and handed off beyond the twin's scope */
  handoff: boolean
  risk: Risk
  elapsedMin: number
  exitMin: number
  exitIsActual: boolean
  exitClock: string
  /** e.g. "80% CI ±40 min" — or null for history actuals */
  ciLabel: string | null
  ciLowMin: number | null
  ciHighMin: number | null
  losPredictedMin: number
  losBenchmarkMin: number
  losActualMin: number | null
  /** the wait actually drawn from the hospital's published distribution */
  realWaitMin: number | null
  pendingSteps: string[]
  blockerLabel: string | null
  recommendation: {
    title: string
    explanation: string
    impactMin: number
    kind: 'action' | 'monitor' | 'done'
    canResolve: boolean
  } | null
  segments: FlowSegment[]
  /** the raw callout list — per-item, independent of segment anchoring */
  optimizations: Optimization[]
  totalSavedMin: number
  nearOptimal: boolean
  vitals: OpsPatient['vitals'] | null
  wearable: OpsPatient['signals']['wearable']
  provenance: Record<string, string> | null
  modelLine: string
  calibrationLine: string
  guard: { topicOk: boolean; safetyOk: boolean }
}

const RECOMMEND_TITLES: Record<string, string> = {
  move_to_observation: 'Move to the obs ward + escalate consult',
  prioritize_lab_sample: 'Flag troponin re-run as cardiac priority',
  monitor: 'Monitor — on pathway',
  done_monitor: 'Done — monitoring recovery',
  escalate_consult_or_move_to_observation: 'Escalate consult or move to the obs ward',
  chase_lab_result: 'Chase the pending lab result',
  prioritize_imaging_slot: 'Prioritize an imaging slot',
  confirm_discharge_or_bed: 'Confirm disposition to free the bed',
}

/** Segment types an optimization would compress, in priority order — later
    entries are fallbacks so the saving lands on a stop that can absorb it. */
function optimizationAnchors(issue: string): string[] {
  const t = issue.toLowerCase()
  if (t.includes('troponin') || t.includes('lab') || t.includes('blood'))
    return ['labs_ordered', 'bed_assigned', 'waiting']
  if (t.includes('consult') || t.includes('wearable') || t.includes('arrhythmia'))
    return ['consult_requested', 'waiting', 'labs_ordered']
  return ['observation', 'waiting', 'consult_requested', 'bed_assigned']
}

function buildSegments(events: TrackEvent[], upTo: number | null, notes?: Map<number, string>): FlowSegment[] {
  const segs: FlowSegment[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (upTo != null && e.tMin > upTo) break
    const nextT = i + 1 < events.length ? events[i + 1].tMin : null
    const rawEnd = nextT ?? e.tMin
    const end = upTo != null ? Math.min(rawEnd === e.tMin && nextT == null ? upTo : rawEnd, upTo) : rawEnd
    const isCurrent = upTo != null && (nextT == null || nextT > upTo)
    const zone = e.areaId ? areaById.get(`${e.deptId}/${e.areaId}`)?.area.name : deptById.get(e.deptId)?.name
    segs.push({
      zoneLabel: zone ?? e.rawArea,
      deptId: e.deptId,
      areaId: e.areaId,
      startMin: e.tMin,
      endMin: end,
      minutes: Math.max(0, end - e.tMin),
      eventType: e.type,
      label: eventLabel(e.type),
      note: notes?.get(i),
      current: isCurrent,
      predicted: false,
      savedMin: 0,
      appliedMin: 0,
    })
    if (isCurrent) break
  }
  // zero-minute stops (e.g. the instantaneous arrival hand-off) would render
  // as cryptic slivers on the journey bar — the header carries arrival anyway
  return segs.filter((s) => s.minutes > 0 || s.current)
}

export function sheetModelFor(id: string, tMin: number, resolvedAtMin: number | null): SheetVM | null {
  const track = trackById.get(id)
  if (!track) return null
  const p = track.patient
  const isHero = id === HERO_ID
  const sarah: SarahPresentation | null = isHero && tMin >= 0 ? sarahAt(tMin, resolvedAtMin) : null

  const q = quantiles[track.pathway]
  const cal = adminKpis.eta_calibration

  // --- journey segments ---
  let segments: FlowSegment[]
  if (isHero && sarah) {
    const base = toTrackEvents(
      [...sarahBaseEvents(), ...sarah.extraEvents],
      track.arrivalMode,
    ).sort((a, b) => a.tMin - b.tMin)
    const notes = new Map<number, string>()
    base.forEach((e, i) => {
      const extra = sarah.extraEvents.find((x) => parseT(x.t) === e.tMin && x.type === e.type)
      if (extra) notes.set(i, extra.note)
    })
    segments = buildSegments(base, tMin, notes)
    // predicted remainder: pending steps stretched to the predicted exit
    const lastEnd = segments.length ? segments[segments.length - 1].endMin : tMin
    const remaining = Math.max(0, sarah.exitMin - lastEnd)
    const per = remaining / Math.max(1, sarah.pendingSteps.length)
    sarah.pendingSteps.forEach((step, i) => {
      segments.push({
        zoneLabel: step,
        deptId: 'emergency',
        areaId: null,
        startMin: lastEnd + i * per,
        endMin: lastEnd + (i + 1) * per,
        minutes: per,
        eventType: 'predicted',
        label: step,
        current: false,
        predicted: true,
        savedMin: 0,
        appliedMin: 0,
      })
    })
  } else if (track.kind === 'history') {
    segments = buildSegments(track.events, null)
  } else {
    const upTo = Math.min(tMin, track.endMin)
    segments = buildSegments(track.events, upTo)
    // remainder of the seed track as predicted ghost
    for (let i = 0; i < track.events.length; i++) {
      const e = track.events[i]
      if (e.tMin <= upTo) continue
      const nextT = i + 1 < track.events.length ? track.events[i + 1].tMin : e.tMin
      if (nextT - e.tMin <= 0) continue
      const zone = e.areaId ? areaById.get(`${e.deptId}/${e.areaId}`)?.area.name : deptById.get(e.deptId)?.name
      segments.push({
        zoneLabel: zone ?? e.rawArea,
        deptId: e.deptId,
        areaId: e.areaId,
        startMin: e.tMin,
        endMin: nextT,
        minutes: nextT - e.tMin,
        eventType: e.type,
        label: eventLabel(e.type),
        current: false,
        predicted: true,
        savedMin: 0,
        appliedMin: 0,
      })
    }
  }

  // --- optimization overlay ---
  const optimization = p?.optimization ?? []
  let totalSavedMin = 0
  for (const opt of optimization) {
    let match: FlowSegment | undefined
    for (const type of optimizationAnchors(opt.issue)) {
      match =
        segments.find((s) => !s.predicted && s.eventType === type) ??
        segments.find((s) => s.eventType === type)
      if (match) break
    }
    if (match) {
      match.savedMin += opt.saving_min
      match.savedWhy = match.savedWhy ? `${match.savedWhy} · ${opt.issue}` : opt.issue
    }
    totalSavedMin += opt.saving_min
  }
  for (const s of segments) s.appliedMin = Math.min(s.savedMin, s.minutes)

  // --- prediction numbers ---
  const heroEnd = isHero && sarah ? (sarah.departed ? sarah.exitMin : SIM_END_MIN + 1) : null
  const effectiveEnd = heroEnd ?? track.endMin
  const onFloor = track.arrivalMin <= tMin && tMin < effectiveEnd
  const notArrivedYet = track.arrivalMin > tMin
  const idx = eventIndexAt(track.events, tMin)
  const cur = idx >= 0 ? track.events[idx] : null

  let risk: Risk
  let exitMin: number
  let ciLowMin: number | null
  let ciHighMin: number | null
  let pendingSteps: string[]
  let blockerLabel: string | null
  let rec: SheetVM['recommendation']

  if (isHero && sarah) {
    risk = sarah.risk
    exitMin = sarah.exitMin
    ciLowMin = sarah.departed ? null : sarah.ciLowMin
    ciHighMin = sarah.departed ? null : sarah.ciHighMin
    pendingSteps = sarah.pendingSteps
    blockerLabel = sarah.blockerLabel
    rec = sarah.recommendation
      ? {
          title: RECOMMEND_TITLES[sarah.recommendation.action] ?? sarah.recommendation.action,
          explanation: sarah.recommendation.explanation,
          impactMin: sarah.recommendation.impact_min,
          kind:
            sarah.recommendation.action === 'monitor'
              ? 'monitor'
              : sarah.recommendation.action === 'done_monitor'
                ? 'done'
                : 'action',
          canResolve: sarah.canResolve,
        }
      : null
  } else if (track.kind === 'history') {
    // while the scrubbed moment has them on the floor, show the same live risk
    // the map computes; once the journey is over, the record rests at on-track
    risk = onFloor && cur ? riskFor(track, tMin, cur) : 'on_track'
    exitMin = track.endMin
    ciLowMin = null
    ciHighMin = null
    pendingSteps = []
    blockerLabel = null
    rec = null
  } else {
    risk = cur ? riskFor(track, Math.min(tMin, track.endMin - 1), cur) : 'on_track'
    exitMin = predictedExitMin(track, Math.min(tMin, track.endMin))
    ciLowMin = q ? track.arrivalMin + q.p10 : null
    ciHighMin = q ? track.arrivalMin + q.p90 : null
    const remainingTypes = track.events.filter((e) => e.tMin > tMin).map((e) => eventLabel(e.type))
    pendingSteps = [...new Set(remainingTypes)].slice(0, 4)
    blockerLabel = onFloor && p ? blockerText(p.blocker) : null
    rec =
      onFloor && p && p.recommendation
        ? {
            title: RECOMMEND_TITLES[p.recommendation.action] ?? p.recommendation.action.replace(/_/g, ' '),
            explanation: p.recommendation.explanation,
            impactMin: p.recommendation.impact_min,
            kind: p.recommendation.action === 'monitor' ? 'monitor' : 'action',
            canResolve: false,
          }
        : null
    // the hero before the 11:00 anchor is mid-intake — her seed snapshot's
    // blocker/recommendation describe the scripted NOW, not this past moment
    if (isHero) {
      blockerLabel = null
      rec = null
    }
  }

  // settled in a seeded ward bed / handed off — the A&E prediction is closed
  const lastEvent = track.events[track.events.length - 1]
  const admittedNow =
    track.kind === 'today' && track.admitted && track.inpatient && tMin >= lastEvent.tMin
  const handoffNow = track.handoff && tMin >= lastEvent.tMin
  if (admittedNow || handoffNow) {
    exitMin = lastEvent.tMin
    ciLowMin = null
    ciHighMin = null
    pendingSteps = []
    blockerLabel = admittedNow
      ? 'Admitted — ward care continues outside the A&E scope'
      : `Handed off to ${lastEvent.rawDept} — beyond the A&E twin's scope`
  }

  const ciLabel =
    ciLowMin != null && ciHighMin != null
      ? `80% CI ±${Math.round((ciHighMin - ciLowMin) / 2 / 5) * 5} min`
      : null

  return {
    kind: track.kind,
    isHero,
    id: track.id,
    name: track.name,
    age: track.age,
    sex: track.sex,
    complaint: track.complaint,
    pathway: track.pathway,
    acuity: track.acuity,
    arrivalMode: track.arrivalMode,
    arrivalMin: track.arrivalMin,
    onFloor,
    notArrivedYet,
    departed: tMin >= effectiveEnd,
    admittedNow,
    handoff: handoffNow,
    risk,
    elapsedMin: Math.max(0, Math.min(tMin, effectiveEnd) - track.arrivalMin),
    exitMin,
    exitIsActual: track.kind === 'history',
    exitClock: fmtClock(exitMin),
    ciLabel,
    ciLowMin,
    ciHighMin,
    // the hero's LOS follows her beat-driven exit — a frozen p50 would
    // contradict the sliding prediction chip right above it
    losPredictedMin:
      isHero && sarah
        ? Math.round(sarah.exitMin - track.arrivalMin)
        : (q?.p50 ?? track.endMin - track.arrivalMin),
    losBenchmarkMin: p?.benchmark_los_min ?? q?.p50 ?? 0,
    losActualMin: track.kind === 'history' ? track.endMin - track.arrivalMin : null,
    realWaitMin: p?.real_wait_draw_min ?? null,
    pendingSteps,
    blockerLabel,
    recommendation: rec,
    segments,
    optimizations: optimization,
    totalSavedMin,
    nearOptimal: !!p?.near_optimal_track,
    vitals: p?.vitals ?? null,
    wearable: p?.signals.wearable ?? null,
    provenance: p?.provenance ?? null,
    modelLine: q
      ? `FlowTwin ETA — LOS quantiles from ${q.n} real ED stays (MIMIC-IV-ED)`
      : 'FlowTwin ETA — planned ward discharge',
    calibrationLine: `${cal.interval} · in-sample on ${cal.n} MIMIC-IV-ED stays — full-dataset calibration planned`,
    guard: { topicOk: p?.guard.topic_ok ?? true, safetyOk: p?.guard.safety_ok ?? true },
  }
}

function blockerText(blocker: string): string | null {
  const map: Record<string, string> = {
    cardiology_queue: 'Waiting on the cardiology consult queue',
    labs_pending: 'Awaiting lab result before disposition',
    imaging_queue: 'Waiting on an imaging slot',
    awaiting_disposition: 'Medically progressing — awaiting disposition',
    awaiting_consult: 'In the waiting hall — consultation ahead',
    awaiting_triage: 'Waiting for triage',
    none: 'No blocker',
  }
  return map[blocker] ?? blocker.replace(/_/g, ' ')
}

// ---------------------------------------------------------------- admin VM

export interface AdminVM {
  censusNow: number
  bedOccupancyPct: number
  dischargedToday: number
  avgWaitNowMin: number
  waitingHall: number
  arrivalForecast: typeof adminKpis.arrival_forecast_next_3h
  bottleneck: typeof adminKpis.recurring_bottleneck
  calibration: typeof adminKpis.eta_calibration
  benchmark: typeof adminKpis.hf_admissions_benchmark
  assumptions: typeof adminKpis.assumptions
  hk: typeof adminKpis.hk
  optimizePlan: typeof adminKpis.optimize_plan
  /** the live reallocation play, when the consult queue is over capacity */
  play: {
    active: boolean
    queued: number
    blockedBeds: number
    overstayMin: number
    costHkd: number
    costEur: number
    resolvedNote: string | null
  }
}

const BED_AREAS = [
  'emergency/cubicles',
  'emergency/resus',
  'emw/obs-beds',
  'icu/beds',
  'cardiology/telemetry',
  'surgery/recovery',
  'medical-ward/beds',
  'surgical-ward/beds',
  'geriatric-ward/beds',
  'step-down/beds',
]

export function adminModelAt(
  agents: MapAgent[],
  zones: ZoneLoads,
  tMin: number,
  resolvedAtMin: number | null,
): AdminVM {
  let beds = 0
  let bedCap = 0
  for (const key of BED_AREAS) {
    const z = zones.areas.get(key)
    if (z) {
      beds += Math.min(z.count, z.capacity)
      bedCap += z.capacity
    }
  }
  const consult = zones.areas.get('cardiology/consult')
  const queued = consult?.count ?? 0
  const over = (consult?.level ?? 'ok') === 'over'
  // each queued chest-pain patient holds a cubicle ~50 extra min
  const overstayMin = queued * 50
  const costHkd = Math.round((overstayMin / 60) * adminKpis.assumptions.bed_hour_cost_hkd)
  const resolved = resolvedAtMin != null && tMin >= resolvedAtMin

  const present = agents.filter((a) => !a.exiting)
  const waits = present.filter((a) => a.kind === 'today' || tMin < 0)
  const avgWait = waits.length ? waits.reduce((s, a) => s + a.waitMin, 0) / waits.length : 0

  // the forecast follows the scrubbed clock: next 3 hour-of-day buckets from
  // the arrival-rate table (falls back to the static anchor snapshot)
  const rates = adminKpis.arrival_rates_by_hour
  const hourNow = simToDate(tMin).getHours()
  const forecast = rates?.length === 24
    ? [1, 2, 3].map((dh) => rates[(hourNow + dh) % 24])
    : adminKpis.arrival_forecast_next_3h

  return {
    censusNow: present.length,
    bedOccupancyPct: bedCap ? Math.round((beds / bedCap) * 100) : 0,
    dischargedToday: dischargedTodayCount(tMin),
    avgWaitNowMin: Math.round(avgWait),
    waitingHall: zones.areas.get('emergency/waiting-hall')?.count ?? 0,
    arrivalForecast: forecast,
    bottleneck: adminKpis.recurring_bottleneck,
    calibration: adminKpis.eta_calibration,
    benchmark: adminKpis.hf_admissions_benchmark,
    assumptions: adminKpis.assumptions,
    hk: adminKpis.hk,
    optimizePlan: adminKpis.optimize_plan,
    play: {
      // the live play is a demo-day affordance — scrubbing a historic
      // afternoon must not offer to resolve a queue that no longer exists
      active: tMin >= 0 && over && !resolved,
      queued,
      blockedBeds: queued,
      overstayMin,
      costHkd,
      costEur: Math.round(costHkd / adminKpis.assumptions.hkd_per_eur),
      resolvedNote: resolved
        ? 'Play executed: consult coverage escalated 60 min — queue draining.'
        : null,
    },
  }
}

// ---------------------------------------------------------------- day review

export interface DayReview {
  hospital: string
  cluster: string
  district: string
  /** counts up to the scrubbed moment (today) */
  arrived: number
  discharged: number
  admitted: number
  inBuilding: number
  /** the real feed's climb on the demo day */
  realClimb: { fromMin: number | null; fromClock: string; toMin: number | null; toClock: string }
  /** Sarah's case strip */
  sarah: {
    resolved: boolean
    baselineExit: string
    slippedExit: string
    finalExit: string
    recoveredMin: number
  }
  optimizePlan: typeof adminKpis.optimize_plan
  assumptions: typeof adminKpis.assumptions
}

export function dayReviewAt(tMin: number, resolvedAtMin: number | null): DayReview {
  const midnight = -11 * 60
  let arrived = 0
  let admitted = 0
  for (const t of todayTracks) {
    if (t.arrivalMin >= midnight && t.arrivalMin <= tMin) {
      arrived++
      if (t.admitted && t.events[t.events.length - 1].tMin <= tMin) admitted++
    }
  }
  const resolved = resolvedAtMin != null && tMin >= resolvedAtMin
  const world = worldAt(tMin, resolvedAtMin)
  return {
    hospital: adminKpis.hk.hospital,
    cluster: adminKpis.hk.cluster,
    district: adminKpis.hk.district,
    arrived,
    discharged: dischargedTodayCount(tMin),
    admitted,
    inBuilding: world.status.onFloor,
    realClimb: {
      fromMin: adminKpis.recurring_bottleneck.avg_los_other_min,
      fromClock: adminKpis.recurring_bottleneck.window.split('→')[0]?.trim() ?? '08:00',
      toMin: adminKpis.recurring_bottleneck.avg_los_in_window_min,
      toClock: adminKpis.recurring_bottleneck.window.split('→')[1]?.trim() ?? '17:00',
    },
    sarah: {
      resolved,
      baselineExit: '14:20',
      slippedExit: '16:50',
      finalExit: resolved ? '16:05' : '16:50',
      recoveredMin: resolved ? 45 : 0,
    },
    optimizePlan: adminKpis.optimize_plan,
    assumptions: adminKpis.assumptions,
  }
}

// ---------------------------------------------------------------- world (memoized)

export interface World {
  agents: MapAgent[]
  zones: ZoneLoads
  status: HospitalStatus
}

let lastKey = ''
let lastWorld: World | null = null

/** One computation per (t, resolvedAt) pair — every component reads the same world. */
export function worldAt(tMin: number, resolvedAtMin: number | null): World {
  const key = `${Math.round(tMin * 10)}:${resolvedAtMin ?? 'x'}`
  if (lastWorld && key === lastKey) return lastWorld
  const agents = agentsAt(tMin, resolvedAtMin)
  const zones = zoneLoadsAt(agents, tMin, resolvedAtMin)
  const status = hospitalStatusAt(agents, zones)
  lastKey = key
  lastWorld = { agents, zones, status }
  return lastWorld
}

export { BEAT_MIN, LIVE_MIN }
