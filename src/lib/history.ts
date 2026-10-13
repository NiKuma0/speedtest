export interface HistoryEntry {
  /** Unix timestamp (ms) of the test */
  date: number
  ping: number
  jitter: number
  download: number
  bytes: number
  source: string
}

const KEY = 'speedtest.history'
const MAX_ENTRIES = 50

export function loadHistory(): HistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Saves the history (newest first), keeping only the last MAX_ENTRIES results. */
export function saveHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const trimmed = entries.slice(0, MAX_ENTRIES)
  if (trimmed.length) localStorage.setItem(KEY, JSON.stringify(trimmed))
  else localStorage.removeItem(KEY)
  return trimmed
}
