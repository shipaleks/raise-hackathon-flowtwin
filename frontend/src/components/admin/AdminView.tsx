/* Administrator view — the one surface where money is allowed.
   Anchored to the REAL hospital: live network table (18 HA sites), the real
   7-day wait pattern, and the reallocation play priced in HK$ under stated
   assumptions. The Doctor view never shows money. */

import { adminModelAt, worldAt } from '../../sim/engine'
import type { AdminVM, LoadLevel, ZoneLoads } from '../../sim/engine'
import { FLOORS, deptsOnFloor } from '../../sim/layout'
import { fmtDayClock, fmtDur } from '../../sim/time'
import { HOSPITAL } from '../../data/seed'
import { fmtWait, heroPattern, heroWaitsAt, networkNow } from '../../data/live'
import { simToDate } from '../../sim/time'
import { useStore } from '../../store'
import { ArrivalForecast } from './ArrivalForecast'
import { NemotronForecastCard } from '../../live/NemotronForecastCard'
import { TftForecastCard } from '../../live/TftForecastCard'
import './admin.css'

const hkd = (n: number) => `HK$${n.toLocaleString('en-US')}`

const LEVEL_WORD: Record<LoadLevel, string> = {
  ok: 'flowing',
  busy: 'busy',
  over: 'over capacity',
}

function CheckMark() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 5.2 4 7.7 8.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function StatTile({ label, value, sub, live }: { label: string; value: string; sub?: string; live?: boolean }) {
  return (
    <div className={`admin-kpi reg-ticks${live ? ' admin-kpi--live' : ''}`}>
      <span className="admin-kpi__idx" aria-hidden="true" />
      <span className="admin-kpi__label">{label}</span>
      {/* keyed on the value so a change gets the quick fade/slide swap */}
      <span className="admin-kpi__value" key={value}>
        {value}
      </span>
      {sub ? <span className="admin-kpi__sub">{sub}</span> : null}
    </div>
  )
}

/** The demo beat: the same bottleneck the doctor sees, framed as a reallocation
   play with cost-of-delay — or, once resolved, its outcome; otherwise the
   real recurring pattern from the feed. */
function PlayCard({ vm, onGoToDoctor }: { vm: AdminVM; onGoToDoctor: () => void }) {
  const { play, bottleneck, assumptions } = vm

  let body
  if (play.active) {
    body = (
      <div className="admin-play admin-play--crit">
        <div className="admin-play__title">Cardiology consult queue over capacity</div>
        <p className="admin-play__line tnum">
          {play.queued} consults queued · blocking {play.blockedBeds} cubicles · ≈{fmtDur(play.overstayMin)} avoidable
          overstay
        </p>
        <p className="admin-play__move tnum">
          Move 1 consult doctor for 60 min → frees ≈{fmtDur(play.overstayMin)} of bed-time (≈ {hkd(play.costHkd)}
          {' / '}€{play.costEur} at {hkd(assumptions.bed_hour_cost_hkd)}/bed-hour — stated assumption)
        </p>
        <button
          type="button"
          className="admin-play__foot"
          onClick={onGoToDoctor}
          aria-label="Switch to Doctor view to resolve this bottleneck"
        >
          <CheckMark />
          Same bottleneck the care team sees — resolve it from the Doctor view
        </button>
      </div>
    )
  } else if (play.resolvedNote) {
    body = (
      <div className="admin-play admin-play--ok">
        <div className="admin-play__title">Reallocation play executed</div>
        <p className="admin-play__line">{play.resolvedNote}</p>
      </div>
    )
  } else {
    body = (
      <div className="admin-play admin-play--neutral">
        <div className="admin-play__title">
          Recurring · {bottleneck.window}
        </div>
        <p className="admin-play__line tnum">
          Cat-4/5 median wait {bottleneck.avg_los_other_min} min at the trough → {bottleneck.avg_los_in_window_min} min
          at the daytime peak
        </p>
        <p className="admin-play__note">{bottleneck.note}</p>
      </div>
    )
  }

  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">Bottleneck &amp; reallocation play</h2>
      {body}
    </section>
  )
}

/** All 18 HA A&E sites — the real network, live. */
function NetworkCard() {
  const rows = networkNow()
  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">The network right now</h2>
      <table className="admin-table admin-net">
        <caption className="admin-table__caption">
          All 18 Hospital Authority A&amp;E sites — real published waits, latest feed snapshot.
        </caption>
        <thead>
          <tr>
            <th scope="col">Hospital</th>
            <th scope="col">Cluster</th>
            <th scope="col" className="admin-table__num">
              cat-3 p50
            </th>
            <th scope="col" className="admin-table__num">
              cat-4/5 p50
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} className={r.slug === HOSPITAL.hospital_slug ? 'is-hero' : undefined}>
              <td>{r.name}</td>
              <td className="admin-net__cluster">{r.meta?.cluster ?? ''}</td>
              <td className="admin-table__num tnum">{fmtWait(r.t3p50_min)}</td>
              <td className="admin-table__num tnum">{fmtWait(r.t45p50_min)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** The hospital's real 7-day hour-of-day wait curve, with "you are here". */
function PatternCard({ simMin }: { simMin: number }) {
  const pat = heroPattern()
  const vals = pat.map((p) => p.t45p50_mean ?? 0)
  const max = Math.max(1, ...vals)
  const hourNow = simToDate(simMin).getHours()
  const W = 336
  const H = 92
  const bw = W / 24
  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">The real daily pattern</h2>
      <svg
        className="admin-pattern"
        viewBox={`0 0 ${W} ${H + 18}`}
        role="img"
        aria-label={`Mean cat-4/5 median wait by hour of day over 7 days, peaking at ${fmtWait(max)}`}
      >
        {pat.map((p, h) => {
          const v = p.t45p50_mean ?? 0
          const bh = (v / max) * H
          return (
            <rect
              key={h}
              className={`admin-pattern__bar${h === hourNow ? ' is-now' : ''}`}
              x={h * bw + 1.5}
              y={H - bh}
              width={bw - 3}
              height={Math.max(1, bh)}
              rx={2}
            >
              <title>{`${String(h).padStart(2, '0')}:00 — ${fmtWait(v)} (7-day mean)`}</title>
            </rect>
          )
        })}
        {[0, 6, 12, 18].map((h) => (
          <text key={h} className="admin-pattern__tick" x={h * bw + 2} y={H + 13}>
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
      <p className="admin-card__caption">
        Cat-4/5 median wait by hour — 7-day mean from the HA archive. The highlighted bar is the
        scrubbed hour. This is the hospital's own published data, not a simulation.
      </p>
    </section>
  )
}

function DeptLoadCard({ zones }: { zones: ZoneLoads }) {
  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">Load by floor</h2>
      <div className="admin-load">
        {FLOORS.map((f) => (
          <div key={f.id} className="admin-load__floor">
            <p className="admin-load__floorname">
              Floor {f.short} · {f.name}
            </p>
            {deptsOnFloor(f.id)
              .filter((d) => !d.outside && d.areas.some((a) => a.capacity > 0))
              .map((d) => {
                const z = zones.depts.get(d.id)
                const count = z?.count ?? 0
                const cap = z?.capacity ?? 0
                const level: LoadLevel = z?.level ?? 'ok'
                const pct = cap > 0 ? Math.min(100, (count / cap) * 100) : 0
                return (
                  <div className="admin-load__row" key={d.id}>
                    <span className="admin-load__name">{d.name}</span>
                    <div
                      className="admin-load__meter"
                      role="img"
                      aria-label={`${d.name}: ${count} of ${cap} capacity, ${LEVEL_WORD[level]}`}
                    >
                      <span className={`admin-load__fill admin-load__fill--${level}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="admin-load__val tnum">
                      {count}/{cap}
                    </span>
                  </div>
                )
              })}
          </div>
        ))}
      </div>
      <p className="admin-card__caption">
        A&amp;E load is calibrated to the live feed; the upper floors are a representative slice —
        the feed does not publish ward occupancy.
      </p>
    </section>
  )
}

function CalibrationCard({ vm }: { vm: AdminVM }) {
  const { calibration: cal, benchmark } = vm
  return (
    <section className="card admin-card reg-ticks">
      <h2 className="admin-card__title">Model calibration</h2>
      <p className="admin-cal__line tnum">
        {cal.interval} · n={cal.n} real ED stays (MIMIC-IV-ED)
      </p>
      <p className="admin-card__caption">
        FlowTwin ETA — LOS quantiles from real de-identified stays; in-sample on the open demo
        subset, out-of-sample calibration needs the full dataset (drop-in).
      </p>
      <p className="admin-cal__bench tnum">
        Wait draws: lognormal through the hospital's real published p50/p95 per snapshot ·
        source: {benchmark.source}
      </p>
    </section>
  )
}

export function AdminView() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const optimizedAtMin = useStore((s) => s.optimizedAtMin)
  const setView = useStore((s) => s.setView)
  const setWrapOpen = useStore((s) => s.setWrapOpen)

  const { agents, zones } = worldAt(simMin, resolvedAtMin, optimizedAtMin)
  const vm = adminModelAt(agents, zones, simMin, resolvedAtMin, optimizedAtMin)
  const w = heroWaitsAt(simMin)

  return (
    <section className="admin" aria-label="Administrator dashboard">
      <div className="admin__inner">
        <header className="admin-head">
          <div className="admin-head__title">
            <span className="admin-head__role">Administrator</span>
            <span className="admin-head__dot" aria-hidden="true">
              ·
            </span>
            <span className="admin-head__scope">
              {HOSPITAL.hospital} · {HOSPITAL.cluster}
            </span>
          </div>
          <div className="admin-head__right">
            <button type="button" className="admin-head__optimize" onClick={() => setWrapOpen(true)}>
              Optimize the day →
            </button>
            <div className="admin-head__time tnum">{fmtDayClock(simMin)} HKT</div>
          </div>
        </header>

        <div className="admin-kpis">
          <StatTile
            label="Cat-4/5 wait now"
            value={fmtWait(w?.t45p50)}
            sub={`p95 ${fmtWait(w?.t45p95)} — real published feed`}
            live
          />
          <StatTile
            label="Cat-3 wait now"
            value={fmtWait(w?.t3p50)}
            sub={`p95 ${fmtWait(w?.t3p95)} — real published feed`}
            live
          />
          <StatTile
            label="In the building"
            value={String(vm.censusNow)}
            sub={`${vm.waitingHall} in the waiting hall · est. census`}
          />
          <StatTile
            label="Bed occupancy"
            value={`${vm.bedOccupancyPct}%`}
            sub="cubicles · obs · wards (representative)"
          />
          <StatTile label="Discharged today" value={String(vm.dischargedToday)} sub="left since 00:00" />
        </div>

        <div className="admin-grid">
          <div className="admin-col">
            <PlayCard vm={vm} onGoToDoctor={() => setView('doctor')} />
            <PatternCard simMin={simMin} />
            <TftForecastCard />
            <NemotronForecastCard />
            <CalibrationCard vm={vm} />
          </div>
          <div className="admin-col">
            <NetworkCard />
            <section className="card admin-card reg-ticks">
              <h2 className="admin-card__title">Expected arrivals · next 3 h</h2>
              <ArrivalForecast forecast={vm.arrivalForecast} />
            </section>
            <DeptLoadCard zones={zones} />
          </div>
        </div>

        <footer className="admin-foot">
          <span>
            FlowTwin · Administrator plate · {HOSPITAL.hospital}
          </span>
          <span className="admin-foot__sep" aria-hidden="true" />
          <span>Printed from the HA live feed · {fmtDayClock(simMin)} HKT</span>
        </footer>
      </div>
    </section>
  )
}
