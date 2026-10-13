export interface ConnectionInfo {
  ip?: string
  isp?: string
  asn?: number
  city?: string
  country?: string
  countryCode?: string
  /** Cloudflare data center (IATA code) serving the test */
  colo?: string
  tls?: string
  http?: string
  /** Physical link type (wifi, cellular, ethernet…), only exposed by some browsers (mostly Android Chrome) */
  linkType?: string
}

interface NetworkInformation {
  type?: string
}

function parseTrace(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .trim()
      .split('\n')
      .map((line) => line.split('=') as [string, string]),
  )
}

export async function fetchConnectionInfo(): Promise<ConnectionInfo> {
  const nav = navigator as Navigator & { connection?: NetworkInformation }
  const info: ConnectionInfo = {
    linkType: nav.connection?.type,
  }

  const [trace, who] = await Promise.allSettled([
    fetch('https://speed.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' }).then((r) => r.text()),
    fetch('https://ipwho.is/').then((r) => r.json()),
  ])

  if (trace.status === 'fulfilled') {
    const t = parseTrace(trace.value)
    info.ip = t.ip
    info.colo = t.colo
    info.countryCode = t.loc
    info.tls = t.tls
    info.http = t.http
  }

  if (who.status === 'fulfilled' && who.value?.success) {
    const w = who.value
    info.ip ??= w.ip
    info.isp = w.connection?.isp || w.connection?.org
    info.asn = w.connection?.asn
    info.city = w.city
    info.country = w.country
    info.countryCode ??= w.country_code
  }

  return info
}
