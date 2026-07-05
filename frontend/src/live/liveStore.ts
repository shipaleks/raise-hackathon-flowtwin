/* Zustand store for the live plane — kept separate from the sim store so the
   deterministic twin stays a pure function of (simMin, resolvedAt) and the
   live results layer on top without ever desyncing the demo. */

import { create } from 'zustand'
import { probeLive } from './client'
import type { AgentSnap, ChiefState, ForecastState, TranslationSnap } from './types'

interface LiveState {
  /** which planes have keys behind the proxy (probed once at boot) */
  gemini: boolean
  nvidia: boolean
  probed: boolean

  agents: Record<string, AgentSnap>
  chief: ChiefState
  forecast: ForecastState
  translations: Record<string, TranslationSnap>

  init: () => void
  patchAgent: (id: string, patch: Partial<AgentSnap>) => void
  setChief: (patch: Partial<ChiefState>) => void
  setForecast: (patch: Partial<ForecastState>) => void
  patchTranslation: (id: string, patch: Partial<TranslationSnap>) => void
}

export const IDLE_AGENT: AgentSnap = {
  status: 'idle',
  ops: null,
  turns: 0,
  phase: 'baseline',
  history: [],
}

export const IDLE_TRANSLATION: TranslationSnap = { status: 'idle', result: null }

export const useLiveStore = create<LiveState>((set, get) => ({
  gemini: false,
  nvidia: false,
  probed: false,

  agents: {},
  chief: { status: 'idle', insight: null, environmentId: null, startedAtMs: null },
  forecast: { status: 'idle', points: [], history: [] },
  translations: {},

  init: () => {
    if (get().probed) return
    set({ probed: true })
    probeLive().then((f) => set({ gemini: f.gemini, nvidia: f.nvidia }))
  },

  patchAgent: (id, patch) =>
    set((s) => ({
      agents: { ...s.agents, [id]: { ...(s.agents[id] ?? IDLE_AGENT), ...patch } },
    })),

  setChief: (patch) => set((s) => ({ chief: { ...s.chief, ...patch } })),
  setForecast: (patch) => set((s) => ({ forecast: { ...s.forecast, ...patch } })),

  patchTranslation: (id, patch) =>
    set((s) => ({
      translations: { ...s.translations, [id]: { ...(s.translations[id] ?? IDLE_TRANSLATION), ...patch } },
    })),
}))

export const agentSnap = (id: string): AgentSnap => useLiveStore.getState().agents[id] ?? IDLE_AGENT
