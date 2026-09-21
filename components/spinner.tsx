/**
 * Tiny inline spinner. Animated with Tailwind's `animate-spin` so it respects
 * `prefers-reduced-motion` through the global motion-reduce reset if we add one;
 * `currentColor` keeps it usable on both light and dark chips.
 */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 shrink-0 animate-spin ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
