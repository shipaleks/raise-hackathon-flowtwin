#!/usr/bin/env python3
"""
Train a Temporal Fusion Transformer — the reference model of NVIDIA's Time
Series Prediction Platform (TSPP) — on the real HA A&E wait series, and emit
the forecast the app renders.

Method, stated plainly:
  · data: hourly cat-4/5 median waits, all 18 HA sites (build_dataset.py)
  · model: TFT with quantile output (p10/p50/p90), 7-day encoder, 24 h horizon
  · backtest: the last 24 h are held out; MAE reported for TFT vs the
    seasonal-naive baseline (same hour yesterday) — the honest yardstick
  · forecast: the next 24 h beyond the newest observation, per hospital

Output: data/seed/tft_forecast.json (committed — the app reads only this)

Run inside the venv:  .venv-tft/bin/python tft/train_tft.py
"""
import json
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import lightning.pytorch as pl
import torch
from lightning.pytorch.callbacks import EarlyStopping
from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
from pytorch_forecasting.data import GroupNormalizer
from pytorch_forecasting.metrics import QuantileLoss

warnings.filterwarnings("ignore")
torch.manual_seed(42)
np.random.seed(42)
pl.seed_everything(42, workers=True)

ROOT = Path(__file__).parent.parent
DATA = ROOT / "raw" / "tft_dataset.csv"
OUT = ROOT / "seed" / "tft_forecast.json"

ENCODER_H = 7 * 24   # a week of context
HORIZON_H = 24       # forecast + holdout window
QUANTILES = [0.1, 0.5, 0.9]
HERO = "QMH"


def load_frame() -> pd.DataFrame:
    df = pd.read_csv(DATA, parse_dates=["ts"])
    # regular hourly grid per hospital; small gaps interpolated, big gaps kept
    frames = []
    for slug, g in df.groupby("slug"):
        g = g.set_index("ts").sort_index()
        g = g[~g.index.duplicated(keep="last")]
        idx = pd.date_range(g.index.min(), g.index.max(), freq="1h")
        g = g.reindex(idx)
        g["t45p50"] = g["t45p50"].interpolate(limit=3)
        g["slug"] = slug
        g = g.dropna(subset=["t45p50"])
        frames.append(g.reset_index(names="ts"))
    out = pd.concat(frames, ignore_index=True)
    t0 = out["ts"].min()
    out["time_idx"] = ((out["ts"] - t0).dt.total_seconds() // 3600).astype(int)
    out["hour"] = out["ts"].dt.hour.astype(str)
    out["dow"] = out["ts"].dt.dayofweek.astype(str)
    out["t45p50"] = out["t45p50"].astype(float)
    return out


def make_model(training: TimeSeriesDataSet) -> TemporalFusionTransformer:
    return TemporalFusionTransformer.from_dataset(
        training,
        hidden_size=32,
        attention_head_size=2,
        dropout=0.1,
        hidden_continuous_size=16,
        loss=QuantileLoss(QUANTILES),
        learning_rate=0.01,
        log_interval=-1,
    )


def main():
    df = load_frame()
    max_idx = int(df["time_idx"].max())
    cutoff = max_idx - HORIZON_H  # last 24 h held out for the backtest
    n_sites = df["slug"].nunique()
    print(f"dataset: {len(df)} rows · {n_sites} sites · {max_idx + 1} hourly steps")

    training = TimeSeriesDataSet(
        df[df.time_idx <= cutoff],
        time_idx="time_idx",
        target="t45p50",
        group_ids=["slug"],
        max_encoder_length=ENCODER_H,
        max_prediction_length=HORIZON_H,
        static_categoricals=["slug"],
        time_varying_known_categoricals=["hour", "dow"],
        time_varying_known_reals=["time_idx"],
        time_varying_unknown_reals=["t45p50"],
        target_normalizer=GroupNormalizer(groups=["slug"]),
        allow_missing_timesteps=True,
    )
    validation = TimeSeriesDataSet.from_dataset(
        training, df, predict=True, stop_randomization=True
    )
    train_dl = training.to_dataloader(train=True, batch_size=64, num_workers=0)
    val_dl = validation.to_dataloader(train=False, batch_size=64, num_workers=0)

    model = make_model(training)
    print(f"TFT parameters: {sum(p.numel() for p in model.parameters()):,}")
    trainer = pl.Trainer(
        max_epochs=25,
        accelerator="cpu",
        gradient_clip_val=0.1,
        callbacks=[EarlyStopping(monitor="val_loss", patience=4)],
        enable_progress_bar=False,
        logger=False,
        enable_checkpointing=False,
        deterministic=True,
    )
    trainer.fit(model, train_dl, val_dl)

    # ---------------- backtest on the held-out last 24 h ----------------
    raw = model.predict(val_dl, mode="raw", return_x=True, return_index=True,
                        trainer_kwargs={"accelerator": "cpu", "logger": False})
    preds = raw.output.prediction  # [n_series, HORIZON_H, n_quantiles]
    # return_index gives a DataFrame with one row per predicted series — the
    # clean, order-safe way to map a prediction row back to its hospital
    slugs = raw.index["slug"].tolist()

    actual_by_slug, naive_by_slug = {}, {}
    for slug, g in df.groupby("slug"):
        tail = g[g.time_idx > cutoff].sort_values("time_idx")
        prev = g[(g.time_idx > cutoff - 24) & (g.time_idx <= cutoff)].sort_values("time_idx")
        if len(tail) == HORIZON_H and len(prev) == HORIZON_H:
            actual_by_slug[slug] = tail["t45p50"].to_numpy()
            naive_by_slug[slug] = prev["t45p50"].to_numpy()

    tft_err, naive_err, hero_tft, hero_naive = [], [], None, None
    for i, slug in enumerate(slugs):
        if slug not in actual_by_slug:
            continue
        p50 = preds[i, :, QUANTILES.index(0.5)].numpy()
        a = actual_by_slug[slug]
        n = naive_by_slug[slug]
        m = min(len(p50), len(a))
        e_t = float(np.mean(np.abs(p50[:m] - a[:m])))
        e_n = float(np.mean(np.abs(n[:m] - a[:m])))
        tft_err.append(e_t)
        naive_err.append(e_n)
        if slug == HERO:
            hero_tft, hero_naive = e_t, e_n
    print(f"backtest (last 24 h, {len(tft_err)} sites): "
          f"TFT MAE {np.mean(tft_err):.0f} min · naive-24h {np.mean(naive_err):.0f} min")

    # ---------------- forward forecast: next 24 h beyond the data --------
    t0 = df["ts"].min()
    future_rows = []
    for slug in df["slug"].unique():
        for h in range(1, HORIZON_H + 1):
            idx = max_idx + h
            ts = t0 + timedelta(hours=idx)
            future_rows.append({"slug": slug, "ts": ts, "time_idx": idx,
                                "t45p50": 0.0, "hour": str(ts.hour),
                                "dow": str(ts.dayofweek)})
    full = pd.concat([df, pd.DataFrame(future_rows)], ignore_index=True)
    predict_ds = TimeSeriesDataSet.from_dataset(
        training, full, predict=True, stop_randomization=True,
        min_prediction_idx=max_idx + 1,
    )
    fraw = model.predict(predict_ds.to_dataloader(train=False, batch_size=64, num_workers=0),
                         mode="raw", return_x=True, return_index=True,
                         trainer_kwargs={"accelerator": "cpu", "logger": False})
    fpred = fraw.output.prediction
    fslugs = fraw.index["slug"].tolist()

    anchor = t0 + timedelta(hours=max_idx)
    forecast = {}
    for i, slug in enumerate(fslugs):
        pts = []
        for h in range(HORIZON_H):
            q = fpred[i, h, :].numpy()
            ts = anchor + timedelta(hours=h + 1)
            pts.append({"t": ts.isoformat(timespec="minutes"),
                        "p10": max(0, round(float(q[0]))),
                        "p50": max(0, round(float(q[1]))),
                        "p90": max(0, round(float(q[2])))})
        forecast[str(slug)] = pts

    OUT.write_text(json.dumps({
        "model": "TFT (Temporal Fusion Transformer) — reference model of NVIDIA's Time Series Prediction Platform",
        "trained_on": f"{max_idx + 1} hourly steps × {n_sites} HA sites (real published cat-4/5 median waits)",
        "generated": datetime.now().isoformat(timespec="minutes"),
        "anchor_hkt": anchor.isoformat(timespec="minutes"),
        "horizon_h": HORIZON_H,
        "quantiles": QUANTILES,
        "backtest": {
            "holdout_h": HORIZON_H,
            "n_sites": len(tft_err),
            "tft_mae_min": round(float(np.mean(tft_err))),
            "naive24_mae_min": round(float(np.mean(naive_err))),
            "hero_tft_mae_min": round(hero_tft) if hero_tft is not None else None,
            "hero_naive24_mae_min": round(hero_naive) if hero_naive is not None else None,
        },
        "forecast": forecast,
    }, indent=1))
    print(f"wrote {OUT.relative_to(ROOT)} · anchor {anchor} · {len(forecast)} sites")


if __name__ == "__main__":
    main()
