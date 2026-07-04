import { useLayoutEffect, useRef, useState } from 'react'
import './ui.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
}

/**
 * A segmented picker with radiogroup semantics: one tab stop, arrow keys move
 * the selection (the full keyboard contract the role implies — plain tablist
 * roles without roving focus read as broken to AT users).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  variant = 'pill',
}: {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  size?: 'md' | 'sm'
  /** 'pill' = rail with sliding ink thumb; 'underline' = folio tabs with a 2px ink rule. */
  variant?: 'pill' | 'underline'
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)

  // The active pill is a measured sliding thumb, so switching glides instead
  // of jumping. Re-measured on selection and on any container resize (fonts).
  useLayoutEffect(() => {
    const el = refs.current.get(value)
    const measure = () => {
      const btn = refs.current.get(value)
      if (btn) setThumb({ x: btn.offsetLeft, w: btn.offsetWidth })
    }
    measure()
    if (!el?.parentElement) return
    const ro = new ResizeObserver(measure)
    ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [value, options])

  const move = (from: T, delta: number) => {
    const i = options.findIndex((o) => o.id === from)
    const next = options[(i + delta + options.length) % options.length]
    onChange(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div
      className={`segmented segmented--${size} segmented--${variant}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {thumb ? (
        <span
          className="segmented__thumb"
          aria-hidden="true"
          style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
        />
      ) : null}
      {options.map((o) => (
        <button
          key={o.id}
          ref={(el) => {
            if (el) refs.current.set(o.id, el)
            else refs.current.delete(o.id)
          }}
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className={`segmented__btn${o.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              e.stopPropagation()
              move(o.id, 1)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              e.stopPropagation()
              move(o.id, -1)
            }
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
