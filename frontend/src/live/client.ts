/* Thin fetch layer for the live plane. Both providers are reached through
   same-origin proxies (/api/gemini, /api/nvidia) so the keys stay server-side
   — the dev server injects them in vite.config.ts, nginx in deploy/. */

export interface LiveFlags {
  gemini: boolean
  nvidia: boolean
}

let flags: LiveFlags = { gemini: false, nvidia: false }
let probed: Promise<LiveFlags> | null = null

/** One probe per session; resolves {gemini,nvidia} availability. */
export function probeLive(): Promise<LiveFlags> {
  if (!probed) {
    probed = fetch('/api/live-status')
      .then((r) => (r.ok ? r.json() : { gemini: false, nvidia: false }))
      .then((f: LiveFlags) => (flags = f))
      .catch(() => (flags = { gemini: false, nvidia: false }))
  }
  return probed
}

export const liveFlags = () => flags

/* ---------------- Gemini Interactions API ---------------- */

interface InteractionStep {
  type: string
  content?: Array<{ type: string; text?: string }>
}

export interface Interaction {
  id: string
  status: string
  environment_id?: string
  steps?: InteractionStep[]
}

export async function createInteraction(body: Record<string, unknown>): Promise<Interaction> {
  const r = await fetch('/api/gemini/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store: true, ...body }),
  })
  if (!r.ok) throw new Error(`interactions ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/** The final model_output text of an interaction (thoughts skipped). */
export function interactionText(ix: Interaction): string {
  const outs = (ix.steps ?? []).filter((s) => s.type === 'model_output')
  const last = outs[outs.length - 1]
  return (last?.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n')
}

/* ---------------- Gemini generateContent (plain, non-Interactions) ----------------
   Used for Gemma models, which live on the same API but reject systemInstruction
   and JSON mode — the whole instruction travels in the single user turn. */

export async function generateContent(model: string, prompt: string): Promise<string> {
  const r = await fetch(`/api/gemini/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  })
  if (!r.ok) throw new Error(`generateContent ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  return ((d?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string }>)
    .map((p) => p.text ?? '')
    .join('')
}

/* ---------------- NVIDIA API catalog (OpenAI-compatible) ---------------- */

export async function nvidiaChat(body: Record<string, unknown>): Promise<string> {
  const r = await fetch('/api/nvidia/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`nvidia ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  return d?.choices?.[0]?.message?.content ?? ''
}

/* ---------------- parsing helpers ---------------- */

/** Last balanced {...} block in a model reply — survives ```json fences and
    leaked <think> traces (Nemotron repeats the JSON after </think>). */
export function lastJsonObject<T>(text: string): T {
  const src = text.replace(/<\/?think>/g, '')
  let best: string | null = null
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '{') continue
    let depth = 0
    let inStr = false
    for (let j = i; j < src.length; j++) {
      const ch = src[j]
      if (inStr) {
        if (ch === '\\') j++
        else if (ch === '"') inStr = false
      } else if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          best = src.slice(i, j + 1)
          i = j
          break
        }
      }
    }
  }
  if (!best) throw new Error('no JSON object in model reply')
  return JSON.parse(best) as T
}
