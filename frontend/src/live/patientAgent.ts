/* The stateful patient agent — one Gemini Interactions chain per patient.
   The chain IS the memory: intake seeds it with the journey so far, and demo
   beats append as events via previous_interaction_id, so every prediction is
   a function of the accumulated journey, never a snapshot.

   Model: gemini-3.5-flash via the Interactions API. */

import type { SheetVM } from '../sim/engine'
import { fmtClock } from '../sim/time'
import { createInteraction, interactionText, lastJsonObject, liveFlags } from './client'
import { agentSnap, useLiveStore } from './liveStore'
import type { AgentOpsState } from './types'

const SYSTEM = `You are the operational patient-flow agent for ONE hospital patient in a Hong Kong A&E.
You shadow the journey and track ONLY operations: timing, queues, beds, resources, blockers, next operational action.
Never give medical advice, diagnosis, or treatment opinions — care stays with clinicians.
After every message, reply with ONLY this compact JSON (no prose, no fences):
{"predicted_exit":"HH:MM","delay_risk":"low"|"elevated"|"high","blocker":string|null,"next_action":{"title":string,"explanation":string,"impact_min":number}|null,"agent_note":string}
agent_note is one sentence that explicitly references the accumulated journey (what already happened, not just the latest event).`

/** phase order — chain appends are forward-only so scrubbing back never
    rewrites the agent's memory */
const PHASE_ORDER = ['baseline', 'lab_delay', 'overload', 'resolved'] as const
export type LivePhase = (typeof PHASE_ORDER)[number]
const phaseRank = (p: string) => PHASE_ORDER.indexOf(p as LivePhase)

/** chain bookkeeping kept outside React state */
const chains = new Map<string, { interactionId: string; busy: boolean; pending: LivePhase | null }>()

/** Serialize the twin's view of the patient into the intake message. */
function intakeMessage(vm: SheetVM, simMin: number): string {
  const journey = vm.segments
    .filter((s) => !s.predicted)
    .map(
      (s) =>
        `${fmtClock(s.startMin)}–${s.current ? 'now' : fmtClock(s.endMin)} ${s.zoneLabel}: ${s.label}${s.note ? ` (${s.note})` : ''}`,
    )
    .join('\n')
  const vitals = vm.vitals
    ? `Vitals at triage: HR ${vm.vitals.hr}, BP ${vm.vitals.sbp}, SpO2 ${vm.vitals.spo2}, pain ${vm.vitals.pain}/10.`
    : ''
  return [
    `Time now ${fmtClock(simMin)}. New patient under your watch:`,
    `${vm.name}, ${vm.age}, ${vm.complaint} — pathway "${vm.pathway}", triage cat-${vm.acuity}, arrived ${fmtClock(vm.arrivalMin)} by ${vm.arrivalMode}.`,
    vitals,
    `Journey so far:\n${journey || '(just arrived)'}`,
    `Pending steps: ${vm.pendingSteps.join(', ') || 'none'}.`,
    `Twin baseline for context: predicted exit ${vm.exitClock}${vm.ciLabel ? ` (${vm.ciLabel})` : ''}, current blocker: ${vm.blockerLabel ?? 'none'}.`,
    `Build your own operational state and reply with the JSON.`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** What each demo beat tells the chain. */
function phaseEvent(phase: LivePhase, simMin: number): string {
  const t = fmtClock(simMin)
  switch (phase) {
    case 'lab_delay':
      return `Event ${t}: troponin re-run queued — lab turnaround +35 min. Recalculate against what you already know about this patient.`
    case 'overload':
      return `Event ${t}: three more chest-pain arrivals hit the cardiology consult queue (4 waiting, capacity ~3/h) exactly as the hospital's real afternoon climb opens. Recalculate.`
    case 'resolved':
      return `Action executed ${t}: patient moved to the observation ward (bed O-6); consult coverage escalated for 60 min; queue draining. Recalculate.`
    default:
      return `Event ${t}: no change.`
  }
}

async function turn(id: string, input: string, prevId: string | null, phase: LivePhase): Promise<void> {
  const ix = await createInteraction({
    model: 'gemini-3.5-flash',
    system_instruction: SYSTEM,
    input,
    ...(prevId ? { previous_interaction_id: prevId } : {}),
  })
  const ops = lastJsonObject<AgentOpsState>(interactionText(ix))
  const chain = chains.get(id)
  if (chain) chain.interactionId = ix.id
  else chains.set(id, { interactionId: ix.id, busy: false, pending: null })
  const { patchAgent } = useLiveStore.getState()
  const prev = agentSnap(id)
  patchAgent(id, {
    status: 'live',
    ops,
    turns: prev.turns + 1,
    // the agent's own before/after trail — this is the stage-showable result
    history: [...prev.history, { phase, exit: ops.predicted_exit, risk: ops.delay_risk }],
  })
}

/** Create the chain from the twin's current view of the patient. */
export async function wakeAgent(vm: SheetVM, simMin: number, phase: LivePhase): Promise<void> {
  const id = vm.id
  if (!liveFlags().gemini || chains.has(id) || agentSnap(id).status === 'thinking') return
  const { patchAgent } = useLiveStore.getState()
  patchAgent(id, { status: 'thinking', phase })
  chains.set(id, { interactionId: '', busy: true, pending: null })
  try {
    await turn(id, intakeMessage(vm, simMin), null, phase)
    patchAgent(id, { phase })
    drain(id, simMin)
  } catch (e) {
    chains.delete(id)
    patchAgent(id, { status: 'error', error: String(e) })
  } finally {
    const c = chains.get(id)
    if (c) c.busy = false
  }
}

/** Append a demo-beat event to an existing chain (forward-only, queued). */
export function notifyPhase(id: string, phase: LivePhase, simMin: number): void {
  const chain = chains.get(id)
  if (!chain || !liveFlags().gemini) return
  const snap = agentSnap(id)
  if (phaseRank(phase) <= phaseRank(snap.phase)) return
  chain.pending = phase
  drain(id, simMin)
}

function drain(id: string, simMin: number): void {
  const chain = chains.get(id)
  if (!chain || chain.busy || !chain.pending || !chain.interactionId) return
  const phase = chain.pending
  chain.pending = null
  chain.busy = true
  const { patchAgent } = useLiveStore.getState()
  patchAgent(id, { status: 'thinking', phase })
  turn(id, phaseEvent(phase, simMin), chain.interactionId, phase)
    .catch((e) => patchAgent(id, { status: 'error', error: String(e) }))
    .finally(() => {
      chain.busy = false
      drain(id, simMin)
    })
}

export const hasChain = (id: string) => chains.has(id)
