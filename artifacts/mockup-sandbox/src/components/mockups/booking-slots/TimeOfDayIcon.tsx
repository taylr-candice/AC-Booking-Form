import { Sun } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * Custom time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — sun rising on the horizon WITH rays but no
 *    upward arrow (the arrow read as ambiguous). Outline only — the
 *    half-disc is not filled. Mirrors Lucide's `Sunrise` minus the
 *    arrow tip.
 *  - `AfternoonIcon` — Lucide's outline `Sun` (circle + rays, no
 *    fill). Re-exported here so the slot-picker imports stay
 *    consistent with `MorningIcon` / `EveningIcon`.
 *  - `EveningIcon`   — Lucide's outline `Moon` (no fill). Re-exported
 *    so every surface uses the same evening glyph and so the icon
 *    set lives in one file.
 *
 * All three honour `currentColor` for both stroke and fill, so
 * callers can tint them via the usual `style.color` / `className`
 * props the slot pickers already pass to Lucide icons (drop-in
 * compatible). None of them render with a solid fill.
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
    <Sun className={className} style={style} aria-hidden={ariaHidden} />
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
