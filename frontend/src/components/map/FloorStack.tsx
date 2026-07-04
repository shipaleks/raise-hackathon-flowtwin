/* The floor navigator as a tiny axonometric diorama — three blueprint
   plates stacked in iso, the lift shaft threading through them, live
   counts riding each plate. Replaces the old flat button rail. */

import { FLOORS, LIFT, MAP_W, MAP_H, deptsOnFloor, floorById, type FloorId } from '../../sim/layout'
import { isoPt, isoRect } from './iso'
import { useStore } from '../../store'

const PLATE = isoRect(0, 0, MAP_W, MAP_H)
const ORIGIN_X = 70
const ORIGIN_Y = 10
const STEP_Y = 44

const LIFT_C = isoPt(LIFT.x + LIFT.w / 2, LIFT.y + LIFT.h / 2)
const PLATE_C = isoPt(MAP_W / 2, MAP_H / 2)

interface FloorStackProps {
  countByFloor: Record<FloorId, { count: number; worst: 'ok' | 'busy' | 'over' }>
}

export function FloorStack({ countByFloor }: FloorStackProps) {
  const floorId = useStore((s) => s.floorId)
  const setFloor = useStore((s) => s.setFloor)
  const stack = useStore((s) => s.stackOpen)
  const setStackOpen = useStore((s) => s.setStackOpen)

  const activeName = floorById.get(floorId)?.name ?? ''
  const plural = (n: number) => (n === 1 ? 'patient' : 'patients')

  return (
    <nav className="fstack" aria-label="Floors">
      <svg
        className="fstack__svg"
        viewBox="0 0 208 190"
        width={208}
        height={190}
        aria-hidden="false"
      >
        {/* the lift shaft threading the stack */}
        <line
          className="fstack__shaft"
          x1={ORIGIN_X + LIFT_C.x}
          y1={ORIGIN_Y + LIFT_C.y - 8}
          x2={ORIGIN_X + LIFT_C.x}
          y2={ORIGIN_Y + LIFT_C.y + STEP_Y * (FLOORS.length - 1) + 10}
        />
        {FLOORS.map((f, i) => {
          const st = countByFloor[f.id]
          const active = f.id === floorId
          return (
            <g key={f.id} transform={`translate(${ORIGIN_X} ${ORIGIN_Y + i * STEP_Y})`}>
              <g
                className={`fstack__floor${active ? ' is-active' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={`Floor ${f.short} — ${f.name}, ${st.count} ${plural(st.count)}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setFloor(f.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setFloor(f.id)
                  }
                }}
              >
                <path className="fstack__plate" d={PLATE} />
                {deptsOnFloor(f.id).map((d) => (
                  <path key={d.id} className="fstack__dept" d={isoRect(d.x, d.y, d.w, d.h)} />
                ))}
                <path className="fstack__lift" d={isoRect(LIFT.x, LIFT.y, LIFT.w, LIFT.h)} />
                {/* floor letter at the west tip, count at the plate centre */}
                <text className="fstack__short" x={isoPt(0, MAP_H).x - 8} y={isoPt(0, MAP_H).y + 2}>
                  {f.short}
                </text>
                <g transform={`translate(${PLATE_C.x} ${PLATE_C.y})`}>
                  <circle className="fstack__badge" r={9} />
                  <text className="fstack__count tnum" y={3}>
                    {st.count}
                  </text>
                  <circle className={`fstack__dot fstack__dot--${st.worst}`} cx={8.5} cy={-6.5} r={2.6} />
                </g>
              </g>
            </g>
          )
        })}
      </svg>
      <p className="fstack__name">{activeName}</p>
      <button
        type="button"
        className={`fstack__explode${stack ? ' is-on' : ''}`}
        aria-pressed={stack}
        onClick={(e) => {
          e.stopPropagation()
          setStackOpen(!stack)
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1.2 11 3.8 6 6.4 1 3.8Z" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M11 6.2 6 8.8 1 6.2" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M11 8.6 6 11.2 1 8.6" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>
        Building view
      </button>
      <p className="fstack__note">F cycles floors · B building</p>
    </nav>
  )
}
