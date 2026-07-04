# FlowTwin — a live twin of your hospital's flow

Every patient gets a stateful **AI agent** that shadows them from arrival to discharge, remembers the whole journey, predicts when they'll leave (with a confidence interval), spots where the flow is stuck, and suggests the next operational move. **Operations only — time, beds, and queues. Care stays with clinicians.**

This repo contains the **interactive clickable prototype** built for the RAISE hackathon (Google DeepMind track × NVIDIA Nemotron): a responsive, keyboard-navigable, light+dark web app running a deterministic simulation over real open hospital datasets. No live API calls in this build — the full live architecture (Gemini Interactions chains, Antigravity Ops Chief, PersonaPlex voice, NemoGuard gating, Computer Use on a legacy EHR) is specified in [PLAN.md](./PLAN.md).

## Quickstart (30 seconds)

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

Production build: `npm run build` → static site in `frontend/dist/` (relative base — host anywhere).

## The demo, click by click

1. **Calm overview** — Doctor view, 11:00. Seven agents on the floor, load rings green.
2. **Meet Sarah** — click her glyph in the Cardiology consult queue (or use the `DEMO` rail, bottom right). The patient sheet shows her journey, predicted exit **14:20 · 80% CI**, and the "Ops-only ✓ NemoGuard" badge.
3. **Lab delay** (demo step 2, sim 12:30) — her exit slides to 15:05, ring turns amber, blocker: "troponin re-run — chemistry congestion".
4. **Cardiology overload** (step 3, sim 14:00) — three more chest-pain arrivals hit the consult queue *on their own seeded tracks* exactly as the recurring 14:00–17:00 backup window opens: 4 queued, ring red, Sarah's exit 16:50 ±40.
5. **Flow tab → "Optimized path"** — the ghost overlay shows −35/−50/−40 min timing/sequence opportunities (never "wrong diagnosis"). Jacquelin P. is the near-optimal control track — no waste flagged.
6. **Resolve** (step 4) — one action: Sarah visibly moves to Observation (bed O-12), consult coverage escalates 60 min, exit recovers to 16:05.
7. **Administrator view** (toggle, or `V`) — the same bottleneck as a reallocation play with cost-of-delay (€45/bed-hour, stated assumption), arrival forecast by entry mode, avoidable-wait ranking. Money lives **only** here — the Doctor view never shows it.
8. **Time scrubber** — drag across 7 days of history; presets (2 AM · Morning rounds · Lunchtime · Shift change 18:00) each look visibly different; the afternoon cardiology backup recurs every day.
9. **Intake & Signals** — real dataset fields; Gerda W. carries an example wearable import (overnight-arrhythmia flag, "screening, not diagnosis"); wearable/vocal-biomarker chips are greyed **pluggable, mention-only** sources.

Keyboard: `Esc` close/zoom out · `Space` play/pause · `←/→` scrub (`Shift` ×6) · `V` view · `T` theme · `1–4` presets.

## Honesty (also shown in-UI, About → Data honesty)

- **Real (Synthea open synthetic records):** identities, sex, age, chief complaints — 817 ED encounters.
- **Real (HF `infinite-dataset-hub/HospitalAdmissions`):** admitted length-of-stay benchmark + outcome mix (n=91).
- **Synthesized and labeled:** arrival hours (ED diurnal curve — the Synthea sample's encounter hours are generator batch artifacts), station-level times, vitals, and the recurring afternoon cardiology backup. No open dataset records ED boarding at station level (MIMIC-IV-ED planned).
- **Every model-derived number names its model** — "FlowTwin ETA — empirical quantile model over the 7-day log", "FlowTwin Arrival Forecast".
- **Calibration shown live:** the 80% interval covered ~81% of 455 past journeys, median error ±13 min — because history has known outcomes, the model shows its track record.

Rebuild the seed deterministically: `python3 data/build_seed.py` (see [data/README.md](./data/README.md); raw downloads are gitignored).

## Visual direction

The brief asked for 2–3 candidate directions before building. Considered:

1. **Clinical Calm** *(chosen — locked by [DESIGN.md](./DESIGN.md))* — Linear × Apple Health: near-white/near-black planes, one teal accent, reserved status colors, tabular numbers, hairline geometry, meaningful motion only.
2. *Mission Control* — dark-first, denser telemetry, stronger data-ink. Rejected: reads "dashboard toy", not a shippable clinical product.
3. *Paper Ward* — warm neutrals, softer cards, illustrated glyphs. Rejected: undercuts the precision story the calibration readout needs.

Palettes were validated programmatically (CVD separation, chroma, contrast) against both surfaces; sex encoding (blue M / pink F / grey unknown) always pairs with a letter so color is never the only signal.

## Architecture (prototype)

```
frontend/
  src/sim/        time model · floor-plate geometry · demo beats · the engine
                  (pure worldAt(t) → agents, zone loads, sheet + admin view-models)
  src/store.ts    zustand UI state (view, sim clock, zoom path, selection, resolve)
  src/components/ map/ (drill-down SVG) · sheet/ (3 tabs) · admin/ · scrubber/ · chrome/ · ui/
  src/styles/     design tokens (light+dark, reduced-motion collapse)
data/
  build_seed.py   deterministic seed builder (seed=42, anchor 2026-07-04T11:00)
  seed/           patients_today · history_7d (455 journeys) · scenario · admin_kpis
```

Everything on screen is a pure function of `(simMinute, resolvedAt)` — scrubbing is perfectly reversible and the demo can never desync.

## Sovereignty (the closing slide)

On-prem open models (PersonaPlex voice, Nemotron department fleet, NemoGuard ops-gate) keep voice and patient data inside the hospital; frontier reasoning sees only de-identified operational metadata. As on-device open models (Gemma) mature, the entire agent layer runs fully in-hospital — swap the reasoning endpoint and nothing leaves the building.

*Gemini runs the agents. Nemotron runs the hospital.*
