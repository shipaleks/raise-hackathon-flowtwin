import { create } from 'zustand'
import { BEAT_MIN } from './sim/beats'
import { SIM_END_MIN, clampSim } from './sim/time'

export type View = 'doctor' | 'admin'
export type Theme = 'light' | 'dark'
export type SheetTab = 'flow' | 'predictions' | 'intake'

interface FlowTwinState {
  view: View
  theme: Theme
  /** sim time in minutes relative to the 11:00 anchor (negative = history) */
  simMin: number
  playing: boolean
  /** sim-minutes per real second while playing */
  speed: number
  /** [] = hospital, [dept] = department, [dept, area] = room level */
  zoomPath: string[]
  selectedId: string | null
  sheetTab: SheetTab
  showOptimized: boolean
  /** sim-minute the presenter tapped Resolve (null = not yet) */
  resolvedAtMin: number | null
  aboutOpen: boolean
  hoveredId: string | null

  setView: (v: View) => void
  toggleTheme: () => void
  setSimMin: (m: number) => void
  nudgeSim: (dm: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  zoomTo: (path: string[]) => void
  zoomOut: () => void
  select: (id: string | null) => void
  setSheetTab: (t: SheetTab) => void
  setShowOptimized: (v: boolean) => void
  resolveNow: () => void
  setAboutOpen: (v: boolean) => void
  setHovered: (id: string | null) => void
  /** jump straight to a demo beat (presenter control) */
  jumpToBeat: (beat: 'meet' | 'labDelay' | 'overload' | 'resolveSuggested') => void
}

export const useStore = create<FlowTwinState>((set, get) => ({
  view: 'doctor',
  theme: (document.documentElement.dataset.theme as Theme) ?? 'light',
  simMin: 0,
  playing: false,
  speed: 30,
  zoomPath: [],
  selectedId: null,
  sheetTab: 'flow',
  showOptimized: false,
  resolvedAtMin: null,
  aboutOpen: false,
  hoveredId: null,

  setView: (view) => set({ view, selectedId: view === 'admin' ? null : get().selectedId }),

  toggleTheme: () => {
    const theme: Theme = get().theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('flowtwin-theme', theme)
    set({ theme })
  },

  setSimMin: (m) => set({ simMin: clampSim(m) }),
  nudgeSim: (dm) => set({ simMin: clampSim(get().simMin + dm), playing: false }),

  setPlaying: (playing) => {
    // hitting play at the very end restarts today
    if (playing && get().simMin >= SIM_END_MIN) set({ simMin: 0 })
    set({ playing })
  },
  setSpeed: (speed) => set({ speed }),

  zoomTo: (zoomPath) => set({ zoomPath }),
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
  setHovered: (hoveredId) => set({ hoveredId }),

  jumpToBeat: (beat) => {
    const target = BEAT_MIN[beat] + (beat === 'meet' ? 0 : 1)
    set({ simMin: clampSim(target), playing: false })
  },
}))

/** Esc: about → sheet → zoom out, in that order. Returns true if it consumed the key. */
export function escapeStep(): boolean {
  const s = useStore.getState()
  if (s.aboutOpen) {
    s.setAboutOpen(false)
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
