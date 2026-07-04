/* Typed access to the committed seed (data/seed/*.json).
   Identity/complaint/arrival = real (Synthea sample); LOS-days/outcomes = real
   (HF HospitalAdmissions); station times, vitals, and the afternoon cardiology
   backup = synthesized and labeled per-record (see data/README.md). */

import patientsJson from '@seed/patients_today.json'
import historyJson from '@seed/history_7d.json'
import scenarioJson from '@seed/scenario.json'
import kpisJson from '@seed/admin_kpis.json'
import type { AdminKpis, History7d, PatientsToday, Scenario } from '../types'

export const patientsToday = patientsJson as unknown as PatientsToday
export const history7d = historyJson as unknown as History7d
export const scenario = scenarioJson as unknown as Scenario
export const adminKpis = kpisJson as unknown as AdminKpis

/** Everyone who is (or will be) on the floor today: 7 in-house + 10 scheduled arrivals. */
export const todayCast = [...patientsToday.patients, ...patientsToday.arrivals_today]

export const HERO_ID = scenario.hero
