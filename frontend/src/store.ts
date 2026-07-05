import { create } from 'zustand'
import { BEAT_MIN } from './sim/beats'
import { FLOORS, floorOfDept, type FloorId } from './sim/layout'
import { SIM_END_MIN, clampSim } from './sim/time'

export type View = 'doctor' | 'admin'
export type SheetTab = 'flow' | 'predictions' | 'intake'

/** 00:00 of the demo day, in sim-minutes (the anchor is 11:00). */
const MIDNIGHT_MIN = -11 * 60

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
  /** sim-minute the whole action board executes from (null = baseline day) */
  optimizedAtMin: number | null
  /** Sarah's resolve was scheduled by optimizeAll, not tapped — undo clears it */
  optimizeAutoResolved: boolean
  aboutOpen: boolean
  /** the Day review / Optimize-the-day overlay */
  wrapOpen: boolean
  /** the exploded axonometric building view */
  stackOpen: boolean
  /** editorial act-card flashed when a demo beat is jumped to */
  beatToast: string | null
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
  /** replay the day with every board recommendation executed as it surfaced */
  optimizeAll: () => void
  /** back to the baseline day (keeps a manually tapped Resolve) */
  undoOptimize: () => void
  setAboutOpen: (v: boolean) => void
  setWrapOpen: (v: boolean) => void
  setStackOpen: (v: boolean) => void
  setBeatToast: (t: string | null) => void
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
  optimizedAtMin: null,
  optimizeAutoResolved: false,
  aboutOpen: false,
  wrapOpen: false,
  stackOpen: false,
  beatToast: null,
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
    const cur = get().resolvedAtMin
    // manual resolve wins over a board-scheduled one that hasn't landed yet
    if (t >= BEAT_MIN.overload && (cur == null || cur > t)) {
      set({ resolvedAtMin: t })
    }
  },

  optimizeAll: () => {
    if (get().optimizedAtMin != null) return
    const autoResolve = get().resolvedAtMin == null
    // one counterfactual, not a scrub-dependent one: the whole day replays
    // with each action executed as it surfaced — the hero's at the resolve
    // beat (her bottleneck doesn't exist earlier), the rest at their own
    // moments (the engine pivots each at max(midnight, arrival))
    set({
      optimizedAtMin: MIDNIGHT_MIN,
      resolvedAtMin: autoResolve ? BEAT_MIN.resolveSuggested : get().resolvedAtMin,
      optimizeAutoResolved: autoResolve,
    })
  },

  undoOptimize: () => {
    if (get().optimizedAtMin == null) return
    set({
      optimizedAtMin: null,
      resolvedAtMin: get().optimizeAutoResolved ? null : get().resolvedAtMin,
      optimizeAutoResolved: false,
    })
  },

  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setWrapOpen: (wrapOpen) => set({ wrapOpen }),
  setStackOpen: (stackOpen) => set({ stackOpen }),
  setBeatToast: (beatToast) => set({ beatToast }),
  setHovered: (hoveredId) => set({ hoveredId }),

  jumpToBeat: (beat) => {
    // no floor forcing: with the hero selected, the map already follows her
    const target = BEAT_MIN[beat] + (beat === 'meet' ? 0 : 1)
    set({ simMin: clampSim(target), playing: false, beatToast: BEAT_ACT[beat] })
  },
}))

/** Editorial act cards for the presenter beats. */
const BEAT_ACT: Record<'meet' | 'labDelay' | 'overload' | 'resolveSuggested', string> = {
  meet: 'Act I — Meet Sarah',
  labDelay: 'Act II — The lab delay',
  overload: 'Act III — Cardiology overload',
  resolveSuggested: 'Act IV — The resolve',
}

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
