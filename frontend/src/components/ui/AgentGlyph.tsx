import type { Risk, Sex } from '../../types'
import './ui.css'

const SEX_VAR: Record<Sex | 'unknown', string> = {
  male: 'var(--sex-m)',
  female: 'var(--sex-f)',
  unknown: 'var(--sex-u)',
}

/* the letter is the mandated non-color cue — its ink is chosen per fill
   (and per theme, via tokens) so it always clears contrast on the token */
const SEX_INK: Record<Sex | 'unknown', string> = {
  male: 'var(--sex-m-ink)',
  female: 'var(--sex-f-ink)',
  unknown: 'var(--sex-u-ink)',
}

const SEX_LETTER: Record<Sex | 'unknown', string> = { male: 'M', female: 'F', unknown: '–' }

const RISK_VAR: Record<Risk, string> = {
  on_track: 'var(--ok)',
  elevated: 'var(--warn)',
  high: 'var(--crit)',
}

export interface AgentGlyphProps {
  sex: Sex | 'unknown'
  risk: Risk
  /** outer size in px (SVG scales inside) */
  size?: number
  /** large = sheet header (sparkle mark + letter badge); map = letter token */
  variant?: 'map' | 'large'
  /** subtle pulse — only while blocked */
  pulse?: boolean
  title?: string
}

/**
 * The agent token: a soft rounded-square bot glyph, deliberately not a human.
 * Fill encodes sex (always paired with the letter so color is never the only
 * cue); the thin outer ring encodes delay risk.
 */
export function AgentGlyph({ sex, risk, size = 16, variant = 'map', pulse = false, title }: AgentGlyphProps) {
  const fill = SEX_VAR[sex]
  const ring = RISK_VAR[risk]
  const cls = `agent-glyph${pulse ? ' agent-glyph--pulse' : ''}`

  if (variant === 'large') {
    return (
      <svg className={cls} width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
        {title ? <title>{title}</title> : null}
        <rect x="5" y="5" width="38" height="38" rx="12" fill={fill} />
        <rect
          x="2"
          y="2"
          width="44"
          height="44"
          rx="15"
          fill="none"
          stroke={ring}
          strokeWidth="2.5"
          className="agent-glyph__ring"
        />
        {/* the agent mark — a friendly four-point sparkle */}
        <path
          d="M24 12l2.6 7.4L34 22l-7.4 2.6L24 32l-2.6-7.4L14 22l7.4-2.6z"
          fill="rgba(255,255,255,0.95)"
        />
        <circle cx="37" cy="37" r="8.5" fill="var(--surface)" />
        <text x="37" y="40.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-2)">
          {SEX_LETTER[sex]}
        </text>
      </svg>
    )
  }

  // map variant: a little person (head + shoulders) — the floor reads as
  // people, while the sheet header keeps the agent's sparkle mark
  return (
    <svg className={cls} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      {title ? <title>{title}</title> : null}
      <circle
        cx="12"
        cy="12.5"
        r="10.4"
        fill="none"
        stroke={ring}
        strokeWidth="1.9"
        className="agent-glyph__ring"
      />
      <circle cx="12" cy="7.6" r="3.5" fill={fill} />
      <path d="M5.6 20.4v-1.2a6.4 6.4 0 0 1 12.8 0v1.2z" fill={fill} />
      <text
        x="12"
        y="19"
        textAnchor="middle"
        fontSize="6.4"
        fontWeight="700"
        fill={SEX_INK[sex]}
      >
        {SEX_LETTER[sex]}
      </text>
    </svg>
  )
}
