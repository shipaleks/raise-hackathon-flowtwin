# FlowTwin — data plane: a REAL hospital, live

The twin is anchored to **Queen Mary Hospital, Hong Kong** via the Hospital
Authority's public A&E waiting-time feed (18 hospitals, updated every
15 minutes), its full 15-minute historical archive on data.gov.hk, and real
patient-level statistics from **MIMIC-IV-ED**. Only the derived seed JSON +
the builders are committed; raw pulls are cached/gitignored.

## Layout
```
data/
  fetch_hk.py            # live feed + 48h @15min + 7d hourly archive → hk_live/hk_history
  build_mimic_stats.py   # MIMIC-IV-ED → real ED distributions → mimic_stats.json
  build_seed.py          # deterministic cast builder (seed=42) calibrated to the feed
  raw/            (gitignored / cached)
    hk_archive/                    # cached data.gov.hk snapshots (one JSON per 15-min stamp)
    mimic-ed/*.csv.gz              # MIMIC-IV-ED tables (open demo subset bundled by fetch;
                                   #   drop the full credentialed ed/ tables here — same schema)
    patients.csv, ...              # Synthea sample (names/sex/age ONLY)
  seed/           (committed — the demo backbone)
    hk_live.json          # latest real snapshot, parsed to minutes, all 18 hospitals + meta
    hk_history.json       # real series (48h @15min + 7d hourly) + 7-day hour-of-day pattern
    mimic_stats.json      # real ED distributions (arrival hours, acuity, LOS quantiles, vitals)
    patients_today.json   # synthetic personas in-house at the demo anchor + later arrivals
    history_7d.json       # completed journeys across the 48-h replay window
    scenario.json         # Sarah's scripted beats (lab delay / overload / resolve)
    admin_kpis.json       # hk block, real recurring pattern, ETA model, optimize_plan
```

## Go live (one command before a demo)
```bash
python3 data/fetch_hk.py         # pull the live feed + archive (cached, ~30 s cold)
python3 data/build_mimic_stats.py
python3 data/build_seed.py       # re-anchor the whole twin to the newest feed
```

First run only — grab the open MIMIC-IV-ED demo tables (data/raw is gitignored):
```bash
mkdir -p data/raw/mimic-ed && cd data/raw/mimic-ed
for f in edstays.csv.gz triage.csv.gz vitalsign.csv.gz diagnosis.csv.gz; do
  curl -sSL -O "https://physionet.org/files/mimic-iv-ed-demo/2.2/ed/$f"; done
cd ../../..
# Synthea names registry (identity flavor only)
curl -L "https://synthetichealth.github.io/synthea-sample-data/downloads/latest/synthea_sample_data_csv_latest.zip" -o data/raw/synthea_csv.zip
cd data/raw && unzip -o synthea_csv.zip && cd ../..
```
The frontend is a pure deterministic replay of these files — no API calls in
the browser, nothing to break on stage.

## What is REAL vs SYNTHETIC (the honesty ledger — also in-app, About)
| Layer | Source | Status |
|---|---|---|
| Hospital identity, cluster, district | Hospital Authority | **REAL** |
| Waits by triage cat (t2, t3 p50/p95, t45 p50/p95), update times | HA feed, 15-min cadence | **REAL · live** |
| 48-h wait series + 7-day hour-of-day pattern (the daily climb, the overnight backlog) | data.gov.hk historical archive of the same feed | **REAL · measured** |
| Arrival diurnal shape, acuity-conditional LOS tails, admit ordering, triage-vitals ranges | MIMIC-IV-ED (open demo subset n=222 bundled; full dataset drops in unchanged) | **REAL statistics** |
| Triage mix ≈1/3/44/48/4%, ~27% admission share, ~300 attendances/day | HA-published approximate levels | **stated assumption** |
| Individual personas (Synthea names), station-level rooms/minutes, floor plan | synthetic by design — the feed has no patient-level data (privacy) | **synthetic · labeled** |
| Each persona's WAIT | **a lognormal draw through the hospital's real published p50/p95 at their arrival snapshot** | real distribution, synthetic individual |
| Sarah's four demo beats | scripted for the guided story | **synthetic · labeled** |
| Money (HK$400/bed-hour ≈ €47, recoverable shares) | stated per optimizer line | **assumption** |

## Determinism & self-check
Fixed RNG seed; same fetched feed → identical world. `build_seed.py` ends with
an engine-parity occupancy replay printing per-zone counts at key moments
(the 14:05 consult overload must read 4/3, the waiting hall must track the
real climb).

## Licenses
HA A&E feed: public open data (data.gov.hk). MIMIC-IV-ED demo: open access
(PhysioNet); the full MIMIC-IV-ED is credentialed and **not redistributable —
never commit it**. Synthea: open synthetic (Apache-2.0), used for names only.
