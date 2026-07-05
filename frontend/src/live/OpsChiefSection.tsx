/* Ops Chief section for the Day-review overlay — one button, one Antigravity
   run: the census CSV goes into the agent's persistent sandbox, pandas runs
   there, and the 3-sentence insight lands here with its environment id. */

import { useStore } from '../store'
import { useLiveStore } from './liveStore'
import { runOpsChief } from './opsChief'
import './live.css'

export function OpsChiefSection() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const gemini = useLiveStore((s) => s.gemini)
  const chief = useLiveStore((s) => s.chief)

  if (!gemini) return null

  return (
    <section className="chrome-about__section">
      <h3 className="chrome-about__h">Ops Chief — Antigravity, live</h3>
      <p className="chrome-about__body">
        The Ops Chief is <strong>antigravity-preview-05-2026</strong> with a persistent sandbox: it
        receives the twin's census as CSV, runs real pandas over it, and answers in plain
        operational language. Not a chat summary — analysis with code, in an environment that
        persists across snapshots.
      </p>
      {chief.status !== 'done' && (
        <button
          type="button"
          className="live-chief__run"
          disabled={chief.status === 'running'}
          onClick={() => runOpsChief(simMin, resolvedAtMin)}
        >
          {chief.status === 'running' ? 'Running pandas in the sandbox…' : 'Run the Ops Chief analysis'}
        </button>
      )}
      {chief.status === 'error' && (
        <p className="live-error">Antigravity call failed — precomputed plan above still stands. {chief.error}</p>
      )}
      {chief.insight && (
        <>
          <blockquote className="live-chief__insight">{chief.insight}</blockquote>
          <p className="chrome-wrap__assumption">
            Computed live over the census at the scrubbed moment
            {chief.environmentId ? ` · sandbox ${chief.environmentId.slice(0, 8)}… (reused across runs)` : ''}.
          </p>
        </>
      )}
    </section>
  )
}
