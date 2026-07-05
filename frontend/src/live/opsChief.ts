/* The Ops Chief — the Antigravity agent (antigravity-preview-05-2026) with a
   persistent remote environment. It gets the twin's event log as CSV, runs
   real pandas over it in its sandbox, and returns the hospital-wide insight.
   The environment_id is reused across the session so the analysis accumulates. */

import { worldAt } from '../sim/engine'
import { heroWaitsAt } from '../data/live'
import { HOSPITAL } from '../data/seed'
import { fmtClock } from '../sim/time'
import { createInteraction, interactionText, liveFlags } from './client'
import { useLiveStore } from './liveStore'

const ENV_KEY = 'flowtwin.antigravity.env'

/** The floor as an event log — one row per person the twin tracks right now. */
function censusCsv(
  simMin: number,
  resolvedAtMin: number | null,
  optimizedAtMin: number | null,
): string {
  const { agents } = worldAt(simMin, resolvedAtMin, optimizedAtMin)
  const rows = agents
    .filter((a) => a.kind === 'today')
    .map(
      (a) =>
        `${a.id},${a.deptId},${a.areaId ?? ''},${a.acuity},${Math.round(a.waitMin)},${Math.round(a.elapsedMin)},${a.risk},${a.blocked ? 1 : 0}`,
    )
  return ['patient_id,dept,area,triage_cat,wait_min,elapsed_min,risk,blocked', ...rows].join('\n')
}

export async function runOpsChief(
  simMin: number,
  resolvedAtMin: number | null,
  optimizedAtMin: number | null = null,
): Promise<void> {
  const { chief, setChief } = useLiveStore.getState()
  if (!liveFlags().gemini || chief.status === 'running') return
  setChief({ status: 'running', startedAtMs: Date.now(), error: undefined })

  const envId = localStorage.getItem(ENV_KEY)
  const w = heroWaitsAt(simMin)
  const feedLine = w
    ? `Published feed at this moment: cat-3 median wait ${w.t3p50} min, cat-4/5 median ${w.t45p50} min (p95 ${w.t45p95} min).`
    : ''

  const input = [
    `You are the Ops Chief for ${HOSPITAL.hospital} A&E. Time now ${fmtClock(simMin)}.`,
    feedLine,
    `Write the following census snapshot to census.csv in your environment (append a snapshot_time column = "${fmtClock(simMin)}" if the file already exists from an earlier snapshot), then analyze it with Python/pandas:`,
    '',
    censusCsv(simMin, resolvedAtMin, optimizedAtMin),
    '',
    `1) rank departments by total waiting minutes currently accumulating;`,
    `2) identify the single department blocking the most patients (blocked=1);`,
    `3) quantify what one extra clinician there for 60 minutes would recover, assuming each blocked patient's wait stops growing;`,
    `4) keep census.csv for the next snapshot.`,
    `Reply with a 3-sentence plain-language operational insight — timing, queues and beds only, no clinical judgements.`,
  ].join('\n')

  try {
    const ix = await createInteraction({
      agent: 'antigravity-preview-05-2026',
      input,
      environment: envId ?? 'remote',
    })
    if (ix.environment_id) localStorage.setItem(ENV_KEY, ix.environment_id)
    useLiveStore.getState().setChief({
      status: 'done',
      insight: interactionText(ix).trim(),
      environmentId: ix.environment_id ?? envId,
    })
  } catch (e) {
    // a stale environment id from an old session can be rejected — retry fresh once
    if (envId) {
      localStorage.removeItem(ENV_KEY)
      useLiveStore.getState().setChief({ status: 'idle' })
      return runOpsChief(simMin, resolvedAtMin, optimizedAtMin)
    }
    useLiveStore.getState().setChief({ status: 'error', error: String(e) })
  }
}
