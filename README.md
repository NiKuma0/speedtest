# Speedtest

A minimal internet speed test (ping, jitter, download) built with React + TypeScript + Vite.
Gruvbox dark theme. No backend and no third-party APIs.

**Live:** https://nikuma0.github.io/speedtest/

## How it works

The test downloads a file and measures how fast the bytes arrive.

- **Source file**: by default `testfile.bin`, 25 MB of random (incompressible) bytes generated at build
  time (`scripts/gen-testfile.mjs`) and served by GitHub Pages from the same origin via its CDN.
  You can switch to any other file URL in the UI (saved in `localStorage`); the server must allow CORS.
- **Ping / jitter**: 20 sequential `HEAD` requests (falls back to `GET` if `HEAD` is rejected),
  timed until response headers arrive. The first request (DNS/TCP/TLS handshakes) is discarded.
  Ping is the median, jitter is the mean difference between consecutive samples. Browsers can't
  send ICMP, so this is HTTP-level latency.
- **Download**: 4 parallel streams download the file over and over for 10 s; bytes are counted while
  reading the response stream. The first ~2 s (TCP slow start) are excluded from the final result.
- **History**: the last 50 results are kept in `localStorage`; rows can be deleted one by one or cleared.
- A random query parameter plus `cache: 'no-store'` keeps the browser cache out of the way.

Upload isn't measured: a static site has no server to receive data.

## Development

```sh
npm install
npm run dev     # http://localhost:5173/speedtest/
npm run build
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
