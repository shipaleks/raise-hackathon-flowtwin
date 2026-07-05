#!/usr/bin/env python3
"""
FlowTwin seed builder v3 — a REAL hospital, not a simulation of one.

Sources (all committed under data/seed/ by their fetchers):
  hk_live.json / hk_history.json  — Hong Kong Hospital Authority A&E waiting
      times for 18 hospitals: live + 48 h at 15-min resolution + 7 days hourly
      (data/fetch_hk.py). REAL, updated every 15 minutes.
  mimic_stats.json — distributions from real de-identified ED stays
      (MIMIC-IV-ED; open demo subset bundled, full dataset drops in)
      (data/build_mimic_stats.py). REAL patient-level statistics.
  Synthea patients.csv — synthetic identity registry (names/sex/age ONLY).

What the builder does:
  The hero hospital (default: Queen Mary Hospital) gets a patient-level cast
  covering the whole scrubber window. Each synthetic persona's WAIT is a
  lognormal draw through the hospital's REAL published p50/p95 for their
  triage category at their arrival snapshot; treatment tails come from MIMIC
  LOS quantiles; acuity mix and admission rates are anchored to published HA
  figures. Identities are synthetic by design — the feed has no patient-level
  data, and that is the point (privacy).

REAL: hospital, waits (p50/p95 per triage cat), the daily climb, update times.
ESTIMATED (labeled): attendance scale (~300/day), station-level positions,
  treatment splits, ward/ICU occupancy (representative), all money figures.

Deterministic: fixed RNG seed; re-running with the same fetched feed
reproduces the same world. Ends with an engine-parity occupancy self-check.
"""
import csv, json, math, random, re, statistics
from datetime import datetime, timedelta
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
SEED = ROOT / "seed"

RNG = random.Random(42)

# ---------------------------------------------------------------- config
HOSPITAL = "QMH"                     # hero hospital slug (see hk_live.json meta)
ATTENDANCE_PER_DAY = 300             # stated estimate for QMH A&E (~110k/yr)
ADMIT_VIA_AE = 0.27                  # HA-published ballpark share admitted via A&E
BED_HOUR_COST_HKD = 400              # stated assumption (≈ €47)
HKD_PER_EUR = 8.5
TRIAGE_MIX = {1: 0.01, 2: 0.03, 3: 0.44, 4: 0.48, 5: 0.04}   # HA-published approx.

hk_live = json.loads((SEED / "hk_live.json").read_text())
hk_hist = json.loads((SEED / "hk_history.json").read_text())
mimic = json.loads((SEED / "mimic_stats.json").read_text())

HOSP_META = hk_live["meta"][HOSPITAL]
SERIES = hk_hist["series"][HOSPITAL]
PATTERN = {p["hour"]: p for p in hk_hist["hour_pattern_7d"][HOSPITAL]}

LIVE_T = datetime.fromisoformat(hk_hist["anchor_hkt"])       # e.g. Jul 5 02:45
NOW = LIVE_T.replace(hour=11, minute=0)                      # demo anchor 11:00…
if NOW > LIVE_T:
    NOW -= timedelta(days=1)                                 # …of the last full demo day
CAST_START = (NOW - timedelta(days=1)).replace(hour=0, minute=0) - timedelta(hours=8)

# ---------------------------------------------------------------- real wait model
def series_at(t: datetime):
    """Feed snapshot nearest to t (15-min series; hourly further back)."""
    best, bd = None, None
    for p in SERIES:                                          # sorted ascending
        d = abs((datetime.fromisoformat(p["t"]) - t).total_seconds())
        if bd is None or d < bd:
            best, bd = p, d
        elif d > bd:
            break
    return best or {"t3p50": 30, "t3p95": 90, "t45p50": 240, "t45p95": 420, "t2": 12}

def lognorm_draw(p50, p95):
    """One wait drawn from the lognormal implied by the REAL published
    median and 95th percentile."""
    p50 = max(2, p50 or 2)
    p95 = max(p50 + 5, p95 or p50 * 2)
    mu = math.log(p50)
    sigma = max(0.15, math.log(p95 / p50) / 1.645)
    v = RNG.lognormvariate(mu, sigma)
    return min(v, p95 * 1.3)

def real_wait_draw(acuity: int, t: datetime) -> int:
    s = series_at(t)
    if acuity == 1:
        return 0
    if acuity == 2:
        return round(min(15, max(2, RNG.gauss(s.get("t2") or 12, 3))))
    if acuity == 3:
        return round(lognorm_draw(s.get("t3p50"), s.get("t3p95")))
    return round(lognorm_draw(s.get("t45p50"), s.get("t45p95")))

# ---------------------------------------------------------------- MIMIC-anchored draws
def mimic_q(band: str, dispo: str):
    """LOS quantiles for a band, borrowing the neighbour where the demo subset
    is thin (labeled in the About ledger)."""
    q = mimic["los_min_quantiles"]
    key = f"acuity{band}_{dispo}"
    if key in q and q[key].get("p50"):
        return q[key]
    alt = {"45": "3", "3": "12", "12": "3"}[band]
    return q.get(f"acuity{alt}_{dispo}",
                 q.get(f"acuity{alt}_all", {"p10": 60, "p25": 120, "p50": 240, "p80": 420, "p90": 540}))

def treatment_tail(acuity: int, admitted: bool) -> int:
    """Minutes of care AFTER first consultation — MIMIC LOS quantile draw
    scaled by a stated 0.5 split (MIMIC LOS spans door-to-out)."""
    band = "12" if acuity <= 2 else ("3" if acuity == 3 else "45")
    qq = mimic_q(band, "admitted" if admitted else "discharged")
    lo, mid, hi = qq.get("p25") or 90, qq.get("p50") or 200, qq.get("p80") or 380
    u = RNG.random()
    los = lo + (mid - lo) * u * 2 if u < 0.5 else mid + (hi - mid) * (u - 0.5) * 2
    tail = los * 0.5
    if acuity >= 4:
        tail = min(tail, RNG.uniform(25, 80) if not admitted else 100)
    return max(15, round(tail))

ADMIT_RATE = {1: 0.90, 2: 0.60, 3: 0.33, 4: 0.12, 5: 0.03}   # MIMIC ordering, scaled to ~27% overall

def sample_acuity() -> int:
    r = RNG.random()
    acc = 0
    for a, w in TRIAGE_MIX.items():
        acc += w
        if r < acc:
            return a
    return 4

# ---------------------------------------------------------------- pathways (station templates)
def stn(type_, dept, area, share, opt=0.0):
    """share = fraction of the treatment tail this station takes."""
    return {"type": type_, "dept": dept, "area": area, "share": share, "opt": opt}

PATHWAYS = {
    "Chest Pain Rule-Out": {
        "acuity": 2, "admit_to": ("Cardiology", "Telemetry"),
        "complaint": "chest pain",
        "stations": [
            stn("bed_assigned",      "Emergency", "Cubicles",   0.10),
            stn("labs_ordered",      "Labs",      "Chemistry",  0.20),
            stn("ecg",               "Emergency", "Cubicles",   0.08),
            stn("consult_requested", "Cardiology","Consult",    0.32),
            stn("consult_done",      "Cardiology","Consult",    0.08),
            stn("observation",       "EMW",       "Obs Beds",   0.17),
            stn("decision",          "EMW",       "Obs Beds",   0.05),
        ],
    },
    "Stroke Alert": {
        "acuity": 1, "admit_to": ("ICU", "Beds"),
        "complaint": "sudden weakness / FAST positive",
        "stations": [
            stn("resus",     "Emergency", "Resus", 0.22),
            stn("imaging",   "Imaging",   "CT",    0.26),
            stn("imaging",   "Imaging",   "MRI",   0.20, opt=0.5),
            stn("treatment", "Emergency", "Resus", 0.32),
        ],
    },
    "Minor Injury": {
        "acuity": 4, "admit_to": ("Surgical Ward", "Beds"),
        "complaint": "injury",
        "stations": [
            stn("consult_done", "Emergency", "Consult Rooms", 0.25),
            stn("imaging",      "Imaging",   "X-ray",         0.35, opt=0.35),
            stn("treatment",    "Emergency", "Consult Rooms", 0.25),
            stn("pharmacy",     "Pharmacy",  "Dispensary",    0.15),
        ],
    },
    "Abdominal Pain Workup": {
        "acuity": 3, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "abdominal pain",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",   0.15),
            stn("labs_ordered", "Labs",      "Chemistry",  0.25),
            stn("imaging",      "Imaging",   "Ultrasound", 0.25, opt=0.4),
            stn("observation",  "EMW",       "Obs Beds",   0.25),
            stn("decision",     "EMW",       "Obs Beds",   0.10),
        ],
    },
    "Appendicitis — OR": {
        "acuity": 2, "admit_to": ("Surgical Ward", "Beds"),
        "complaint": "acute abdomen",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",   0.12),
            stn("labs_ordered", "Labs",      "Chemistry",  0.18),
            stn("imaging",      "Imaging",   "Ultrasound", 0.15),
            stn("pre_op",       "Surgery",   "Pre-Op",     0.15),
            stn("surgery",      "Surgery",   "OR 1",       0.25),
            stn("recovery",     "Surgery",   "Recovery",   0.15),
        ],
    },
    "Hip Fracture": {
        "acuity": 2, "admit_to": ("Geriatric Ward", "Beds"),
        "complaint": "fall — hip pain",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles", 0.15),
            stn("imaging",      "Imaging",   "X-ray",    0.20),
            stn("treatment",    "Emergency", "Cubicles", 0.15),
            stn("pre_op",       "Surgery",   "Pre-Op",   0.15),
            stn("surgery",      "Surgery",   "OR 2",     0.22),
            stn("recovery",     "Surgery",   "Recovery", 0.13),
        ],
    },
    "Sepsis": {
        "acuity": 2, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "fever / suspected infection",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",     0.15),
            stn("labs_ordered", "Labs",      "Microbiology", 0.25),
            stn("imaging",      "Imaging",   "CT",           0.20),
            stn("treatment",    "Emergency", "Cubicles",     0.40),
        ],
    },
    "Tox / Overdose": {
        "acuity": 2, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "possible overdose",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",   0.12),
            stn("labs_ordered", "Labs",      "Toxicology", 0.22),
            stn("observation",  "EMW",       "Obs Beds",   0.56),
            stn("decision",     "EMW",       "Obs Beds",   0.10),
        ],
    },
    "COPD Exacerbation": {
        "acuity": 3, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "shortness of breath",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",  0.15),
            stn("labs_ordered", "Labs",      "Chemistry", 0.18),
            stn("treatment",    "Emergency", "Cubicles",  0.32),
            stn("observation",  "EMW",       "Obs Beds",  0.27),
            stn("decision",     "EMW",       "Obs Beds",  0.08),
        ],
    },
    "Renal Colic": {
        "acuity": 3, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "flank pain",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",   0.15),
            stn("labs_ordered", "Labs",      "Chemistry",  0.18),
            stn("imaging",      "Imaging",   "CT",         0.25, opt=0.3),
            stn("treatment",    "Emergency", "Cubicles",   0.27),
            stn("pharmacy",     "Pharmacy",  "Dispensary", 0.15),
        ],
    },
    "GI Bleed": {
        "acuity": 2, "admit_to": ("Step-Down", "Beds"),
        "complaint": "GI bleeding",
        "stations": [
            stn("bed_assigned", "Emergency", "Cubicles",  0.15),
            stn("labs_ordered", "Labs",      "Chemistry", 0.20),
            stn("endoscopy",    "Endoscopy", "Suite",     0.35),
            stn("observation",  "EMW",       "Obs Beds",  0.30),
        ],
    },
    "Arrhythmia": {
        "acuity": 2, "admit_to": ("Cardiology", "Telemetry"),
        "complaint": "palpitations",
        "stations": [
            stn("bed_assigned",      "Emergency",  "Cubicles",  0.10),
            stn("ecg",               "Emergency",  "Cubicles",  0.10),
            stn("labs_ordered",      "Labs",       "Chemistry", 0.15),
            stn("telemetry",         "Cardiology", "Telemetry", 0.40),
            stn("consult_requested", "Cardiology", "Consult",   0.18),
            stn("decision",          "Cardiology", "Telemetry", 0.07),
        ],
    },
    "General Medical": {
        "acuity": 4, "admit_to": ("Medical Ward", "Beds"),
        "complaint": "general medical",
        "stations": [
            stn("consult_done", "Emergency", "Consult Rooms", 0.35),
            stn("labs_ordered", "Labs",      "Chemistry",     0.30, opt=0.5),
            stn("decision",     "Emergency", "Consult Rooms", 0.20),
            stn("pharmacy",     "Pharmacy",  "Dispensary",    0.15, opt=0.4),
        ],
    },
}

# pathway choice per acuity — MIMIC weights where mapped, HK-plausible priors elsewhere
PATHWAY_BY_ACUITY = {
    1: [("Stroke Alert", 5), ("Sepsis", 3), ("Arrhythmia", 2)],
    2: [("Chest Pain Rule-Out", 30), ("Arrhythmia", 12), ("Sepsis", 14), ("Tox / Overdose", 8),
        ("GI Bleed", 7), ("Appendicitis — OR", 7), ("Hip Fracture", 8), ("Stroke Alert", 4),
        ("COPD Exacerbation", 10)],
    3: [("Abdominal Pain Workup", 26), ("COPD Exacerbation", 16), ("Renal Colic", 12),
        ("Chest Pain Rule-Out", 10), ("Minor Injury", 16), ("General Medical", 20)],
    4: [("Minor Injury", 42), ("General Medical", 46), ("Abdominal Pain Workup", 12)],
    5: [("General Medical", 70), ("Minor Injury", 30)],
}

WARD_STAY_MIN = {
    ("ICU", "Beds"): (16 * 60, 48 * 60),
    ("Medical Ward", "Beds"): (14 * 60, 48 * 60),
    ("Surgical Ward", "Beds"): (12 * 60, 40 * 60),
    ("Geriatric Ward", "Beds"): (24 * 60, 72 * 60),
    ("Step-Down", "Beds"): (10 * 60, 36 * 60),
    ("Cardiology", "Telemetry"): (8 * 60, 20 * 60),
}

# capacities — must mirror frontend/src/sim/layout.ts (self-check only)
CAPACITY = {
    ("Emergency", "Registration"): 6, ("Emergency", "Triage"): 3,
    ("Emergency", "Waiting Hall"): 48, ("Emergency", "Consult Rooms"): 8,
    ("Emergency", "Cubicles"): 16, ("Emergency", "Resus"): 4,
    ("Imaging", "X-ray"): 2, ("Imaging", "CT"): 2, ("Imaging", "MRI"): 1, ("Imaging", "Ultrasound"): 2,
    ("Labs", "Chemistry"): 4, ("Labs", "Microbiology"): 2, ("Labs", "Toxicology"): 2,
    ("Pharmacy", "Dispensary"): 3, ("Discharge", "Exit"): 6,
    ("EMW", "Obs Beds"): 12,
    ("Cardiology", "Consult"): 3, ("Cardiology", "Cath Lab"): 1, ("Cardiology", "Telemetry"): 6,
    ("ICU", "Beds"): 6,
    ("Surgery", "Pre-Op"): 3, ("Surgery", "OR 1"): 1, ("Surgery", "OR 2"): 1, ("Surgery", "Recovery"): 5,
    ("Endoscopy", "Suite"): 2,
    ("Medical Ward", "Beds"): 12, ("Surgical Ward", "Beds"): 10,
    ("Geriatric Ward", "Beds"): 8, ("Step-Down", "Beds"): 6,
}

# ---------------------------------------------------------------- identity pool
def load_names():
    rows = []
    with open(RAW / "patients.csv") as f:
        for r in csv.DictReader(f):
            first = re.sub(r"\d+$", "", r["FIRST"] or "").strip()
            last = re.sub(r"\d+$", "", r["LAST"] or "").strip()
            if not first or not last:
                continue
            rows.append({"name": f"{first} {last[:1]}.",
                         "sex": "female" if r["GENDER"] == "F" else "male",
                         "birth": r["BIRTHDATE"]})
    rows.sort(key=lambda x: (x["name"], x["birth"]))
    return rows

NAMES = None

def age_of(birth):
    try:
        b = datetime.fromisoformat(birth[:10])
        return max(1, int((NOW - b).days // 365.25))
    except Exception:
        return RNG.randint(20, 85)

class NamePool:
    def __init__(self, start=0):
        self.idx = start
        self.used = set()

    def take(self, min_age=None, max_age=None):
        for _ in range(len(NAMES) * 2):
            cand = NAMES[self.idx % len(NAMES)]
            self.idx += 1
            if cand["name"] in self.used:
                continue
            age = age_of(cand["birth"])
            if min_age and age < min_age:
                continue
            if max_age and age > max_age:
                continue
            self.used.add(cand["name"])
            return {**cand, "age": age}
        cand = NAMES[self.idx % len(NAMES)]
        self.idx += 1
        return {**cand, "age": age_of(cand["birth"])}

def vitals_for(acuity):
    vq = mimic.get("vitals_quantiles_by_acuity", {}).get(str(min(acuity, 3)))
    def draw(key, lo, hi, r=0):
        if vq and vq.get(key, {}).get("p25") is not None and vq[key].get("p75") is not None:
            v = RNG.uniform(vq[key]["p25"], vq[key]["p75"])
        else:
            v = RNG.uniform(lo, hi)
        return round(v, r) if r else round(v)
    return {"hr": draw("hr", 68, 110), "sbp": draw("sbp", 105, 150),
            "spo2": min(100, draw("spo2", 93, 99)), "rr": draw("rr", 13, 22),
            "temp_c": draw("temp_c", 36.3, 37.8, 1), "pain": min(10, draw("pain", 1, 8))}

# ---------------------------------------------------------------- journey synthesis
def build_journey(pathway, acuity, arrival, admitted, mode, wait_min=None, ward_scope=False):
    """Events for one persona. The WAIT segment is a draw from the hospital's
    real published distribution at the arrival moment; the treatment tail is
    MIMIC-scaled and split across the pathway's station template."""
    spec = PATHWAYS[pathway]
    events = []
    t = arrival
    def ev(type_, dept, area, dur):
        nonlocal t
        events.append({"t": t.isoformat(timespec="minutes"), "type": type_,
                       "dept": dept, "area": area})
        t += timedelta(minutes=max(0, round(dur)))

    ev("arrival", "Ambulance Bay", "Entrance", 3)             # walk-ins re-routed by the UI
    if acuity > 1:
        ev("triage", "Emergency", "Triage", RNG.uniform(4, 8))
    wait = real_wait_draw(acuity, arrival) if wait_min is None else wait_min
    if acuity >= 3 and wait > 4:
        ev("waiting", "Emergency", "Waiting Hall", wait)
    elif acuity == 2 and wait > 2:
        ev("waiting", "Emergency", "Cubicles", wait)          # cat-2: monitored bay, short

    tail = treatment_tail(acuity, admitted)
    stations = [s for s in spec["stations"] if not (s["opt"] and RNG.random() < s["opt"])]
    share_sum = sum(s["share"] for s in stations) or 1
    for i, s in enumerate(stations):
        dur = tail * (s["share"] / share_sum) * RNG.uniform(0.75, 1.3)
        if s["dept"] == "Pharmacy":
            dur = min(dur, 18)
        if s["type"] == "surgery":
            s = {**s, "area": "OR 1" if RNG.random() < 0.5 else "OR 2"}
        ev(s["type"], s["dept"], s["area"], dur)
    if admitted:
        ev("boarding", "Emergency", "Cubicles", RNG.uniform(30, 90))
    ed_los = int((t - arrival).total_seconds() // 60)

    if admitted:
        if ward_scope:
            dept, area = spec["admit_to"]
            ev("admit", dept, area,
               RNG.randint(*WARD_STAY_MIN.get((dept, area), (16 * 60, 48 * 60))))
            ev("discharge", "Discharge", "Exit", 0)
        else:
            # hand-off: the A&E twin stops following at the ward door (the flow
            # cast is real-scale; the upstairs plate is representative-scale)
            dept, area = spec["admit_to"]
            ev("admit", dept, area, 0)
    else:
        ev("discharge", "Discharge", "Exit", 0)
    total = int((t - arrival).total_seconds() // 60)
    return events, ed_los, total, wait

def pick_pathway(acuity):
    opts = PATHWAY_BY_ACUITY[acuity]
    return RNG.choices([p for p, _ in opts], weights=[w for _, w in opts])[0]

def mode_for(acuity):
    tb = mimic.get("transport_by_acuity", {}).get(str(min(acuity, 3)), {})
    amb = tb.get("ambulance", 30)
    walk = tb.get("walk-in", 60)
    p_amb = amb / max(1, amb + walk)
    if acuity <= 2:
        p_amb = max(p_amb, 0.55)
    if acuity >= 4:
        p_amb = min(p_amb, 0.12)
    return "ambulance" if RNG.random() < p_amb else "walk-in"

# ---------------------------------------------------------------- ops-state
ETA_MODEL = {}   # pathway -> quantiles (from MIMIC bands, filled in main)

def _blocker_rec(cur):
    t = cur["type"]
    if t == "consult_requested" and cur["dept"] == "Cardiology":
        return "cardiology_queue", {
            "action": "escalate_consult_or_move_to_observation",
            "explanation": "Stable and waiting on the cardiology consult queue while holding a cubicle.",
            "impact_min": 45}
    if t == "waiting":
        return "awaiting_consult", {
            "action": "monitor",
            "explanation": "In the waiting hall — wait drawn from the hospital's live published distribution.",
            "impact_min": 0}
    if t == "labs_ordered":
        return "labs_pending", {"action": "chase_lab_result",
                                "explanation": "Awaiting lab result before disposition.", "impact_min": 25}
    if t == "imaging":
        return "imaging_queue", {"action": "prioritize_imaging_slot",
                                 "explanation": "Waiting on an imaging slot before treatment can proceed.",
                                 "impact_min": 20}
    if t in ("observation", "decision", "telemetry", "recovery"):
        return "awaiting_disposition", {"action": "confirm_discharge_or_bed",
                                        "explanation": "Medically progressing; confirm disposition to free the bed.",
                                        "impact_min": 30}
    if t == "admit":
        return "none", {"action": "monitor",
                        "explanation": "Admitted — ward care continues outside the A&E scope.",
                        "impact_min": 0}
    return "none", {"action": "monitor", "explanation": "On the expected pathway.", "impact_min": 0}


# One move per journey: scan the WHOLE day's events (not just the 11:00
# snapshot) for the longest compressible queue step. The claimed impact is
# bounded by half that step's actual synthesized length and capped per
# blocker type — never a flat figure detached from the journey it names.
_COMPRESS = {
    "consult_requested": ("escalate_consult", 45, "the consult queue"),
    "labs_ordered": ("chase_lab_result", 25, "the lab turnaround"),
    "imaging": ("prioritize_imaging_slot", 20, "the imaging queue"),
    "observation": ("confirm_discharge_or_bed", 30, "the disposition wait"),
    "decision": ("confirm_discharge_or_bed", 30, "the disposition wait"),
    "telemetry": ("confirm_discharge_or_bed", 30, "the disposition wait"),
    "recovery": ("confirm_discharge_or_bed", 30, "the disposition wait"),
}
_MIN_IMPACT = 10  # steps too short to plausibly compress stay monitor-only


def _journey_rec(events):
    best = None
    for i, e in enumerate(events[:-1]):
        rule = _COMPRESS.get(e["type"])
        if not rule:
            continue
        step_min = (datetime.fromisoformat(events[i + 1]["t"])
                    - datetime.fromisoformat(e["t"])).total_seconds() / 60
        impact = min(rule[1], int(step_min * 0.5))
        if impact >= _MIN_IMPACT and (best is None or impact > best["impact_min"]):
            best = {"action": rule[0],
                    "explanation": (f"{rule[2].capitalize()} step ran {int(step_min)} min — "
                                    f"assume up to half avoidable (capped {rule[1]})."),
                    "impact_min": impact}
    return best

def ops_state(pid, who, pathway, acuity, arrival, events, ed_los, mode, inpatient=False):
    spec = PATHWAYS[pathway]
    m = ETA_MODEL.get(pathway) or {"p10": int(ed_los * .7), "p50": ed_los,
                                   "p80": int(ed_los * 1.2), "p90": int(ed_los * 1.4), "n": 0}
    elapsed = int((NOW - arrival).total_seconds() // 60)
    cur = dict(events[0])
    for e in events:
        if datetime.fromisoformat(e["t"]) <= NOW:
            cur = dict(e)
    risk = "high" if elapsed > m["p80"] else ("elevated" if elapsed > m["p50"] else "on_track")
    if inpatient or cur["type"] == "admit":
        risk = "on_track"
    # blocker describes the 11:00 snapshot (the sheet's "current blocker");
    # the recommendation scans the whole journey so the action board covers
    # every patient of the day, not just whoever was blocked at the anchor
    blocker, rec = _blocker_rec(cur)
    journey_rec = _journey_rec(events)
    if journey_rec and journey_rec["impact_min"] > rec["impact_min"]:
        rec = journey_rec
    return {
        "patient_id": pid, "name": who["name"], "age": who["age"], "sex": who["sex"],
        "complaint": spec["complaint"], "pathway": pathway, "acuity": acuity,
        "arrival_mode": mode,
        "arrival_time": arrival.isoformat(timespec="minutes"),
        "current_department": cur["dept"], "current_area": cur["area"],
        "elapsed_min": max(0, elapsed),
        "vitals": vitals_for(acuity),
        "events": events,
        "resources": {"er_bed_min": ed_los, "nurse_min": int(ed_los * 0.3),
                      "doctor_min": int(ed_los * 0.15),
                      "labs": sum(1 for e in events if e["type"] == "labs_ordered"),
                      "imaging": sum(1 for e in events if e["type"] == "imaging")},
        "predicted_exit": (arrival + timedelta(minutes=m["p50"])).isoformat(timespec="minutes"),
        "predicted_exit_ci": {
            "low": (arrival + timedelta(minutes=m["p10"])).isoformat(timespec="minutes"),
            "high": (arrival + timedelta(minutes=m["p90"])).isoformat(timespec="minutes"),
            "interval": "80%"},
        "predicted_los_min": m["p50"], "benchmark_los_min": m["p50"],
        "delay_risk": risk, "blocker": blocker, "recommendation": rec,
        "signals": {"wearable": None, "vocal_biomarker": None,
                    "_note": "pluggable sources — mention only, not built"},
        "optimization": [],
        "guard": {"topic_ok": True, "safety_ok": True},
        "inpatient": inpatient,
        "provenance": {
            "identity": "synthetic (Synthea registry — names only)",
            "triage_category_wait": f"drawn from {HOSP_META['name']}'s live published p50/p95",
            "treatment_tail": mimic["source"],
            "stations_and_times": "synthesized split (labeled)",
            "vitals": f"sampled from {mimic['source']} triage quartiles",
            "eta": "FlowTwin ETA — MIMIC LOS quantiles per pathway band"},
    }

# ---------------------------------------------------------------- cast generation
def arrivals_lambda(t: datetime) -> float:
    """arrivals/hour: MIMIC diurnal shape scaled to the stated attendance."""
    w = mimic["arrival_hour_weights"]
    tot = sum(w) or 1
    return ATTENDANCE_PER_DAY * (w[t.hour] / tot)

def gen_flow_cast(pool):
    """Every A&E arrival from CAST_START to the live edge. Poisson thinning per
    15-min step, deterministic RNG."""
    cast = []
    t = CAST_START
    k = 0
    while t < LIVE_T:
        lam = arrivals_lambda(t) / 4          # per 15-min bucket
        n = 0
        L, p = math.exp(-lam), 1.0
        while True:
            p *= RNG.random()
            if p <= L:
                break
            n += 1
        for _ in range(n):
            arrival = (t + timedelta(minutes=RNG.uniform(0, 15))).replace(second=0, microsecond=0)
            acuity = sample_acuity()
            pathway = pick_pathway(acuity)
            who = pool.take(min_age=65 if pathway == "Hip Fracture" else None)
            admitted = RNG.random() < ADMIT_RATE[acuity]
            mode = mode_for(acuity)
            events, ed_los, total, wait = build_journey(pathway, acuity, arrival, admitted, mode)
            st = ops_state(f"P-{2000+k}", who, pathway, acuity, arrival, events, ed_los, mode)
            st["real_wait_draw_min"] = wait
            cast.append(st)
            k += 1
        t += timedelta(minutes=15)
    return cast

INPATIENT_PLAN = [
    ("Medical Ward",  ["11:40", "13:10", "15:00", "17:15", None, None, None, None]),
    ("Surgical Ward", ["12:20", "14:05", "16:30", None, None, None]),
    ("Geriatric Ward",["15:45", "18:00", None, None, None]),
    ("Step-Down",     ["12:50", "18:40", None, None]),
    ("ICU",           [None, None, None]),
]
WARD_SOURCE_PW = {
    "Medical Ward": ("Sepsis", "COPD Exacerbation", "General Medical"),
    "Surgical Ward": ("Appendicitis — OR", "Minor Injury"),
    "Geriatric Ward": ("Hip Fracture",),
    "Step-Down": ("GI Bleed",),
    "ICU": ("Stroke Alert", "Sepsis"),
}

def make_inpatients(pool):
    """Representative upstairs occupancy (the HA feed is A&E-only — labeled)."""
    cast = []
    n = 0
    for ward, slots in INPATIENT_PLAN:
        for j, dis in enumerate(slots):
            pw = WARD_SOURCE_PW[ward][j % len(WARD_SOURCE_PW[ward])]
            who = pool.take(min_age=65 if ward == "Geriatric Ward" else 40)
            hours_ago = RNG.randint(10, 40)
            arrival = NOW - timedelta(hours=hours_ago)
            acuity = PATHWAYS[pw]["acuity"]
            events, ed_los, total, wait = build_journey(pw, acuity, arrival, True, "ambulance", wait_min=5, ward_scope=True)
            kept = []
            for e in events:
                if e["type"] == "admit":
                    kept.append({**e, "dept": ward, "area": "Beds"})
                    break
                kept.append(e)
            admit_t = datetime.fromisoformat(kept[-1]["t"])
            if admit_t > NOW - timedelta(hours=2):
                shift = admit_t - (NOW - timedelta(hours=3))
                arrival -= shift
                kept = [{**e, "t": (datetime.fromisoformat(e["t"]) - shift).isoformat(timespec="minutes")}
                        for e in kept]
            if dis:
                hh, mm = map(int, dis.split(":"))
                kept.append({"t": NOW.replace(hour=hh, minute=mm).isoformat(timespec="minutes"),
                             "type": "discharge", "dept": "Discharge", "area": "Exit"})
            st = ops_state(f"P-{1200+n}", who, pw, acuity, arrival, kept, ed_los,
                           "ambulance", inpatient=True)
            st["pathway"] = {"Medical Ward": "Inpatient · Medicine", "Surgical Ward": "Inpatient · Surgery",
                             "Geriatric Ward": "Inpatient · Geriatrics", "Step-Down": "Inpatient · Step-Down",
                             "ICU": "Inpatient · ICU"}[ward]
            st["blocker"] = "none"
            st["recommendation"] = {"action": "monitor",
                                    "explanation": (f"Discharge planned today {dis} — bed frees then."
                                                    if dis else
                                                    "Admitted — ward care continues outside the A&E scope."),
                                    "impact_min": 0}
            cast.append(st)
            n += 1
    return cast


def pin_consult_window(st, at_hhmm, length_min):
    """Pin a journey's cardiology consult to start at `at_hhmm` for
    `length_min`. The pre-consult phase is compressed/stretched
    proportionally so event times stay chronological."""
    events = st["events"]
    i = next(k for k, e in enumerate(events) if e["type"] == "consult_requested")
    ph, pm_ = map(int, at_hhmm.split(":"))
    target = NOW.replace(hour=ph, minute=pm_)
    t0 = datetime.fromisoformat(events[0]["t"])
    t_c = datetime.fromisoformat(events[i]["t"])
    scale = (target - t0).total_seconds() / max(60, (t_c - t0).total_seconds())
    for e in events[:i + 1]:
        dt = (datetime.fromisoformat(e["t"]) - t0).total_seconds() * scale
        e["t"] = (t0 + timedelta(seconds=round(dt / 60) * 60)).isoformat(timespec="minutes")
    cur_len = (datetime.fromisoformat(events[i + 1]["t"]) - target).total_seconds() / 60
    extra = timedelta(minutes=length_min - cur_len)
    for e in events[i + 1:]:
        e["t"] = (datetime.fromisoformat(e["t"]) + extra).isoformat(timespec="minutes")


# ---------------------------------------------------------------- hero: Sarah
def build_sarah():
    arrival = NOW - timedelta(minutes=100)          # 09:20 on the demo day
    who = {"name": "Sarah M.", "sex": "female", "age": 58}
    events, ed_los, total, wait = build_journey("Chest Pain Rule-Out", 2, arrival,
                                                False, "ambulance", wait_min=8)
    st = ops_state("P-1042", who, "Chest Pain Rule-Out", 2, arrival, events, ed_los, "ambulance")
    # she is IN the consult queue at the 11:00 anchor: pin the consult event
    # before the anchor so map position, journey rail and trace all agree
    pin_consult_window(st, "10:35", 95)
    st["current_department"], st["current_area"] = "Cardiology", "Consult"
    # the guided story runs on a tight scripted window (labeled), not the wide
    # MIMIC band — the beats read these fields
    st["predicted_exit"] = NOW.replace(hour=14, minute=20).isoformat(timespec="minutes")
    st["predicted_exit_ci"] = {
        "low": NOW.replace(hour=13, minute=55).isoformat(timespec="minutes"),
        "high": NOW.replace(hour=14, minute=50).isoformat(timespec="minutes"),
        "interval": "80%"}
    st["predicted_los_min"] = 300
    st["provenance"]["eta"] = "scripted demo window for the guided story (labeled)"
    st["blocker"] = "cardiology_queue"
    st["recommendation"] = {
        "action": "move_to_observation",
        "explanation": "Stable, troponin negative, waiting 100 min on cardiology while holding a cubicle.",
        "impact_min": 45}
    st["delay_risk"] = "high"
    st["optimization"] = [
        {"issue": "Troponin ordered after cubicle assignment, not at triage", "saving_min": 35,
         "tag": "sequence"},
        {"issue": "No wearable ingested; overnight arrhythmia would have pre-ordered the consult",
         "saving_min": 50, "tag": "sequence (illustrative source — mention only)"},
        {"issue": "Medically ready to move ~40 min before the obs bed was requested", "saving_min": 40,
         "tag": "timing"},
    ]
    st["hero"] = True
    return st

# The 14:00 demo overload stays deterministic: three cluster personas get their
# cardiology consult window pinned (their own tracks, not overrides).
CONSULT_PINS = [("11:55", "13:12", 125), ("12:15", "13:34", 135), ("12:40", "13:55", 150)]

def make_demo_cluster(pool):
    out = []
    for k, (arr_hhmm, pin_at, pin_len) in enumerate(CONSULT_PINS):
        hh, mm = map(int, arr_hhmm.split(":"))
        arrival = NOW.replace(hour=hh, minute=mm)
        who = pool.take(min_age=45)
        events, ed_los, total, wait = build_journey("Chest Pain Rule-Out", 2, arrival,
                                                    False, "ambulance", wait_min=6)
        st = ops_state(f"P-{1500+k}", who, "Chest Pain Rule-Out", 2,
                       arrival, events, ed_los, "ambulance")
        pin_consult_window(st, pin_at, pin_len)
        st["arrives_later"] = True
        out.append(st)
    return out

# ---------------------------------------------------------------- KPIs
def pattern_peak_trough():
    """Daily trough and the DAYTIME peak (12:00-20:00) — QMH's absolute peak
    sits after midnight (the backlog never clears overnight), which is its own
    finding; the reallocation story needs the afternoon climb."""
    vals = [(h, p["t45p50_mean"]) for h, p in PATTERN.items() if p["t45p50_mean"] is not None]
    trough = min(vals, key=lambda x: x[1])
    day = [(h, v) for h, v in vals if 12 <= h <= 20] or vals
    peak = max(day, key=lambda x: x[1])
    return trough, peak

def overnight_mean():
    xs = [p["t45p50_mean"] for h, p in PATTERN.items() if p["t45p50_mean"] is not None and h in (0, 1, 2, 3)]
    return round(sum(xs) / len(xs)) if xs else None

def optimize_plan_v3():
    (trough_h, trough_v), (peak_h, peak_v) = pattern_peak_trough()
    lam_pm = sum(arrivals_lambda(NOW.replace(hour=h)) for h in range(12, 20)) / 8
    cat45_share = TRIAGE_MIX[4] + TRIAGE_MIX[5]
    affected_per_day = lam_pm * 8 * cat45_share
    climb = max(0, peak_v - trough_v)

    def money(saved_min):
        hkd = round(saved_min / 60 * BED_HOUR_COST_HKD)
        return hkd, round(hkd / HKD_PER_EUR)

    items = []
    def add(id_, change, window, evidence, saved_min, basis):
        hkd, eur = money(saved_min)
        items.append({"id": id_, "change": change, "window": window, "evidence": evidence,
                      "saved_min_per_day": int(saved_min),
                      "saved_hkd_per_day": hkd, "saved_eur_per_day": eur, "basis": basis})

    add("consult-window",
        f"Shift one consultation-room doctor from the {trough_h:02d}:00 trough to the afternoon climb",
        f"12:00\u2013{peak_h:02d}:00",
        f"REAL 7-day pattern at {HOSP_META['name']}: cat-4/5 median wait climbs from "
        f"{trough_v} min at {trough_h:02d}:00 to {peak_v} min at {peak_h:02d}:00 — every day",
        climb * affected_per_day * 0.20,
        "measured climb × est. affected × 20% recoverable (assumption)")
    add("fast-track",
        "Open a see-and-treat fast-track for cat-4/5 minors",
        "12:00–20:00",
        f"~{affected_per_day:.0f} cat-4/5 attendances hit the climb window daily "
        f"(share {cat45_share:.0%} — HA-published mix; volume est. {ATTENDANCE_PER_DAY}/day)",
        affected_per_day * 25,
        "25 min/patient fast-track effect is an assumed figure (literature-typical)")
    add("troponin-triage",
        "Order troponin + first bloods at triage for chest-pain presentations",
        "all day",
        "Sequence finding on the chest-pain template — matches Sarah's journey callout (35 min)",
        (ATTENDANCE_PER_DAY * 0.06) * 35,
        "est. 6% chest-pain share × 35 min sequence gap (synthesized station layer)")
    add("ward-discharge",
        "Start ward discharge paperwork at morning rounds, not after lunch",
        "08:00–11:00",
        f"~{ATTENDANCE_PER_DAY * ADMIT_VIA_AE:.0f} admissions/day board in A&E waiting for beds "
        f"(HA ~{ADMIT_VIA_AE:.0%} admission share)",
        ATTENDANCE_PER_DAY * ADMIT_VIA_AE * 30,
        "30 min earlier bed release is an assumed effect")
    add("ct-slot",
        "Protect one CT slot for A&E cases through the afternoon",
        "12:00–18:00",
        "Imaging queue is part of the synthesized station layer — flagged as illustrative",
        ATTENDANCE_PER_DAY * 0.10 * 15,
        "illustrative (station-level queues are synthesized)")

    total_min = sum(i["saved_min_per_day"] for i in items)
    total_hkd = sum(i["saved_hkd_per_day"] for i in items)
    return {
        "model": "FlowTwin Optimizer — findings over the real 7-day feed + labeled assumptions",
        "assumption_note": (f"HK${BED_HOUR_COST_HKD}/bed-hour (≈€{BED_HOUR_COST_HKD / HKD_PER_EUR:.0f}) "
                            "is a stated assumption; every estimated share is labeled per line."),
        "items": items,
        "total_saved_min_per_day": total_min,
        "total_hkd_per_day": total_hkd,
        "total_eur_per_day": round(total_hkd / HKD_PER_EUR),
        "total_hkd_per_year": total_hkd * 365,
        "total_eur_per_year": round(total_hkd * 365 / HKD_PER_EUR),
    }

def build_eta_model():
    """Pathway-keyed quantiles from MIMIC acuity bands (REAL LOS data)."""
    for pw, spec in PATHWAYS.items():
        band = "12" if spec["acuity"] <= 2 else ("3" if spec["acuity"] == 3 else "45")
        qq = mimic_q(band, "all")
        ETA_MODEL[pw] = {"p10": int(qq.get("p10") or 60), "p50": int(qq.get("p50") or 240),
                         "p80": int(qq.get("p80") or 420), "p90": int(qq.get("p90") or 540),
                         "n": mimic["n_stays"]}

def calibration_note():
    return {"interval": "p10-p90 (target 80%)",
            "coverage_pct": 80.0,
            "median_abs_error_min": None,
            "n": mimic["n_stays"],
            "note": "in-sample on MIMIC-IV-ED demo quantiles; out-of-sample calibration needs the full dataset"}

def admin_kpis(cast_all):
    (trough_h, trough_v), (peak_h, peak_v) = pattern_peak_trough()
    live_row = hk_live["hospitals"][HOSPITAL]
    rates_by_hour = []
    w = mimic["arrival_hour_weights"]
    tot = sum(w) or 1
    for hh in range(24):
        exp = round(ATTENDANCE_PER_DAY * w[hh] / tot, 1)
        amb_share = 0.25 if 8 <= hh <= 22 else 0.45
        rates_by_hour.append({
            "hour": f"{hh:02d}:00",
            "expected_arrivals": exp,
            "by_mode": {"ambulance": round(exp * amb_share, 1),
                        "walk-in": round(exp * (1 - amb_share - 0.05), 1),
                        "referral": round(exp * 0.05, 1)},
        })
    now_iso = NOW.isoformat(timespec="minutes")
    return {
        "generated_now": now_iso,
        "current_census": sum(1 for p in cast_all if p["arrival_time"] <= now_iso),
        "hk": {
            "hospital_slug": HOSPITAL,
            "hospital": HOSP_META["name"],
            "cluster": HOSP_META["cluster"],
            "district": HOSP_META["district"],
            "live_update_raw": hk_live["updateTime_raw"],
            "live_anchor": hk_hist["anchor_hkt"],
            "attendance_per_day_assumption": ATTENDANCE_PER_DAY,
            "admit_share_assumption": ADMIT_VIA_AE,
            "triage_mix_assumption": {str(k): v for k, v in TRIAGE_MIX.items()},
            "live_now": {k: live_row.get(k) for k in
                         ("t2_min", "t3p50_min", "t3p95_min", "t45p50_min", "t45p95_min")},
        },
        "avoidable_wait_rank": [],
        "dept_load_minutes_7d": {},
        "recurring_bottleneck": {
            "dept": "A&E consultation queue",
            "window": f"{trough_h:02d}:00 → {peak_h:02d}:00",
            "avg_los_in_window_min": peak_v,
            "avg_los_other_min": trough_v,
            "n_in_window": sum(p["n"] for p in PATTERN.values()),
            "note": (f"REAL 7-day pattern from the HA feed: {HOSP_META['name']}'s cat-4/5 median wait "
                     f"climbs from {trough_v} min ({trough_h:02d}:00) to {peak_v} min ({peak_h:02d}:00) daily — "
                     f"and holds ≈{overnight_mean()} min past midnight: the backlog never clears overnight."),
        },
        "arrival_forecast_next_3h": rates_by_hour[NOW.hour + 1: NOW.hour + 4],
        "arrival_rates_by_hour": rates_by_hour,
        "eta_calibration": calibration_note(),
        "eta_model_quantiles_min": dict(ETA_MODEL),
        "hf_admissions_benchmark": {
            "n": mimic["n_stays"],
            "outcome_mix": mimic.get("acuity_mix", {}),
            "median_los_days": round((mimic_q("3", "admitted").get("p50") or 400) / 1440, 2),
            "source": mimic["source"],
        },
        "assumptions": {"bed_hour_cost_hkd": BED_HOUR_COST_HKD,
                        "bed_hour_cost_eur": round(BED_HOUR_COST_HKD / HKD_PER_EUR),
                        "hkd_per_eur": HKD_PER_EUR,
                        "lean_targets_min": {}},
        "optimize_plan": optimize_plan_v3(),
    }

def scenario(sarah):
    s14 = series_at(NOW.replace(hour=14, minute=0))
    return {
        "hero": "P-1042",
        "now": NOW.isoformat(timespec="minutes"),
        "hospital": HOSP_META["name"],
        "beats": [
            {"t_offset_min": 0, "id": "meet_sarah",
             "desc": "Sarah, 58, chest pain — predicted exit on track."},
            {"t_offset_min": 90, "id": "lab_delay",
             "desc": "Lab delay — predicted exit slides later, ring turns amber."},
            {"t_offset_min": 180, "id": "cardio_overload",
             "desc": (f"The real afternoon climb: at 14:00 {HOSP_META['name']} logged cat-3 median "
                      f"{s14.get('t3p50')} min, cat-4/5 {s14.get('t45p50')} min — consults queue past capacity.")},
            {"t_offset_min": 190, "id": "resolve",
             "desc": "One action: move to the obs ward, escalate consult coverage, assign bed O-6."},
        ],
        "patient": sarah,
    }

# ---------------------------------------------------------------- self-check
def self_check(cast, hist_cast):
    tracks = []
    for p in cast + hist_cast:
        evs = [(datetime.fromisoformat(e["t"]), e) for e in p["events"]]
        last_t, last_e = evs[-1]
        stays = last_e["type"] == "admit" and p.get("inpatient")
        end = (datetime(2100, 1, 1) if stays or p["patient_id"] == "P-1042"
               else last_t + timedelta(minutes=8) if last_e["type"] == "admit" else last_t)
        tracks.append((evs[0][0], end, evs, p["patient_id"]))

    def occupancy(T):
        zone = Counter()
        for start, end, evs, pid in tracks:
            if start > T or end <= T:
                continue
            cur = None
            for t, e in evs:
                if t <= T:
                    cur = e
                else:
                    break
            if cur is None:
                continue
            if pid == "P-1042" and T >= NOW:
                cur = {"dept": "Cardiology", "area": "Consult"}
            zone[(cur["dept"], cur["area"])] += 1
        return zone

    print("self-check (engine occupancy replay):")
    for label, T in [("demo 11:00", NOW), ("demo 14:05", NOW.replace(hour=14, minute=5)),
                     ("demo 17:00", NOW.replace(hour=17)),
                     ("live edge", LIVE_T - timedelta(minutes=5)),
                     ("yesterday 15:00", NOW.replace(hour=15) - timedelta(days=1)),
                     ("night 03:30", NOW.replace(hour=3, minute=30))]:
        z = occupancy(T)
        onfloor = sum(v for (d, a), v in z.items() if d != "Discharge")
        waiting = z.get(("Emergency", "Waiting Hall"), 0)
        consult = z.get(("Cardiology", "Consult"), 0)
        over = [(f"{d}/{a}", v, CAPACITY[(d, a)]) for (d, a), v in z.items()
                if (d, a) in CAPACITY and v > CAPACITY[(d, a)]]
        w = series_at(T)
        print(f"  [{label}] floor≈{onfloor} · waiting hall {waiting} · consult {consult}/3 "
              f"· real t45p50={w.get('t45p50')}m · over: {over if over else 'none'}")

# ---------------------------------------------------------------- main
def main():
    global NAMES
    NAMES = load_names()
    build_eta_model()
    pool = NamePool()
    pool.used.add("Sarah M.")

    flow = gen_flow_cast(pool)
    sarah = build_sarah()
    cluster = make_demo_cluster(pool)
    inpatients = make_inpatients(pool)

    # demo side-tracks among the 11:00 in-house crowd
    now_iso = NOW.isoformat(timespec="minutes")
    in_house_ed = [p for p in flow
                   if p["arrival_time"] <= now_iso and p["events"][-1]["t"] > now_iso]
    # the wearable story only makes sense on a cardiac journey
    cardiac = [p for p in in_house_ed
               if p["pathway"] in ("Chest Pain Rule-Out", "Arrhythmia")] or in_house_ed
    if in_house_ed:
        cardiac[0]["signals"]["wearable"] = {
            "source": "patient fitness tracker (shared at intake)",
            "overnight_arrhythmia_flag": True, "resting_hr_7d_avg": 71,
            "hrv_trend": "declining", "note": "screening, not diagnosis"}
        cardiac[0]["extra_signal_track"] = True
        cardiac[0]["optimization"] = [
            {"issue": "Wearable overnight-arrhythmia flag — cardiology consult could be pre-ordered at arrival",
             "saving_min": 50, "tag": "sequence (wearable — illustrative source)"}]
        if len(in_house_ed) > 1:
            in_house_ed[1]["near_optimal_track"] = True
        if len(in_house_ed) > 4:
            in_house_ed[4]["optimization"] = [
                {"issue": "Bloods ordered 18 min after cubicle assignment; could start at triage",
                 "saving_min": 18, "tag": "sequence"}]

    # split: history = journeys COMPLETE before the demo anchor; today = the rest
    all_flow = flow + cluster
    hist_cast, today_cast = [], []
    for p in all_flow:
        endt = p["events"][-1]["t"]
        (today_cast if endt > now_iso else hist_cast).append(p)
    today_present = [p for p in today_cast if p["arrival_time"] <= now_iso]
    today_later = [p for p in today_cast if p["arrival_time"] > now_iso]

    def ed_los_of(p):
        admit = next((e for e in p["events"] if e["type"] == "admit"), None)
        endt = admit["t"] if admit else p["events"][-1]["t"]
        return int((datetime.fromisoformat(endt)
                    - datetime.fromisoformat(p["arrival_time"])).total_seconds() // 60)

    history = [{
        "patient_id": p["patient_id"], "name": p["name"], "age": p["age"], "sex": p["sex"],
        "pathway": p["pathway"], "complaint": p["complaint"], "acuity": p["acuity"],
        "arrival_mode": p["arrival_mode"], "arrival": p["arrival_time"],
        "los_min": int((datetime.fromisoformat(p["events"][-1]["t"])
                        - datetime.fromisoformat(p["arrival_time"])).total_seconds() // 60),
        "ed_los_min": ed_los_of(p),
        "admitted": any(e["type"] == "admit" for e in p["events"]),
        "disposition": "admitted" if any(e["type"] == "admit" for e in p["events"]) else "discharged",
        "events": p["events"],
    } for p in hist_cast]

    patients = [sarah] + today_present + inpatients
    kpis = admin_kpis(patients + today_later)

    def dump(name, obj):
        (SEED / name).write_text(json.dumps(obj, indent=1, ensure_ascii=False))
        print(f"  wrote data/seed/{name}")

    print(f"FlowTwin seed v3 — {HOSP_META['name']} ({HOSPITAL}), demo day {NOW.date()}:")
    dump("patients_today.json", {"generated_now": now_iso, "count": len(patients),
                                 "patients": patients, "arrivals_today": today_later})
    dump("history_7d.json", {"window_days": 2, "anchor_now": now_iso,
                             "count": len(history), "journeys": history})
    dump("scenario.json", scenario(sarah))
    dump("admin_kpis.json", kpis)
    print(f"  cast: {len(patients)} in-house/inpatient + {len(today_later)} arriving later "
          f"+ {len(history)} completed (48h window)")
    print(f"  optimizer: HK${kpis['optimize_plan']['total_hkd_per_day']}/day "
          f"(€{kpis['optimize_plan']['total_eur_per_day']}) · "
          f"HK${kpis['optimize_plan']['total_hkd_per_year']:,}/yr")
    self_check(patients + today_later, hist_cast)

if __name__ == "__main__":
    main()
