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
    bed_hour_cost_eur: number
    lean_targets_min: Record<string, number>
  }
}

export interface ScenarioBeat {
  t_offset_min: number
  id: 'meet_sarah' | 'lab_delay' | 'cardio_overload' | 'resolve'
  desc: string
}

export interface Scenario {
  hero: string
  now: string
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
