import { formatSpeed } from '../lib/format'
import type { HistoryEntry } from '../lib/history'

interface HistoryProps {
  entries: HistoryEntry[]
  onDelete: (date: number) => void
  onClear: () => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })

export function History({ entries, onDelete, onClear }: HistoryProps) {
  if (!entries.length) return null

  const best = Math.max(...entries.map((e) => e.download))

  return (
    <section className="history">
      <div className="history__header">
        <h2 className="history__title">history</h2>
        <button
          className="link-button"
          onClick={() => {
            if (confirm('Clear all saved results?')) onClear()
          }}
        >
          clear
        </button>
      </div>
      <div className="history__scroll">
        <table className="history__table">
          <thead>
            <tr>
              <th>date</th>
              <th className="num">ping, ms</th>
              <th className="num">jitter, ms</th>
              <th className="num">download, Mbps</th>
              <th>source</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.date}>
                <td className="history__date">{dateFormat.format(e.date)}</td>
                <td className="num history__ping">{e.ping.toFixed(0)}</td>
                <td className="num history__jitter">{e.jitter.toFixed(1)}</td>
                <td className="num history__download">
                  {formatSpeed(e.download)}
                  {e.download === best && entries.length > 1 && <span className="history__best"> ★</span>}
                </td>
                <td className="history__source" title={e.source}>
                  <span>{new URL(e.source).host}</span>
                </td>
                <td>
                  <button className="history__delete" onClick={() => onDelete(e.date)} aria-label="Delete result" title="Delete">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
