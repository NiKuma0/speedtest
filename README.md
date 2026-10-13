# Speedtest

A speedtest.net-style internet speed test built with React + TypeScript + Vite.

**Live:** https://nikuma0.github.io/speedtest/

## How it works

GitHub Pages only serves static files, so all measurements run in the browser against
[speed.cloudflare.com](https://speed.cloudflare.com) (CORS-enabled):

- **Ping / jitter** — 20 sequential `GET /__down?bytes=0` requests. RTT is measured in the browser
  minus the server processing time reported in the `Server-Timing` header. The first request
  (DNS/TCP/TLS handshakes) is discarded. Ping is the median, jitter is the mean difference between
  consecutive samples. Browsers can't send ICMP, so this is an HTTP-level latency.
- **Download** — 4 parallel streams repeatedly fetching 25 MB from `/__down` for 10 s;
  bytes are counted while reading the response stream.
- **Upload** — 4 parallel XHR `POST /__up` requests with 8 MB of random data for 10 s;
  progress comes from `xhr.upload.onprogress`.
- The final speed excludes the first ~2 s (TCP slow-start warmup).
- **Connection info** — IP, Cloudflare data center, HTTP/TLS version from `/cdn-cgi/trace`;
  ISP, ASN and location from [ipwho.is](https://ipwho.is).

## Development

```sh
npm install
npm run dev     # http://localhost:5173/speedtest/
npm run build
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
