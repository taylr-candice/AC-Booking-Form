import type { CSSProperties } from "react";

/**
 * Custom time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — sun rising on the horizon, outline, no arrow.
 *  - `AfternoonIcon` — solid filled circle (no rays); distinct from
 *    the morning half-disc at a glance.
 *  - `EveningIcon`   — slim crescent moon.
 *
 * All three honour `currentColor` so callers can tint via
 * `style.color` / `className` (drop-in Lucide compatible).
 */

type IconProps = {
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
};

export function MorningIcon({
  className,
  style,
  "aria-hidden": ariaHidden = true,
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {/* Short vertical ray rising from the top of the sun (replaces
          Lucide Sunrise's arrow shaft + chevron). */}
      <path d="M12 5v3" />
      {/* Two diagonal rays, top-left and top-right. */}
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="m19.07 10.93-1.41 1.41" />
      {/* Two side rays, level with the sun. */}
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      {/* Horizon line. */}
      <path d="M22 22H2" />
      {/* Top half of the sun, sitting on the horizon. Outline only. */}
      <path d="M16 18a4 4 0 0 0-8 0" />
    </svg>
  );
}

export function AfternoonIcon({
  className,
  style,
  "aria-hidden": ariaHidden = true,
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {/* Outline circle — midday sun core. */}
      <circle cx="12" cy="12" r="4" />
      {/* 8 short rays at 45° intervals. */}
      <line x1="12" y1="2"    x2="12" y2="4"    />
      <line x1="12" y1="20"   x2="12" y2="22"   />
      <line x1="2"  y1="12"   x2="4"  y2="12"   />
      <line x1="20" y1="12"   x2="22" y2="12"   />
      <line x1="4.93" y1="4.93"   x2="6.34" y2="6.34"   />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93"  x2="17.66" y2="6.34"  />
      <line x1="6.34"  y1="17.66" x2="4.93"  y2="19.07" />
    </svg>
  );
}

export function EveningIcon({
  className,
  style,
  "aria-hidden": ariaHidden = true,
}: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {/*
       * Slim crescent moon. Same outer arc as Lucide Moon (radius 9,
       * large-arc, clockwise from (21,12) back to (12,3)) but the
       * inner cutout arc uses a larger radius (7.5 vs Lucide's 6) so
       * the inner edge curves more gently and the crescent is visibly
       * narrower without losing its recognisable moon shape.
       */}
      <path d="M12 3a7.5 7.5 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
