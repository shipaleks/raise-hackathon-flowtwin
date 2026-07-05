/* Headless watcher: when the demo crosses a beat (lab delay, overload,
   resolve), the hero's Interactions chain hears about it as an event —
   debounced so scrubbing across the timeline doesn't spam the chain, and
   forward-only so rewinding never rewrites the agent's memory. */

import { useEffect } from 'react'
import { HERO_ID } from '../data/seed'
import { useStore } from '../store'
import { useLiveStore } from './liveStore'
import { notifyPhase } from './patientAgent'
import { phaseAt } from './LiveAgentPanel'

const SETTLE_MS = 1200

export function LiveBeatWatcher() {
  const init = useLiveStore((s) => s.init)
  useEffect(() => init(), [init])

  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const phase = phaseAt(simMin, resolvedAtMin)

  useEffect(() => {
    const t = window.setTimeout(() => {
      const { simMin: m, resolvedAtMin: r } = useStore.getState()
      notifyPhase(HERO_ID, phaseAt(m, r), m)
    }, SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  return null
}
