#!/usr/bin/env python3
"""
FlowTwin — Hong Kong Hospital Authority A&E feed fetcher.

Pulls REAL data, no simulation:
  1. Live per-hospital A&E waiting times (updated every 15 min):
       https://www.ha.org.hk/opendata/aed/aedwtdata2-en.json
     Fields per hospital: t1wt/t2wt (triage cat 1/2 wait), t3p50/t3p95 (cat 3,
     median + 95th pct), t45p50/t45p95 (cat 4-5), manageT1case/manageT2case.
  2. The historical archive of the same file via data.gov.hk
     (15-min snapshots): last 48 h at full resolution + 7 days hourly.

Outputs:
  data/seed/hk_live.json     — latest snapshot, parsed to minutes + metadata
  data/seed/hk_history.json  — time series per hospital + hour-of-day pattern

Snapshots are cached in data/raw/hk_archive/ so re-runs are cheap.
All times are HKT (the feed's own clock).
"""
import json, re, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).parent
CACHE = ROOT / "raw" / "hk_archive"
SEED = ROOT / "seed"
CACHE.mkdir(parents=True, exist_ok=True)
SEED.mkdir(exist_ok=True)

FEED_URL = "https://www.ha.org.hk/opendata/aed/aedwtdata2-en.json"
ARCHIVE_LIST = ("https://api.data.gov.hk/v1/historical-archive/list-file-versions"
                "?url={url}&start={start}&end={end}")
ARCHIVE_GET = ("https://api.data.gov.hk/v1/historical-archive/get-file"
               "?url={url}&time={time}")

# Hospital Authority A&E sites — cluster/region are public HA facts.
HOSPITALS = {
    "Alice Ho Miu Ling Nethersole Hospital": ("AHNH", "New Territories East", "Tai Po"),
    "Caritas Medical Centre": ("CMC", "Kowloon West", "Sham Shui Po"),
    "Kwong Wah Hospital": ("KWH", "Kowloon Central", "Yau Ma Tei"),
    "North District Hospital": ("NDH", "New Territories East", "Sheung Shui"),
    "North Lantau Hospital": ("NLTH", "Kowloon West", "Tung Chung"),
    "Pamela Youde Nethersole Eastern Hospital": ("PYNEH", "Hong Kong East", "Chai Wan"),
    "Pok Oi Hospital": ("POH", "New Territories West", "Yuen Long"),
    "Prince of Wales Hospital": ("POWH", "New Territories East", "Sha Tin"),
    "Princess Margaret Hospital": ("PMH", "Kowloon West", "Kwai Chung"),
    "Queen Elizabeth Hospital": ("QEH", "Kowloon Central", "Yau Ma Tei"),
    "Queen Mary Hospital": ("QMH", "Hong Kong West", "Pok Fu Lam"),
    "Ruttonjee Hospital": ("RH", "Hong Kong East", "Wan Chai"),
    "St John Hospital": ("SJH", "Hong Kong East", "Cheung Chau"),
    "Tseung Kwan O Hospital": ("TKOH", "Kowloon East", "Tseung Kwan O"),
    "Tin Shui Wai Hospital": ("TSWH", "New Territories West", "Tin Shui Wai"),
    "Tuen Mun Hospital": ("TMH", "New Territories West", "Tuen Mun"),
    "United Christian Hospital": ("UCH", "Kowloon East", "Kwun Tong"),
    "Yan Chai Hospital": ("YCH", "Kowloon West", "Tsuen Wan"),
}

def slugify(name: str) -> str:
    return HOSPITALS.get(name, (re.sub(r"[^A-Za-z]+", "", name)[:6].upper(),))[0]

# ---------------------------------------------------------------- wait parsing
NUM = re.compile(r"(\d+(?:\.\d+)?)")

def wait_to_min(s):
    """'0 minute' → 0 · '23 minutes' → 23 · 'less than 15 minutes' → 12 ·
    '3.5 hours' → 210 · 'over 8 hours' → 540. Returns (minutes, qualifier)."""
    if not s:
        return None, None
    t = s.strip().lower()
    m = NUM.search(t)
    if not m:
        return None, None
    v = float(m.group(1))
    minutes = v * 60 if "hour" in t else v
    qual = "lt" if "less than" in t else ("gt" if ("over" in t or "more than" in t) else "eq")
    if qual == "lt":
        minutes *= 0.8          # stated convention: "less than X" plotted at 0.8X
    if qual == "gt":
        minutes *= 1.125        # stated convention: "over X" plotted at 1.125X
    return round(minutes), qual

def parse_snapshot(doc):
    """Raw feed doc → {updateTime, hospitals: {slug: parsed row}}."""
    rows = {}
    for r in doc.get("waitTime", []):
        name = r.get("hospName", "").strip()
        slug = slugify(name)
        t2, t2q = wait_to_min(r.get("t2wt"))
        t3p50, _ = wait_to_min(r.get("t3p50"))
        t3p95, _ = wait_to_min(r.get("t3p95"))
        t45p50, q50 = wait_to_min(r.get("t45p50"))
        t45p95, q95 = wait_to_min(r.get("t45p95"))
        rows[slug] = {
            "name": name,
            "t1_min": 0,
            "t2_min": t2, "t2_qual": t2q,
            "t3p50_min": t3p50, "t3p95_min": t3p95,
            "t45p50_min": t45p50, "t45p50_qual": q50,
            "t45p95_min": t45p95, "t45p95_qual": q95,
            "manage_t1": r.get("manageT1case") == "Y",
            "manage_t2": r.get("manageT2case") == "Y",
            "raw": {k: r.get(k) for k in
                    ("t1wt", "t2wt", "t3p50", "t3p95", "t45p50", "t45p95")},
        }
    return {"updateTime": doc.get("updateTime"), "hospitals": rows}

def parse_update_time(s):
    """'5/7/2026 2:45AM' (D/M/YYYY, HKT) → datetime."""
    m = re.match(r"(\d+)/(\d+)/(\d+)\s+(\d+):(\d+)\s*(AM|PM)", s.strip(), re.I)
    d, mo, y, hh, mm, ap = m.groups()
    hh = int(hh) % 12 + (12 if ap.upper() == "PM" else 0)
    return datetime(int(y), int(mo), int(d), hh, int(mm))

# ---------------------------------------------------------------- fetching
def http_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "flowtwin-hackathon/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def fetch_version(ts: str):
    """One archived snapshot (ts = 'YYYYMMDD-HHMM'), cached on disk."""
    cached = CACHE / f"{ts}.json"
    if cached.exists():
        return ts, json.loads(cached.read_text())
    url = ARCHIVE_GET.format(url=urllib.parse.quote(FEED_URL, safe=""), time=ts)
    try:
        doc = http_json(url)             # api follows into S3 via redirect
        if "waitTime" not in doc:        # some responses wrap a location only
            return ts, None
        cached.write_text(json.dumps(doc, ensure_ascii=False))
        return ts, doc
    except Exception as e:
        print(f"    ! {ts}: {e}", file=sys.stderr)
        return ts, None

def list_versions(start, end):
    url = ARCHIVE_LIST.format(url=urllib.parse.quote(FEED_URL, safe=""),
                              start=start.strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))
    return http_json(url).get("timestamps", [])

# ---------------------------------------------------------------- main
def main():
    print("HK HA A&E feed:")
    live_doc = http_json(FEED_URL)
    live = parse_snapshot(live_doc)
    now = parse_update_time(live["updateTime"])
    print(f"  live: {live['updateTime']} (HKT) · {len(live['hospitals'])} hospitals")

    # archive plan: 48 h at 15-min + earlier days hourly. The archive only
    # serves complete days up to YESTERDAY (HKT); the live point covers today.
    end = (now - timedelta(days=1)).date()
    t0 = end - timedelta(days=7)
    stamps = list_versions(datetime.combine(t0, datetime.min.time()),
                           datetime.combine(end, datetime.min.time()))
    print(f"  archive: {len(stamps)} versions available through {end}")
    newest = datetime.strptime(stamps[-1], "%Y%m%d-%H%M") if stamps else now
    want = []
    for ts in stamps:
        dt = datetime.strptime(ts, "%Y%m%d-%H%M")
        if dt >= newest - timedelta(hours=49):
            want.append(ts)                       # full 15-min resolution
        elif dt.minute == 0:
            want.append(ts)                       # hourly beyond 48 h
    print(f"  fetching {len(want)} snapshots (cache: {CACHE})")

    series = {slug: [] for slug in {slugify(n) for n in HOSPITALS}}
    got = 0
    with ThreadPoolExecutor(max_workers=12) as ex:
        for ts, doc in ex.map(fetch_version, want):
            if not doc:
                continue
            got += 1
            snap = parse_snapshot(doc)
            dt = datetime.strptime(ts, "%Y%m%d-%H%M")
            for slug, row in snap["hospitals"].items():
                series.setdefault(slug, []).append({
                    "t": dt.isoformat(timespec="minutes"),
                    "t2": row["t2_min"],
                    "t3p50": row["t3p50_min"], "t3p95": row["t3p95_min"],
                    "t45p50": row["t45p50_min"], "t45p95": row["t45p95_min"],
                })
    # the live snapshot is the newest point of every series (today isn't
    # archived yet — the feed itself covers the gap)
    for slug, row in live["hospitals"].items():
        series.setdefault(slug, []).append({
            "t": now.isoformat(timespec="minutes"),
            "t2": row["t2_min"],
            "t3p50": row["t3p50_min"], "t3p95": row["t3p95_min"],
            "t45p50": row["t45p50_min"], "t45p95": row["t45p95_min"],
        })
    for slug in series:
        series[slug].sort(key=lambda x: x["t"])
    print(f"  fetched {got}/{len(want)} snapshots")

    # hour-of-day pattern (7-day mean per hospital) — the REAL recurring curve
    pattern = {}
    for slug, pts in series.items():
        by_hour = {h: {"t3p50": [], "t45p50": []} for h in range(24)}
        for p in pts:
            h = datetime.fromisoformat(p["t"]).hour
            if p["t3p50"] is not None:
                by_hour[h]["t3p50"].append(p["t3p50"])
            if p["t45p50"] is not None:
                by_hour[h]["t45p50"].append(p["t45p50"])
        pattern[slug] = [{
            "hour": h,
            "t3p50_mean": round(mean(v["t3p50"])) if v["t3p50"] else None,
            "t45p50_mean": round(mean(v["t45p50"])) if v["t45p50"] else None,
            "n": len(v["t45p50"]),
        } for h, v in by_hour.items()]

    meta = {slugify(n): {"name": n, "cluster": c, "district": d}
            for n, (s, c, d) in HOSPITALS.items()}

    (SEED / "hk_live.json").write_text(json.dumps({
        "source": FEED_URL,
        "fetched_at_hkt": now.isoformat(timespec="minutes"),
        "updateTime_raw": live["updateTime"],
        "hospitals": live["hospitals"],
        "meta": meta,
        "parse_conventions": {
            "less_than_X": "plotted at 0.8·X", "over_X": "plotted at 1.125·X",
            "t1": "critical — always seen at once (0 min)",
            "t2": "emergency", "t3": "urgent", "t45": "semi-/non-urgent",
        },
    }, indent=1, ensure_ascii=False))
    print("  wrote data/seed/hk_live.json")

    (SEED / "hk_history.json").write_text(json.dumps({
        "source": FEED_URL + " via data.gov.hk historical archive",
        "anchor_hkt": now.isoformat(timespec="minutes"),
        "resolution": "15 min for last 48 h, hourly before",
        "series": series,
        "hour_pattern_7d": pattern,
    }, ensure_ascii=False))
    print("  wrote data/seed/hk_history.json")

    # quick ranking: where is the afternoon story strongest?
    print("  7-day cat-4/5 median wait, midnight vs 17:00 (min):")
    for slug in ("QMH", "PYNEH", "QEH", "POWH", "TMH", "UCH", "KWH"):
        pat = pattern.get(slug) or []
        h0 = next((p["t45p50_mean"] for p in pat if p["hour"] == 3), None)
        h17 = next((p["t45p50_mean"] for p in pat if p["hour"] == 17), None)
        print(f"    {slug:6} 03:00 → {h0}   17:00 → {h17}")

if __name__ == "__main__":
    main()
