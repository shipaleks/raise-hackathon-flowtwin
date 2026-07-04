/* Presenter demo cluster — the four scripted beats as ordered steps.
   Inline group when the window is wide enough; otherwise a compact
   'Demo' button with an upward popover. Styles live in scrubber.css. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import { HERO_ID } from '../../data/seed'
import { BEAT_MIN } from '../../sim/engine'
import { useStore } from '../../store'

const CAPTION = 'Presenter shortcuts — the same beats are pinned on the timeline.'

const INLINE_MQ = '(min-width: 1280px)'

/** True when the demo steps fit inline next to the presets. */
function useInline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(INLINE_MQ)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(INLINE_MQ).matches,
  )
}

const CheckIcon = (
  <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
    <path
      d="M1.5 5.4 4 7.9 8.5 2.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

interface StepDef {
  id: string
  label: string
  done: boolean
  go: () => void
}

export function DemoControls() {
  const simMin = useStore((s) => s.simMin)
  const resolvedAtMin = useStore((s) => s.resolvedAtMin)
  const wrapOpen = useStore((s) => s.wrapOpen)
  const jumpToBeat = useStore((s) => s.jumpToBeat)
  const select = useStore((s) => s.select)
  const resolveNow = useStore((s) => s.resolveNow)
  const setSimMin = useStore((s) => s.setSimMin)
  const setWrapOpen = useStore((s) => s.setWrapOpen)

  const inline = useInline()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  const steps: StepDef[] = [
    {
      id: 'meet',
      label: 'Meet Sarah',
      done: simMin > BEAT_MIN.meet,
      go: () => {
        jumpToBeat('meet')
        select(HERO_ID)
      },
    },
    {
      id: 'labDelay',
      label: 'Lab delay',
      done: simMin > BEAT_MIN.labDelay,
      go: () => jumpToBeat('labDelay'),
    },
    {
      id: 'overload',
      label: 'Cardiology overload',
      done: simMin > BEAT_MIN.overload,
      go: () => jumpToBeat('overload'),
    },
    {
      id: 'resolve',
      label: 'Resolve',
      done: resolvedAtMin != null,
      go: () => {
        jumpToBeat('resolveSuggested')
        resolveNow()
      },
    },
    {
      id: 'wrap',
      label: 'Day review',
      done: wrapOpen,
      go: () => {
        select(null)
        setSimMin(6.5 * 60) // 17:30 — past the real afternoon peak
        setWrapOpen(true)
      },
    },
  ]
  const currentIdx = steps.findIndex((s) => !s.done)

  // popover: close on outside pointerdown
  useEffect(() => {
    if (!open || inline) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, inline])

  // popover: move focus in on open
  useEffect(() => {
    if (open && !inline) popRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open, inline])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
      toggleRef.current?.focus()
    }
  }

  const stepButton = (s: StepDef, i: number, variant: 'pop' | 'inline') => {
    const state = s.done ? 'done' : i === currentIdx ? 'current' : 'upcoming'
    const cls = variant === 'pop' ? 'scrub-demo__step' : 'scrub-demo-inline__step'
    const suffix = s.done ? ' — done' : state === 'current' ? ' — up next' : ''
    return (
      <button
        key={s.id}
        type="button"
        className={`${cls} is-${state}`}
        aria-current={state === 'current' ? 'step' : undefined}
        aria-label={`Demo step ${i + 1} of ${steps.length}: ${s.label}${suffix}`}
        onClick={s.go}
      >
        <span className="scrub-demo__num tnum" aria-hidden="true">
          {s.done ? CheckIcon : i + 1}
        </span>
        <span>{s.label}</span>
      </button>
    )
  }

  if (inline) {
    return (
      <div className="scrub-demo-inline" role="group" aria-label="Presenter demo steps" title={CAPTION}>
        <span className="scrub-demo-inline__label" aria-hidden="true">
          Demo
        </span>
        {steps.map((s, i) => stepButton(s, i, 'inline'))}
        <span className="visually-hidden">{CAPTION}</span>
      </div>
    )
  }

  return (
    <div className="scrub-demo" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={toggleRef}
        className={`scrub-demo__toggle${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Demo — presenter shortcuts"
        onClick={() => setOpen(!open)}
      >
        Demo
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M1.5 6.5 5 3l3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="scrub-demo__pop" ref={popRef} role="group" aria-label="Presenter demo steps">
          <ol className="scrub-demo__steps">
            {steps.map((s, i) => (
              <li key={s.id}>{stepButton(s, i, 'pop')}</li>
            ))}
          </ol>
          <p className="scrub-demo__caption">{CAPTION}</p>
        </div>
      )}
    </div>
  )
}
