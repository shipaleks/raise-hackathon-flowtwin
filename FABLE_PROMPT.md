# Fable prompt — FlowTwin interactive prototype

Copy everything between the rules below into Fable. Full design rationale is in [DESIGN.md](./DESIGN.md).
It deliberately ends by asking Fable to **ask you clarifying questions and propose 2–3 visual directions before building**.

---

You are designing an interactive, clickable, lightly-animated web prototype for a hospital-operations product called **FlowTwin**. Before you build anything, read this whole brief, then (a) ask me your top clarifying questions, and (b) propose 2–3 distinct visual directions with a sentence each. Only after I pick a direction, generate the prototype with realistic pre-populated (simulated) data so it feels alive on stage.

## What FlowTwin is (in two sentences)
Every patient in a hospital gets a stateful **AI agent** that shadows them from arrival to discharge, remembers the whole journey, predicts when they'll leave (with a confidence interval), spots where the flow is stuck, and suggests the next operational move. It is an **operations** tool — time, beds, and queues — never diagnosis or treatment.

## Aesthetic — the single most important thing
Calm, clinical-grade minimalism. Think Linear × Apple Health × a modern EHR: lots of white space, one restrained accent color, tabular numbers, meaningful motion only, full **light and dark** themes, WCAG-AA contrast, respects reduced-motion. It must look like a real, shippable product, not a hackathon toy. No decorative gradients, no clutter.

## Layout
- **Top bar:** product name + a prominent **view toggle: "Doctor" ↔ "Administrator"**, a breadcrumb, and a global status line.
- **Center (dominant):** a **drill-down hospital map**.
- **Right:** a collapsible **patient sheet** (slides in on click, dismiss with Esc / click-away).
- **Bottom:** a slim **time scrubber**.

## Drill-down map (navigate *into* the building)
Levels: **Hospital → Department/Sector → Specialty region → Room/area.** Click a zone to zoom in; breadcrumb / Esc to zoom out. Examples: Emergency, Imaging, Cardiology, Surgery, Wards, Discharge → inside Cardiology: cath lab / telemetry / consult queue → inside those: individual bays/scanners, triage, waiting area, and an ambulance bay labelled "outside". Each zone shows a live **agent count** and a **load ring** (green → amber → red) with a one-line status.

## The agents (patients) — bot glyphs, NOT little humans
Represent each patient as a small, neutral **SVG "agent" glyph** — a soft rounded-square bot token with a simple mark (in the spirit of a friendly AI-agent avatar / sparkle), deliberately not a stick figure. 
- **Color encodes sex:** blue = male, pink = female, grey = unknown (always paired with a small label so color isn't the only cue).
- A thin **state ring** encodes delay risk: calm / amber / red (subtle pulse only when blocked).
- **Hover → preview tooltip:** name, age, chief complaint, current wait, predicted exit, risk.
- **Click → opens the patient sheet** on the right.
- Agents **move between zones** as their state changes; on discharge the glyph animates off the map (its record stays in history).

## Patient sheet — 3 tabs
Header: agent glyph, name, age, sex, chief complaint, pathway, a big **predicted-exit chip with a confidence interval** (e.g. "16:50 · 80% CI ±40 min"), and a small **"Ops-only ✓ (NemoGuard)"** safety badge.
1. **Flow** — a horizontal **journey timeline** of the path through the hospital: each segment = a zone, sized by minutes spent, annotated with what was done/decided. Add a toggle for an **"Optimized path"** ghost overlay that shows where a step could have happened earlier, with the time saved (e.g. "Troponin at triage instead of after bed → −35 min", "Wearable showed overnight arrhythmia → consult could be pre-ordered → −50 min"). Frame every callout as *timing/sequence could improve*, never "wrong diagnosis".
2. **Predictions** — predicted exit + CI, predicted length-of-stay vs pathway benchmark, tests/steps still pending, current blocker, the single recommended operational action + expected minutes saved, and a small **"model" line** naming what produced the number (e.g. "FlowTwin ETA model — quantile regression over 7-day log").
3. **Intake & Signals** — the real intake fields (arrival mode: walk-in / ambulance / referral; chief complaint; triage acuity; vitals) drawn from the dataset, plus a small **"Additional sources"** row showing *example pluggable inputs* as greyed "available" chips — **wearable / fitness-tracker** and **vocal biomarkers** (labelled "screening, not diagnosis"). These are shown to convey the vision; treat them as mention-only, not active features.

## Two views (same data, different lens)
- **Doctor view (default):** patient-centric, deep on the individual, the "See flow" journey, next best operational action. **Show no money/cost anywhere.**
- **Administrator view:** hospital-wide KPIs — department loads, bed occupancy, throughput, an **arrival forecast** ("expected arrivals next 3h by entry mode"), and a bottleneck + reallocation play with cost-of-delay (e.g. "Cardiology blocks 4 ER beds; move 1 cardiologist 60 min → free ~3h20m overstay ≈ €X"). Money is allowed and central here.

## Time scrubber
A slim bottom timeline covering **7 days of history + today**. Dragging it re-renders the whole hospital at that moment (agent positions, loads, predictions). Include **preset jumps: 2 AM · Morning rounds · Lunchtime · Shift change 18:00** — each should look visibly different. Play/pause to animate forward; pinned tick markers for key demo moments. With a patient sheet open, the scrubber scopes to that patient's own history.

## Calibration & honesty (shown in-UI)
Because history has known outcomes, show a small **calibration readout**, e.g. "80% interval covered 82% of past cases; median error ±22 min." Every model-derived number names its model. Never predict medical outcomes — only operational timing/flow.

## Sovereignty note (closing surface)
Include a closing/architecture surface with the line: on-prem open models keep voice + patient data inside the hospital; frontier reasoning sees only de-identified operational metadata; and a roadmap note that "as on-device open models (Gemma) mature, the entire agent layer runs fully in-hospital." (Narrative only.)

## Demo flow the prototype should support (make these clickable in order)
1. Calm hospital overview (Doctor view). 2. Click patient "Sarah M." → sheet with journey + prediction. 3. Trigger a lab delay → her predicted exit slides later, ring turns amber. 4. Cardiology overload → agents cluster near Cardiology, Sarah goes red. 5. Open the **Flow** tab → show the optimized-path overlay and time saved. 6. **Resolve** → one action → Sarah's agent visibly moves to Observation on the map. 7. Toggle to **Administrator view** → the same bottleneck as a reallocation play with cost-of-delay. 8. Drag the **time scrubber** across the 7-day history to show the recurring afternoon cardiology backup. 9. Show the **Intake** moment: open a patient's **Intake** tab → the real dataset fields populate, with the "Additional sources" row showing example wearable / vocal-biomarker chips as *pluggable* (mention, not active).

## Data
Seed from **real open hospital datasets** (not invented): **Synthea** (fully open synthetic journeys with timestamps) and **`infinite-dataset-hub/HospitalAdmissions`** on Hugging Face (demographics, admit/discharge, length-of-stay), optionally **MIMIC-IV-ED** if available. Fields: demographics, arrival mode, chief complaint, triage acuity, vitals, timestamps, length-of-stay. Pre-populate ~5–8 current patients (one deep = a chest-pain "Sarah", the rest shallow) plus 7 days of historical journeys so nothing looks empty and the LOS/wait distributions look real. Include one **fixable-delay** track (Sarah), one **near-optimal** track (so the tool isn't crying wolf), and one **extra-signal** track whose Intake tab shows an example pluggable source. For a static prototype, representative rows from those datasets are fine.

## Deliverable
A responsive, keyboard-navigable, light+dark clickable prototype with smooth but restrained motion, plus every empty/loading state designed. 

**Now: ask me your clarifying questions and propose 2–3 visual directions before you build.**
