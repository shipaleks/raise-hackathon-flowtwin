/* Types for the live plane — real model calls layered over the deterministic
   twin. Every surface that renders these labels the model by name. */

/** Ops-state JSON the Gemini patient agent returns each turn of its chain. */
export interface AgentOpsState {
  predicted_exit: string // "HH:MM"
  delay_risk: 'low' | 'elevated' | 'high'
  blocker: string | null
  next_action: {
    title: string
    explanation: string
    impact_min: number
  } | null
  /** one-sentence stateful explanation referencing the accumulated journey */
  agent_note: string
}

export type AgentStatus = 'off' | 'idle' | 'thinking' | 'live' | 'error'

/** One point of the agent's own prediction trail — its verdict per turn. */
export interface AgentTrailPoint {
  phase: string
  exit: string // "HH:MM" as the agent predicted it
  risk: AgentOpsState['delay_risk']
}

export interface AgentSnap {
  status: AgentStatus
  /** last validated ops-state from the chain */
  ops: AgentOpsState | null
  /** turns accumulated in the Interactions chain */
  turns: number
  /** last demo phase the chain has been told about */
  phase: string
  /** the agent's predicted exit per turn — the before/after the stage shows */
  history: AgentTrailPoint[]
  error?: string
}

export interface ChiefState {
  status: 'idle' | 'running' | 'done' | 'error'
  insight: string | null
  /** Antigravity persistent sandbox id — reused across the whole demo */
  environmentId: string | null
  startedAtMs: number | null
  error?: string
}

export interface ForecastPoint {
  /** sim-minute of the forecast hour (relative to the 11:00 anchor) */
  tMin: number
  p10: number
  p50: number
  p90: number
}

export interface ForecastState {
  status: 'idle' | 'running' | 'done' | 'error'
  points: ForecastPoint[]
  /** trailing real hourly series handed to the model (for the chart tail) */
  history: Array<{ tMin: number; v: number }>
  error?: string
}
