/* The stage-showable live result — the hero agent's OWN prediction trail
   across the day (intake → slips → after the action), computed by the
   Interactions chain from its accumulated memory, not by the script. */

import { HERO_ID } from '../data/seed'
import { Chip } from '../components/ui/Chip'
import { useLiveStore } from './liveStore'
import { agentRecoveredMin } from './LiveAgentPanel'
import './live.css'

const LABEL: Record<string, string> = {
  baseline: 'at intake',
  lab_delay: 'after the lab delay',
  overload: 'at the overload',
  resolved: 'after the action',
}

export function AgentResultLine() {
  const gemini = useLiveStore((s) => s.gemini)
  const snap = useLiveStore((s) => s.agents[HERO_ID])
  if (!gemini || !snap || snap.history.length < 2) return null
  const recovered = agentRecoveredMin(snap.history)

  return (
    <div className="live-result">
      <p className="live-result__kicker">
        The live agent's own verdict — Gemini Interactions chain, {snap.turns} turns of
        server-side memory, not the script:
      </p>
      <div className="live-trail">
        {snap.history.map((h, i) => (
          <span key={`${h.phase}-${i}`} className="live-trail__step">
            {i > 0 && (
              <span className="live-trail__arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className={`live-trail__exit live-trail__exit--${h.risk} tnum`}>{h.exit}</span>
            <span className="live-trail__phase">{LABEL[h.phase] ?? h.phase}</span>
          </span>
        ))}
        {recovered != null && recovered > 0 && (
          <Chip tone="ok" className="tnum">
            −{recovered} min recovered
          </Chip>
        )}
      </div>
    </div>
  )
}
