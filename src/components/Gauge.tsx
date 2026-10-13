import { formatSpeed } from '../lib/format'

const TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000]
const SWEEP = 270
const START = -135
const SIZE = 340
const C = SIZE / 2
const R = 140
const ARC_LEN = (R * SWEEP * Math.PI) / 180

/** Non-linear scale: every tick interval takes an equal share of the arc. */
function toFraction(mbps: number): number {
  if (mbps <= 0) return 0
  const segment = 1 / (TICKS.length - 1)
  for (let i = 1; i < TICKS.length; i++) {
    if (mbps <= TICKS[i]) {
      const local = (mbps - TICKS[i - 1]) / (TICKS[i] - TICKS[i - 1])
      return (i - 1 + local) * segment
    }
  }
  return 1
}

function point(angleDeg: number, radius: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: C + radius * Math.sin(a), y: C - radius * Math.cos(a) }
}

const arcStart = point(START, R)
const arcEnd = point(START + SWEEP, R)
const ARC_PATH = `M ${arcStart.x} ${arcStart.y} A ${R} ${R} 0 1 1 ${arcEnd.x} ${arcEnd.y}`

interface GaugeProps {
  mbps: number
  mode: 'download' | 'upload'
}

export function Gauge({ mbps, mode }: GaugeProps) {
  const fraction = toFraction(mbps)
  const angle = START + SWEEP * fraction

  return (
    <div className={`gauge gauge--${mode}`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <defs>
          <linearGradient id="grad-download" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#1fd1f9" />
            <stop offset="100%" stopColor="#6afff3" />
          </linearGradient>
          <linearGradient id="grad-upload" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#b621fe" />
            <stop offset="100%" stopColor="#e57cff" />
          </linearGradient>
          <linearGradient id="needle-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.85)" />
          </linearGradient>
        </defs>

        <path d={ARC_PATH} className="gauge__track" />
        <path
          d={ARC_PATH}
          className="gauge__value"
          stroke={`url(#grad-${mode})`}
          strokeDasharray={ARC_LEN}
          strokeDashoffset={ARC_LEN * (1 - fraction)}
        />

        {TICKS.map((tick, i) => {
          const p = point(START + (SWEEP * i) / (TICKS.length - 1), R - 38)
          return (
            <text
              key={tick}
              x={p.x}
              y={p.y}
              className={`gauge__tick ${mbps >= tick && mbps > 0 ? 'gauge__tick--passed' : ''}`}
            >
              {tick}
            </text>
          )
        })}

        <g className="gauge__needle" style={{ transform: `rotate(${angle}deg)` }}>
          <polygon points={`${C - 5},${C - 22} ${C + 5},${C - 22} ${C + 1},${C - R + 30} ${C - 1},${C - R + 30}`} fill="url(#needle-grad)" />
        </g>
        <circle cx={C} cy={C} r={22} className="gauge__hub" />
      </svg>

      <div className="gauge__readout">
        <span className="gauge__number">{formatSpeed(mbps)}</span>
        <span className="gauge__unit">
          <Arrow mode={mode} /> Mbps
        </span>
      </div>
    </div>
  )
}

export function Arrow({ mode }: { mode: 'download' | 'upload' }) {
  return (
    <svg className={`arrow arrow--${mode}`} viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d={mode === 'download' ? 'M8 4v7M5 8l3 3 3-3' : 'M8 12V5M5 8l3-3 3 3'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
