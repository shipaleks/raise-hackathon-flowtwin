/* Gemma translate — the language-assistance plane of the patient card.
   Some personas describe their complaint only in Cantonese; one click sends the
   verbatim words to Gemma and renders an English translation plus 2-3
   ops-relevant bullets for the intake team. Communication only, never clinical.

   Model: gemma-4-31b-it (the largest Gemma the key serves) via the same keyed
   /api/gemini proxy — but through plain generateContent, because Gemma takes no
   systemInstruction or JSON mode, so the whole instruction lives in the single
   user turn. Gemma leaks a reasoning scratchpad before the JSON; lastJsonObject
   picks the final balanced object. */

import type { SelfReport } from '../data/selfReports'
import { generateContent, lastJsonObject, liveFlags } from './client'
import { IDLE_TRANSLATION, useLiveStore } from './liveStore'
import type { GemmaTranslation } from './types'

export const GEMMA_MODEL = 'gemma-4-31b-it'
export const GEMMA_LABEL = 'Gemma 4 31B'

const prompt = (report: SelfReport) => `You are a communication assistant at the intake desk of a Hong Kong A&E.
A patient has described their complaint in their own words, in Cantonese (Traditional Chinese).${report.speaker ? `\nNote: the words are spoken by someone accompanying the patient — ${report.speaker}.` : ''}
Your job is LANGUAGE ASSISTANCE ONLY: translate and summarise so the intake team understands the patient.
Never add medical advice, diagnosis, triage opinions, or treatment suggestions.

The words, verbatim:
"""
${report.text}
"""

Reply with ONLY this JSON — no prose, no code fences:
{"detected_lang": string, "translation": string, "summary_points": [string, string, ...]}
Rules:
- "detected_lang": the language/dialect you detected, as a short label (e.g. "Cantonese (Traditional Chinese)").
- "translation": faithful first-person English translation; keep the speaker's hedges, timings and phrasing.
- "summary_points": 2-3 short bullets of what the intake team should know, strictly from the speaker's words
  (onset/duration, severity as they put it, mobility, who is with them, language or hearing barriers).
  No clinical interpretation.`

/** One Gemma call per patient per session — repeat opens read the cache. */
export async function translateSelfReport(patientId: string, report: SelfReport): Promise<void> {
  const { translations, patchTranslation } = useLiveStore.getState()
  const snap = translations[patientId] ?? IDLE_TRANSLATION
  if (!liveFlags().gemini || snap.status === 'running' || snap.status === 'done') return
  patchTranslation(patientId, { status: 'running', error: undefined })
  try {
    const text = await generateContent(GEMMA_MODEL, prompt(report))
    const result = lastJsonObject<GemmaTranslation>(text)
    patchTranslation(patientId, { status: 'done', result })
  } catch (e) {
    patchTranslation(patientId, { status: 'error', error: String(e) })
  }
}
