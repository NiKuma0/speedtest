/** Logo mark: a gauge arc with a speed marker, followed by the wordmark. */
export function Logo() {
  return (
    <div className="logo">
      <svg className="logo__mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden>
        <rect width="32" height="32" rx="7" fill="var(--bg1)" />
        <path d="M8 22.5a10 10 0 1 1 16 0" fill="none" stroke="var(--bg2)" strokeWidth="3" strokeLinecap="round" />
        <path d="M8 22.5a10 10 0 0 1 13.8-12.9" fill="none" stroke="var(--aqua)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="21.8" cy="9.6" r="2.6" fill="var(--yellow)" />
      </svg>
      <span className="logo__text">
        speed<span className="logo__accent">test</span>
        <span className="logo__cursor">_</span>
      </span>
    </div>
  )
}
