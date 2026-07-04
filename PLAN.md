# FlowTwin — 2-Day Hackathon Build Plan

> **RAISE hackathon · Google DeepMind track (Statement Four, in-person) · NVIDIA mentorship (Nemotron prize)**
> Concept: [idea.md](./idea.md) · Product & visual design: [DESIGN.md](./DESIGN.md) · Prototype brief: [FABLE_PROMPT.md](./FABLE_PROMPT.md).
> This plan turns the concept into a buildable 48-hour execution schedule.
>
> **Renamed from "WardFlow" → `FlowTwin`** ("Ward" read clinical/scary; FlowTwin = a live digital twin of your patient flow, and matches the repo). Alternatives + rationale in [DESIGN.md §0](./DESIGN.md#0-naming).

---

## 0. TL;DR

We build **FlowTwin**: a virtual hospital where every patient is a **stateful agent** that remembers the whole journey, predicts delays, and acts on legacy hospital software. The architecture splits into two planes with one sentence that carries the entire pitch:

> **Gemini runs the agents. Nemotron runs the hospital.**

- **Google plane (load-bearing):** every patient's memory is a server-side stateful chain in the **Interactions API**; the **Antigravity agent** is the "Ops Chief" doing real code-level analysis over the accumulated event log; **Gemini Computer Use** fires *because* the state detects a bottleneck, and clicks through a simulated legacy EHR. **Live Translate** (stretch) feeds multilingual intake into the same state.
- **NVIDIA plane (creative Nemotron usage):** **PersonaPlex** gives every patient a literal full-duplex voice you can talk to (persona generated from live agent state); a fleet of **Nemotron 3 Nano** micro-agents simulates the departments; **NemoGuard Topic Control / Content Safety** enforces the "operations only, never medical advice" boundary; **Nemotron Parse** (stretch) ingests the paper ambulance handoff form.

Demo = one patient's journey (Sarah, chest pain) from arrival to freed ER bed, with one live conversation with the patient herself, one Computer Use action on the EHR, and one system-level insight from Antigravity.

---

## 1. Why this wins both tracks

### 1.1 Google DeepMind Statement Four — the exact scoring rubric

The statement asks for an agent that **"can't get away with"** working from a snapshot, where the chosen primitive is **load-bearing**, and it's **"stronger still if the second primitive only fires because the first is already running."**

Our causal chain answers it verbatim:

1. **Interactions API state is load-bearing.** A patient's delay, its cause, and the right next action are *undefined* without the event history. Remove `previous_interaction_id` and FlowTwin collapses into a static dashboard — we say this out loud in the pitch and show it (a "snapshot-only" toggle that produces a uselessly generic answer is a 30-min nice-to-have, killer if we have time).
2. **The Antigravity agent** (`antigravity-preview-05-2026`) is used for what it's uniquely good at: a persistent sandbox (`environment_id` reused across the whole demo) where it **runs real Python over the accumulated event log** to compute the hospital-wide insight ("Cardiology blocks 4 ER beds; reassigning one cardiologist for 60 min saves 3h20m of overstay") and writes the shift-change report as a file. Not a chat wrapper — an agent doing analysis with code.
3. **Computer Use fires only because state crossed a threshold.** Patient-agent detects "stable + waiting on cardiology + ER bed occupied" → recommendation → staff one-tap → Gemini 3.5 Flash with the `computer_use` tool visibly clicks through **MediTrack Classic** (our deliberately-legacy EHR web app): moves Sarah to Observation, escalates the consult, assigns bed O-12. Second primitive triggered by the first. ✓
4. **Live Translate** (stretch): intake in Spanish/French streams through `gemini-3.5-live-translate-preview`, extracted facts append into the same patient chain — a third primitive feeding the first.

### 1.2 NVIDIA — "best usage of Nemotron, be creative"

Four uses, ranked by demo value; the mentors' own PersonaPlex hint is #1:

| # | Nemotron piece | Role in FlowTwin | Why it's creative, not bolted-on |
|---|---|---|---|
| 1 | **PersonaPlex** (`nvidia/personaplex-7b-v1`, self-hosted) | **"Talk to the patient."** Click any patient-agent → full-duplex voice conversation. The persona prompt is *generated live from the Interactions API state* ("You are Sarah M., 58, chest pain, stable, waiting 100 min for cardiology, tired but cooperative…"). A judge can ask her how long she's waited and she knows. What the nurse learns ("pain is worse") is logged back into the agent state. | The stateful agent gets a literal voice; the two sponsor tracks feed each other in one demo beat. Mentors suggested this repo themselves. |
| 2 | **NemoGuard** (`nvidia/llama-3.1-nemoguard-8b-topic-control`, `…-content-safety`) | Every recommendation and every persona prompt passes a topic-control gate with the policy: *operational logistics only — never diagnosis, treatment, or medication advice*. UI shows a small "Ops-only ✓ (NemoGuard)" badge. | Directly kills the #1 risk in idea.md ("sounds like a medical product") — safety by construction, exactly what a hospital deployment would demand. |
| 3 | **Nemotron 3 Nano fleet** (`nvidia/nemotron-3-nano-30b-a3b` via `integrate.api.nvidia.com/v1`) | Each department (Triage, Lab, Radiology, Cardiology…) is a cheap micro-agent generating events, load reports, and staff replies. The world simulation brain. | Right-size-model story: frontier Gemini for the agents, open 30B-A3B MoE for the hundreds of small world-sim calls. Judges from *both* companies like cost-tiering. |
| 4 | **Nemotron Parse** (`nvidia/nemotron-parse`) — stretch | Photo of the paper ambulance handoff form → structured fields → the patient-agent is *born* from a document. | Hospitals run on faxes. One authentic beat, one API call. |

**Enterprise kicker for the pitch:** hospitals can't ship PHI to arbitrary clouds. PersonaPlex + Nemotron are *open models that run on-prem* — the patient-voice and safety layers never leave the building. Say this on the closing slide.

---

## 2. System architecture

```
┌─────────────────────────────  FlowTwin UI (React + Vite)  ─────────────────────────────┐
│  Hospital map (SVG, animated patient dots) · Patient card · Dept card · Event feed     │
│  [Talk to patient 🎙] [Resolve delay ▶] [Simulate: lab delay / cardio overload / …]    │
└──────────────▲──────────────────────────────────────────────────────▲──────────────────┘
               │ WebSocket (state pushes)                             │ WebRTC/audio tab
┌──────────────┴──────────────── Orchestrator (FastAPI) ──────────────┼──────────────────┐
│                                                                     │                  │
│  Simulation engine ── tick clock (1 tick = 5 sim-min), scripted     │   PersonaPlex    │
│  scenario.json backbone + Nemotron Nano dept agents for texture     │   server (GPU    │
│                                                                     │   box or Mac     │
│  Patient-Agent Manager ── one stateful Interactions chain per       │   MLX port)      │
│  patient (gemini-3.5-flash, previous_interaction_id), returns       │   persona prompt │
│  ops-state JSON → validated (pydantic) → pushed to UI               │   ← built from   │
│                                                                     │   live state     │
│  NemoGuard gate ── topic-control + content-safety on every          │                  │
│  outbound recommendation / persona prompt                           │                  │
│                                                                     │                  │
│  Ops Chief ── Antigravity agent, persistent environment_id,         │                  │
│  event-log CSV → pandas analysis → system insight + shift report    │                  │
│                                                                     │                  │
│  Action Executor ── Computer Use loop (gemini-3.5-flash +           │                  │
│  Playwright, visible browser window) → MediTrack Classic            │                  │
└──────────────────────────────┬──────────────────────────────────────────────────────────┘
                               │ drives (clicks, types)
              ┌────────────────▼────────────────┐
              │  MediTrack Classic — fake legacy │   deliberately ugly Bootstrap-2000s
              │  EHR bed board (separate app)    │   bed board + consult queue + patient list
              └──────────────────────────────────┘
```

### 2.1 Patient ops-state (single source of truth per patient)

Keep the schema from idea.md §10, trimmed to what the UI renders:

```json
{
  "patient_id": "P-1042",
  "name": "Sarah M.", "age": 58, "complaint": "chest pain",
  "pathway": "Chest Pain Rule-Out",
  "current_department": "Emergency",
  "events": [{"t": "10:05", "type": "arrival", "dept": "Emergency"}, ...],
  "pending": ["cardiology_review", "observation_bed"],
  "resources": {"er_bed_min": 220, "nurse_min": 42, "doctor_min": 22, "labs": 1, "imaging": 1},
  "predicted_exit": "18:05",
  "delay_risk": "high",
  "blocker": "cardiology_queue",
  "recommendation": {"action": "move_to_observation", "explanation": "...", "impact_min": 45},
  "guard": {"topic_ok": true, "safety_ok": true}
}
```

The **authoritative copy lives in the Interactions chain** (the model maintains and returns it each turn); the orchestrator keeps the last validated copy as cache so the UI never blocks on API latency.

### 2.2 Key design decisions (decide once, don't revisit)

- **Scripted backbone, generated texture.** The demo scenario (Sarah + 4 background patients, lab delay at T+90, cardiology overload at T+150) lives in `scenario.json` and always plays the same. Nemotron Nano adds flavor text and answers unscripted judge questions. *Never let an LLM decide whether the demo works.*
- **Sim clock is controllable:** play / pause / jump-to-next-beat buttons. Presenter drives pacing.
- **One patient fully deep (Sarah), 4–6 background patients shallow** (state chains but no PersonaPlex voices except Sarah + maybe one more).
- **Frontend never calls LLMs directly.** Everything through the orchestrator WS; every LLM call has a timeout + cached-state fallback, so the UI is always demoable even if APIs melt.
- **MediTrack is optimized for Computer Use reliability:** big buttons, high contrast, stable layout, fixed 1280×800 viewport, no animations. It should *look* legacy and *behave* deterministic.
- Name: **FlowTwin** (matches the repo; subtitle *"a live twin of your hospital's flow"*). Alternatives (Meridian, Cadence, Wayfinder) in [DESIGN.md §0](./DESIGN.md#0-naming). Decide in 5 minutes at kickoff, then never again.

### 2.3 Product & UX design (full detail in [DESIGN.md](./DESIGN.md))

The demo wins on how **clean and calm** it looks — clinical-grade minimalism (Linear × Apple Health × modern EHR), light+dark, meaningful motion only. Decisions that affect the build:

- **Drill-down map, not a flat plan.** Navigate *into* the building: **Hospital → Department/Sector → Specialty region → Room/area** (breadcrumb + Esc to zoom out). Each zone shows a live agent count + load ring (green→amber→red).
- **Patients are neutral bot glyphs, not humans.** A soft rounded-square SVG "agent" token (blue = male, pink = female, grey = unknown, always paired with a label; a thin ring encodes delay risk). **Hover → preview tooltip; click → right-hand patient sheet.** On discharge the glyph animates off the map; its memory is archived (reachable via the scrubber).
- **Patient sheet = 3 tabs:** **Flow** (the "See flow" journey timeline with an **Optimized-path ghost overlay** showing where a step could've happened earlier + minutes saved), **Predictions** (exit time + confidence interval, pending steps, blocker, recommended action, and a model-transparency line), **Intake & Signals** (arrival mode, vocal-biomarker screening flags, wearable data).
- **Two operating views (top-bar toggle):** **Doctor** (patient-centric, next best operational action, *no money shown*) and **Administrator** (hospital-wide loads, throughput, arrival forecast, bottleneck + reallocation play with cost-of-delay). Same truth, two framings.
- **Time scrubber (bottom):** covers **7 days of history + today**; preset jumps (2 AM · Morning rounds · Lunchtime · Shift change 18:00) each look visibly different; play/pause animates flow; beat markers pin demo moments. This *is* the sim clock (subsumes PLAN §2.2 "jump-to-beat").
- **Data backbone = real open datasets, not synthetic:** **Synthea** + **`infinite-dataset-hub/HospitalAdmissions`** (HF), plus **MIMIC-IV-ED** if a teammate credentials in time — real demographics, chief complaint, acuity, vitals, timestamps, LOS ([DESIGN §7.1](./DESIGN.md#71-open-dataset-backbone-real-data-not-synthetic)). Raw data stays local (gitignored).
- **Intake extras are mention-only:** **wearables + vocal biomarkers** appear as greyed "pluggable source" chips on the Intake tab — shown to convey the vision, **not built** (DESIGN §8).
- **Prediction models, named in-UI:** **FlowTwin ETA** (our lightweight quantile/survival model over the 7-day log → exit time + CI) and **FlowTwin Arrival Forecast** (our historical-rate model); reasoning/recommendations from Gemini + Antigravity. A live **calibration readout** ("80% interval covered 82% of past cases; median error ±22 min") answers "how far off are we". Never a black box, never a clinical outcome.
- **Import-history moment:** a visible "load last 7 days" ingestion that calibrates the models — real synthetic data driving real predictions, not a fake animation.

### 2.4 Sovereignty & the Gemma roadmap (pitch pillar)

Hospitals can't ship PHI to arbitrary clouds. **On-prem open models** (PersonaPlex voice, Nemotron fleet, NemoGuard, vocal-biomarker screening) keep voice + patient data **inside the building**; the frontier reasoning calls (Gemini/Antigravity) see only **de-identified operational metadata** — timings, queue states, counts — not names or clinical detail. Say this plainly.

**Roadmap narrative — mention Gemma, do NOT build on it:** *"Today we split frontier-cloud reasoning from on-prem open models. As on-device open models like **Gemma** mature (2–3 years), the entire stateful-agent layer runs fully in-hospital — swap the reasoning endpoint from cloud Gemini to local Gemma and nothing leaves the building."* One line on the closing/roadmap slide + once when explaining model tiering.

---

## 3. Demo script (7 minutes) — beats × tech × fallback

| # | Beat (~s) | What the audience sees | What actually fires | Fallback |
|---|---|---|---|---|
| 1 | Opening (30) | Clean drill-down hospital map, **bot-glyph** agents in their zones, event feed ticking | Sim engine + Nano dept events | Pure scripted events (no Nano) |
| 2 | Meet Sarah (45) | Click Sarah's agent → patient sheet: journey + prediction 14:20, **See flow** optimized-path overlay | Cached state from her Interactions chain | Cache always present |
| 3 | Lab delay (40) | Trigger event → prediction slides to 15:05, yellow warning, *explanation references her history* | Event appended to chain via `previous_interaction_id`; new JSON returned | If API slow: optimistic UI update, explanation arrives async |
| 4 | Cardio overload (40) | Cluster near Cardiology, Sarah → 16:50, red | Same mechanism + map animation | Same |
| 5 | **Talk to Sarah (60)** 🎙 | Presenter (or judge) has a live voice conversation with the patient-agent; she knows she's waited 100 min; nurse asks "pain changed?" → her answer logs as event | PersonaPlex full-duplex, persona prompt from live state; reply summarized → appended to chain | Tier 1: pre-recorded live-capture video · Tier 2: text chat with Nano persona |
| 6 | Recommendation (30) | Card shows plain-language next action + "Ops-only ✓ NemoGuard" badge | Recommendation from chain, gated by topic-control | Pre-validated recommendation cached |
| 7 | **Resolve → Computer Use (60)** | Side window: browser visibly clicks MediTrack — dept→Observation, consult escalated, bed O-12; map animates Sarah moving | Interactions computer_use loop + Playwright headed browser | Pre-recorded screencast, played in the same window frame |
| 8 | Ops Chief insight (45) | "Cardiology blocks 4 ER beds… reassign 1 cardiologist for 60 min → −3h20m overstay" + shift report file appears | Antigravity agent, persistent env, pandas over event CSV | Precomputed insight text; show the real shift-report file from rehearsal |
| 9 | Closing (30) | Architecture slide | — | — |

Closing line: *"A snapshot can't tell you why Sarah is still here. State can. Gemini runs the agents — Nemotron runs the hospital — and one tap fixes the flow."*

**New UI surfaces to weave in (detail in [DESIGN.md](./DESIGN.md); keep the 7-min spine, add ~60–90s if rehearsals allow):**
- **Administrator view** — after beat 6/8, toggle Doctor → Admin: the same cardiology bottleneck reframed as a reallocation play with cost-of-delay + arrival forecast. Best paired with the Ops Chief insight (beat 8).
- **Time scrubber** — drag across the 7-day history to reveal the recurring afternoon cardiology backup ("this isn't luck, it's every weekday 14:00–17:00"). ~20s, high impact.
- **Intake & data sources** — open a patient's Intake tab → real dataset fields populate; the "Additional sources" row shows example wearable / vocal-biomarker chips as *pluggable* (mention, not built). ~15s.

Stretch beat (only if Day 2 goes well): new patient arrives speaking Spanish → Live Translate intake → a new agent chain is born mid-demo.

---

## 4. Team & workstreams

Assuming 4 people (adaptable: with 3, person D's scope merges into A+B; with 5, split D):

| | Owner | Scope |
|---|---|---|
| **A — Frontend** | | Drill-down map + **Doctor/Admin views**, patient sheet (3 tabs) w/ **See-flow overlay**, event feed, **time scrubber**, WS client, demo polish |
| **B — Agents/Backend** | | Orchestrator, sim engine, Interactions patient chains, Antigravity Ops Chief, state schema |
| **C — Actions/EHR** | | MediTrack Classic app, Computer Use loop, Live Translate (stretch) |
| **D — NVIDIA/Voice + Pitch** | | PersonaPlex hosting + bridge, Nano dept agents, NemoGuard gate, Parse (stretch), pitch deck, demo videos |

---

## 5. Schedule

### Day 0 — before the hackathon (2–3 h, tonight/tomorrow)

*Check hackathon rules on pre-written code: everything below is accounts, keys, environment, and throwaway spikes — normally allowed. Don't pre-build product code if rules forbid it.*

- [ ] **Google AI Studio:** API keys for **each teammate** (rate-limit headroom); enable billing on one; verify access to `gemini-3.5-flash` via Interactions API, `antigravity-preview-05-2026`, and `gemini-3.5-live-translate-preview`.
- [ ] **NVIDIA:** API key at [build.nvidia.com](https://build.nvidia.com/models); smoke-test `nvidia/nemotron-3-nano-30b-a3b` and `nvidia/llama-3.1-nemoguard-8b-topic-control` (OpenAI-compatible, base_url `https://integrate.api.nvidia.com/v1`). OpenRouter account as backup (Nano has a free tier there).
- [ ] **Hugging Face:** accept the [PersonaPlex license](https://huggingface.co/nvidia/personaplex-7b-v1), set `HF_TOKEN`.
- [ ] **Datasets (the demo's real backbone):** download the open data — **Synthea** (fully open) + **[`infinite-dataset-hub/HospitalAdmissions`](https://huggingface.co/datasets/infinite-dataset-hub/HospitalAdmissions)** via `datasets.load_dataset`; optionally begin **PhysioNet CITI credentialing** for [MIMIC-IV-ED](https://physionet.org/content/mimic-iv-ed/). Assign an owner. **Raw data stays local — gitignored, never committed.**
- [ ] **Secrets:** every API key (Google, NVIDIA, HF) goes in **`.env`** — already **gitignored**, never pushed. The demo runs **live** off these keys.
- [ ] **GPU box:** create [Brev](https://brev.nvidia.com) (ask NVIDIA mentors for credits — they suggested PersonaPlex, they'll help host it) or RunPod account; boot an L40S/A100, `pip install moshi/.` from [NVIDIA/personaplex](https://github.com/NVIDIA/personaplex), run `python -m moshi.server --ssl "$SSL_DIR"`, confirm the web UI at :8998 talks. Note cold-start time.
- [ ] **Mac fallback:** clone [personaplex-mlx](https://github.com/mu-hashmi/personaplex-mlx) on the best M-series laptop in the team; test realtime mode.
- [ ] Clone [google-gemini/computer-use-preview](https://github.com/google-gemini/computer-use-preview); run the Playwright quickstart once.
- [ ] Decent USB mic (PersonaPlex quality depends on it), HDMI adapters, phone hotspot with data.

### Day 1 — make the spine work

**09:00–10:00 · All — kickoff (60 min, timeboxed)**
Freeze: name, scenario beats, patient state schema (§2.1), repo layout (`/frontend`, `/orchestrator`, `/meditrack`, `/voice`, `/scenario`), WS message contract. Create the monorepo, CI-free, `make dev` runs everything.

**10:00–13:00**
- A: Map layout (SVG zones from a hand-drawn floor plan), patient dots + movement animation, WS client with mock data.
- B: Sim engine (tick clock, `scenario.json` player, event bus) + FastAPI WS push. Then: first Interactions chain — create patient, append event, get JSON state back, pydantic-validate. **This is the critical path — everyone unblocks B if stuck.**
- C: MediTrack Classic: bed board + patient list + consult queue, ugly-on-purpose, REST endpoints so the orchestrator can verify Computer Use actually changed things.
- D: Nano dept-agent wrapper (one function: `dept_event(dept, load, history) → event dict`); NemoGuard gate function; start PersonaPlex on the GPU box, keep it warm.

**14:00–18:00**
- A: Patient card bound to live state (timeline, prediction, resources, blocker); event-feed panel; sim control buttons.
- B: Full loop: sim event → append to chain → validated state → WS → UI. All 5–6 patients. Latency masking (optimistic updates).
- C: Computer Use loop (Interactions API, `tools=[{"type":"computer_use","environment":"browser"}]`) driving MediTrack for the exact 3-action sequence: move Sarah → escalate consult → assign bed O-12. Headed browser, window positioned for the demo.
- D: Persona-prompt generator (live state → PersonaPlex role prompt, through NemoGuard); voice pick (e.g. `NATF2`); first live conversation with "Sarah".

**18:00–21:00 (evening checkpoint: scenes 1–4, 6–7 must run end-to-end)**
- All: first full run-through of the happy path.
- D: **Record fallback videos now, while everything works:** PersonaPlex conversation (screen+audio) and Computer Use screencast. Store in `/fallbacks`.
- B: Start Antigravity spike: create env, upload event CSV, ask for bottleneck analysis, reuse `environment_id`. Measure latency (interactions can take minutes and 100k–3M tokens — budget: **2–3 Antigravity calls in the whole demo, pre-warmed**).

### Day 2 — voice, chief, polish

**09:00–12:00**
- B: Ops Chief productionized: append-only CSV shipped to the same environment each N ticks; "Generate shift report" button; parse insight → UI card.
- D: PersonaPlex ↔ state bridge both ways (conversation summary → event appended to Sarah's chain — use Nano to summarize the transcript). Rehearse the conversation 5×; tune the role prompt (she must know her wait time, stay operational, never discuss treatment).
- C: **Timeboxed 2h:** Live Translate intake spike (`gemini-3.5-live-translate-preview`, es→en). If not solid by 12:00 — **cut it**, the demo is already dense.
- A: Department card (queue, avg wait, overload risk), map polish (cluster near Cardiology at beat 4), "NemoGuard ✓" badge, loading/empty states.

**12:00–15:00**
- All: integrate; freeze features at 14:00. Bug-fix only after.
- D: Pitch deck (5 slides: problem → live demo → architecture "Gemini runs the agents / Nemotron runs the hospital" → why state is load-bearing → **on-prem sovereignty → Gemma roadmap** (fully in-hospital in 2–3 yrs)).

**15:00–end**
- **Three full dress rehearsals** with the actual presenting laptop, projector resolution, and mic. One rehearsal on hotspot (venue wifi will betray you).
- Fallback drill: run the demo once with all APIs blocked — every beat must degrade gracefully.
- Submission package: repo README (30-sec quickstart, architecture diagram, which API powers which beat — judges check this), 2-min video if required, deployed MediTrack + UI.

---

## 6. Component specs & verified code stubs

### 6.1 Patient-agent — stateful Interactions chain (B)

```python
from google import genai
client = genai.Client()  # GEMINI_API_KEY

SYSTEM = """You are the operational patient-flow agent for one hospital patient.
You track ONLY operations: timing, queues, resources, blockers, next operational action.
Never give medical advice, diagnosis, or treatment opinions.
After each event, return the full updated state as JSON matching the provided schema. No prose."""

def create_patient(intake: dict) -> tuple[str, dict]:
    ix = client.interactions.create(
        model="gemini-3.5-flash",
        system_instruction=SYSTEM,          # re-send every call (not carried over)
        input=f"New patient intake:\n{json.dumps(intake)}\nSchema:\n{STATE_SCHEMA}",
        store=True,
    )
    return ix.id, parse_state(ix)           # pydantic-validate; retry once on failure

def append_event(prev_id: str, event: dict) -> tuple[str, dict]:
    ix = client.interactions.create(
        model="gemini-3.5-flash",
        system_instruction=SYSTEM,
        input=f"New event:\n{json.dumps(event)}\nRecalculate prediction, blocker, recommendation. Return full state JSON.",
        previous_interaction_id=prev_id,     # ← the load-bearing primitive
        store=True,
    )
    return ix.id, parse_state(ix)
```

Notes: `store=true` default retention is 55 days on paid tier; tools/system_instruction/config must be re-specified per call; history itself is server-side. Keep a `{patient_id: last_interaction_id}` map + last-good-state cache.

### 6.2 Ops Chief — Antigravity agent (B)

```python
def ops_chief_analysis(env_id: str | None, csv_text: str) -> tuple[str, str]:
    ix = client.interactions.create(
        agent="antigravity-preview-05-2026",
        input=(
            "Append the following to events.csv (create if missing), then using Python/pandas: "
            "1) rank departments by total minutes of avoidable patient waiting; "
            "2) find which single department blocks the most ER beds right now; "
            "3) quantify the impact of adding one clinician there for 60 minutes; "
            "4) write shift_report.md. Reply with a 3-sentence plain-language insight.\n\n"
            + csv_text
        ),
        environment=env_id or "remote",      # reuse = persistent long-task state
    )
    return ix.environment_id, extract_text(ix)
```

Constraints found in docs: no structured outputs, no computer_use inside Antigravity, function calling only stateful, `background=True` requires `store=True`. Latency is minutes — call it at beat boundaries, never inline.

### 6.3 Computer Use loop → MediTrack (C)

```python
ix = client.interactions.create(
    model="gemini-3.5-flash",
    input=[task_text, screenshot_bytes],     # "In MediTrack: move Sarah M. to Observation, ..."
    tools=[{"type": "computer_use", "environment": "browser"}],
)
# loop: read function_call steps (click/type/navigate, coords normalized 0-999)
# → execute via Playwright on the headed browser → screenshot → send function_result → repeat
```

Google does **not** host the browser — our Playwright, our window (that's good: the audience watches it click). Start from the reference repo, strip it to our loop. Verify success via MediTrack REST (`GET /api/patients/P-1042` → dept == "Observation"), not via the model's claim. Retry whole task once; then fallback video.

### 6.4 Nemotron Nano dept agents + NemoGuard gate (D)

```python
from openai import OpenAI
nv = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=NVIDIA_API_KEY)

def dept_tick(dept, load, recent):
    r = nv.chat.completions.create(
        model="nvidia/nemotron-3-nano-30b-a3b",
        messages=[{"role": "system", "content": DEPT_SIM_PROMPT},
                  {"role": "user", "content": json.dumps({"dept": dept, "load": load, "recent": recent})}],
        extra_body={"reasoning_budget": 0},   # fast mode for world sim
    )
    return r.choices[0].message.content

def guard_topic(text) -> bool:
    r = nv.chat.completions.create(
        model="nvidia/llama-3.1-nemoguard-8b-topic-control",
        messages=[{"role": "system", "content": OPS_ONLY_POLICY},
                  {"role": "user", "content": text}],
    )
    return "off-topic" not in r.choices[0].message.content.lower()
```

Every outbound recommendation + persona prompt passes `guard_topic` (and content-safety, same pattern with `nvidia/llama-3.1-nemoguard-8b-content-safety`). On failure → regenerate once with stricter instruction → else show safe template. Log all gate decisions; show the badge in UI.

### 6.5 PersonaPlex (D)

GPU box (primary): `pip install moshi/.` → `SSL_DIR=$(mktemp -d); HF_TOKEN=... python -m moshi.server --ssl "$SSL_DIR"` → web UI at `:8998` (mic permission needs HTTPS). `--cpu-offload` if VRAM-tight; voices ship as embeddings (`NATF2.pt` etc.).
Mac fallback: `personaplex-mlx` realtime mode.
Persona prompt template (regenerate on card open, post-NemoGuard):

```
You are {name}, {age}, in the {dept} of a hospital since {arrival}. You came in with {complaint}.
So far: {journey_summary}. You have been waiting {wait_min} minutes for {blocker_plain}.
Mood: {mood_from_delay}. Answer questions about your experience and how you feel about waiting.
You are NOT a doctor; if asked about diagnosis or treatment, say the medical team handles that.
```

Bridge back: capture/transcribe the exchange → Nano summarizes to `{"type":"patient_reported", ...}` → `append_event` on Sarah's chain. (If two-way bridging gets hairy, the nurse types the takeaway — one input box, honest and quick.)

### 6.6 Live Translate — stretch only (C)

Live API session with `gemini-3.5-live-translate-preview`, audio 16 kHz in / 24 kHz out, `targetLanguageCode: "en-US"`; translated text → fact extraction (Nano) → `append_event`. Cut without hesitation at the Day-2 12:00 gate.

### 6.7 MediTrack Classic (C)

Single-page Bootstrap-3-era app + tiny REST backend (SQLite/JSON file). Screens: bed board (grid of beds w/ statuses), patient list, consult queue. Requirements driven by Computer Use: fixed 1280×800, ≥40px click targets, unique visible labels ("Move to…", "Escalate", "Assign bed"), zero animations, `data-testid`s for our own verification.

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Computer Use flaky live | Med | Deterministic MediTrack UI, fixed viewport, 3-action scope, REST verification, retry once, **rehearsed fallback screencast in identical window** |
| PersonaPlex hosting fails / hall too noisy | Med | 3 tiers: GPU box → Mac MLX → recorded live-capture. Directional USB mic, presenter repeats judge questions into it |
| Antigravity latency (minutes/interaction) or preview quota | High | Only 2–3 calls, pre-warmed env, precomputed insight fallback; per-teammate API keys |
| Interactions JSON drift | Med | pydantic + one retry + last-good-state cache; UI reads only cache |
| Rate limits / venue wifi | Med | Billing enabled, multiple keys, exponential backoff; hotspot rehearsal; scripted backbone runs fully offline |
| Demo overrun | High | Sim clock jump-to-beat buttons; 7-min script rehearsed ×3; Live Translate pre-cut |
| "It's a medical device" judge pushback | Low | NemoGuard beat + explicit framing: operational predictions only (idea.md §11 language) |

**Scope-cut ladder (cut top-down when behind):** Live Translate → Nemotron Parse intake → department detail cards → second voiced patient → background-patient count (6→4) → map animation niceties. **Never cut:** Sarah's chain, Computer Use beat, PersonaPlex beat (video tier allowed), Ops Chief insight (precomputed allowed).

---

## 8. Judging one-liners (memorize)

- *"Which primitive is load-bearing?"* — The Interactions chain **is** the patient. Every prediction is a function of the full event history held server-side; a snapshot model literally cannot say *why* Sarah is delayed or what frees the bed.
- *"Why Computer Use?"* — Hospitals won't replace their EHR for us. The agent acts on the software they already have — and it acts only when its state says so.
- *"Why Antigravity and not a prompt?"* — The Ops Chief runs actual pandas over the full event log in a persistent sandbox and ships a shift-report artifact. That's analysis, not summarization.
- *"Best usage of Nemotron?"* — Nemotron is the hospital: patients speak through PersonaPlex conditioned on live agent state, departments think with Nano, and NemoGuard is the reason this system can exist in healthcare at all. All open models, all runnable on-prem where PHI lives.
- *"Is this safe?"* — FlowTwin never touches clinical decisions; every output is topic-gated to operations. It optimizes time, beds, and queues — care stays with clinicians.

---

## 9. Reference links

**Google:** [Interactions API docs](https://ai.google.dev/gemini-api/docs/interactions) · [API reference](https://ai.google.dev/api/interactions-api) · [Antigravity agent](https://ai.google.dev/gemini-api/docs/antigravity-agent) · [Computer Use (Interactions)](https://ai.google.dev/gemini-api/docs/interactions/computer-use) · [Computer Use overview](https://ai.google.dev/gemini-api/docs/computer-use) · [computer-use-preview repo](https://github.com/google-gemini/computer-use-preview) · [Live Translate docs](https://ai.google.dev/gemini-api/docs/live-api/live-translate) · [Live Translate model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview) · [Interactions GA post](https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api-general-availability/)

**NVIDIA:** [build.nvidia.com/models](https://build.nvidia.com/models) · [Nemotron 3 Nano](https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b) · [Nemotron 3 Super](https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b) · [Nemotron Parse](https://build.nvidia.com/nvidia/nemotron-parse) · [NemoGuard jailbreak](https://build.nvidia.com/nvidia/nemoguard-jailbreak-detect) · [NeMo Guardrails + NIM](https://docs.nvidia.com/nemo/microservices/25.7.0/guardrails/tutorials/integrate-nim.html) · [PersonaPlex repo](https://github.com/NVIDIA/personaplex) · [PersonaPlex weights](https://huggingface.co/nvidia/personaplex-7b-v1) · [PersonaPlex project page](https://research.nvidia.com/labs/adlr/personaplex/) · [PersonaPlex MLX port](https://github.com/mu-hashmi/personaplex-mlx) · [Brev](https://brev.nvidia.com)
