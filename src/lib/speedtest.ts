/** Default source: random-bytes file generated at build time and served from the same origin. */
export const DEFAULT_SOURCE = new URL(`${import.meta.env.BASE_URL}testfile.bin`, location.href).href

export interface Progress {
  /** Current speed in Mbps */
  mbps: number
  /** 0..1 progress of the current phase */
  fraction: number
}

export interface PingResult {
  ping: number
  jitter: number
  samples: number[]
}

export interface DownloadResult {
  mbps: number
  bytes: number
}

/** Appends a random query param so the browser never serves the file from its own cache. */
function bust(url: string): string {
  const u = new URL(url, location.href)
  u.searchParams.set('_r', Math.random().toString(36).slice(2))
  return u.href
}

/** Turns the browser's opaque "Failed to fetch" into something actionable. */
async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(bust(url), { ...init, cache: 'no-store' })
  } catch (e) {
    if (init.signal?.aborted) throw e
    throw new Error(
      `Could not load ${new URL(url, location.href).host}. The server must be reachable and allow CORS (Access-Control-Allow-Origin).`,
      { cause: e },
    )
  }
  if (!res.ok) throw new Error(`Source responded with HTTP ${res.status}`)
  return res
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * HTTP round-trip time: time until response headers of a HEAD request.
 * Falls back to GET (body is discarded unread) if the server rejects HEAD.
 */
export async function measurePing(
  url: string,
  count: number,
  signal: AbortSignal,
  onSample?: (ms: number, fraction: number) => void,
): Promise<PingResult> {
  let method = 'HEAD'
  const samples: number[] = []
  for (let i = 0; i <= count; i++) {
    const start = performance.now()
    let res: Response
    try {
      res = await request(url, { method, signal })
    } catch (e) {
      if (method === 'GET' || signal.aborted) throw e
      method = 'GET'
      i--
      continue
    }
    const rtt = performance.now() - start
    res.body?.cancel()
    // The first request includes DNS + TCP + TLS handshakes, skip it
    if (i > 0) {
      samples.push(rtt)
      onSample?.(rtt, i / count)
    }
  }
  const diffs = samples.slice(1).map((v, i) => Math.abs(v - samples[i]))
  return {
    ping: median(samples),
    jitter: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0,
    samples,
  }
}

/**
 * Tracks transferred bytes over time and computes both the live speed
 * (sliding window) and the final speed (excluding TCP slow-start warmup).
 */
class Meter {
  private samples: { t: number; bytes: number }[] = []
  bytes = 0
  private readonly start = performance.now()
  private readonly warmupMs: number
  private readonly windowMs: number

  constructor(warmupMs: number, windowMs = 1500) {
    this.warmupMs = warmupMs
    this.windowMs = windowMs
    this.samples.push({ t: this.start, bytes: 0 })
  }

  add(bytes: number) {
    this.bytes += bytes
  }

  tick(): number {
    const now = performance.now()
    this.samples.push({ t: now, bytes: this.bytes })
    const from = this.samples.find((s) => s.t >= now - this.windowMs) ?? this.samples[0]
    return toMbps(this.bytes - from.bytes, now - from.t)
  }

  get elapsed() {
    return performance.now() - this.start
  }

  result(): number {
    const last = this.samples[this.samples.length - 1]
    const from = this.samples.find((s) => s.t - this.start >= this.warmupMs) ?? this.samples[0]
    if (last.t - from.t < 500) return toMbps(last.bytes, last.t - this.start)
    return toMbps(last.bytes - from.bytes, last.t - from.t)
  }
}

function toMbps(bytes: number, ms: number): number {
  return ms > 0 ? (bytes * 8) / (ms / 1000) / 1e6 : 0
}

interface DownloadOptions {
  url: string
  durationMs: number
  streams: number
  signal: AbortSignal
  onProgress: (p: Progress) => void
}

/** Downloads `url` over and over in N parallel streams for a fixed duration. */
export async function measureDownload({ url, durationMs, streams, signal, onProgress }: DownloadOptions): Promise<DownloadResult> {
  const meter = new Meter(Math.min(2000, durationMs / 4))
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort)

  const timer = setInterval(() => {
    const fraction = Math.min(meter.elapsed / durationMs, 1)
    onProgress({ mbps: meter.tick(), fraction })
    if (fraction >= 1) controller.abort()
  }, 100)

  const loop = async () => {
    while (!controller.signal.aborted) {
      try {
        const res = await request(url, { signal: controller.signal })
        if (!res.body) {
          meter.add((await res.arrayBuffer()).byteLength)
          continue
        }
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          meter.add(value.byteLength)
        }
      } catch (e) {
        if (controller.signal.aborted) return
        controller.abort()
        throw e
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: streams }, loop))
  } finally {
    clearInterval(timer)
    signal.removeEventListener('abort', abort)
  }
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  meter.tick()
  return { mbps: meter.result(), bytes: meter.bytes }
}
