/* The one-picture architecture — real data in, a deterministic twin in the
   middle, and the key-gated live plane on the right, every model named.
   Pure SVG in the folio language; scales with the About card. */

import './chrome.css'

function Box({
  x,
  y,
  w,
  h,
  title,
  lines,
  live,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  lines: string[]
  live?: boolean
}) {
  return (
    <g>
      <rect className={`adg-box${live ? ' adg-box--live' : ''}`} x={x} y={y} width={w} height={h} rx={7} />
      <text className="adg-boxtitle" x={x + 10} y={y + 17}>
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} className="adg-sub" x={x + 10} y={y + 31 + i * 11}>
          {l}
        </text>
      ))}
    </g>
  )
}

function Arrow({ d }: { d: string }) {
  return <path className="adg-arrow" d={d} markerEnd="url(#adg-head)" />
}

export function ArchDiagram() {
  return (
    <svg
      className="adg"
      viewBox="0 0 720 470"
      role="img"
      aria-label="FlowTwin architecture: real data feeds a deterministic twin in the browser; with keys configured, a live plane adds Gemini patient-agent chains, the Antigravity Ops Chief, and a Nemotron wait forecast through a server-side-key proxy."
    >
      <defs>
        <marker id="adg-head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0.5 L7.5,4 L0,7.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </marker>
      </defs>

      {/* ---------------- column titles ---------------- */}
      <text className="adg-col" x={14} y={20}>
        DATA — THE REAL WORLD
      </text>
      <text className="adg-col" x={252} y={20}>
        THE TWIN — IN THE BROWSER
      </text>
      <text className="adg-col adg-col--live" x={514} y={20}>
        LIVE PLANE — WITH KEYS ONLY
      </text>

      {/* ---------------- data column ---------------- */}
      <Box
        x={14}
        y={32}
        w={196}
        h={56}
        title="HA live feed"
        lines={['real A&E waits · 18 sites', 'p50/p95 · every 15 min · 7-day archive']}
      />
      <Box
        x={14}
        y={100}
        w={196}
        h={56}
        title="MIMIC-IV-ED"
        lines={['real de-identified ED stays', 'LOS tails · acuity · arrival shape']}
      />
      <Box x={14} y={168} w={196} h={44} title="Synthea registry" lines={['names, sex, age — identity only']} />

      <Arrow d="M112,88 L112,98" />
      <Arrow d="M112,156 L112,166" />
      <Arrow d="M112,212 L112,228" />

      <Box
        x={14}
        y={230}
        w={196}
        h={96}
        title="Pipeline · python, seed 42"
        lines={[
          'fetch_hk.py — feed + archive',
          'build_mimic_stats.py — distributions',
          'build_seed.py — synthetic personas,',
          'waits drawn from the real p50/p95',
        ]}
      />
      <text className="adg-note" x={14} y={344}>
        deterministic · committed as seed/*.json
      </text>

      <Arrow d="M210,278 C234,278 234,84 248,84" />

      {/* ---------------- twin column ---------------- */}
      <Box
        x={252}
        y={32}
        w={224}
        h={104}
        title="Deterministic engine"
        lines={[
          'worldAt(t, resolvedAt, optimizedAt)',
          'a pure function — scrub anywhere,',
          'perfectly reversible, never desyncs',
          'ETA: MIMIC LOS quantiles + ladder',
        ]}
      />
      <Box
        x={252}
        y={152}
        w={224}
        h={86}
        title="The action board"
        lines={[
          'one move per journey (194 of 322)',
          'minutes ≤ half its queue step,',
          'capped 10–45 per blocker — stated',
        ]}
      />
      <Box
        x={252}
        y={254}
        w={224}
        h={90}
        title="Surfaces"
        lines={['floor map · patient sheets', 'administrator view · time scrubber', 'day review — goal → result']}
      />

      <Arrow d="M364,136 L364,150" />
      <Arrow d="M364,238 L364,252" />

      {/* ---------------- live plane ---------------- */}
      <rect className="adg-fence" x={506} y={28} width={206} height={380} rx={9} />

      <Box
        x={514}
        y={40}
        w={190}
        h={52}
        title="/api proxy"
        lines={['keys server-side only', 'vite dev · nginx template']}
        live
      />
      <Box
        x={514}
        y={112}
        w={190}
        h={90}
        title="Gemini 3.5 Flash"
        lines={['Interactions API — one stateful', 'chain per patient; demo beats', 'append via previous_interaction_id', '→ exit · blocker · next move']}
        live
      />
      <Box
        x={514}
        y={222}
        w={190}
        h={78}
        title="Antigravity (05-2026)"
        lines={['the Ops Chief — census CSV in,', 'real pandas in a persistent', 'sandbox, insight out']}
        live
      />
      <Box
        x={514}
        y={320}
        w={190}
        h={76}
        title="Nemotron 3 Nano 30B"
        lines={['zero-shot forecast of the next', '12 h of the real wait curve', 'p10 / p50 / p90 · admin view']}
        live
      />

      <Arrow d="M476,299 C496,299 496,66 512,66" />
      <Arrow d="M609,92 L609,110" />
      <Arrow d="M609,202 L609,220" />
      <Arrow d="M609,300 L609,318" />

      {/* ---------------- footnotes ---------------- */}
      <text className="adg-note" x={252} y={370}>
        no keys → the twin runs alone, fully
      </text>
      <text className="adg-note" x={252} y={382}>
        deterministic; live results layer on top
      </text>
      <text className="adg-note" x={14} y={434}>
        On paper (PLAN.md), not in this build: PersonaPlex patient voice · Nemotron department fleet · Computer Use → legacy EHR · Live Translate intake
      </text>
      <text className="adg-note" x={14} y={450}>
        Sovereignty: frontier cloud sees de-identified operational metadata only — and here even that layer is built from public + open data.
      </text>
    </svg>
  )
}
