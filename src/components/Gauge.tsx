import { formatSpeed } from '../lib/format'

const TICKS = [0, 5, 10, 50, 100, 250, 500, 750, 1000]
const SWEEP = 240
const START = -120
const SIZE = 320
const C = SIZE / 2
const R = 128
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

export function Gauge({ mbps }: { mbps: number }) {
  const fraction = toFraction(mbps)
  const marker = point(START + SWEEP * fraction, R)

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${SIZE} ${SIZE * 0.86}`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--aqua)" />
            <stop offset="100%" stopColor="var(--green)" />
          </linearGradient>
        </defs>

        <path d={ARC_PATH} className="gauge__track" />
        {fraction > 0 && (
          <path
            d={ARC_PATH}
            className="gauge__value"
            strokeDasharray={ARC_LEN}
            strokeDashoffset={ARC_LEN * (1 - fraction)}
          />
        )}
        <circle cx={marker.x} cy={marker.y} r={9} className="gauge__marker" />

        {TICKS.map((tick, i) => {
          const p = point(START + (SWEEP * i) / (TICKS.length - 1), R - 34)
          return (
            <text key={tick} x={p.x} y={p.y} className={`gauge__tick ${mbps >= tick && mbps > 0 ? 'gauge__tick--passed' : ''}`}>
              {tick}
            </text>
          )
        })}

        <text x={C} y={C + 6} className="gauge__number">
          {formatSpeed(mbps)}
        </text>
        <text x={C} y={C + 38} className="gauge__unit">
          Mbps
        </text>
      </svg>
    </div>
  )
}
