/* Typed access to the committed seed (data/seed/*.json).
   REAL: hk_live / hk_history (HA A&E feed — waits, p50/p95, 48h+7d archive)
         and the MIMIC-derived distributions baked into the cast.
   SYNTHETIC (labeled): the individual personas — the feed has no
   patient-level data, by design. See About → honesty ledger. */

import patientsJson from '@seed/patients_today.json'
import historyJson from '@seed/history_7d.json'
import scenarioJson from '@seed/scenario.json'
import kpisJson from '@seed/admin_kpis.json'
import hkLiveJson from '@seed/hk_live.json'
import hkHistoryJson from '@seed/hk_history.json'
import tftForecastJson from '@seed/tft_forecast.json'
import type {
  AdminKpis,
  History7d,
  HkHistory,
  HkLive,
  PatientsToday,
  Scenario,
  TftForecast,
} from '../types'

export const patientsToday = patientsJson as unknown as PatientsToday
export const history7d = historyJson as unknown as History7d
export const scenario = scenarioJson as unknown as Scenario
export const adminKpis = kpisJson as unknown as AdminKpis
export const hkLive = hkLiveJson as unknown as HkLive
export const hkHistory = hkHistoryJson as unknown as HkHistory

/** TFT forecast — trained offline on the real feed (data/tft/), committed. */
export const tftForecast = tftForecastJson as unknown as TftForecast

/** Everyone the twin tracks today: in-house at the anchor + scheduled arrivals. */
export const todayCast = [...patientsToday.patients, ...patientsToday.arrivals_today]

export const HERO_ID = scenario.hero

/** The real hospital this build is calibrated to. */
export const HOSPITAL = adminKpis.hk
