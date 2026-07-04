/* The hospital floor-plates — three levels, one global coordinate space
   (1000×640) per floor. G is the A&E (calibrated to the real HK feed);
   1 and 2 are the representative acute/ward levels the flow feeds into.
   Every floor shares the lift core footprint, and every department keeps a
   44px header band clear of its rooms so zone labels never collide with
   area rects (the old truncation bug class). Zooming is a viewport
   transform into a rect, never a re-layout. */

export const MAP_W = 1000
export const MAP_H = 640

export type FloorId = 'g' | 'f1' | 'f2'

export interface FloorDef {
  id: FloorId
  short: string
  name: string
  note: string
}

/** Ordered top-down for the floor rail (upper storeys first). */
export const FLOORS: FloorDef[] = [
  { id: 'f2', short: '2', name: 'Wards', note: 'representative slice' },
  { id: 'f1', short: '1', name: 'Acute & Procedures', note: 'representative slice' },
  { id: 'g', short: 'G', name: 'A&E — Emergency', note: 'calibrated to the live feed' },
]

export const floorById = new Map(FLOORS.map((f) => [f.id, f]))

/** What a slot physically is — drives the furniture glyph + the slot noun. */
export type SlotKind =
  | 'chair'
  | 'bed'
  | 'trolley'
  | 'desk'
  | 'scanner'
  | 'plate'
  | 'bench'
  | 'table'
  | 'hatch'
  | 'door'

export interface AreaDef {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  capacity: number
  kind: SlotKind
  /** slot noun ("Bed", "Chair", …) — derived from kind unless overridden */
  noun?: string
}

export interface DeptDef {
  id: string
  name: string
  floor: FloorId
  x: number
  y: number
  w: number
  h: number
  outside?: boolean
  areas: AreaDef[]
}

const area = (
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
  capacity: number,
  kind: SlotKind,
  noun?: string,
): AreaDef => ({ id, name, x, y, w, h, capacity, kind, noun })

/* Corridor spine + lift core — identical footprint on all floors so
   cross-floor journeys read as one building. The lift core sits at the
   east end of the plate, below the corridor, in a region no floor's
   rooms may claim (the old core at x468 slid under f2's Day Room). */
export const CORRIDOR = { y1: 292, y2: 336 }
export const LIFT = { x: 906, y: 352, w: 70, h: 88 }
export const CORRIDOR_MID = (CORRIDOR.y1 + CORRIDOR.y2) / 2

export const DEPTS: DeptDef[] = [
  /* ---------------------------------------------------------- floor G — A&E */
  {
    id: 'ambulance-bay',
    name: 'Ambulance Bay',
    floor: 'g',
    x: 24,
    y: 18,
    w: 210,
    h: 68,
    outside: true,
    areas: [area('entrance', 'Entrance', 32, 58, 194, 24, 4, 'door', 'Stand')],
  },
  {
    id: 'walk-in',
    name: 'Walk-in Entrance',
    floor: 'g',
    x: 250,
    y: 18,
    w: 190,
    h: 68,
    outside: true,
    areas: [area('reception', 'Reception', 258, 58, 174, 24, 4, 'desk', 'Desk')],
  },
  {
    id: 'emergency',
    name: 'A&E',
    floor: 'g',
    x: 24,
    y: 94,
    w: 592,
    h: 198,
    areas: [
      area('waiting-hall', 'Waiting Hall', 36, 138, 210, 142, 48, 'chair', 'Seat'),
      area('triage', 'Triage', 258, 138, 82, 64, 3, 'desk', 'Desk'),
      area('resus', 'Resus', 258, 214, 82, 66, 4, 'trolley', 'Bay'),
      area('consult-rooms', 'Consult Rooms', 352, 138, 116, 142, 10, 'desk', 'Room'),
      area('cubicles', 'Cubicles', 480, 138, 124, 142, 16, 'trolley', 'Cubicle'),
    ],
  },
  {
    id: 'imaging',
    name: 'Imaging',
    floor: 'g',
    x: 632,
    y: 94,
    w: 192,
    h: 198,
    areas: [
      area('x-ray', 'X-ray', 644, 138, 82, 64, 2, 'plate'),
      area('ct', 'CT', 738, 138, 74, 64, 2, 'scanner'),
      area('mri', 'MRI', 644, 214, 82, 66, 1, 'scanner'),
      area('ultrasound', 'Ultrasound', 738, 214, 74, 66, 2, 'plate', 'Couch'),
    ],
  },
  {
    id: 'labs',
    name: 'Labs',
    floor: 'g',
    x: 840,
    y: 94,
    w: 136,
    h: 198,
    areas: [
      area('chemistry', 'Chemistry', 850, 138, 116, 44, 4, 'bench'),
      area('microbiology', 'Microbiology', 850, 190, 116, 42, 2, 'bench'),
      area('toxicology', 'Toxicology', 850, 240, 116, 40, 2, 'bench'),
    ],
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    floor: 'g',
    x: 24,
    y: 356,
    w: 190,
    h: 108,
    areas: [area('dispensary', 'Dispensary', 36, 400, 166, 52, 3, 'hatch')],
  },
  {
    id: 'discharge',
    name: 'Discharge',
    floor: 'g',
    x: 230,
    y: 356,
    w: 190,
    h: 108,
    areas: [area('exit', 'Exit', 242, 400, 166, 52, 6, 'door', 'Gate')],
  },

  /* ------------------------------------------------- floor 1 — acute support */
  {
    id: 'emw',
    name: 'EMW',
    floor: 'f1',
    x: 24,
    y: 94,
    w: 250,
    h: 198,
    areas: [area('obs-beds', 'Obs Beds', 36, 138, 226, 142, 12, 'bed')],
  },
  {
    id: 'cardiology',
    name: 'Cardiology',
    floor: 'f1',
    x: 290,
    y: 94,
    w: 300,
    h: 198,
    areas: [
      area('consult', 'Consult', 302, 138, 96, 142, 3, 'desk', 'Room'),
      area('cath-lab', 'Cath Lab', 410, 138, 78, 64, 1, 'table'),
      area('telemetry', 'Telemetry', 410, 214, 168, 66, 6, 'bed'),
      area('cath-prep', 'Prep', 500, 138, 78, 64, 2, 'trolley'),
    ],
  },
  {
    id: 'icu',
    name: 'ICU',
    floor: 'f1',
    x: 606,
    y: 94,
    w: 174,
    h: 198,
    areas: [area('beds', 'Beds', 618, 138, 150, 142, 6, 'bed')],
  },
  {
    id: 'surgery',
    name: 'Surgery',
    floor: 'f1',
    x: 796,
    y: 94,
    w: 180,
    h: 198,
    areas: [
      area('pre-op', 'Pre-Op', 808, 138, 72, 64, 3, 'trolley'),
      area('or-1', 'OR 1', 892, 138, 72, 64, 1, 'table'),
      area('or-2', 'OR 2', 892, 214, 72, 66, 1, 'table'),
      area('recovery', 'Recovery', 808, 214, 72, 66, 5, 'bed'),
    ],
  },
  {
    id: 'endoscopy',
    name: 'Endoscopy',
    floor: 'f1',
    x: 24,
    y: 356,
    w: 190,
    h: 108,
    areas: [area('suite', 'Suite', 36, 400, 166, 52, 2, 'table')],
  },
  {
    id: 'physio',
    name: 'Physio',
    floor: 'f1',
    x: 230,
    y: 356,
    w: 190,
    h: 108,
    areas: [area('gym', 'Gym', 242, 400, 166, 52, 0, 'bench', 'Mat')],
  },

  /* --------------------------------------------------------- floor 2 — wards */
  {
    id: 'medical-ward',
    name: 'Medical Ward',
    floor: 'f2',
    x: 24,
    y: 94,
    w: 300,
    h: 198,
    areas: [area('beds', 'Beds', 36, 138, 276, 142, 12, 'bed')],
  },
  {
    id: 'surgical-ward',
    name: 'Surgical Ward',
    floor: 'f2',
    x: 340,
    y: 94,
    w: 280,
    h: 198,
    areas: [area('beds', 'Beds', 352, 138, 256, 142, 10, 'bed')],
  },
  {
    id: 'geriatric-ward',
    name: 'Geriatric Ward',
    floor: 'f2',
    x: 636,
    y: 94,
    w: 340,
    h: 198,
    areas: [area('beds', 'Beds', 648, 138, 316, 142, 8, 'bed')],
  },
  {
    id: 'step-down',
    name: 'Step-Down',
    floor: 'f2',
    x: 24,
    y: 356,
    w: 300,
    h: 108,
    areas: [area('beds', 'Beds', 36, 400, 276, 52, 6, 'bed')],
  },
  {
    id: 'day-room',
    name: 'Day Room',
    floor: 'f2',
    x: 340,
    y: 356,
    w: 190,
    h: 108,
    areas: [area('lounge', 'Lounge', 352, 400, 166, 52, 0, 'chair')],
  },
]

/** Free lower-right region (all floors, clear of every room and the lift
    core) — the drawn title block / legend annotation lives here. */
export const NOTES_RECT = { x: 546, y: 352, w: 344, h: 168 }

export const deptById = new Map(DEPTS.map((d) => [d.id, d]))
export const areaById = new Map(
  DEPTS.flatMap((d) => d.areas.map((a) => [`${d.id}/${a.id}`, { dept: d, area: a }] as const)),
)
export const deptsOnFloor = (f: FloorId) => DEPTS.filter((d) => d.floor === f)
export const floorOfDept = (deptId: string): FloorId => deptById.get(deptId)?.floor ?? 'g'

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-')

/** Map a seed event's dept/area names onto layout ids. */
export function zoneIdsFor(dept: string, areaName: string): { deptId: string; areaId: string | null } {
  const deptId = slug(dept) === 'a&e' ? 'emergency' : slug(dept)
  const mapped = deptId === 'emergency' || deptById.has(deptId) ? deptId : 'emergency'
  const areaId = slug(areaName)
  return {
    deptId: mapped,
    areaId: areaById.has(`${mapped}/${areaId}`) ? areaId : null,
  }
}

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface SlotGrid {
  pad: number
  w: number
  h: number
  cols: number
  rows: number
}

/** One shared grid math for slots, furniture and occupancy. */
export function slotGrid(rect: { w: number; h: number }, n: number): SlotGrid {
  const pad = 8
  const w = Math.max(rect.w - pad * 2, 8)
  const h = Math.max(rect.h - pad * 2, 8)
  const cols = Math.max(1, Math.round(Math.sqrt((Math.max(n, 1) * w) / h)) || 1)
  const rows = Math.ceil(Math.max(n, 1) / cols)
  return { pad, w, h, cols, rows }
}

export function slotCenter(
  rect: { x: number; y: number; w: number; h: number },
  grid: SlotGrid,
  s: number,
): { x: number; y: number } {
  const c = s % grid.cols
  const r = Math.floor(s / grid.cols)
  return {
    x: rect.x + grid.pad + ((c + 0.5) * grid.w) / grid.cols,
    y: rect.y + grid.pad + ((r + 0.5) * grid.h) / grid.rows,
  }
}

/**
 * Deterministic spot inside an area (or a dept's inner rect when the event has
 * no mapped area). Grid sized to max(capacity, occupants); each occupant takes
 * hash(id) % slots with linear probing, so positions are stable and collision-free.
 */
export function placeOccupants(
  rect: { x: number; y: number; w: number; h: number },
  occupantIds: string[],
  minSlots: number,
): Map<string, { x: number; y: number }> {
  const n = Math.max(minSlots, occupantIds.length, 1)
  const grid = slotGrid(rect, n)
  const slots = grid.cols * grid.rows
  const taken = new Array<boolean>(slots).fill(false)
  const out = new Map<string, { x: number; y: number }>()
  const sorted = [...occupantIds].sort()
  for (const id of sorted) {
    let s = hash(id) % slots
    while (taken[s]) s = (s + 1) % slots
    taken[s] = true
    out.set(id, slotCenter(rect, grid, s))
  }
  return out
}

/** A deterministic slot for an id ignoring other occupants — good enough for
    the ORIGIN of a walk (the walker has already left that room). */
export function roughSlot(
  rect: { x: number; y: number; w: number; h: number },
  id: string,
  minSlots: number,
): { x: number; y: number } {
  const grid = slotGrid(rect, Math.max(minSlots, 1))
  return slotCenter(rect, grid, hash(id) % (grid.cols * grid.rows))
}

// ---------------------------------------------------------------- routing

export interface RoutePoint {
  x: number
  y: number
  floor: FloorId
}

/** The door of a zone: midpoint of the edge facing the corridor spine. */
export function doorOf(rect: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const cx = rect.x + rect.w / 2
  const above = rect.y + rect.h <= CORRIDOR.y1 + 1
  return { x: cx, y: above ? rect.y + rect.h : rect.y }
}

const LIFT_DOOR = { x: LIFT.x + LIFT.w / 2, y: CORRIDOR_MID }

function zoneRect(deptId: string, areaId: string | null): { x: number; y: number; w: number; h: number } {
  if (areaId) {
    const hit = areaById.get(`${deptId}/${areaId}`)
    if (hit) return hit.area
  }
  const d = deptById.get(deptId)
  if (d) return { x: d.x + 8, y: d.y + 44, w: d.w - 16, h: d.h - 52 }
  return { x: MAP_W / 2, y: MAP_H / 2, w: 10, h: 10 }
}

/**
 * Corridor-aware walking route between two zone points. Same floor: door →
 * corridor → door. Cross-floor: via the lift core (the floor switch happens
 * inside the lift). Returns a polyline with per-point floor tags.
 */
export function routeBetween(
  from: { deptId: string; areaId: string | null; x: number; y: number },
  to: { deptId: string; areaId: string | null; x: number; y: number },
): RoutePoint[] {
  const fFrom = floorOfDept(from.deptId)
  const fTo = floorOfDept(to.deptId)
  const start: RoutePoint = { x: from.x, y: from.y, floor: fFrom }
  const end: RoutePoint = { x: to.x, y: to.y, floor: fTo }

  // same room (or same dept free-space) — walk straight
  if (fFrom === fTo && from.deptId === to.deptId && from.areaId === to.areaId) {
    return [start, end]
  }

  const doorA = doorOf(zoneRect(from.deptId, from.areaId))
  const doorB = doorOf(zoneRect(to.deptId, to.areaId))

  if (fFrom === fTo) {
    return [
      start,
      { ...doorA, floor: fFrom },
      { x: doorA.x, y: CORRIDOR_MID, floor: fFrom },
      { x: doorB.x, y: CORRIDOR_MID, floor: fFrom },
      { ...doorB, floor: fFrom },
      end,
    ]
  }

  return [
    start,
    { ...doorA, floor: fFrom },
    { x: doorA.x, y: CORRIDOR_MID, floor: fFrom },
    { x: LIFT_DOOR.x, y: CORRIDOR_MID, floor: fFrom },
    { x: LIFT_DOOR.x, y: CORRIDOR_MID, floor: fTo },
    { x: doorB.x, y: CORRIDOR_MID, floor: fTo },
    { ...doorB, floor: fTo },
    end,
  ]
}

/** Point at fraction t (0..1) along a route, constant speed by segment length. */
export function pointOnRoute(route: RoutePoint[], t: number): RoutePoint {
  if (route.length === 0) return { x: MAP_W / 2, y: MAP_H / 2, floor: 'g' }
  if (route.length === 1 || t <= 0) return route[0]
  if (t >= 1) return route[route.length - 1]
  const lens: number[] = []
  let total = 0
  for (let i = 1; i < route.length; i++) {
    // the lift hop is instantaneous in x/y — give it a nominal length so the
    // agent spends a beat "inside" the lift
    const dx = route[i].x - route[i - 1].x
    const dy = route[i].y - route[i - 1].y
    const l = route[i].floor !== route[i - 1].floor ? 60 : Math.hypot(dx, dy)
    lens.push(l)
    total += l
  }
  let dist = t * total
  for (let i = 1; i < route.length; i++) {
    const l = lens[i - 1]
    if (dist <= l) {
      const f = l === 0 ? 0 : dist / l
      const a = route[i - 1]
      const b = route[i]
      if (a.floor !== b.floor) {
        // inside the lift: hold position, switch floor at the midpoint
        return { x: a.x, y: a.y, floor: f < 0.5 ? a.floor : b.floor }
      }
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, floor: a.floor }
    }
    dist -= l
  }
  return route[route.length - 1]
}
