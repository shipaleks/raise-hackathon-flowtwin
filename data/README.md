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
    history_7d.json       # 168 completed journeys across the last 7 days
    scenario.json         # Sarah's scripted track + beats (lab delay / cardio overload / resolve)
    admin_kpis.json       # avoidable-wait rank, bottleneck, arrival forecast, ETA calibration
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
| Patient name, sex, age, chief complaint/reason, ED arrival hour-of-day | **Real** — Synthea sample |
| Admission length-of-stay (days) + outcome mix (Admin KPI benchmark) | **Real** — HF HospitalAdmissions |
| Intra-stay station sequence, per-station minutes, ED boarding hours | **Synthesized** — pathway templates (neither open source records ED station-level boarding times) |
| Vitals, the recurring 14:00–17:00 cardiology backup, ETA numbers | **Synthesized** — labeled in each record's `provenance` block |

Pathways: `Chest Pain Rule-Out`, `Minor Injury / Trauma`, `Tox / Overdose`, `Sepsis`, `General Medical`. Zones mirror the DESIGN drill-down (Emergency→Triage/ER Bay/Observation, Imaging→X-ray/CT, Cardiology→Consult/Telemetry, Labs, Wards, Discharge, Ambulance Bay).

## Ops-state schema (per current patient)
Superset of [PLAN §2.1](../PLAN.md): `patient_id, name, age, sex, complaint, pathway, acuity, arrival_mode, arrival_time, current_department, current_area, elapsed_min, vitals, events[], resources, predicted_exit, predicted_exit_ci{low,high,interval}, predicted_los_min, delay_risk, blocker, recommendation{action,explanation,impact_min}, signals{wearable,vocal_biomarker,_note}, guard{topic_ok,safety_ok}, provenance{}`. The hero (Sarah, `P-1042`) also has `optimization[]` (the −35/−50/−40 min flow-view callouts).

## Verified output (last run)
- 7 current patients, 168 historical journeys.
- **FlowTwin ETA calibration: 83.3% interval coverage, ±11 min median error** (from `admin_kpis.json`).
- Sarah: predicted exit 13:28, 80% CI 12:20→15:15, `delay_risk=high`, `blocker=cardiology_queue`.

## Known TODOs for the implementing model
1. **Recurring-bottleneck stat returns `None`** — too few `Chest Pain Rule-Out` encounters land in the 14:00–17:00 window across the 168-journey sample, so `admin_kpis.recurring_bottleneck.avg_los_in_window_min` is empty. Fix by oversampling cardiac pathways into that window (or widening the window / boosting `per_day`). The delay logic itself works; only the summary metric is thin.
2. **Vitals & ED boarding times are synthesized** — if MIMIC-IV-ED gets credentialed, replace with real triage vitals + ED LOS and drop the synthesized flags.
3. **Names** carry occasional Synthea numeric suffixes; `clean_name()` strips trailing digits but spot-check.
4. Seed is a static snapshot — the live app should treat `patients_today.json` as the initial state and drive changes through the orchestrator (PLAN §2).

## Licenses
Synthea: open/synthetic (Apache-2.0, no real PHI). HF `infinite-dataset-hub/HospitalAdmissions`: LLM-generated, open. MIMIC-IV-ED (if used): PhysioNet credentialed, **not** redistributable — never commit.
