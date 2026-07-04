/* Sarah's demo-beat presentation layer.
   The background world plays straight from seed tracks; only the hero's
   *predictions and position* are overridden per beat so the scripted story
   (PLAN §3) is deterministic: never let data decide whether the demo works.

   Beat times (minutes after 11:00 anchor) come from scenario.json:
     0    meet_sarah       — on track
     90   lab_delay        — troponin re-run queued, exit slides +45, amber
     180  cardio_overload  — 4 consults queued as the recurring 14:00 backup
                             starts, exit 16:50, red
     190  (suggested) resolve — action-triggered, not time-triggered
*/

import { scenario } from '../data/seed'
import { parseT } from './time'
import type { JourneyEvent, Recommendation, Risk } from '../types'

const offsets = Object.fromEntries(scenario.beats.map((b) => [b.id, b.t_offset_min]))

export const BEAT_MIN = {
  meet: offsets.meet_sarah ?? 0,
  labDelay: offsets.lab_delay ?? 90,
  overload: offsets.cardio_overload ?? 180,
  resolveSuggested: offsets.resolve ?? 190,
}

export type SarahPhase = 'baseline' | 'lab_delay' | 'overload' | 'resolved'

export interface SarahPresentation {
  phase: SarahPhase
  risk: Risk
  /** predicted exit / CI in sim-minutes */
  exitMin: number
  ciLowMin: number
  ciHighMin: number
  blocker: string
  blockerLabel: string
  pendingSteps: string[]
  recommendation: Recommendation | null
  /** the Resolve affordance is live only while the overload is on */
  canResolve: boolean
  resolved: boolean
  /** where the hero sits on the map */
  position: { dept: string; area: string }
  /** beat events appended to her real intake events for the Flow tab */
  extraEvents: Array<JourneyEvent & { note: string }>
}

const seedExitMin = parseT(scenario.patient.predicted_exit)
const seedCiLow = parseT(scenario.patient.predicted_exit_ci.low)
const seedCiHigh = parseT(scenario.patient.predicted_exit_ci.high)

const atClock = (simMin: number) => {
  // scenario events carry ISO stamps; build one for a sim-minute
  const d = new Date(new Date(scenario.now).getTime() + simMin * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const IN_CONSULT = { dept: 'Cardiology', area: 'Consult' }
const IN_OBSERVATION = { dept: 'Emergency', area: 'Observation' }

const LAB_DELAY_EVENT: JourneyEvent & { note: string } = {
  t: atClock(BEAT_MIN.labDelay),
  type: 'lab_delay',
  dept: 'Labs',
  area: 'Chemistry',
  note: 'Troponin re-run queued — chemistry congestion',
}

const OVERLOAD_EVENT: JourneyEvent & { note: string } = {
  t: atClock(BEAT_MIN.overload),
  type: 'dept_overload',
  dept: 'Cardiology',
  area: 'Consult',
  note: 'Cardiology overload — 4 consults queued, 1 cardiologist on duty',
}

// moved_to_observation LAST so it becomes the open "now" segment on the Flow
// bar — Sarah's current stop after the resolve is Observation, not Consult
const resolveEvents = (resolvedAtMin: number): Array<JourneyEvent & { note: string }> => [
  {
    t: atClock(resolvedAtMin),
    type: 'consult_escalated',
    dept: 'Cardiology',
    area: 'Consult',
    note: 'Consult escalated — second cardiologist covering 60 min',
  },
  {
    t: atClock(resolvedAtMin),
    type: 'moved_to_observation',
    dept: 'Emergency',
    area: 'Observation',
    note: 'Moved to Observation — bed O-12 assigned',
  },
]

/** Sarah's presented ops-state at sim-minute t. */
export function sarahAt(tMin: number, resolvedAtMin: number | null): SarahPresentation {
  const resolved = resolvedAtMin != null && tMin >= resolvedAtMin

  if (resolved) {
    return {
      phase: 'resolved',
      risk: 'on_track',
      exitMin: BEAT_MIN.overload + 125, // 16:05 — one action bought ~45 min back
      ciLowMin: BEAT_MIN.overload + 95,
      ciHighMin: BEAT_MIN.overload + 155,
      blocker: 'none',
      blockerLabel: 'In Observation (bed O-12) — escalated consult on its way',
      pendingSteps: ['Escalated cardiology consult', 'Disposition decision'],
      recommendation: {
        action: 'done_monitor',
        explanation: 'Action taken: moved to Observation, consult coverage escalated. Recovered ~45 min.',
        impact_min: 0,
      },
      canResolve: false,
      resolved: true,
      position: IN_OBSERVATION,
      extraEvents: [LAB_DELAY_EVENT, OVERLOAD_EVENT, ...resolveEvents(resolvedAtMin)],
    }
  }

  if (tMin >= BEAT_MIN.overload) {
    return {
      phase: 'overload',
      risk: 'high',
      exitMin: BEAT_MIN.overload + 170, // 16:50 — the queue, not the medicine
      ciLowMin: BEAT_MIN.overload + 130,
      ciHighMin: BEAT_MIN.overload + 210, // ±40 min
      blocker: 'cardiology_queue',
      blockerLabel: '4 consults queued · 1 cardiologist on duty (recurring 14:00–17:00 pattern)',
      pendingSteps: ['Troponin re-run', 'Cardiology consult', 'Observation window', 'Disposition'],
      recommendation: {
        action: 'move_to_observation',
        explanation:
          'Stable, first troponin negative. Move to Observation (bed O-12 free) and escalate consult coverage — she stops holding ER Bay 4 while she waits.',
        impact_min: 45,
      },
      // one-shot: after the presenter resolves once, rewinding into the
      // overload window must not re-offer a button that would silently no-op
      canResolve: resolvedAtMin == null,
      resolved: false,
      position: IN_CONSULT,
      extraEvents: [LAB_DELAY_EVENT, OVERLOAD_EVENT],
    }
  }

  if (tMin >= BEAT_MIN.labDelay) {
    return {
      phase: 'lab_delay',
      risk: 'elevated',
      exitMin: seedExitMin + 45, // 15:05
      ciLowMin: seedCiLow + 45,
      ciHighMin: seedCiHigh + 55,
      blocker: 'labs_pending',
      blockerLabel: 'Troponin re-run queued — chemistry congestion',
      pendingSteps: ['Troponin re-run', 'Cardiology consult', 'Observation window', 'Disposition'],
      recommendation: {
        action: 'prioritize_lab_sample',
        explanation: 'Flag the re-run as cardiac-priority in chemistry — recovers ~25 min of the slip.',
        impact_min: 25,
      },
      canResolve: false,
      resolved: false,
      position: IN_CONSULT,
      extraEvents: [LAB_DELAY_EVENT],
    }
  }

  return {
    phase: 'baseline',
    risk: 'on_track',
    exitMin: seedExitMin, // 14:20
    ciLowMin: seedCiLow,
    ciHighMin: seedCiHigh,
    blocker: 'cardiology_consult',
    blockerLabel: 'Cardiology consult queued — expected within the hour',
    pendingSteps: ['Cardiology consult', 'Observation window', 'Disposition'],
    recommendation: {
      action: 'monitor',
      explanation: 'On the expected Chest Pain Rule-Out pathway. No action needed.',
      impact_min: 0,
    },
    canResolve: false,
    resolved: false,
    position: IN_CONSULT,
    extraEvents: [],
  }
}

/** Sarah's real intake events (≤ now) — her seed future is replaced by the beats. */
export function sarahBaseEvents(): JourneyEvent[] {
  return scenario.patient.events.filter((e) => parseT(e.t) <= 0)
}
