# FlowTwin - One-Minute Demo Video Script

**Goal:** show the working app for Google DeepMind Statement Four. No deck.
Record the app screen and use a tight voice-over.

**Target:** 55-60 seconds.

---

## Timeline

| Time | Screen | Voice-over |
|---|---|---|
| 0:00-0:06 | Doctor view, full hospital floor plate | "This is FlowTwin: a stateful operations twin for any hospital. Gemini runs the agents. Nemotron runs the hospital." |
| 0:06-0:13 | Top bar waits and About ledger flash | "The proof data is real and anonymous: public Hong Kong A&E wait updates, p50 and p95 by triage category. The patient personas are synthetic by design." |
| 0:13-0:22 | Click the demo patient, open Flow tab | "A snapshot can show who is waiting. FlowTwin remembers the journey: arrival, triage, labs, consult queue, bed state, and predicted exit." |
| 0:22-0:32 | Trigger Lab delay, then Cardiology overload | "When state changes, the prediction changes. The agent uses accumulated history to identify the blocker, not just the current screen." |
| 0:32-0:41 | Predictions tab, then Resolve | "The boundary is strict: operations only, time, beds, queues. Staff approve the move, and the flow updates in the twin. In production, Computer Use would click the legacy EHR." |
| 0:41-0:50 | Switch to Administrator view | "The same state rolls up to hospital operations: real network waits, the measured daily pattern, department load, and the Ops Chief view." |
| 0:50-1:00 | Open Optimize the day / Day review | "The primitive is persistent state: Gemini Interactions for patient memory, Antigravity for hospital analysis, and Nemotron forecasting the wait curve. Next, Live Translate, local voice, NemoGuard, and Gemma move the workflow inside the hospital." |

---

## Click Path

1. Start at `http://localhost:5173` in Doctor view.
2. Click **About** briefly to show the honesty ledger, then close it.
3. Click the demo patient on the map.
4. Use the **Demo** controls: **Meet Sarah**, **Lab delay**, **Cardiology overload**.
5. Open **Predictions** if it is not already visible.
6. Click **Resolve**.
7. Switch to **Administrator** view.
8. Click **Optimize the day**.

---

## Lower-Third Captions

- `REAL OPEN HOSPITAL DATA`
- `STATEFUL PATIENT JOURNEY`
- `BLOCKER DETECTED FROM HISTORY`
- `OPS-ONLY RECOMMENDATION`
- `HOSPITAL-WIDE OPS CHIEF`
- `ANY HOSPITAL ADAPTER`

---

## One-Line Close

> "A dashboard sees a queue. FlowTwin remembers the hospital flow that created it."
