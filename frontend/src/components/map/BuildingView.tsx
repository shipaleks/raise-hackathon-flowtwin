/* The exploded axonometric building — the three floor plates lift off the
   page, tilt into iso and fan apart; the lift shaft threads them together
   in screen space. Click a plate (or its label) to fly back down onto that
   floor's plan. GSAP drives the whole choreography. */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { worldAt } from '../../sim/engine'
import { FLOORS, LIFT, MAP_H, MAP_W, floorById } from '../../sim/layout'
import { useStore } from '../../store'
import { PlateStatic } from './PlateStatic'

const TILT = { rotationX: 60, rotationZ: -32 }
const PLATE_GAP = 310 // translateZ between storeys
const LIFT_CX = ((LIFT.x + LIFT.w / 2) / MAP_W) * 100
const LIFT_CY = ((LIFT.y + LIFT.h / 2) / MAP_H) * 100

/** z-offset of a plate: G at the bottom of the fan, floor 2 on top. */
const plateZ = (i: number) => (FLOORS.length - 1 - i) * PLATE_GAP - PLATE_GAP

export function BuildingView({ open }: { open: boolean }) {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const optimizedAtMin = useStore((s) => s.optimizedAtMin)
  const setFloor = useStore((s) => s.setFloor)
  const floorId = useStore((s) => s.floorId)

  const [mounted, setMounted] = useState(open)
  const rootRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const shaftRef = useRef<SVGSVGElement>(null)
  const closingRef = useRef(false)

  // mount on open; unmount only after the exit timeline finishes
  useEffect(() => {
    if (open) {
      closingRef.current = false
      setMounted(true)
    }
  }, [open])

  const world = worldAt(simMin, resolvedAtMin, optimizedAtMin)

  /** Project the three lift-core markers and draw the shaft polyline. */
  const drawShaft = () => {
    const root = rootRef.current
    const svg = shaftRef.current
    if (!root || !svg) return
    const rootR = root.getBoundingClientRect()
    const pts: Array<{ x: number; y: number }> = []
    root.querySelectorAll<HTMLElement>('.bv-plate__liftmark').forEach((m) => {
      const r = m.getBoundingClientRect()
      pts.push({ x: r.left + r.width / 2 - rootR.left, y: r.top + r.height / 2 - rootR.top })
    })
    if (pts.length < 2) return
    const line = svg.querySelector('polyline')
    if (line) line.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '))
    svg.querySelectorAll('circle').forEach((c, i) => {
      if (pts[i]) {
        c.setAttribute('cx', String(pts[i].x))
        c.setAttribute('cy', String(pts[i].y))
      }
    })
  }

  const fitScale = () => {
    const root = rootRef.current
    if (!root) return 1
    const r = root.getBoundingClientRect()
    return Math.min(r.width / 1620, r.height / 1560, 1)
  }

  // enter choreography
  useLayoutEffect(() => {
    if (!mounted || !open) return
    const root = rootRef.current
    const tilt = tiltRef.current
    if (!root || !tilt) return
    const plates = Array.from(root.querySelectorAll<HTMLElement>('.bv-plate'))
    const labels = root.querySelector('.bv-labels')
    const head = root.querySelector('.bv-head')
    const shaft = shaftRef.current
    const activeIdx = FLOORS.findIndex((f) => f.id === floorId)

    gsap.set(root, { autoAlpha: 0 })
    gsap.set(root.querySelector('.bv-fit'), { scale: fitScale() })
    gsap.set(tilt, { rotationX: 0, rotationZ: 0 })
    plates.forEach((p, i) => gsap.set(p, { z: 0, autoAlpha: i === activeIdx ? 1 : 0 }))
    gsap.set([labels, head, shaft], { autoAlpha: 0 })

    const tl = gsap.timeline()
    tl.to(root, { autoAlpha: 1, duration: 0.22, ease: 'power1.out' })
      .to(tilt, { ...TILT, duration: 1.05, ease: 'power3.inOut' }, 0.1)
      .to(plates, { autoAlpha: 1, duration: 0.4, ease: 'power1.out' }, 0.25)
      .to(
        plates.map((p) => p),
        { z: (i: number) => plateZ(i), duration: 1.05, ease: 'power3.inOut' },
        0.1,
      )
      .add(() => drawShaft())
      .to([labels, head, shaft], { autoAlpha: 1, duration: 0.45, ease: 'power1.out' }, '>-0.05')

    const onResize = () => {
      gsap.set(root.querySelector('.bv-fit'), { scale: fitScale() })
      requestAnimationFrame(drawShaft)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      tl.kill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open])

  // exit choreography — runs when the store closes the stack
  useEffect(() => {
    if (open || !mounted || closingRef.current) return
    closingRef.current = true
    const root = rootRef.current
    const tilt = tiltRef.current
    if (!root || !tilt) {
      setMounted(false)
      return
    }
    const plates = Array.from(root.querySelectorAll<HTMLElement>('.bv-plate'))
    const activeIdx = FLOORS.findIndex((f) => f.id === useStore.getState().floorId)
    const tl = gsap.timeline({ onComplete: () => setMounted(false) })
    tl.to([root.querySelector('.bv-labels'), root.querySelector('.bv-head'), shaftRef.current], {
      autoAlpha: 0,
      duration: 0.18,
    })
      .to(tilt, { rotationX: 0, rotationZ: 0, duration: 0.85, ease: 'power3.inOut' }, 0)
      .to(plates, { z: 0, duration: 0.85, ease: 'power3.inOut' }, 0)
      .to(
        plates.filter((_, i) => i !== activeIdx),
        { autoAlpha: 0, duration: 0.4, ease: 'power1.in' },
        0.25,
      )
      .to(root, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, '>-0.15')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted])

  if (!mounted) return null

  const plural = (n: number) => (n === 1 ? 'patient' : 'patients')

  return (
    <div ref={rootRef} className="bv" role="dialog" aria-label="Building view — all floors">
      <div className="bv-head">
        <p className="bv-head__eyebrow">Axonometric · live census</p>
        <h2 className="bv-head__title">The building, floor by floor</h2>
      </div>

      <div className="bv-fit">
        <div className="bv-scene">
          <div ref={tiltRef} className="bv-tilt">
            {FLOORS.map((f) => {
              const agents = world.agents.filter((a) => a.floorId === f.id)
              return (
                <div
                  key={f.id}
                  className={`bv-plate${f.id === floorId ? ' is-active' : ''}`}
                  onClick={() => setFloor(f.id)}
                  onMouseEnter={(e) => {
                    const idx = FLOORS.findIndex((x) => x.id === f.id)
                    gsap.to(e.currentTarget, { z: plateZ(idx) + 26, duration: 0.35, ease: 'power2.out' })
                  }}
                  onMouseLeave={(e) => {
                    const idx = FLOORS.findIndex((x) => x.id === f.id)
                    gsap.to(e.currentTarget, { z: plateZ(idx), duration: 0.45, ease: 'power2.out' })
                  }}
                >
                  <PlateStatic floorId={f.id} agents={agents} billboard />
                  <span
                    className="bv-plate__liftmark"
                    style={{ left: `${LIFT_CX}%`, top: `${LIFT_CY}%` }}
                    aria-hidden="true"
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* the shaft, projected into screen space */}
      <svg ref={shaftRef} className="bv-shaft" aria-hidden="true">
        <polyline points="" />
        {FLOORS.map((f) => (
          <circle key={f.id} r={4} />
        ))}
      </svg>

      <ol className="bv-labels">
        {FLOORS.map((f, i) => {
          const st = world.status.perFloor[f.id]
          const active = f.id === floorId
          return (
            <li key={f.id}>
              <button
                type="button"
                className={`bv-label${active ? ' is-active' : ''}`}
                aria-label={`Go to floor ${f.short} — ${f.name}, ${st.count} ${plural(st.count)}`}
                onClick={() => setFloor(f.id)}
              >
                <span className="bv-label__idx tnum">{String(FLOORS.length - 1 - i).padStart(2, '0')}</span>
                <span className="bv-label__body">
                  <span className="bv-label__name">{floorById.get(f.id)?.name}</span>
                  <span className="bv-label__meta tnum">
                    Floor {f.short} · {st.count} inside
                    <span className={`bv-label__dot bv-label__dot--${st.worst}`} />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <p className="bv-hint">click a plate to land on it · Esc to return</p>
    </div>
  )
}
