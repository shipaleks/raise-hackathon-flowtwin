/* Ops-state schema — mirrors data/seed/*.json (see data/README.md). */

export type Sex = 'male' | 'female'
export type Risk = 'on_track' | 'elevated' | 'high'
export type ArrivalMode = 'ambulance' | 'walk-in' | 'referral'

export interface JourneyEvent {
  t: string // ISO minutes, local
  type: string
  dept: string
  area: string
}

export interface Vitals {
  hr: number
  sbp: number
  spo2: number
  rr: number
  temp_c: number
  pain: number
}

export interface Optimization {
  issue: string
  saving_min: number
  tag: string
}

export interface Recommendation {
  action: string
  explanation: string
  impact_min: number
}

export interface WearableSignal {
  source: string
  overnight_arrhythmia_flag: boolean
  resting_hr_7d_avg: number
  hrv_trend: string
  note: string
}

export interface OpsPatient {
  patient_id: string
  name: string
  age: number
  sex: Sex
  complaint: string
  pathway: string
  acuity: number
  arrival_mode: ArrivalMode
  arrival_time: string
  current_department: string
  current_area: string
  elapsed_min: number
  vitals: Vitals
  events: JourneyEvent[]
  resources: {
    er_bed_min: number
    nurse_min: number
    doctor_min: number
    labs: number
    imaging: number
  }
  predicted_exit: string
  predicted_exit_ci: { low: string; high: string; interval: string }
  predicted_los_min: number
  benchmark_los_min: number
  delay_risk: Risk
  blocker: string
  recommendation: Recommendation
  signals: {
    wearable: WearableSignal | null
    vocal_biomarker: unknown
    _note: string
  }
  optimization: Optimization[]
  guard: { topic_ok: boolean; safety_ok: boolean }
  provenance: Record<string, string>
  hero?: boolean
  arrives_later?: boolean
  extra_signal_track?: boolean
  near_optimal_track?: boolean
  /** seeded upstairs cast — keeps their ward bed for the whole window */
  inpatient?: boolean
  /** the wait actually drawn from the hospital's published distribution */
  real_wait_draw_min?: number
}

export interface HistoryJourney {
  patient_id: string
  name: string
  age: number
  sex: Sex
  pathway: string
  complaint: string
  acuity: number
  arrival_mode: ArrivalMode
  arrival: string
  los_min: number
  ed_los_min?: number
  admitted: boolean
  disposition: 'admitted' | 'discharged'
  events: JourneyEvent[]
}

export interface PathwayQuantiles {
  p10: number
  p50: number
  p80: number
  p90: number
  n: number
}

export interface AdminKpis {
  generated_now: string
  current_census: number
  avoidable_wait_rank: Array<{
    dept: string
    avoidable_wait_min: number
    cost_of_delay_eur: number
  }>
  dept_load_minutes_7d: Record<string, number>
  recurring_bottleneck: {
    dept: string
    window: string
    avg_los_in_window_min: number | null
    avg_los_other_min: number | null
    n_in_window: number
    note: string
  }
  arrival_forecast_next_3h: Array<{
    hour: string
    expected_arrivals: number
    by_mode: Record<string, number>
  }>
  /** all 24 hour-of-day rate buckets — the UI derives the live forecast */
  arrival_rates_by_hour?: Array<{
    hour: string
    expected_arrivals: number
    by_mode: Record<string, number>
  }>
  eta_calibration: {
    interval: string
    coverage_pct: number
    median_abs_error_min: number
    n: number
  }
  eta_model_quantiles_min: Record<string, PathwayQuantiles>
  hf_admissions_benchmark: {
    n: number
    outcome_mix: Record<string, number>
    median_los_days: number
    source: string
  }
  assumptions: {
    bed_hour_cost_hkd: number
    bed_hour_cost_eur: number
    hkd_per_eur: number
    lean_targets_min: Record<string, number>
  }
  /** the real hospital this build is calibrated to */
  hk: {
    hospital_slug: string
    hospital: string
    cluster: string
    district: string
    live_update_raw: string
    live_anchor: string
    attendance_per_day_assumption: number
    admit_share_assumption: number
    triage_mix_assumption: Record<string, number>
    live_now: Record<string, number | null>
  }
  optimize_plan: OptimizePlan
}

export interface OptimizePlanItem {
  id: string
  change: string
  window: string
  evidence: string
  saved_min_per_day: number
  saved_hkd_per_day: number
  saved_eur_per_day: number
  basis: string
}

export interface OptimizePlan {
  model: string
  assumption_note: string
  items: OptimizePlanItem[]
  total_saved_min_per_day: number
  total_hkd_per_day: number
  total_eur_per_day: number
  total_hkd_per_year: number
  total_eur_per_year: number
}

/* ---------------------------------------------------------------- HK feed */

export interface HkHospitalRow {
  name: string
  t1_min: number
  t2_min: number | null
  t3p50_min: number | null
  t3p95_min: number | null
  t45p50_min: number | null
  t45p95_min: number | null
  manage_t1: boolean
  manage_t2: boolean
  raw: Record<string, string>
}

export interface HkLive {
  source: string
  fetched_at_hkt: string
  updateTime_raw: string
  hospitals: Record<string, HkHospitalRow>
  meta: Record<string, { name: string; cluster: string; district: string }>
}

export interface HkSeriesPoint {
  t: string
  t2: number | null
  t3p50: number | null
  t3p95: number | null
  t45p50: number | null
  t45p95: number | null
}

export interface HkHistory {
  source: string
  anchor_hkt: string
  resolution: string
  series: Record<string, HkSeriesPoint[]>
  hour_pattern_7d: Record<
    string,
    Array<{ hour: number; t3p50_mean: number | null; t45p50_mean: number | null; n: number }>
  >
}

export interface ScenarioBeat {
  t_offset_min: number
  id: 'meet_sarah' | 'lab_delay' | 'cardio_overload' | 'resolve'
  desc: string
}

export interface Scenario {
  hero: string
  now: string
  hospital?: string
  beats: ScenarioBeat[]
  patient: OpsPatient
}

export interface PatientsToday {
  generated_now: string
  count: number
  patients: OpsPatient[]
  arrivals_today: OpsPatient[]
}

export interface History7d {
  window_days: number
  anchor_now: string
  count: number
  journeys: HistoryJourney[]
}

/** TFT forecast — trained offline on the real feed, committed as seed. */
export interface TftForecastPoint {
  t: string // ISO HKT of the forecast hour
  p10: number
  p50: number
  p90: number
}

export interface TftForecast {
  model: string
  trained_on: string
  generated: string
  anchor_hkt: string
  horizon_h: number
  quantiles: number[]
  backtest: {
    holdout_h: number
    n_sites: number
    tft_mae_min: number
    naive24_mae_min: number
    hero_tft_mae_min: number | null
    hero_naive24_mae_min: number | null
  }
  forecast: Record<string, TftForecastPoint[]>
}
