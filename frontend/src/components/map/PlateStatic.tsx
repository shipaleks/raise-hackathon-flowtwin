/* A lean, non-interactive floor plate for the exploded building view:
   shell, corridor, lift symbol, dept/room hairlines, dept names, and the
   live crowd as risk-coloured dots. No furniture, no handlers — it has
   to render three times inside a 3D transform and stay light. */

import type { MapAgent } from '../../sim/engine'
import { CORRIDOR, LIFT, MAP_H, MAP_W, deptsOnFloor, type FloorId } from '../../sim/layout'

const RISK_FILL: Record<string, string> = {
  on_track: 'var(--ok)',
  elevated: 'var(--warn)',
  high: 'var(--crit)',
}

export function PlateStatic({
  floorId,
  agents,
  billboard = false,
}: {
  floorId: FloorId
  agents: MapAgent[]
  /** counter-rotate names against the stack's rotateZ so they stay legible */
  billboard?: boolean
}) {
  return (
    <svg className="plate-static" viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
      <rect className="ps-plate" x={12} y={84} width={MAP_W - 24} height={MAP_H - 104} rx={22} />
      <rect
        className="ps-corridor"
        x={20}
        y={CORRIDOR.y1}
        width={MAP_W - 40}
        height={CORRIDOR.y2 - CORRIDOR.y1}
      />
      <g className="ps-lift">
        <rect x={LIFT.x} y={LIFT.y} width={LIFT.w} height={LIFT.h} />
        <line x1={LIFT.x} y1={LIFT.y} x2={LIFT.x + LIFT.w} y2={LIFT.y + LIFT.h} />
        <line x1={LIFT.x + LIFT.w} y1={LIFT.y} x2={LIFT.x} y2={LIFT.y + LIFT.h} />
      </g>
      {deptsOnFloor(floorId).map((d) => (
        <g key={d.id} className={d.outside ? 'ps-dept ps-dept--outside' : 'ps-dept'}>
          <rect x={d.x} y={d.y} width={d.w} height={d.h} rx={14} className="ps-dept__rect" />
          {d.areas.map((a) => (
            <rect key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} rx={6} className="ps-area" />
          ))}
          <text
            className="ps-name"
            x={d.x + 14}
            y={d.y + 26}
            transform={billboard ? `rotate(32 ${d.x + 14} ${d.y + 26})` : undefined}
          >
            {d.name}
          </text>
        </g>
      ))}
      <g className="ps-agents">
        {agents.map((a) => (
          <circle key={a.id} cx={a.x} cy={a.y} r={5} fill={RISK_FILL[a.risk] ?? 'var(--ok)'} />
        ))}
      </g>
    </svg>
  )
}
