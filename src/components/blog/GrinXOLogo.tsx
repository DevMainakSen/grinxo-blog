/**
 * GrinXO Logo — inline SVG component.
 * Faithfully recreates the attached logo:
 *   - Salmon/coral circle icon (smile + upper-left crescent cutout)
 *   - Purple "GrinXO" wordmark
 *   - Salmon dot above the "i"
 */
interface GrinXOLogoProps {
  height?: number;
  className?: string;
}

export default function GrinXOLogo({ height = 46, className }: GrinXOLogoProps) {
  return (
    <svg
      viewBox="0 0 280 80"
      height={height}
      width={(height * 280) / 80}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="GrinXO"
      role="img"
      className={className}
    >
      {/* ── Icon: salmon circle ── */}
      <circle cx="40" cy="40" r="38" fill="#EE7B6E" />

      {/* Upper-left white crescent cutout (the "grin" opening) */}
      <ellipse
        cx="28"
        cy="26"
        rx="18"
        ry="16"
        fill="white"
        transform="rotate(-15 28 26)"
      />
      {/* Inner salmon circle to make crescent shape */}
      <ellipse
        cx="32"
        cy="29"
        rx="13"
        ry="12"
        fill="#EE7B6E"
        transform="rotate(-15 32 29)"
      />

      {/* Smile arc (white, lower half of circle) */}
      <path
        d="M20 50 Q40 68 60 50"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Wordmark: "GrinXO" in GrinXO purple ── */}
      <text
        x="90"
        y="57"
        fontFamily='"Helvetica Neue", Helvetica, Arial, sans-serif'
        fontWeight="800"
        fontSize="44"
        fill="#6B3FA0"
        letterSpacing="-1"
      >
        GrinXO
      </text>

      {/* Salmon dot above the "i" in "Grin" — positioned over letter 3 */}
      <circle cx="136" cy="16" r="5.5" fill="#EE7B6E" />
    </svg>
  );
}
