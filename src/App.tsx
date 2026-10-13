import { useEffect, useRef, useState } from 'react'
import { Arrow, Gauge } from './components/Gauge'
import { COLOS } from './lib/colos'
import { formatSpeed } from './lib/format'
import { fetchConnectionInfo, type ConnectionInfo } from './lib/connection'
import { measureDownload, measurePing, measureUpload } from './lib/speedtest'

type Phase = 'idle' | 'ping' | 'download' | 'upload' | 'done'

interface Results {
  ping?: number
  jitter?: number
  download?: number
  upload?: number
}

const TEST_DURATION_MS = 10_000
const STREAMS = 4
const PING_COUNT = 20

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [results, setResults] = useState<Results>({})
  const [liveSpeed, setLiveSpeed] = useState(0)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [conn, setConn] = useState<ConnectionInfo | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetchConnectionInfo().then(setConn)
  }, [])

  async function start() {
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    setError(null)
    setResults({})
    setLiveSpeed(0)

    try {
      setPhase('ping')
      const pingSamples: number[] = []
      const ping = await measurePing(PING_COUNT, signal, (ms, fraction) => {
        pingSamples.push(ms)
        setProgress(fraction)
        setResults({ ping: Math.min(...pingSamples) })
      })
      setResults({ ping: ping.ping, jitter: ping.jitter })

      setPhase('download')
      const download = await measureDownload({
        durationMs: TEST_DURATION_MS,
        streams: STREAMS,
        signal,
        onProgress: ({ mbps, fraction }) => {
          setLiveSpeed(mbps)
          setProgress(fraction)
        },
      })
      setResults((r) => ({ ...r, download }))
      setLiveSpeed(0)

      setPhase('upload')
      const upload = await measureUpload({
        durationMs: TEST_DURATION_MS,
        streams: STREAMS,
        signal,
        onProgress: ({ mbps, fraction }) => {
          setLiveSpeed(mbps)
          setProgress(fraction)
        },
      })
      setResults((r) => ({ ...r, upload }))
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

  function cancel() {
    abortRef.current?.abort()
  }

  const running = phase === 'ping' || phase === 'download' || phase === 'upload'
  const gaugeMode = phase === 'upload' ? 'upload' : 'download'

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <path d="M12 3a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 3z" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 14l4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          SPEEDTEST
        </div>
      </header>

      <main className="main">
        <section className={`results ${phase === 'idle' ? 'results--hidden' : ''}`}>
          <Metric
            label="PING"
            unit="ms"
            value={results.ping}
            format={(v) => v.toFixed(0)}
            active={phase === 'ping'}
            extra={results.jitter !== undefined ? `jitter ${results.jitter.toFixed(1)} ms` : undefined}
            icon={<PingIcon />}
          />
          <Metric
            label="DOWNLOAD"
            unit="Mbps"
            value={phase === 'download' ? liveSpeed : results.download}
            format={formatSpeed}
            active={phase === 'download'}
            icon={<Arrow mode="download" />}
          />
          <Metric
            label="UPLOAD"
            unit="Mbps"
            value={phase === 'upload' ? liveSpeed : results.upload}
            format={formatSpeed}
            active={phase === 'upload'}
            icon={<Arrow mode="upload" />}
          />
        </section>

        <section className="stage">
          {phase === 'idle' && (
            <button className="go" onClick={start} aria-label="Start speed test">
              <span className="go__ring" />
              <span className="go__label">GO</span>
            </button>
          )}

          {running && (
            <div className="running">
              <Gauge mbps={liveSpeed} mode={gaugeMode} />
              <div className="progress">
                <div className={`progress__bar progress__bar--${gaugeMode}`} style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="phase-label">
                {phase === 'ping' ? 'Measuring latency…' : phase === 'download' ? 'Testing download…' : 'Testing upload…'}
              </div>
              <button className="link-button" onClick={cancel}>
                Cancel
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div className="done">
              {error && <div className="error">Test failed: {error}</div>}
              <button className="again" onClick={start}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                  <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                TEST AGAIN
              </button>
            </div>
          )}
        </section>

        <section className="connection">
          <InfoItem
            icon={<UserIcon />}
            title={conn?.isp ?? (conn ? 'Unknown provider' : 'Detecting…')}
            lines={[
              conn?.ip,
              [conn?.city, conn?.country].filter(Boolean).join(', ') || undefined,
              conn?.asn ? `AS${conn.asn}` : undefined,
            ]}
          />
          <InfoItem
            icon={<GlobeIcon />}
            title="Cloudflare"
            lines={[
              conn?.colo ? `${COLOS[conn.colo] ?? conn.colo} (${conn.colo})` : conn ? 'Unknown location' : 'Detecting…',
              [conn?.http?.toUpperCase(), conn?.tls].filter(Boolean).join(' · ') || undefined,
              conn?.linkType ? `Connection: ${conn.linkType}` : undefined,
            ]}
          />
        </section>
      </main>

      <footer className="footer">
        Measured against <a href="https://speed.cloudflare.com" target="_blank" rel="noreferrer">speed.cloudflare.com</a> · {STREAMS} parallel
        streams · {TEST_DURATION_MS / 1000}s per test
      </footer>
    </div>
  )
}

interface MetricProps {
  label: string
  unit: string
  value?: number
  format: (v: number) => string
  active: boolean
  extra?: string
  icon: React.ReactNode
}

function Metric({ label, unit, value, format, active, extra, icon }: MetricProps) {
  return (
    <div className={`metric ${active ? 'metric--active' : ''}`}>
      <div className="metric__label">
        {icon}
        {label}
        <span className="metric__unit">{unit}</span>
      </div>
      <div className="metric__value">{value !== undefined ? format(value) : '—'}</div>
      <div className="metric__extra">{extra ?? ' '}</div>
    </div>
  )
}

function InfoItem({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: (string | undefined)[] }) {
  return (
    <div className="info">
      <div className="info__icon">{icon}</div>
      <div>
        <div className="info__title">{title}</div>
        {lines.filter(Boolean).map((line) => (
          <div key={line} className="info__line">
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}

function PingIcon() {
  return (
    <svg className="arrow arrow--ping" viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8h2l1-2.5L9 11l1-3h2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
