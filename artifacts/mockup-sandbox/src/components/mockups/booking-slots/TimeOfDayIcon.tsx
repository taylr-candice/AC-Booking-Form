import type { CSSProperties } from "react";
import { Sun, Moon } from "lucide-react";

/**
 * Custom and wrapped time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — custom half-sun on the horizon (outline, no arrow,
 *    no rays below the line). Lucide has no direct equivalent.
 *  - `AfternoonIcon` — Lucide `Sun` (full circle + 8 rays). Clearly
 *    distinct from the morning half-disc: full sun in the sky vs sun
 *    just cresting the horizon.
 *  - `EveningIcon`   — Lucide `Moon` (crescent). Standard, universally
 *    recognisable, renders crisply at any size.
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
      {/* Short vertical ray from the top of the sun. */}
      <path d="M12 5v3" />
      {/* Two diagonal rays, upper-left and upper-right. */}
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="m19.07 10.93-1.41 1.41" />
      {/* Two horizontal side rays, level with the sun centre. */}
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      {/* Horizon line. */}
      <path d="M22 22H2" />
      {/* Top half of the sun sitting on the horizon. */}
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
    <Sun
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    />
  );
}

export function EveningIcon({
  className,
  style,
  "aria-hidden"  : ariaHidden = true,
}: IconProps) {
  return (
    <Moon
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    />
  );
}
