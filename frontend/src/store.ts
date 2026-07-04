import { create } from 'zustand'
import { BEAT_MIN } from './sim/beats'
import { FLOORS, floorOfDept, type FloorId } from './sim/layout'
import { SIM_END_MIN, clampSim } from './sim/time'

export type View = 'doctor' | 'admin'
export type SheetTab = 'flow' | 'predictions' | 'intake'

interface FlowTwinState {
  view: View
  /** sim time in minutes relative to the 11:00 anchor (negative = the recorded past) */
  simMin: number
  playing: boolean
  /** sim-minutes per real second while playing */
  speed: number
  /** which floor plate is on screen */
  floorId: FloorId
  /** [] = hospital, [dept] = department, [dept, area] = room level */
  zoomPath: string[]
  selectedId: string | null
  sheetTab: SheetTab
  showOptimized: boolean
  /** sim-minute the presenter tapped Resolve (null = not yet) */
  resolvedAtMin: number | null
  aboutOpen: boolean
  /** the Day review / Optimize-the-day overlay */
  wrapOpen: boolean
  /** the exploded axonometric building view */
  stackOpen: boolean
  hoveredId: string | null

  setView: (v: View) => void
  setSimMin: (m: number) => void
  nudgeSim: (dm: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  setFloor: (f: FloorId) => void
  cycleFloor: () => void
  zoomTo: (path: string[]) => void
  zoomOut: () => void
  select: (id: string | null) => void
  setSheetTab: (t: SheetTab) => void
  setShowOptimized: (v: boolean) => void
  resolveNow: () => void
  setAboutOpen: (v: boolean) => void
  setWrapOpen: (v: boolean) => void
  setStackOpen: (v: boolean) => void
  setHovered: (id: string | null) => void
  /** jump straight to a demo beat (presenter control) */
  jumpToBeat: (beat: 'meet' | 'labDelay' | 'overload' | 'resolveSuggested') => void
}

export const useStore = create<FlowTwinState>((set, get) => ({
  view: 'doctor',
  simMin: 0,
  playing: false,
  speed: 30,
  floorId: 'g',
  zoomPath: [],
  selectedId: null,
  sheetTab: 'flow',
  showOptimized: false,
  resolvedAtMin: null,
  aboutOpen: false,
  wrapOpen: false,
  stackOpen: false,
  hoveredId: null,

  setView: (view) => set({ view, selectedId: view === 'admin' ? null : get().selectedId }),

  setSimMin: (m) => set({ simMin: clampSim(m) }),
  nudgeSim: (dm) => set({ simMin: clampSim(get().simMin + dm), playing: false }),

  setPlaying: (playing) => {
    // hitting play at the very end restarts the demo day
    if (playing && get().simMin >= SIM_END_MIN) set({ simMin: 0 })
    set({ playing })
  },
  setSpeed: (speed) => set({ speed }),

  setFloor: (floorId) => set({ floorId, zoomPath: [], stackOpen: false }),
  cycleFloor: () => {
    const order = FLOORS.map((f) => f.id)
    const i = order.indexOf(get().floorId)
    set({ floorId: order[(i + 1) % order.length], zoomPath: [] })
  },

  zoomTo: (zoomPath) => {
    // zooming into a department on another storey switches the plate too
    const floorId = zoomPath.length ? floorOfDept(zoomPath[0]) : get().floorId
    set({ zoomPath, floorId })
  },
  zoomOut: () => set({ zoomPath: get().zoomPath.slice(0, -1) }),

  select: (selectedId) =>
    set({
      selectedId,
      sheetTab: selectedId && selectedId !== get().selectedId ? 'flow' : get().sheetTab,
    }),
  setSheetTab: (sheetTab) => set({ sheetTab }),
  setShowOptimized: (showOptimized) => set({ showOptimized }),

  resolveNow: () => {
    const t = get().simMin
    if (t >= BEAT_MIN.overload && get().resolvedAtMin == null) {
      set({ resolvedAtMin: t })
    }
  },

  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setWrapOpen: (wrapOpen) => set({ wrapOpen }),
  setStackOpen: (stackOpen) => set({ stackOpen }),
  setHovered: (hoveredId) => set({ hoveredId }),

  jumpToBeat: (beat) => {
    // no floor forcing: with the hero selected, the map already follows her
    const target = BEAT_MIN[beat] + (beat === 'meet' ? 0 : 1)
    set({ simMin: clampSim(target), playing: false })
  },
}))

/** Esc: wrap → about → building stack → sheet → zoom out, in that order.
    Returns true if it consumed the key. */
export function escapeStep(): boolean {
  const s = useStore.getState()
  if (s.wrapOpen) {
    s.setWrapOpen(false)
    return true
  }
  if (s.aboutOpen) {
    s.setAboutOpen(false)
    return true
  }
  if (s.stackOpen) {
    s.setStackOpen(false)
    return true
  }
  if (s.selectedId) {
    s.select(null)
    return true
  }
  if (s.zoomPath.length) {
    s.zoomOut()
    return true
  }
  return false
}
