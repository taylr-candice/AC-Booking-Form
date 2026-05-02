import type { CSSProperties } from "react";
import { Moon } from "lucide-react";

/**
 * Custom and wrapped time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — custom half-sun on the horizon, two short side
 *    rays only (no upward arrow / vertical ray above the disc). Clearly
 *    "sun just rising" without the Lucide Sunrise arrow aesthetic.
 *  - `AfternoonIcon` — solid filled circle (no rays). Distinct from the
 *    morning half-disc: full sun high in the sky, rendered as a bold
 *    disc so it reads clearly at 16px.
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
      {/* Two short horizontal side rays — no upward arrow. */}
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
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      {/* Solid filled circle — unambiguous "full sun in the sky". */}
      <circle cx="12" cy="12" r="6" />
    </svg>
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
