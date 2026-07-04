# FlowTwin — a live twin of a REAL hospital's A&E

**This is Queen Mary Hospital, Hong Kong — right now.** FlowTwin plugs into the
Hospital Authority's public A&E waiting-time feed (18 hospitals, updated every
15 minutes, real p50/p95 per triage category), replays the last 48 hours of it
person-by-person on a three-storey floor plate, and gives every patient a
stateful **AI agent** that shadows the journey, predicts the exit with a
confidence interval, and suggests the next operational move.
**Operations only — time, beds, and queues. Care stays with clinicians.**

The trick that keeps it honest: the hospital, the waits, and the daily
pattern are **real**; the individual patients are **synthetic personas by
design** (the feed publishes no patient-level data — that's the point), with
their statistics drawn from **MIMIC-IV-ED** (real de-identified ED stays) and
each persona's wait drawn from **the hospital's own published p50/p95
distribution at their arrival snapshot**. Every layer is labeled in-app
(About → honesty ledger).

Built for the RAISE hackathon (Google DeepMind track × NVIDIA Nemotron). No
live API calls in the browser build — the full live architecture (Gemini
Interactions chains, Antigravity Ops Chief, PersonaPlex voice, NemoGuard
gating) is specified in [PLAN.md](./PLAN.md).

## Quickstart (30 seconds)

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

**Go live before a demo** (re-anchors the twin to the feed's newest snapshot):

```bash
python3 data/fetch_hk.py && python3 data/build_mimic_stats.py && python3 data/build_seed.py
```

Production build: `npm run build` → static site in `frontend/dist/`.

## The demo, click by click

1. **Sat Jul 4, 11:00 HKT — floor G.** The A&E plate: waiting hall, triage,
   resus, consult rooms, cubicles, imaging, labs, pharmacy — plus the real
   cat-3/cat-4/5 waits in the top bar, straight from the feed. The floor rail
   stacks G / 1 / 2 (acute floor, wards) with live census; patients walk the
   corridors and take the lift between floors.
2. **Meet Sarah** (DEMO rail, step 1) — chest pain, cat-2, in the cardiology
   consult queue on floor 1. Her sheet shows the whole way she came (journey
   rail: came from → NOW + what she's waiting for → predicted next), her exit
   **14:20 ±30 min**, and her trace drawn on the map — lift ride included.
3. **Lab delay** (step 2, 12:30) — troponin re-run queued, exit slides to
   15:05, ring amber.
4. **The real afternoon climb** (step 3, 14:00) — three more chest-pain
   arrivals hit the consult queue *on their own tracks* exactly as the
   hospital's real daily climb opens (QMH's cat-4/5 median wait rises from
   ~2 h at the 08:00 trough to ~4¾ h by 17:00 — 7-day mean of the actual
   feed). Consult reads 4/3, Sarah goes red: exit 16:50.
5. **Resolve** (step 4) — one action: she walks to the obs ward (bed O-6),
   consult coverage escalates 60 min, the queue drains, exit recovers to
   **16:05 (−45 min)**.
6. **Administrator view** (`V`) — money lives only here: the same bottleneck
   priced at HK$400/bed-hour (stated), the **real network table** (all 18 HA
   A&E sites, live), and **the real daily pattern** chart — the hospital's own
   published curve, not a simulation.
7. **Optimize the day** (step 5, or the button) — the day in review: what
   happened (real numbers), what FlowTwin changed (14:20 → 16:50 → 16:05,
   −45 min), and **tomorrow's plan** — five exact operational changes with
   measured evidence, labeled assumptions, and the money:
   ≈ **HK$54.5k/day (€6.4k), ≈ HK$19.9M/yr** — every line carries its basis.
8. **Time scrubber** — 48 h of the real feed, ending at the **LIVE** edge.
   Presets: Night 03:30 (the backlog that never clears — real), the morning
   trough, the afternoon climb, LIVE.

Keyboard: `Esc` close/zoom out · `Space` play/pause · `←/→` scrub
(`Shift` ×6) · `F` floors · `V` view · `T` theme · `1–4` presets.

## Honesty (the ledger is in-app: About → honesty ledger)

- **REAL · live:** the hospital; waits per triage category (p50/p95); the
  15-min update cadence; 48 h + 7 days of archive; the recurring daily climb
  *and* the overnight backlog — measured from the feed.
- **REAL statistics (MIMIC-IV-ED):** arrival hour-of-day shape, acuity
  conditionals, LOS tails, triage vitals ranges. Open demo subset (n=222)
  bundled; the full credentialed dataset drops into `data/raw/mimic-ed/`
  unchanged.
- **Stated assumptions:** triage mix, ~27 % admission share, ~300
  attendances/day, HK$400/bed-hour, every "recoverable" share in the plan.
- **Synthetic · labeled:** the individual personas (names from Synthea),
  station-level rooms and minutes, the floor plan, Sarah's scripted beats.
- **Every model names itself** on every surface: the wait sampler (lognormal
  through the real p50/p95), FlowTwin ETA (MIMIC LOS quantiles, escalating
  ladder), the arrival model, risk thresholds, and the optimizer.

## Architecture (prototype)

```
data/
  fetch_hk.py            HA live feed + data.gov.hk archive → hk_live / hk_history
  build_mimic_stats.py   MIMIC-IV-ED → real ED distributions
  build_seed.py          deterministic cast calibrated to the real feed (seed 42)
frontend/
  src/sim/        time model · 3-floor plate w/ corridors + lift · demo beats ·
                  the engine (pure worldAt(t): walking agents, zone loads,
                  journey traces, sheet/admin/day-review view-models)
  src/data/       typed seed access + live-series helpers
  src/store.ts    zustand UI state (view, floor, clock, zoom, selection, resolve)
  src/components/ map/ (floor plates, furniture, meeples, traces) · sheet/ ·
                  admin/ (network, real pattern) · chrome/ (About, Optimize-the-day) ·
                  scrubber/ · ui/
```

Everything on screen is a pure function of `(simMinute, resolvedAt)` —
scrubbing is perfectly reversible and the demo can never desync.

## Sovereignty (the closing slide)

On-prem open models (PersonaPlex voice, Nemotron department fleet, NemoGuard
ops-gate) keep voice and patient data inside the hospital; frontier reasoning
sees only de-identified operational metadata — and here even that layer is
built from public + open data. As on-device open models (Gemma) mature, the
entire agent stack runs fully in-hospital.

*Gemini runs the agents. Nemotron runs the hospital. The feed keeps it honest.*
