# FlowTwin — Product & Visual Design Document

> Working name **FlowTwin** (see §0 for the rename rationale and alternatives).
> This is the design source of truth for the demo UI. Build plan lives in [PLAN.md](./PLAN.md); concept in [idea.md](./idea.md).
> The one-line paste-ready design brief for a prototyping tool (Fable) is in [FABLE_PROMPT.md](./FABLE_PROMPT.md).

---

## 0. Naming

**Problem with "WardFlow":** "Ward" reads clinical and a little institutional/scary (psychiatric ward, "being warded"), and "flow" on its own is generic. We want something clean, calm, professional, and clearly about *operations and movement*, not about being a patient.

**Recommendation — `FlowTwin`** (also already the repo name). It says exactly what the product is: a **live digital twin of your patient flow**. Modern, non-clinical, memorable, and it makes the whole pitch legible in three words. Tagline: *"FlowTwin — a live twin of your hospital's flow."*

**Strong alternatives** (all non-scary, ops-flavored, easy to say):

| Name | Why it works | Watch-out |
|---|---|---|
| **FlowTwin** ✅ | Describes the product; matches repo; "twin follows the patient" | — |
| **Meridian** | Calm, premium; evokes pathways / lines of flow | Common in finance branding |
| **Cadence** | The rhythm and pace of operations; warm | Used by some HR/eng tools |
| **Wayfinder** | Guides each patient's path through the building; hopeful, human | Slightly consumer-app feel |
| **Tempo** | Short, punchy, about throughput and pace | Generic |
| **Throughline** | The connecting thread of a patient's journey | Longer to say |

We'll use **FlowTwin** throughout this doc. Final call is a 5-minute kickoff decision — then never revisit (per PLAN §2.2).

---

## 1. Design principles

The demo lives or dies on how *clean and calm* it looks. Judges should feel they're looking at a real, shippable hospital product — not a hackathon toy.

1. **Calm, clinical-grade minimalism.** Lots of white space, a single restrained accent, no gradients-for-fun, no clutter. Think Linear / Apple Health / modern EHR, not a gamified dashboard.
2. **One thing in focus at a time.** The map holds attention; detail arrives in a side panel, never a modal pile-up.
3. **Everything is explainable.** Every prediction shows *why* (which events, which model, what confidence). Nothing is a magic number.
4. **Motion is meaningful, never decorative.** Agents move because a patient moved; a number slides because state changed. Respect `prefers-reduced-motion`.
5. **Operations, never diagnosis.** The whole product optimizes time, beds, and queues. Care stays with clinicians. This is a visible, load-bearing constraint (NemoGuard badge, ops-only copy).
6. **De-humanize the token, humanize the care.** Patients are represented by neutral **agent glyphs**, not little people — it keeps the tone professional and privacy-respecting and reinforces "this is the *agent* that follows the patient," not surveillance of a person.

**Accessibility:** WCAG-AA contrast, full light + dark themes, keyboard navigable, color never the sole signal (always pair color with icon/label).

---

## 2. Two operating modes — Doctor view vs Administrator view

A top-bar toggle switches the entire lens. Same underlying data, different questions, different affordances. **This is a headline feature** — it shows we understand that a hospital has (at least) two very different users.

### 2.1 Doctor / Clinical-Ops view (default)
The mindset: *"What's happening with the patients in front of me, and what's the next best operational move?"*

- Patient-centric. Deep on the individual: full journey, pending tests, predicted exit, current blocker, the single recommended next action.
- Shows the **"See flow"** journey, intake signals, and the ops recommendation with the NemoGuard "Ops-only ✓" badge.
- **Never shows money.** No cost figures, no staffing-budget language. A doctor doesn't want (and shouldn't be nudged by) cost-per-bed-hour at the point of care.
- Zone loads shown as *clinical* pressure (queue length, longest wait), not dollars.

### 2.2 Administrator view
The mindset: *"Where is the whole hospital bottlenecked, and what reallocation buys the most throughput?"*

- Aggregate-centric. Department loads, bed occupancy, throughput, arrival forecast, cost-of-delay.
- Surfaces optimization plays: *"Cardiology is blocking 4 ER beds; reassigning one cardiologist for 60 min frees ~3h20m of overstay (≈ 2.6 bed-hours, est. €X)."*
- Shows **capacity planning**: predicted arrivals next N hours by entry mode; projected occupancy; where today will break if nothing changes.
- Money and staffing are allowed and central here.

> Design rule: the *same* bottleneck renders as **"90-min cardiology queue delaying Sarah"** for the doctor and **"Cardiology = top avoidable-wait driver, €X/day"** for the admin. One truth, two framings.

---

## 3. Spatial navigation — drill-down, not a flat map

We navigate *into* the building, zooming through levels of detail. A breadcrumb sits top-left; clicking a zone zooms in, `Esc` / breadcrumb zooms out. Each zone shows a live **agent count** and a **load ring**.

```
Hospital  ›  Department / Sector  ›  Specialty region  ›  Room / area
(campus)     (Emergency, Imaging,    (within Cardiology:    (MRI room, ER bay 4,
             Cardiology, Surgery,     cath lab, telemetry,    triage, waiting area,
             Wards, Discharge)        consult bench)          ambulance bay / "outside")
```

- **Level 0 — Hospital:** clean floor-plate of departments as soft rounded zones. Each zone = name, agent count, load ring (green→amber→red), 1-line status.
- **Level 1 — Department:** zoom into e.g. Emergency; see its rooms/areas (triage, bays, waiting, imaging hand-off) with agents positioned in them.
- **Level 2 — Specialty region:** e.g. Cardiology → cath lab / telemetry / consult queue.
- **Level 3 — Room/area:** the individual bay or scanner, with the agents currently there.

Agents **move between zones** as their patient's state changes (arrival → triage → bay → imaging → observation → discharge). On discharge the glyph animates out of the map; its record and memory are **archived** (reachable via the time scrubber and a "Discharged today" list) — the agent keeps its memory, it just leaves the floor.

---

## 4. The agents — bot glyphs, not humans

Each patient is represented by a small **SVG agent glyph** — deliberately *not* a humanoid. Think a soft rounded-square "bot" token with a simple mark (in the spirit of an AI-agent avatar / a friendly sparkle-asterisk), not a stick figure. This keeps the tone professional and privacy-forward and reinforces the core idea: *this is the agent that shadows the patient.*

- **Color = sex:** **blue** for male, **pink** for female. (Neutral fallback grey if unknown.) Color is paired with a letter/icon so it's not the only signal.
- **State ring / accent:** a thin ring encodes delay risk — calm (on-track), amber (at-risk), red (blocked). Subtle pulse only when blocked.
- **Hover → preview tooltip:** name, age, chief complaint, current wait, predicted exit, risk. ~250 ms fade, follows cursor, non-blocking.
- **Click → patient sheet** slides in from the right (see §5).
- **Density:** ~5–8 agents on screen for the demo (one deep, the rest shallow). Clusters near a bottleneck (e.g. Cardiology at the overload beat) read at a glance.

---

## 5. The patient sheet — right-hand detail panel

Clicking an agent opens a clean **right side panel** (the "patient sheet"), overlaying nothing important, dismissible with `Esc` or a click-away. Header: agent glyph, name, age, sex, chief complaint, pathway, a big **predicted-exit chip with confidence**, and the **"Ops-only ✓ (NemoGuard)"** badge.

Three tabs:

### Tab 1 — Flow  *(the "See flow" view; see §6)*
The patient's journey through the hospital: time in each section, what was done, what was decided, and where a decision could be improved.

### Tab 2 — Predictions
- Predicted exit time **with confidence interval** (e.g. *16:50, 80% CI ±40 min*).
- Predicted length-of-stay vs. pathway benchmark.
- **Tests / steps still pending** and the current **blocker**.
- The single **recommended operational action** + expected time saved.
- **Model transparency line:** which model produced this and from what inputs (see §9). Never a bare number.

### Tab 3 — Intake & Signals
- Arrival mode (walk-in / ambulance / referral) and initial complaint.
- **Vocal-biomarker screening** result from the reception conversation (§8) — shown as *screening flags*, clearly labelled non-diagnostic.
- **Wearable / fitness-tracker** import (HR, HRV, SpO₂, overnight arrhythmia flags, activity) if the patient shared it.
- How these signals **shifted the prediction or suggested a step** (e.g. "overnight arrhythmia flag → cardiology consult pre-ordered").

---

## 6. The Flow view — journey + optimization overlay

The centerpiece of the Doctor view and the most "wow" screen. A horizontal **journey timeline** of the patient's path: each segment is a zone the patient sat in, sized by minutes spent, annotated with what happened (bloods ordered, imaging done, consult requested) and what was decided.

Two layers, toggleable:

1. **Actual path** — what really happened, with time-in-each-section and total.
2. **Optimized path (FlowTwin suggestion)** — a ghosted overlay showing where a decision could have been made earlier or differently, with the time saved called out.

Examples of the optimization callouts (drive the "we can also show improvements" ask):
- *"Troponin could have been ordered at triage instead of after bed assignment → −35 min."*
- *"Wearable showed overnight arrhythmia → cardiology consult could have been pre-ordered at arrival → −50 min."*
- *"Patient was medically ready to move 40 min before the bed was requested → −40 min ER occupancy."*

Each callout is tagged **operational** (never "wrong diagnosis" — always "sequence/timing could improve"), keeping us safely on the ops side of the line. We ship **multiple simulated tracks** (§11) so we can show both a clean journey and a fixable one.

---

## 7. Time scrubber — the last 7 days + today

A slim **timeline scrubber** pinned to the bottom. Dragging it re-renders the *entire* hospital state at that moment: agent positions, zone loads, predictions, blockers. This is how we "show state changes over time" and "click through a patient's full history."

- **Range:** the pre-loaded **7 days of history** + **today** (live/sim).
- **Preset jumps:** `2 AM` (quiet) · `Morning rounds` · `Lunchtime` · `Shift change 18:00` — each a very different-looking hospital, which reads beautifully on stage.
- **Play / pause / speed:** animate forward through time; agents flow between zones.
- **Beat markers:** the scripted demo beats (lab delay, cardio overload) are pinned as ticks so the presenter can jump precisely.
- **Per-patient history:** with a patient sheet open, the scrubber scopes to that patient's timeline so you can replay just their journey.

The scrubber *is* the sim clock — it unifies "presenter pacing control" (PLAN §2.2) with "historical playback."

### 7.1 Open dataset backbone (real data, not synthetic)

The 7-day history and the patients are **seeded from open hospital datasets**, so LOS distributions, acuity mix, and arrival patterns are real. Options, best-fidelity first:

| Dataset | What it gives us | Access | Use |
|---|---|---|---|
| **MIMIC-IV-ED** (PhysioNet, ~425k ED stays, BIDMC 2011–2019) | Triage acuity (ESI 1–5), chief complaint, vitals, ED arrival/discharge times → real journeys + LOS | Free but **credentialed** (short CITI training + DUA); redistribution-restricted, so we load locally, never commit | Primary if a teammate gets credentialed in time |
| **Synthea** (synthetic, fully open, license-free) | Full longitudinal encounters with timestamps; generate any volume of realistic journeys | Open, no credentialing | Fast, safe fallback for the flow view + scrubber |
| **`infinite-dataset-hub/HospitalAdmissions`** (Hugging Face) | Demographics, diagnosis, admit/discharge dates, LOS, outcome label | Open, immediate `datasets.load_dataset` | Quick LOS/ETA-model + Admin KPIs (lacks intra-stay event times) |
| Iran teaching-hospital ED (ScienceDirect, open-access) | `ED_triage` / `ED_admission` / `services` event tables | Open download | Extra event-level flow texture |

**Honesty note:** MIMIC data is *not* redistributable — it stays local and is gitignored (never pushed). Where we synthesize to fill gaps (e.g. exact room-level positions the datasets don't record), we say so. See §14 for the "which dataset" decision.

---

## 8. Intake & data sources

**The real data backbone is an open hospital dataset** (see §7.1 below), not synthetic. Every patient's intake — demographics, arrival mode, chief complaint, triage acuity, vitals, timestamps, and length-of-stay outcome — comes from real records, which is what makes the flow view and the predictions credible on stage.

The **Intake & Signals** tab surfaces those fields, and *names additional data sources the platform can plug in* — we **mention** these to show the vision; we do **not build** them for the demo:

- **Wearable / fitness-tracker** data (HR, HRV, SpO₂, overnight arrhythmia flags, activity) — one example extra input a patient could share at intake.
- **Vocal biomarkers** — an emerging field where a short reception conversation yields *non-diagnostic screening flags* (stress, respiratory, cognitive). Grounded in real work (e.g. **Klick Labs 2023** diabetes-from-voice; Sonde/Canary/Vocalis). **Mention only** — presented as "one more signal we could fuse in," always labelled *"screening, not diagnosis,"* and (like everything) it would run **on-prem** so voice never leaves the building.

Framing rule for any mentioned source: operational triage support, never diagnosis; ops-gated by NemoGuard; sovereign by design (§10).

**Demo beat:** open a patient's **Intake** tab → the real dataset fields populate; a small "additional sources" row shows *example* wearable / vocal-biomarker inputs as pluggable (greyed "available" chips), making the point without us building them.

---

## 9. Prediction models — what we use, and how honest we are about it

The user asked us to be **very clear about which models power which number**. We are. Three prediction surfaces, each labelled in-UI:

| Surface | What it predicts | How (demo) | Shown as |
|---|---|---|---|
| **FlowTwin ETA** *(our model)* | Remaining time / predicted exit for a patient | Lightweight **quantile regression / survival** over the 7-day event log; features: pathway, arrival mode, current zone, elapsed wait, live resource state, time-of-day, intake/wearable flags | Exit time **+ confidence interval** (e.g. 16:50, 80% CI ±40 min) |
| **FlowTwin Arrival Forecast** *(our model)* | Patients arriving next N hours, by entry mode | Historical time-of-day/day-of-week rates from the 7-day log | Admin view: expected arrivals + occupancy projection |
| **Reasoning / recommendation** | Blocker, next best operational action, hospital-wide insight | **Gemini** (stateful Interactions chain per patient) + **Antigravity** Ops Chief over the event log | Plain-language action + explanation |

**Confidence & calibration (the "how far off are we" ask):** because we hold the 7-day history *with known outcomes*, we can show a live **calibration readout** — e.g. *"80% interval covered 82% of past cases; median error ±22 min."* That turns "trust me" into "here's our track record," which is exactly what an administrator wants.

**Honesty rules:**
- The ETA and arrival models are **lightweight statistical models over the operational log** — not black boxes, not clinical inference. We say so.
- We never predict a medical outcome — only *operational timing and flow*.
- Where a number is model-derived, the UI names the model. No anonymous magic.

---

## 10. Data sovereignty & local hosting (+ the Gemma roadmap)

A first-class pitch pillar, not a footnote. **Hospitals cannot ship patient data to arbitrary clouds.** FlowTwin is designed sovereign:

- **On-prem models:** PersonaPlex (patient voice), Nemotron (department fleet), NemoGuard (safety gate), and the vocal-biomarker screening are **open models that run inside the hospital**. Voice and PHI never leave the building.
- **What leaves (today, honestly):** the frontier reasoning calls (Gemini/Antigravity) run in the cloud but carry only **de-identified operational metadata** — timings, queue states, resource counts — not names or clinical detail. We say this plainly; it's the difference between a demo and a deployable system.
- **The roadmap narrative — Gemma (do NOT build on it; position it):** *"Today we split frontier-cloud reasoning from on-prem open models. In 2–3 years, open on-device models like **Gemma** will be capable enough to run the entire stateful-agent layer **inside the hospital**, on the hospital's own hardware — and then nothing leaves the building at all. FlowTwin is architected for that day: swap the reasoning endpoint from cloud Gemini to local Gemma and the whole system goes fully sovereign."*

Place the Gemma line on the **closing/roadmap slide** and mention it once when explaining model tiering. It flatters Google, reinforces sovereignty, and gives a credible "where this goes" without us having to build it now.

---

## 11. Patient tracks (for the demo)

Seeded from the open dataset (§7.1) and pinned so the demo is deterministic (PLAN §2.2); each track showcases a different capability:

1. **Sarah M., 58, chest pain — the hero, fixable delay.** Clean arrival, then lab delay + cardiology overload push her exit out; the "See flow" optimization overlay shows −35/−50 min opportunities; one tap (Computer Use) resolves it. Voiced via PersonaPlex.
2. **Near-optimal track — a control.** A patient whose journey was near-ideal, so the optimization overlay shows almost no waste — proves the tool isn't just crying wolf.
3. **Extra-signal track (illustrative).** A patient whose Intake tab shows an *example* pluggable source (wearable arrhythmia flag) that *would* let FlowTwin pre-order a consult earlier. We **mention** the source, not build it — it makes the "richer inputs" point without new scope.

All tracks appear across the 7-day scrubber as historical journeys too, so the hospital-history story (recurring 14:00–17:00 cardiology backup) is grounded in real data, not a slide.

---

## 12. Visual system spec

- **Layout:** left = drill-down map (dominant), right = collapsible patient sheet, top = view toggle + breadcrumb + global status, bottom = time scrubber.
- **Color:** near-white / soft-neutral canvas; **one** calm accent (recommend a medical teal or calm blue) for interactive/primary; semantic set — green (on-track), amber (at-risk), red (blocked). Agent sex: blue (M) / pink (F) / grey (unknown), always paired with a label. Full dark theme.
- **Type:** one clean humanist sans (e.g. Inter). Generous line-height. Numbers tabular so predictions don't jitter as they update.
- **Components:** zone card (name / count / load ring / status), agent glyph, hover tooltip, patient sheet w/ tabs, journey timeline (actual + ghost overlay), prediction chip w/ CI, calibration readout, NemoGuard badge, scrubber with beat markers, view toggle, department/admin KPI tiles.
- **Motion:** agent zone-to-zone tween (~600 ms ease), number slide on state change, panel slide-in (~200 ms). Nothing gratuitous. Honor reduced-motion.
- **Empty/loading/fallback states** designed for every panel (the demo must look composed even if an API is slow — PLAN §2.2).

---

## 13. Screen inventory (what the prototype must contain)

1. **Hospital overview** (Level 0) — Doctor view, calm state.
2. **Department drill-down** (Levels 1–3) with breadcrumb + agent counts.
3. **Patient sheet** — all three tabs (Flow / Predictions / Intake & Signals).
4. **Flow view** with actual + optimized overlay and callouts.
5. **Administrator view** — hospital KPIs, bottleneck + reallocation play, arrival forecast, cost-of-delay.
6. **Time scrubber** with the four preset jumps and beat markers.
7. **Intake moment** — a patient's Intake tab populating from the open dataset, with example wearable / vocal-biomarker sources shown as greyed "pluggable" chips (mention, not built).
8. **Resolve-delay moment** — recommendation → one tap → agent moves on the map (ties to the Computer Use beat).
9. **Import-history moment** — the "load last 7 days" ingestion that visibly calibrates the models.
10. **Closing/architecture + sovereignty/Gemma-roadmap** slide surface.

---

## 14. Decisions (locked from team feedback) + what's still open

**Locked:**
1. **Name** — decide later; **FlowTwin** stays as the working name (alternatives in §0).
2. **Views** — **Doctor + Administrator only.** No nurse view.
3. **Agent glyph** — **color = sex** (blue M / pink F / grey unknown), delay-**risk on the ring**, always paired with a label so color isn't the sole signal.
4. **Data** — **real open datasets** (§7.1), downloaded (HF / PhysioNet), **not synthetic**. Kept local, gitignored.
5. **Wearables + vocal biomarkers** — **mention only, do not build.** Shown as greyed "pluggable source" chips on the Intake tab (§8).
6. **Fable** — the target is the **Fable model** (Anthropic); FABLE_PROMPT.md is written for a model that generates the prototype/code directly.
7. **Live, not scripted** — genuinely wired to Gemini + Nemotron on stage. **API keys go in `.env` (already gitignored — never pushed).**

**Still open (not blocking):**
- **Which dataset to commit to:** start on **Synthea + `infinite-dataset-hub/HospitalAdmissions`** (open, immediate), and swap in **MIMIC-IV-ED** *if* a teammate completes PhysioNet credentialing in time. Confirm who owns the download.
- **Map source:** stylized floor plan (recommended, fast) vs. realistic layout.
