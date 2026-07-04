import { useRef } from 'react'
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
}: {
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  size?: 'md' | 'sm'
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>())

  const move = (from: T, delta: number) => {
    const i = options.findIndex((o) => o.id === from)
    const next = options[(i + delta + options.length) % options.length]
    onChange(next.id)
    refs.current.get(next.id)?.focus()
  }

  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel}>
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
