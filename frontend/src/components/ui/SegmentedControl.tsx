import './ui.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
}

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
  return (
    <div className={`segmented segmented--${size}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          className={`segmented__btn${o.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
