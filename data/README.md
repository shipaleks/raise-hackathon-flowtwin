# FlowTwin — data & seed

Turns two **open** datasets into deterministic demo seed tracks. Raw data is downloaded locally and **gitignored**; only the derived seed JSON + the builder are committed.

## Layout
```
data/
  build_seed.py          # deterministic transformer (seed=42, now=2026-07-04T11:00)
  raw/            (gitignored — re-download with the commands below)
    patients.csv, encounters.csv, ...   # Synthea sample CSV (8.3 MB)
    hospital_admissions.json            # HF infinite-dataset-hub/HospitalAdmissions (91 rows)
    synthea_csv.zip
  seed/           (committed — the demo backbone)
    patients_today.json   # 7 current patients (ops-state), Sarah = hero, index 0
    history_7d.json       # 371 completed journeys across the last 7 days (with per-journey events for the scrubber)
    scenario.json         # Sarah's scripted track + beats (lab delay / cardio overload / resolve)
    admin_kpis.json       # avoidable-wait rank, bottleneck, arrival forecast by entry mode, ETA calibration
```

## Re-download the raw data
```bash
mkdir -p data/raw
# Synthea sample (fully open, license-free — no Java needed)
curl -L "https://synthetichealth.github.io/synthea-sample-data/downloads/latest/synthea_sample_data_csv_latest.zip" -o data/raw/synthea_csv.zip
cd data/raw && unzip -o synthea_csv.zip && cd ../..
# HF HospitalAdmissions (open)
curl "https://datasets-server.huggingface.co/rows?dataset=infinite-dataset-hub/HospitalAdmissions&config=default&split=train&offset=0&length=100" -o data/raw/hospital_admissions.json
# Rebuild seed
python3 data/build_seed.py
```
Optional higher-fidelity source: **MIMIC-IV-ED** (PhysioNet, free but credentialed — CITI course + DUA; not redistributable, keep local).

## What is REAL vs SYNTHESIZED (kept honest)
| Field | Source |
|---|---|
| Patient name, sex, age, chief complaint/reason | **Real** — Synthea sample |
| Admission length-of-stay (days) + outcome mix (Admin KPI benchmark) | **Real** — HF HospitalAdmissions |
| ED arrival hour-of-day | **Synthesized** — typical ED diurnal curve (`ED_HOUR_WEIGHTS`); the Synthea sample's encounter START hours are generator batch artifacts (03:00/10:00 spikes, near-empty evenings) |
| Intra-stay station sequence, per-station minutes, ED boarding hours | **Synthesized** — pathway templates (neither open source records ED station-level boarding times) |
| Vitals, the recurring 14:00–17:00 cardiology backup, ETA numbers | **Synthesized** — labeled in each record's `provenance` block |

Pathways: `Chest Pain Rule-Out`, `Minor Injury / Trauma`, `Tox / Overdose`, `Sepsis`, `General Medical`. Zones mirror the DESIGN drill-down (Emergency→Triage/ER Bay/Observation, Imaging→X-ray/CT, Cardiology→Consult/Telemetry, Labs, Wards, Discharge, Ambulance Bay).

## Ops-state schema (per current patient)
Superset of [PLAN §2.1](../PLAN.md): `patient_id, name, age, sex, complaint, pathway, acuity, arrival_mode, arrival_time, current_department, current_area, elapsed_min, vitals, events[], resources, predicted_exit, predicted_exit_ci{low,high,interval}, predicted_los_min, delay_risk, blocker, recommendation{action,explanation,impact_min}, signals{wearable,vocal_biomarker,_note}, guard{topic_ok,safety_ok}, provenance{}`. The hero (Sarah, `P-1042`) also has `optimization[]` (the −35/−50/−40 min flow-view callouts).

## Verified output (last run — regenerate with `python3 data/build_seed.py` and re-check)
- 7 current patients (unique IDs: hero `P-1042`, background `P-1050`–`P-1055`) + 10 scheduled today-arrivals (`P-1060`+), **455 historical journeys** (~60/day + 5 oversampled afternoon cardiac/day).
- **FlowTwin ETA calibration: 81.3% interval coverage, ±14 min median error, n=455** (from `admin_kpis.json`, target 80%).
- **Recurring bottleneck measurable:** Chest-Pain LOS when the consult queues 14:00–17:00 = **312 min vs 251 min otherwise** (n=25 in-window; classified by consult-request hour, matching how the synthesized backup applies).
- Sarah: predicted exit 13:52, 80% CI 12:51→15:07, `delay_risk=high`, `blocker=cardiology_queue` (the frontend's demo beats present her risk per the scripted arc).
- Arrival rates for **all 24 hours by entry mode** (`arrival_rates_by_hour`) — the UI derives the "next 3 h" forecast from the scrubbed moment; `arrival_forecast_next_3h` keeps the 11:00 snapshot.
- Each historical journey carries its `events` (station starts) so the frontend can place agents at any scrubber moment; Admin KPIs are aggregated from the *same* spans that produced each journey (no RNG-stream drift).
- Demo tracks (DESIGN §11): `P-1050` Gerda W. = extra-signal track (example wearable import, "screening, not diagnosis", −50 min callout on both Intake and Flow); `P-1051` Jacquelin P. = near-optimal control (`optimization: []`); `P-1053` Amos C. = one small sequence callout.

## Known TODOs for the implementing model
1. **Vitals & ED boarding times are synthesized** — if MIMIC-IV-ED gets credentialed, replace with real triage vitals + ED LOS and drop the synthesized flags.
2. **Names** carry occasional Synthea numeric suffixes; `clean_name()` strips trailing digits but spot-check.
3. Seed is a static snapshot — the live app should treat `patients_today.json` as the initial state and drive changes through the orchestrator (PLAN §2). The frontend prototype drives Sarah's demo beats (lab delay / cardio overload / resolve) as presentation-layer overrides keyed to sim time.

## Licenses
Synthea: open/synthetic (Apache-2.0, no real PHI). HF `infinite-dataset-hub/HospitalAdmissions`: LLM-generated, open. MIMIC-IV-ED (if used): PhysioNet credentialed, **not** redistributable — never commit.
