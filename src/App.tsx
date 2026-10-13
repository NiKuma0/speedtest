import { useRef, useState } from 'react'
import { Gauge } from './components/Gauge'
import { formatBytes, formatSpeed } from './lib/format'
import { DEFAULT_SOURCE, measureDownload, measurePing } from './lib/speedtest'

type Phase = 'idle' | 'ping' | 'download' | 'done'

interface Results {
  ping?: number
  jitter?: number
  download?: number
  bytes?: number
}

const TEST_DURATION_MS = 10_000
const STREAMS = 4
const PING_COUNT = 20
const SOURCE_KEY = 'speedtest.source'

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [results, setResults] = useState<Results>({})
  const [liveSpeed, setLiveSpeed] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState(() => localStorage.getItem(SOURCE_KEY) ?? DEFAULT_SOURCE)
  const abortRef = useRef<AbortController | null>(null)

  async function start() {
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    setError(null)
    setResults({})
    setLiveSpeed(0)
    setProgress(0)

    try {
      setPhase('ping')
      const pingSamples: number[] = []
      const ping = await measurePing(source, PING_COUNT, signal, (ms, fraction) => {
        pingSamples.push(ms)
        setProgress(fraction)
        setResults({ ping: Math.min(...pingSamples) })
      })
      setResults({ ping: ping.ping, jitter: ping.jitter })

      setPhase('download')
      setProgress(0)
      const download = await measureDownload({
        url: source,
        durationMs: TEST_DURATION_MS,
        streams: STREAMS,
        signal,
        onProgress: ({ mbps, fraction }) => {
          setLiveSpeed(mbps)
          setProgress(fraction)
        },
      })
      setResults((r) => ({ ...r, download: download.mbps, bytes: download.bytes }))
      setPhase('done')
    } catch (e) {
      if (signal.aborted) {
        setPhase('idle')
        setResults({})
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('done')
      }
    } finally {
      setLiveSpeed(0)
      abortRef.current = null
    }
  }

  function changeSource(url: string | null) {
    if (url === null) localStorage.removeItem(SOURCE_KEY)
    else localStorage.setItem(SOURCE_KEY, url)
    setSource(url ?? DEFAULT_SOURCE)
  }

  const running = phase === 'ping' || phase === 'download'

  return (
    <div className="app">
      <header className="header">
        <span className="header__prompt">~/</span>speedtest
      </header>

      <main className="main">
        <section className="results">
          <Metric label="ping" unit="ms" value={results.ping?.toFixed(0)} active={phase === 'ping'} color="yellow" />
          <Metric label="jitter" unit="ms" value={results.jitter?.toFixed(1)} active={phase === 'ping'} color="orange" />
          <Metric
            label="download"
            unit="Mbps"
            value={phase === 'download' ? formatSpeed(liveSpeed) : results.download !== undefined ? formatSpeed(results.download) : undefined}
            active={phase === 'download'}
            color="aqua"
          />
        </section>

        <section className="stage">
          {phase === 'idle' && (
            <button className="start" onClick={start}>
              start
            </button>
          )}

          {running && (
            <div className="running">
              <Gauge mbps={liveSpeed} />
              <div className="progress">
                <div className={`progress__bar progress__bar--${phase}`} style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="phase-label">{phase === 'ping' ? 'measuring latency…' : 'downloading…'}</div>
              <button className="link-button" onClick={() => abortRef.current?.abort()}>
                cancel
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div className="done">
              {error ? (
                <div className="error">{error}</div>
              ) : (
                results.bytes !== undefined && (
                  <div className="summary">
                    downloaded {formatBytes(results.bytes)} in {TEST_DURATION_MS / 1000}s over {STREAMS} streams
                  </div>
                )
              )}
              <button className="start start--again" onClick={start}>
                run again
              </button>
            </div>
          )}
        </section>

        <SourceSettings source={source} disabled={running} onChange={changeSource} />
      </main>
    </div>
  )
}

interface MetricProps {
  label: string
  unit: string
  value?: string
  active: boolean
  color: 'yellow' | 'orange' | 'aqua'
}

function Metric({ label, unit, value, active, color }: MetricProps) {
  return (
    <div className={`metric metric--${color} ${active ? 'metric--active' : ''}`}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">
        {value ?? '—'}
        <span className="metric__unit">{unit}</span>
      </div>
    </div>
  )
}

interface SourceSettingsProps {
  source: string
  disabled: boolean
  onChange: (url: string | null) => void
}

function SourceSettings({ source, disabled, onChange }: SourceSettingsProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(source)
  const [invalid, setInvalid] = useState(false)
  const isDefault = source === DEFAULT_SOURCE

  function save(e: React.FormEvent) {
    e.preventDefault()
    const value = draft.trim()
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol')
    } catch {
      setInvalid(true)
      return
    }
    onChange(value === DEFAULT_SOURCE ? null : value)
    setEditing(false)
  }

  if (editing) {
    return (
      <form className="source source--editing" onSubmit={save}>
        <label className="source__label" htmlFor="source-url">
          test file url
        </label>
        <input
          id="source-url"
          className={`source__input ${invalid ? 'source__input--invalid' : ''}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setInvalid(false)
          }}
          placeholder="https://example.com/large-image.jpg"
          autoFocus
          spellCheck={false}
        />
        <p className="source__hint">
          Any large file (image, video, archive) works. The server must allow cross-origin requests (CORS). Bigger files give
          more accurate results.
        </p>
        <div className="source__actions">
          <button type="submit" className="btn btn--primary">
            save
          </button>
          <button type="button" className="btn" onClick={() => setDraft(DEFAULT_SOURCE)}>
            reset to default
          </button>
          <button type="button" className="btn" onClick={() => setEditing(false)}>
            cancel
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="source">
      <span className="source__label">source</span>
      <span className="source__url" title={source}>
        {source.replace(/^https?:\/\//, '')}
      </span>
      {isDefault && <span className="source__badge">default</span>}
      <button
        className="link-button"
        disabled={disabled}
        onClick={() => {
          setDraft(source)
          setInvalid(false)
          setEditing(true)
        }}
      >
        change
      </button>
    </div>
  )
}
