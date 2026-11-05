/**
 * The CALIBRE mark: two drops, a large one and a small one above it, each lit from the top left with a highlight and a
 * faint reflected rim, like light on water (Sui's and Walrus's element). The small drop drifts gently; it holds still for
 * people who ask for less motion.
 */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className={`logo ${className}`}>
      <defs>
        <radialGradient id="calibre-drop" cx="0.32" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#c4fdf3" />
          <stop offset="0.42" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0f7a6a" />
        </radialGradient>
      </defs>
      <g>
        <circle cx="27" cy="38" r="19" fill="url(#calibre-drop)" />
        <path d="M41.57 43.3A15.5 15.5 0 0 1 31.01 52.97" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="20" cy="30" rx="5.6" ry="3.2" transform="rotate(-40 20 30)" fill="#fff" fillOpacity=".92" />
      </g>
      <g className="logo-small">
        <circle cx="50" cy="15" r="8.5" fill="url(#calibre-drop)" />
        <path d="M56.2 17.26A6.6 6.6 0 0 1 51.71 21.38" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="47" cy="12" rx="2.6" ry="1.5" transform="rotate(-40 47 12)" fill="#fff" fillOpacity=".92" />
      </g>
    </svg>
  );
}
