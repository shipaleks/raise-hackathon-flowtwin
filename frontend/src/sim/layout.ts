/* The hospital floor-plate. One global coordinate space (1000×640) at every
   drill-down level: departments contain areas, areas contain spot grids.
   Zooming is a viewport transform into a rect, never a re-layout. */

export const MAP_W = 1000
export const MAP_H = 640

export interface AreaDef {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  capacity: number
}

export interface DeptDef {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  outside?: boolean
  areas: AreaDef[]
}

const area = (id: string, name: string, x: number, y: number, w: number, h: number, capacity: number): AreaDef => ({
  id,
  name,
  x,
  y,
  w,
  h,
  capacity,
})

export const DEPTS: DeptDef[] = [
  {
    id: 'ambulance-bay',
    name: 'Ambulance Bay',
    x: 24,
    y: 24,
    w: 220,
    h: 72,
    outside: true,
    areas: [area('entrance', 'Entrance', 32, 46, 204, 42, 4)],
  },
  {
    id: 'walk-in',
    name: 'Main Entrance',
    x: 268,
    y: 24,
    w: 196,
    h: 72,
    outside: true,
    areas: [area('reception', 'Reception', 276, 46, 180, 42, 4)],
  },
  {
    id: 'discharge',
    name: 'Discharge',
    x: 756,
    y: 24,
    w: 220,
    h: 72,
    areas: [area('exit', 'Exit', 764, 46, 204, 42, 4)],
  },
  {
    id: 'emergency',
    name: 'Emergency',
    x: 24,
    y: 120,
    w: 440,
    h: 300,
    areas: [
      area('triage', 'Triage', 40, 164, 120, 116, 2),
      area('waiting', 'Waiting', 40, 292, 120, 112, 6),
      area('er-bay', 'ER Bays', 176, 164, 152, 240, 6),
      area('observation', 'Observation', 344, 164, 104, 240, 4),
    ],
  },
  {
    id: 'imaging',
    name: 'Imaging',
    x: 488,
    y: 120,
    w: 232,
    h: 140,
    areas: [
      area('x-ray', 'X-ray', 500, 158, 64, 88, 2),
      area('ct', 'CT', 576, 158, 64, 88, 2),
      area('mri', 'MRI', 652, 158, 56, 88, 1),
    ],
  },
  {
    id: 'labs',
    name: 'Labs',
    x: 744,
    y: 120,
    w: 232,
    h: 140,
    areas: [
      area('chemistry', 'Chemistry', 756, 158, 64, 88, 3),
      area('microbiology', 'Microbiology', 832, 158, 64, 88, 2),
      area('toxicology', 'Toxicology', 908, 158, 56, 88, 2),
    ],
  },
  {
    id: 'cardiology',
    name: 'Cardiology',
    x: 488,
    y: 284,
    w: 232,
    h: 136,
    areas: [
      area('consult', 'Consult', 500, 322, 72, 84, 2),
      area('cath-lab', 'Cath Lab', 584, 322, 64, 84, 1),
      area('telemetry', 'Telemetry', 660, 322, 48, 84, 3),
    ],
  },
  {
    id: 'surgery',
    name: 'Surgery',
    x: 744,
    y: 284,
    w: 232,
    h: 136,
    areas: [
      area('or-1', 'OR 1', 756, 322, 64, 84, 1),
      area('or-2', 'OR 2', 832, 322, 64, 84, 1),
      area('recovery', 'Recovery', 908, 322, 56, 84, 3),
    ],
  },
  {
    id: 'wards',
    name: 'Wards',
    x: 24,
    y: 444,
    w: 440,
    h: 148,
    areas: [
      area('medical-ward', 'Medical Ward', 40, 482, 200, 96, 8),
      area('surgical-ward', 'Surgical Ward', 256, 482, 192, 96, 8),
    ],
  },
]

/** Free canvas region under the right column — MapView renders the legend here. */
export const LEGEND_RECT = { x: 488, y: 444, w: 488, h: 148 }

export const deptById = new Map(DEPTS.map((d) => [d.id, d]))
export const areaById = new Map(
  DEPTS.flatMap((d) => d.areas.map((a) => [`${d.id}/${a.id}`, { dept: d, area: a }] as const)),
)

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-')

/** Map a seed event's dept/area names onto layout ids. */
export function zoneIdsFor(dept: string, areaName: string): { deptId: string; areaId: string | null } {
  const deptId = slug(dept)
  if (!deptById.has(deptId)) return { deptId: 'emergency', areaId: null }
  const areaId = slug(areaName)
  return {
    deptId,
    areaId: areaById.has(`${deptId}/${areaId}`) ? areaId : null,
  }
}

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
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
  const pad = 10
  const w = Math.max(rect.w - pad * 2, 8)
  const h = Math.max(rect.h - pad * 2, 8)
  const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)) || 1)
  const rows = Math.ceil(n / cols)
  const slots = cols * rows
  const taken = new Array<boolean>(slots).fill(false)
  const out = new Map<string, { x: number; y: number }>()
  const sorted = [...occupantIds].sort()
  for (const id of sorted) {
    let s = hash(id) % slots
    while (taken[s]) s = (s + 1) % slots
    taken[s] = true
    const c = s % cols
    const r = Math.floor(s / cols)
    out.set(id, {
      x: rect.x + pad + ((c + 0.5) * w) / cols,
      y: rect.y + pad + ((r + 0.5) * h) / rows,
    })
  }
  return out
}
