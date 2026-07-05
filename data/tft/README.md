# TFT wait-time forecast

A **Temporal Fusion Transformer** — the reference model of
[NVIDIA's Time Series Prediction Platform (TSPP)](https://catalog.ngc.nvidia.com/orgs/nvidia/resources/nvidia_tspp_notebooks) —
trained on the real Hong Kong Hospital Authority A&E feed to forecast the next
24 h of cat-4/5 median waits, per hospital, with p10/p50/p90 quantiles.

This is **Path B**: the same TFT architecture TSPP ships, run locally on
CPU/MPS via `pytorch-forecasting` — no GPU, no docker. For the full TSPP
container + Triton serving path, see the notes at the bottom.

## Run

```bash
cd data
python3.12 -m venv .venv-tft
.venv-tft/bin/pip install -r tft/requirements.txt

# 1. pull a long hourly history of the real feed (default 60 days, 18 sites)
.venv-tft/bin/python tft/build_dataset.py 60      # → data/raw/tft_dataset.csv

# 2. train the TFT + backtest + emit the forecast the app reads
.venv-tft/bin/python tft/train_tft.py             # → data/seed/tft_forecast.json
```

`data/raw/` is gitignored (rebuildable); `data/seed/tft_forecast.json` is
committed — the browser reads only that, so the demo needs no GPU, no model,
no live call.

## What's real, what's assumed

- **Real:** the training data (60 days × 18 sites of the actual published
  cat-4/5 median waits) and the **backtest** — the last 24 h are held out and
  never seen in training; the card shows the TFT's mean absolute error on that
  window against a same-hour-yesterday (seasonal-naive) baseline. That number
  is measured, not claimed.
- **Model:** a standard TFT (quantile loss, 7-day encoder, 24 h horizon,
  hour-of-day + weekday + hospital-id features). Small by design (~60k params)
  — the series is strongly seasonal, so it converges in minutes.
- **Labeling:** the app calls it "TFT — reference model of NVIDIA's TSPP",
  not "TSPP" itself, because it runs via `pytorch-forecasting` rather than the
  TSPP container. Faithful to the architecture; honest about the packaging.

## Full-TSPP upgrade (Path A/C, needs a GPU)

`build_dataset.py`'s CSV is already TSPP-shaped (long format: series id, time,
target + covariates). On a Brev / any CUDA box: pull the TSPP container, point
its dataset config at this CSV, train the same TFT recipe, and either export
the forecast JSON (Path A — same contract, this card unchanged) or serve it via
the TSPP Triton notebook and add an `/api/tft` proxy route (Path C — live
inference on stage).
