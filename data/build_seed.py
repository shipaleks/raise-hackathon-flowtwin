#!/usr/bin/env python3
"""
FlowTwin seed builder.

Turns two OPEN datasets into deterministic demo seed tracks:
  - Synthea sample (data/raw/{patients,encounters}.csv) -> real synthetic
    identities, sex, age, ED arrival times, and chief complaint (reason).
  - HF infinite-dataset-hub/HospitalAdmissions (data/raw/hospital_admissions.json)
    -> admission-level length-of-stay (days) + outcome mix for Admin KPIs.

What is REAL vs SYNTHESIZED (kept honest — see data/seed/README.md):
  REAL (from data):  name, sex, age, chief complaint/reason, arrival hour-of-day,
                     ED encounter existence, admission LOS-days + outcome distribution.
  SYNTHESIZED:       intra-stay station sequence + per-station minutes, ED boarding
                     hours, vitals, the recurring 14:00-17:00 cardiology backup, and
                     the FlowTwin ETA / recommendation numbers. All labeled.

Deterministic: fixed random seed + fixed "now" anchor. Re-running produces identical output.
Outputs -> data/seed/*.json (+ README.md written separately).
"""
import csv, json, random, re, statistics
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from pathlib import Path

RAW = Path(__file__).parent / "raw"
SEED = Path(__file__).parent / "seed"
SEED.mkdir(exist_ok=True)

RNG = random.Random(42)
NOW = datetime(2026, 7, 4, 11, 0)        # demo "now": mid-morning, afternoon still ahead
HISTORY_DAYS = 7
BED_HOUR_COST_EUR = 45                    # stated assumption for cost-of-delay (Admin view)

# ---------------------------------------------------------------- pathways
# Zones mirror the DESIGN drill-down: (department, area). Durations in minutes.
def stn(type_, dept, area, base):
    return {"type": type_, "dept": dept, "area": area, "base": base}

PATHWAYS = {
    "Chest Pain Rule-Out": {
        "acuity": 2,
        "stations": [
            stn("arrival",          "Ambulance Bay", "Entrance",   0),
            stn("triage",           "Emergency", "Triage",         15),
            stn("bed_assigned",     "Emergency", "ER Bay",         10),
            stn("labs_ordered",     "Labs",      "Chemistry",      35),   # troponin
            stn("ecg",              "Emergency", "ER Bay",         10),
            stn("consult_requested","Cardiology","Consult",        70),   # the queue
            stn("consult_done",     "Cardiology","Consult",        20),
            stn("observation",      "Emergency", "Observation",    60),
            stn("decision",         "Emergency", "Observation",    10),
            stn("discharge",        "Discharge", "Exit",            0),
        ],
    },
    "Minor Injury / Trauma": {
        "acuity": 3,
        "stations": [
            stn("arrival",       "Ambulance Bay", "Entrance", 0),
            stn("triage",        "Emergency", "Triage",       12),
            stn("bed_assigned",  "Emergency", "ER Bay",       15),
            stn("imaging",       "Imaging",   "X-ray",        30),
            stn("treatment",     "Emergency", "ER Bay",       30),
            stn("decision",      "Emergency", "ER Bay",       10),
            stn("discharge",     "Discharge", "Exit",          0),
        ],
    },
    "Tox / Overdose": {
        "acuity": 2,
        "stations": [
            stn("arrival",      "Ambulance Bay", "Entrance", 0),
            stn("triage",       "Emergency", "Triage",       10),
            stn("bed_assigned", "Emergency", "ER Bay",       10),
            stn("labs_ordered", "Labs",      "Toxicology",   40),
            stn("observation",  "Emergency", "Observation",  120),
            stn("decision",     "Emergency", "Observation",  10),
            stn("discharge",    "Discharge", "Exit",          0),
        ],
    },
    "Sepsis": {
        "acuity": 2,
        "stations": [
            stn("arrival",      "Ambulance Bay", "Entrance", 0),
            stn("triage",       "Emergency", "Triage",       10),
            stn("bed_assigned", "Emergency", "ER Bay",       10),
            stn("labs_ordered", "Labs",      "Microbiology", 45),
            stn("imaging",      "Imaging",   "CT",           35),
            stn("admit",        "Wards",     "Medical Ward", 60),
        ],
    },
    "General Medical": {
        "acuity": 4,
        "stations": [
            stn("arrival",      "Ambulance Bay", "Entrance", 0),
            stn("triage",       "Emergency", "Triage",       12),
            stn("bed_assigned", "Emergency", "ER Bay",       20),
            stn("labs_ordered", "Labs",      "Chemistry",    35),
            stn("decision",     "Emergency", "ER Bay",       15),
            stn("discharge",    "Discharge", "Exit",          0),
        ],
    },
}

REASON_TO_PATHWAY = [
    (re.compile(r"myocardial|cardiac|chest|angina|heart failure|congestive", re.I), "Chest Pain Rule-Out"),
    (re.compile(r"laceration|fracture|sprain|injury|concussion|wound|burn", re.I),  "Minor Injury / Trauma"),
    (re.compile(r"overdose|poisoning|intoxicat", re.I),                             "Tox / Overdose"),
    (re.compile(r"sepsis|septic|infection|pneumonia|cystitis|pyelonephritis", re.I),"Sepsis"),
]
COMPLAINT = {
    "Chest Pain Rule-Out": "chest pain",
    "Minor Injury / Trauma": "injury",
    "Tox / Overdose": "possible overdose",
    "Sepsis": "fever / suspected infection",
    "General Medical": "general medical",
}

def pathway_for(reason: str) -> str:
    r = reason or ""
    for rx, pw in REASON_TO_PATHWAY:
        if rx.search(r):
            return pw
    return "General Medical"

def clean_name(first, last):
    f = re.sub(r"\d+$", "", first or "").strip()
    l = re.sub(r"\d+$", "", last or "").strip()
    return f"{f} {l[:1]}." if f and l else (f or "Patient")

def vitals_for(acuity):
    j = lambda a, b: RNG.randint(a, b)
    if acuity <= 2:
        return {"hr": j(92, 118), "sbp": j(105, 150), "spo2": j(92, 97),
                "rr": j(18, 24), "temp_c": round(RNG.uniform(36.6, 38.4), 1), "pain": j(5, 9)}
    if acuity == 3:
        return {"hr": j(78, 100), "sbp": j(112, 140), "spo2": j(95, 99),
                "rr": j(14, 20), "temp_c": round(RNG.uniform(36.4, 37.6), 1), "pain": j(3, 7)}
    return {"hr": j(66, 88), "sbp": j(115, 135), "spo2": j(97, 100),
            "rr": j(12, 18), "temp_c": round(RNG.uniform(36.2, 37.2), 1), "pain": j(1, 5)}

# ---------------------------------------------------------------- load raw
def load_patients():
    pts = {}
    with open(RAW / "patients.csv") as f:
        for r in csv.DictReader(f):
            pts[r["Id"]] = r
    return pts

def load_ed_encounters(pts):
    rows = []
    with open(RAW / "encounters.csv") as f:
        for r in csv.DictReader(f):
            if r["ENCOUNTERCLASS"] not in ("emergency", "urgentcare"):
                continue
            p = pts.get(r["PATIENT"])
            if not p:
                continue
            try:
                start = datetime.fromisoformat(r["START"].replace("Z", "")[:19])
            except Exception:
                continue
            rows.append({"start": start, "reason": r["REASONDESCRIPTION"],
                         "sex": p["GENDER"], "first": p["FIRST"], "last": p["LAST"],
                         "birth": p["BIRTHDATE"]})
    # stable order for determinism
    rows.sort(key=lambda x: (x["start"], x["first"], x["last"]))
    return rows

def age_of(birth, on):
    try:
        b = datetime.fromisoformat(birth[:10])
        return max(0, int((on - b).days // 365.25))
    except Exception:
        return RNG.randint(25, 80)

def load_hf_admissions():
    d = json.load(open(RAW / "hospital_admissions.json"))
    rows = [x["row"] for x in d["rows"]]
    los = [r["LengthOfStay"] for r in rows if isinstance(r.get("LengthOfStay"), (int, float))]
    outcomes = Counter(r["PredictedOutcome"] for r in rows)
    return {"n": len(rows), "los_days": los, "outcomes": dict(outcomes)}

# ---------------------------------------------------------------- journey synth
def build_journey(pathway, arrival, admitted, afternoon_backup):
    """Return (events, station_spans, los_min). Durations synthesized; sum = LOS."""
    spec = PATHWAYS[pathway]
    events, spans = [], []
    t = arrival
    for i, s in enumerate(spec["stations"]):
        dur = s["base"]
        if dur > 0:
            dur = max(3, int(RNG.gauss(dur, dur * 0.28)))
        # recurring bottleneck: cardiology consults queued in 14:00-17:00 wait longer
        if s["type"] == "consult_requested" and afternoon_backup and 14 <= t.hour < 17:
            dur += RNG.randint(35, 75)
        # boarding after decision if admitted
        if s["type"] in ("decision", "observation") and admitted:
            dur += RNG.randint(30, 90)
        events.append({"t": t.isoformat(timespec="minutes"), "type": s["type"],
                       "dept": s["dept"], "area": s["area"]})
        if dur > 0:
            spans.append({"dept": s["dept"], "area": s["area"], "type": s["type"],
                          "start": t.isoformat(timespec="minutes"), "min": dur})
        t += timedelta(minutes=dur)
    los = int((t - arrival).total_seconds() // 60)
    return events, spans, los

def resources_from_spans(spans):
    er = sum(s["min"] for s in spans if s["dept"] == "Emergency")
    return {
        "er_bed_min": er,
        "nurse_min": int(er * 0.35),
        "doctor_min": int(er * 0.2),
        "labs": sum(1 for s in spans if s["dept"] == "Labs"),
        "imaging": sum(1 for s in spans if s["dept"] == "Imaging"),
    }

# ---------------------------------------------------------------- history
def make_history(enc_rows, hf):
    """~24 completed journeys/day for 7 days, remapped into the 7-day window,
    preserving hour-of-day so the diurnal + afternoon-cardiology pattern is real-ish."""
    hist = []
    per_day = 24
    idx = 0
    for day in range(HISTORY_DAYS, 0, -1):
        day_date = (NOW - timedelta(days=day)).date()
        for _ in range(per_day):
            src = enc_rows[idx % len(enc_rows)]; idx += 1
            pathway = pathway_for(src["reason"])
            hour = src["start"].hour
            arrival = datetime(day_date.year, day_date.month, day_date.day,
                               hour, RNG.randint(0, 59))
            admitted = pathway in ("Sepsis",) or RNG.random() < 0.18
            events, spans, los = build_journey(pathway, arrival, admitted, afternoon_backup=True)
            hist.append({
                "patient_id": f"H-{arrival.strftime('%m%d')}-{idx:04d}",
                "name": clean_name(src["first"], src["last"]),
                "age": age_of(src["birth"], arrival),
                "sex": "female" if src["sex"] == "F" else "male",
                "pathway": pathway,
                "complaint": COMPLAINT[pathway],
                "acuity": PATHWAYS[pathway]["acuity"],
                "arrival": arrival.isoformat(timespec="minutes"),
                "los_min": los,
                "admitted": admitted,
                "disposition": "admitted" if admitted else "discharged",
            })
    return hist

def eta_model(history):
    """FlowTwin ETA: empirical quantiles of LOS per pathway -> point + 80% interval."""
    by = defaultdict(list)
    for h in history:
        by[h["pathway"]].append(h["los_min"])
    model = {}
    for pw, xs in by.items():
        xs = sorted(xs)
        q = lambda p: xs[min(len(xs) - 1, int(len(xs) * p))]
        model[pw] = {"p10": q(0.10), "p50": q(0.50), "p80": q(0.80),
                     "p90": q(0.90), "n": len(xs)}
    return model

def calibrate(history, model):
    """How often did actual LOS fall inside the pathway's p10-p90 interval? Median abs err vs p50."""
    covered = tot = 0
    errs = []
    for h in history:
        m = model.get(h["pathway"])
        if not m:
            continue
        tot += 1
        if m["p10"] <= h["los_min"] <= m["p90"]:
            covered += 1
        errs.append(abs(h["los_min"] - m["p50"]))
    return {
        "interval": "p10-p90 (target 80%)",
        "coverage_pct": round(100 * covered / tot, 1) if tot else None,
        "median_abs_error_min": int(statistics.median(errs)) if errs else None,
        "n": tot,
    }

# ---------------------------------------------------------------- current patients
def make_current(enc_rows, model, start_idx=500):
    """~6 patients currently in-hospital (arrived within the last few hours, not discharged)."""
    current = []
    picks = [("Chest Pain Rule-Out", 205), ("Minor Injury / Trauma", 95),
             ("Sepsis", 150), ("General Medical", 70),
             ("Tox / Overdose", 160), ("Minor Injury / Trauma", 40)]
    idx = start_idx
    for k, (want_pw, elapsed) in enumerate(picks):
        # find a source encounter matching the pathway for a real name/age/sex
        src = None
        for _ in range(len(enc_rows)):
            cand = enc_rows[idx % len(enc_rows)]; idx += 1
            if pathway_for(cand["reason"]) == want_pw:
                src = cand; break
        if src is None:
            src = enc_rows[idx % len(enc_rows)]; idx += 1
        arrival = NOW - timedelta(minutes=elapsed)
        events, spans, los = build_journey(want_pw, arrival, admitted=False, afternoon_backup=True)
        current.append(_ops_state(f"P-{1040+k}", clean_name(src["first"], src["last"]),
                                   age_of(src["birth"], arrival),
                                   "female" if src["sex"] == "F" else "male",
                                   want_pw, arrival, events, spans, los, model))
    return current

def _ops_state(pid, name, age, sex, pathway, arrival, events, spans, los, model):
    m = model.get(pathway, {"p50": los, "p10": int(los * .8), "p90": int(los * 1.3)})
    elapsed = int((NOW - arrival).total_seconds() // 60)
    predicted_exit = arrival + timedelta(minutes=m["p50"])
    ci_low = arrival + timedelta(minutes=m["p10"])
    ci_high = arrival + timedelta(minutes=m["p90"])
    # where are they now?
    cur = events[0]
    passed = 0
    for s in spans:
        passed += s["min"]
        cur = {"dept": s["dept"], "area": s["area"], "type": s["type"]}
        if passed >= elapsed:
            break
    over = elapsed > m["p50"]
    risk = "high" if elapsed > m["p80"] else ("elevated" if over else "on_track")
    blocker, rec = _blocker_rec(pathway, cur, arrival)
    return {
        "patient_id": pid, "name": name, "age": age, "sex": sex,
        "complaint": COMPLAINT[pathway], "pathway": pathway,
        "acuity": PATHWAYS[pathway]["acuity"],
        "arrival_mode": "ambulance" if PATHWAYS[pathway]["acuity"] <= 2 else "walk-in",
        "arrival_time": arrival.isoformat(timespec="minutes"),
        "current_department": cur["dept"], "current_area": cur["area"],
        "elapsed_min": elapsed,
        "vitals": vitals_for(PATHWAYS[pathway]["acuity"]),
        "events": events,
        "resources": resources_from_spans(spans),
        "predicted_exit": predicted_exit.isoformat(timespec="minutes"),
        "predicted_exit_ci": {"low": ci_low.isoformat(timespec="minutes"),
                              "high": ci_high.isoformat(timespec="minutes"),
                              "interval": "80%"},
        "predicted_los_min": m["p50"], "benchmark_los_min": m["p50"],
        "delay_risk": risk, "blocker": blocker, "recommendation": rec,
        "signals": {"wearable": None, "vocal_biomarker": None,
                    "_note": "pluggable sources — mention only, not built"},
        "guard": {"topic_ok": True, "safety_ok": True},
        "provenance": {"identity": "Synthea", "complaint": "Synthea",
                       "stations_and_times": "synthesized", "vitals": "synthesized",
                       "eta": "FlowTwin ETA (empirical quantiles over 7-day history)"},
    }

def _blocker_rec(pathway, cur, arrival):
    t = cur["type"]
    if t in ("consult_requested",) and cur["dept"] == "Cardiology":
        return "cardiology_queue", {
            "action": "escalate_consult_or_move_to_observation",
            "explanation": "Stable and waiting on the cardiology consult queue while holding an ER bay.",
            "impact_min": 45}
    if t in ("labs_ordered",):
        return "labs_pending", {
            "action": "chase_lab_result",
            "explanation": "Awaiting lab result before disposition.",
            "impact_min": 25}
    if t in ("imaging",):
        return "imaging_queue", {
            "action": "prioritize_imaging_slot",
            "explanation": "Waiting on an imaging slot before treatment can proceed.",
            "impact_min": 20}
    if t in ("observation", "decision"):
        return "awaiting_disposition", {
            "action": "confirm_discharge_or_bed",
            "explanation": "Medically progressing; confirm disposition to free the bay.",
            "impact_min": 30}
    return "none", {"action": "monitor", "explanation": "On the expected pathway.", "impact_min": 0}

# ---------------------------------------------------------------- hero: Sarah
def build_sarah(model):
    arrival = NOW - timedelta(minutes=100)  # arrived 100 min ago
    pathway = "Chest Pain Rule-Out"
    events, spans, los = build_journey(pathway, arrival, admitted=False, afternoon_backup=False)
    st = _ops_state("P-1042", "Sarah M.", 58, "female", pathway, arrival, events, spans, los, model)
    st["complaint"] = "chest pain"
    st["current_department"], st["current_area"] = "Cardiology", "Consult"
    st["blocker"] = "cardiology_queue"
    st["recommendation"] = {
        "action": "move_to_observation",
        "explanation": "Stable, troponin negative, waiting 100 min on cardiology while holding ER Bay 4.",
        "impact_min": 45}
    st["delay_risk"] = "high"
    st["optimization"] = [
        {"issue": "Troponin ordered after bed assignment, not at triage", "saving_min": 35,
         "tag": "sequence"},
        {"issue": "No wearable ingested; overnight arrhythmia would have pre-ordered the consult",
         "saving_min": 50, "tag": "sequence (illustrative source — mention only)"},
        {"issue": "Medically ready to move ~40 min before bed was requested", "saving_min": 40,
         "tag": "timing"},
    ]
    st["hero"] = True
    return st

# ---------------------------------------------------------------- admin KPIs
def admin_kpis(history, current, model, calib, hf):
    # avoidable-wait ranking by department (sum of station minutes beyond a lean target)
    lean = {"Emergency": 30, "Cardiology": 25, "Imaging": 25, "Labs": 30, "Wards": 60}
    avoidable = Counter()
    dept_load = Counter()
    for h in history:
        _, spans, _ = build_journey(h["pathway"], datetime.fromisoformat(h["arrival"]),
                                    h["admitted"], afternoon_backup=True)
        for s in spans:
            dept_load[s["dept"]] += s["min"]
            avoidable[s["dept"]] += max(0, s["min"] - lean.get(s["dept"], 30))
    rank = [{"dept": d, "avoidable_wait_min": m,
             "cost_of_delay_eur": round(m / 60 * BED_HOUR_COST_EUR)}
            for d, m in avoidable.most_common(6)]
    # recurring afternoon cardiology backup
    card_by_hour = defaultdict(list)
    for h in history:
        if h["pathway"] == "Chest Pain Rule-Out":
            card_by_hour[datetime.fromisoformat(h["arrival"]).hour].append(h["los_min"])
    pm = [x for hh, xs in card_by_hour.items() if 14 <= hh < 17 for x in xs]
    other = [x for hh, xs in card_by_hour.items() if not (14 <= hh < 17) for x in xs]
    bottleneck = {
        "dept": "Cardiology", "window": "14:00-17:00",
        "avg_los_in_window_min": int(statistics.mean(pm)) if pm else None,
        "avg_los_other_min": int(statistics.mean(other)) if other else None,
        "note": "Weekday-afternoon cardiology consult queue backs up ER beds (synthesized pattern, visible across the 7-day scrubber).",
    }
    # arrival forecast next 3h by mode (historical rate at this hour-of-day)
    hour_counts = Counter()
    for h in history:
        hour_counts[datetime.fromisoformat(h["arrival"]).hour] += 1
    fc = []
    for dh in range(1, 4):
        hh = (NOW + timedelta(hours=dh)).hour
        rate = hour_counts.get(hh, 0) / HISTORY_DAYS
        fc.append({"hour": f"{hh:02d}:00", "expected_arrivals": round(rate, 1)})
    return {
        "generated_now": NOW.isoformat(timespec="minutes"),
        "current_census": len(current),
        "avoidable_wait_rank": rank,
        "recurring_bottleneck": bottleneck,
        "arrival_forecast_next_3h": fc,
        "eta_calibration": calib,
        "eta_model_quantiles_min": model,
        "hf_admissions_benchmark": {
            "n": hf["n"], "outcome_mix": hf["outcomes"],
            "median_los_days": statistics.median(hf["los_days"]) if hf["los_days"] else None,
            "source": "infinite-dataset-hub/HospitalAdmissions (Hugging Face)",
        },
        "assumptions": {"bed_hour_cost_eur": BED_HOUR_COST_EUR,
                        "lean_targets_min": lean},
    }

# ---------------------------------------------------------------- scenario
def scenario(sarah):
    return {
        "hero": "P-1042",
        "now": NOW.isoformat(timespec="minutes"),
        "beats": [
            {"t_offset_min": 0,  "id": "meet_sarah", "desc": "Sarah, 58, chest pain — predicted exit on track."},
            {"t_offset_min": 90, "id": "lab_delay", "desc": "Lab delay — predicted exit slides later, ring turns amber."},
            {"t_offset_min": 150,"id": "cardio_overload", "desc": "Cardiology overload — cluster near Cardiology, Sarah goes red."},
            {"t_offset_min": 160,"id": "resolve", "desc": "One action: move to Observation, escalate consult, assign bed O-12."},
        ],
        "patient": sarah,
    }

# ---------------------------------------------------------------- main
def main():
    pts = load_patients()
    enc = load_ed_encounters(pts)
    hf = load_hf_admissions()

    history = make_history(enc, hf)
    model = eta_model(history)
    calib = calibrate(history, model)

    sarah = build_sarah(model)
    current = [sarah] + make_current(enc, model)

    kpis = admin_kpis(history, current, model, calib, hf)

    def dump(name, obj):
        (SEED / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False))
        print(f"  wrote data/seed/{name}")

    print("FlowTwin seed:")
    dump("patients_today.json", {"generated_now": NOW.isoformat(timespec="minutes"),
                                 "count": len(current), "patients": current})
    dump("history_7d.json", {"window_days": HISTORY_DAYS, "anchor_now": NOW.isoformat(timespec="minutes"),
                             "count": len(history), "journeys": history})
    dump("scenario.json", scenario(sarah))
    dump("admin_kpis.json", kpis)
    print(f"  {len(current)} current patients, {len(history)} historical journeys")
    print(f"  ETA calibration: {calib['coverage_pct']}% coverage, ±{calib['median_abs_error_min']} min median error")
    print(f"  bottleneck: Cardiology 14-17h avg {kpis['recurring_bottleneck']['avg_los_in_window_min']} min "
          f"vs {kpis['recurring_bottleneck']['avg_los_other_min']} min otherwise")

if __name__ == "__main__":
    main()
