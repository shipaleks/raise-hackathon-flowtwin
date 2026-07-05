import type { ReactNode } from 'react'
import './ui.css'

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit' | 'ghost'

export function Chip({
  tone = 'neutral',
  children,
  title,
  className,
}: {
  tone?: ChipTone
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span className={`chip chip--${tone}${className ? ` ${className}` : ''}`} title={title}>
      {children}
    </span>
  )
}

/** The safety badge: every recommendation is scoped to operations by policy. */
export function OpsOnlyBadge() {
  return (
    <span
      className="chip chip--guard"
      title="Operational logistics only — never diagnosis, treatment, or medication advice."
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1.5 5.2 4 7.7 8.5 2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Ops-only
    </span>
  )
}
