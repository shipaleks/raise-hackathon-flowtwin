#!/usr/bin/env python3
"""
FlowTwin — MIMIC-IV-ED statistics extractor.

Reads data/raw/mimic-ed/*.csv.gz (the open MIMIC-IV-ED **demo** subset by
default; drop the full credentialed MIMIC-IV-ED ed/ tables into the same
folder and this script uses them unchanged — same schema).

Everything extracted here is REAL, patient-level ED data (de-identified,
date-shifted; MIMIC's shifting preserves time-of-day and day-of-week):
  - arrival hour-of-day weights
  - triage acuity mix (1..5) + arrival transport mix per acuity
  - ED length-of-stay quantiles per acuity band × disposition
  - admit rate per acuity
  - chief complaints (top strings) mapped onto FlowTwin pathway templates
  - triage vitals quantiles per acuity (for sampling synthetic personas)

Output: data/seed/mimic_stats.json
"""
import csv, gzip, io, json, re, statistics
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

RAW = Path(__file__).parent / "raw" / "mimic-ed"
SEED = Path(__file__).parent / "seed"

def read_gz(name):
    with gzip.open(RAW / name, "rt") as f:
        return list(csv.DictReader(f))

# chief complaint → FlowTwin pathway template (station sequences live in build_seed)
COMPLAINT_TO_PATHWAY = [
    (r"chest pain|chest tight|angina", "Chest Pain Rule-Out"),
    (r"stroke|facial droop|slurred|weakness.*(side|arm|leg)|aphasia", "Stroke Alert"),
    (r"overdose|ingestion|intoxicat|etoh|alcohol", "Tox / Overdose"),
    (r"fever|sepsis|chills|infection|cellulitis|uti|dysuria", "Sepsis"),
    (r"sob|short(ness)? of breath|dyspnea|copd|asthma|wheez", "COPD Exacerbation"),
    (r"abd|abdominal|epigastric|rlq|ruq|llq|nausea|vomit", "Abdominal Pain Workup"),
    (r"appendic", "Appendicitis — OR"),
    (r"hip (pain|fracture)|s/p fall.*hip|fall.*hip", "Hip Fracture"),
    (r"flank|kidney stone|renal colic|hematuria", "Renal Colic"),
    (r"gi bleed|brbpr|melena|hematemesis|blood in stool", "GI Bleed"),
    (r"palpitation|afib|a-fib|arrhythmia|tachycardia|syncope", "Arrhythmia"),
    (r"laceration|fall|injury|fracture|sprain|mvc|mvа|assault|wound|burn|trauma|pain.*(arm|leg|ankle|wrist|shoulder|knee)", "Minor Injury"),
]

def pathway_of(complaint: str, age_band: str) -> str:
    c = (complaint or "").lower()
    for rx, pw in COMPLAINT_TO_PATHWAY:
        if re.search(rx, c):
            if pw == "Minor Injury" and "hip" in c and age_band == "senior":
                return "Hip Fracture"
            return pw
    return "General Medical"

def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(len(xs) * p))] if xs else None

def quantiles(xs):
    return {f"p{int(p*100)}": q(xs, p) for p in (0.10, 0.25, 0.50, 0.75, 0.80, 0.90, 0.95)}

def main():
    stays = read_gz("edstays.csv.gz")
    triage = {r["stay_id"]: r for r in read_gz("triage.csv.gz")}
    n = len(stays)
    full = n > 5000
    print(f"MIMIC-IV-ED {'FULL' if full else 'demo'}: {n} ED stays")

    hour_w = [0] * 24
    acuity_mix = Counter()
    transport_by_acuity = defaultdict(Counter)
    los_by = defaultdict(list)          # (band, disposition) -> [minutes]
    admit_by_acuity = defaultdict(lambda: [0, 0])
    pathway_w = Counter()
    vitals_by_acuity = defaultdict(lambda: defaultdict(list))
    sex_mix = Counter()

    for s in stays:
        t = triage.get(s["stay_id"], {})
        try:
            tin = datetime.fromisoformat(s["intime"])
            tout = datetime.fromisoformat(s["outtime"])
        except Exception:
            continue
        los = (tout - tin).total_seconds() / 60
        if los <= 5 or los > 3 * 24 * 60:
            continue
        try:
            acu = int(float(t.get("acuity") or 0)) or 3
        except Exception:
            acu = 3
        acu = min(5, max(1, acu))
        band = "12" if acu <= 2 else ("3" if acu == 3 else "45")
        dispo = "admitted" if s["disposition"] == "ADMITTED" else "discharged"

        hour_w[tin.hour] += 1
        acuity_mix[acu] += 1
        sex_mix[s["gender"]] += 1
        tr = s.get("arrival_transport") or "OTHER"
        transport_by_acuity[acu][("ambulance" if tr in ("AMBULANCE", "HELICOPTER")
                                  else "walk-in" if tr == "WALK IN" else "other")] += 1
        los_by[(band, dispo)].append(los)
        los_by[(band, "all")].append(los)
        admit_by_acuity[acu][0] += dispo == "admitted"
        admit_by_acuity[acu][1] += 1
        pathway_w[pathway_of(t.get("chiefcomplaint", ""),
                             "senior")] += 1  # band refined in build_seed by age

        for k, key in (("heartrate", "hr"), ("sbp", "sbp"), ("resprate", "rr"),
                       ("o2sat", "spo2"), ("pain", "pain")):
            v = t.get(k)
            if v:
                try:
                    vitals_by_acuity[acu][key].append(float(v))
                except ValueError:
                    pass
        tv = t.get("temperature")
        if tv:
            try:
                vitals_by_acuity[acu]["temp_c"].append(round((float(tv) - 32) * 5 / 9, 1))
            except ValueError:
                pass

    out = {
        "source": ("MIMIC-IV-ED (full)" if full else "MIMIC-IV-ED Demo 2.2 (open access)"),
        "n_stays": n,
        "note": "real de-identified ED stays; MIMIC date-shifting preserves time-of-day",
        "arrival_hour_weights": hour_w,
        "acuity_mix": {str(k): v for k, v in sorted(acuity_mix.items())},
        "sex_mix": dict(sex_mix),
        "transport_by_acuity": {str(k): dict(v) for k, v in sorted(transport_by_acuity.items())},
        "admit_rate_by_acuity": {str(k): round(a / b, 3) if b else None
                                 for k, (a, b) in sorted(admit_by_acuity.items())},
        "los_min_quantiles": {f"acuity{band}_{dispo}": quantiles(xs)
                              for (band, dispo), xs in sorted(los_by.items())},
        "pathway_weights": dict(pathway_w.most_common()),
        "vitals_quantiles_by_acuity": {
            str(a): {k: quantiles(v) for k, v in vs.items()}
            for a, vs in sorted(vitals_by_acuity.items())},
    }
    (SEED / "mimic_stats.json").write_text(json.dumps(out, indent=1))
    print(f"  acuity mix: {dict(acuity_mix)}")
    print(f"  admit rates: {out['admit_rate_by_acuity']}")
    print(f"  LOS p50 (cat3, all): {out['los_min_quantiles'].get('acuity3_all', {}).get('p50')} min · "
          f"(cat45, all): {out['los_min_quantiles'].get('acuity45_all', {}).get('p50')} min")
    print(f"  pathway weights: {dict(pathway_w.most_common(8))}")
    print("  wrote data/seed/mimic_stats.json")

if __name__ == "__main__":
    main()
