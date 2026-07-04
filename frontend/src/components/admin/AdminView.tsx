import { adminModelAt, worldAt } from '../../sim/engine'
import type { AdminVM, LoadLevel, ZoneLoads } from '../../sim/engine'
import { DEPTS } from '../../sim/layout'
import { fmtDayClock, fmtDur } from '../../sim/time'
import { useStore } from '../../store'
import { ArrivalForecast } from './ArrivalForecast'
import './admin.css'

const eur = (n: number) => `€${n.toLocaleString('en-US')}`

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

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="admin-kpi">
      <span className="admin-kpi__label">{label}</span>
      <span className="admin-kpi__value">{value}</span>
      {sub ? <span className="admin-kpi__sub">{sub}</span> : null}
    </div>
  )
}

/** The demo beat: the same bottleneck the doctor sees, framed as a reallocation
   play with cost-of-delay — or, once resolved, its outcome; otherwise the
   standing recurring pattern from the 7-day log. */
function PlayCard({ vm, onGoToDoctor }: { vm: AdminVM; onGoToDoctor: () => void }) {
  const { play, bottleneck, assumptions } = vm

  let body
  if (play.active) {
    body = (
      <div className="admin-play admin-play--crit">
        <div className="admin-play__title">Cardiology consult queue over capacity</div>
        <p className="admin-play__line tnum">
          {play.queued} consults queued · blocking {play.blockedBeds} ER bays · ≈{fmtDur(play.overstayMin)} avoidable
          overstay
        </p>
        <p className="admin-play__move tnum">
          Move 1 cardiologist for 60 min → frees ≈{fmtDur(play.overstayMin)} of bed-time (≈ {eur(play.costEur)} at{' '}
          {eur(assumptions.bed_hour_cost_eur)}/bed-hour)
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
    const { avg_los_in_window_min: inWin, avg_los_other_min: other } = bottleneck
    body = (
      <div className="admin-play admin-play--neutral">
        <div className="admin-play__title">
          Recurring: {bottleneck.dept} {bottleneck.window}
        </div>
        {inWin != null && other != null ? (
          <p className="admin-play__line tnum">
            Chest-pain LOS {inWin} min in-window vs {other} min otherwise (n={bottleneck.n_in_window}, 7-day log)
          </p>
        ) : (
          <p className="admin-play__line tnum">
            Elevated afternoon length-of-stay logged in-window (n={bottleneck.n_in_window}, 7-day log)
          </p>
        )}
        <p className="admin-play__note">{bottleneck.note}</p>
      </div>
    )
  }

  return (
    <section className="card admin-card">
      <h2 className="admin-card__title">Bottleneck &amp; reallocation play</h2>
      {body}
    </section>
  )
}

function AvoidableTable({ vm }: { vm: AdminVM }) {
  return (
    <section className="card admin-card">
      <h2 className="admin-card__title">Avoidable wait by department</h2>
      <table className="admin-table">
        <caption className="admin-table__caption">
          7-day log vs lean targets · {eur(vm.assumptions.bed_hour_cost_eur)}/bed-hour is a stated assumption.
        </caption>
        <thead>
          <tr>
            <th scope="col">Dept</th>
            <th scope="col" className="admin-table__num">
              Avoidable wait
            </th>
            <th scope="col" className="admin-table__num">
              Cost of delay
            </th>
          </tr>
        </thead>
        <tbody>
          {vm.avoidableRank.length === 0 ? (
            <tr>
              <td className="admin-table__empty" colSpan={3}>
                No avoidable wait logged in the window.
              </td>
            </tr>
          ) : (
            vm.avoidableRank.map((r) => (
              <tr key={r.dept}>
                <td>{r.dept}</td>
                <td className="admin-table__num tnum">{fmtDur(r.avoidable_wait_min)}</td>
                <td className="admin-table__num tnum">{eur(r.cost_of_delay_eur)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

function DeptLoadCard({ zones }: { zones: ZoneLoads }) {
  const depts = DEPTS.filter((d) => !d.outside)
  return (
    <section className="card admin-card">
      <h2 className="admin-card__title">Department load now</h2>
      <div className="admin-load">
        {depts.map((d) => {
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
    </section>
  )
}

function CalibrationCard({ vm }: { vm: AdminVM }) {
  const { calibration: cal, benchmark } = vm
  return (
    <section className="card admin-card">
      <h2 className="admin-card__title">Model calibration</h2>
      <p className="admin-cal__line tnum">
        {cal.coverage_pct}% of 80% intervals covered · median |error| {cal.median_abs_error_min} min · n={cal.n}
      </p>
      <p className="admin-card__caption">FlowTwin ETA — empirical quantile model, recomputed nightly.</p>
      <p className="admin-cal__bench tnum">
        Admitted LOS benchmark: median {benchmark.median_los_days} days (n={benchmark.n}) — {benchmark.source}
      </p>
    </section>
  )
}

export function AdminView() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const setView = useStore((s) => s.setView)

  const { agents, zones } = worldAt(simMin, resolvedAtMin)
  const vm = adminModelAt(agents, zones, simMin, resolvedAtMin)

  return (
    <section className="admin" aria-label="Administrator dashboard">
      <div className="admin__inner">
        <header className="admin-head">
          <div className="admin-head__title">
            <span className="admin-head__role">Administrator</span>
            <span className="admin-head__dot" aria-hidden="true">
              ·
            </span>
            <span className="admin-head__scope">hospital operations</span>
          </div>
          <div className="admin-head__time tnum">{fmtDayClock(simMin)}</div>
        </header>

        <div className="admin-kpis">
          <StatTile label="Census on floor" value={String(vm.censusNow)} sub="patients tracked live" />
          <StatTile
            label="Bed occupancy"
            value={`${vm.bedOccupancyPct}%`}
            sub="ER bays · observation · wards"
          />
          <StatTile label="Discharged today" value={String(vm.dischargedToday)} sub="left the floor since 00:00" />
          <StatTile label="Avg station wait" value={fmtDur(vm.avgWaitNowMin)} sub="mean dwell in current zone" />
          <StatTile
            label="ETA calibration"
            value={`${vm.calibration.coverage_pct}%`}
            sub={`80% target · ±${vm.calibration.median_abs_error_min} min median`}
          />
        </div>

        <div className="admin-grid">
          <div className="admin-col">
            <PlayCard vm={vm} onGoToDoctor={() => setView('doctor')} />
            <AvoidableTable vm={vm} />
          </div>
          <div className="admin-col">
            <section className="card admin-card">
              <h2 className="admin-card__title">Expected arrivals · next 3 h</h2>
              <ArrivalForecast forecast={vm.arrivalForecast} />
            </section>
            <DeptLoadCard zones={zones} />
            <CalibrationCard vm={vm} />
          </div>
        </div>
      </div>
    </section>
  )
}
