#!/usr/bin/env python3
"""
TFT dataset builder — pulls a LONG hourly history of the real HA A&E feed
(default 60 days, all 18 sites) through the same data.gov.hk archive the
main fetcher uses (shared on-disk cache), and writes a long-format CSV for
training the Temporal Fusion Transformer (the reference model of NVIDIA's
Time Series Prediction Platform).

Output: data/raw/tft_dataset.csv  (gitignored — rebuildable)
        columns: slug, ts (ISO, HKT), t45p50, t3p50
"""
import csv
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import fetch_hk  # noqa: E402  — reuse list_versions / fetch_version / parse_snapshot

ROOT = Path(__file__).parent.parent
OUT = ROOT / "raw" / "tft_dataset.csv"
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 60


def main():
    live_doc = fetch_hk.http_json(fetch_hk.FEED_URL)
    now = fetch_hk.parse_update_time(live_doc.get("updateTime"))
    end = (now - timedelta(days=1)).date()
    t0 = end - timedelta(days=DAYS)
    print(f"TFT dataset: {DAYS} days of hourly snapshots, {t0} → {end} (HKT)")

    stamps = fetch_hk.list_versions(datetime.combine(t0, datetime.min.time()),
                                    datetime.combine(end, datetime.min.time()))
    hourly = [ts for ts in stamps if ts.endswith("00") and
              datetime.strptime(ts, "%Y%m%d-%H%M").minute == 0]
    print(f"  {len(stamps)} versions listed → {len(hourly)} hourly wanted")

    rows = []
    got = 0
    with ThreadPoolExecutor(max_workers=12) as ex:
        for ts, doc in ex.map(fetch_hk.fetch_version, hourly):
            if not doc:
                continue
            got += 1
            snap = fetch_hk.parse_snapshot(doc)
            t = datetime.strptime(ts, "%Y%m%d-%H%M").isoformat(timespec="minutes")
            for slug, r in snap["hospitals"].items():
                if r["t45p50_min"] is None:
                    continue
                rows.append((slug, t, r["t45p50_min"], r["t3p50_min"]))

    rows.sort()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slug", "ts", "t45p50", "t3p50"])
        w.writerows(rows)
    slugs = {r[0] for r in rows}
    print(f"  wrote {OUT.name}: {len(rows)} rows · {len(slugs)} hospitals · "
          f"{got}/{len(hourly)} snapshots fetched")


if __name__ == "__main__":
    main()
