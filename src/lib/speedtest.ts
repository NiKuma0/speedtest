const BASE = 'https://speed.cloudflare.com'

export interface Progress {
  /** Current speed in Mbps (download/upload) */
  mbps: number
  /** 0..1 progress of the current phase */
  fraction: number
}

export interface PingResult {
  ping: number
  jitter: number
  samples: number[]
}

/** Server processing time reported by Cloudflare, so it can be subtracted from RTT. */
function serverTime(res: Response): number {
  const header = res.headers.get('server-timing') ?? ''
  const match = /cfSpeedWorker;dur=([\d.]+)/.exec(header) ?? /dur=([\d.]+)/.exec(header)
  return match ? parseFloat(match[1]) : 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function measurePing(
  count: number,
  signal: AbortSignal,
  onSample?: (ms: number, fraction: number) => void,
): Promise<PingResult> {
  const samples: number[] = []
  for (let i = 0; i < count; i++) {
    const start = performance.now()
    const res = await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { signal, cache: 'no-store' })
    await res.arrayBuffer()
    const rtt = Math.max(performance.now() - start - serverTime(res), 0.1)
    // The first request includes DNS + TCP + TLS handshakes, skip it
    if (i > 0) {
      samples.push(rtt)
      onSample?.(rtt, (i + 1) / count)
    }
  }
  const jitterDiffs = samples.slice(1).map((v, i) => Math.abs(v - samples[i]))
  return {
    ping: median(samples),
    jitter: jitterDiffs.length ? jitterDiffs.reduce((a, b) => a + b, 0) / jitterDiffs.length : 0,
    samples,
  }
}

/**
 * Tracks transferred bytes over time and computes both the live speed
 * (sliding window) and the final speed (excluding TCP slow-start warmup).
 */
class Meter {
  private samples: { t: number; bytes: number }[] = []
  private bytes = 0
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

interface TransferOptions {
  durationMs: number
  streams: number
  signal: AbortSignal
  onProgress: (p: Progress) => void
}

/** Runs `worker` in N parallel loops for a fixed duration, reporting the speed periodically. */
async function runTimed(
  { durationMs, streams, signal, onProgress }: TransferOptions,
  worker: (meter: Meter, signal: AbortSignal) => Promise<void>,
): Promise<number> {
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
        await worker(meter, controller.signal)
      } catch (e) {
        if (controller.signal.aborted) return
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
  return meter.result()
}

const DOWNLOAD_CHUNK = 25 * 1024 * 1024

export function measureDownload(opts: TransferOptions): Promise<number> {
  return runTimed(opts, async (meter, signal) => {
    const res = await fetch(`${BASE}/__down?bytes=${DOWNLOAD_CHUNK}&r=${Math.random()}`, {
      signal,
      cache: 'no-store',
    })
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`)
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      meter.add(value.byteLength)
    }
  })
}

const UPLOAD_CHUNK = 8 * 1024 * 1024
let uploadPayload: Blob | null = null

/** Random (incompressible) payload, built once from a repeated 64 KiB random block. */
function getUploadPayload(): Blob {
  if (!uploadPayload) {
    const block = crypto.getRandomValues(new Uint8Array(65536))
    uploadPayload = new Blob(Array.from({ length: UPLOAD_CHUNK / block.length }, () => block))
  }
  return uploadPayload
}

export function measureUpload(opts: TransferOptions): Promise<number> {
  const payload = getUploadPayload()
  // fetch() can't report upload progress, so XHR is used here
  return runTimed(opts, (meter, signal) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      let sent = 0
      xhr.upload.onprogress = (e) => {
        meter.add(e.loaded - sent)
        sent = e.loaded
      }
      xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: HTTP ${xhr.status}`)))
      xhr.onerror = () => reject(new Error('Upload failed: network error'))
      xhr.onabort = () => resolve()
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
      xhr.open('POST', `${BASE}/__up?r=${Math.random()}`)
      xhr.send(payload)
    })
  })
}
