import type { CSSProperties } from "react";
import { Moon } from "lucide-react";

/**
 * Custom and wrapped time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — Lucide Sunrise minus only the upward chevron
 *    (`m8 6 4-4 4 4`). All other paths kept: top vertical ray,
 *    upper-left / upper-right diagonals, left / right horizontal
 *    rays, horizon at y=22, arc at y=18. No V-shaped arrow.
 *  - `AfternoonIcon` — Solid filled circle. A clean, bold disc that
 *    reads as "high sun / midday" and is clearly distinct from the
 *    half-sun morning horizon and the crescent evening moon.
 *  - `EveningIcon`   — Lucide `Moon` (crescent). Standard, universally
 *    recognisable, renders crisply at any size.
 *
 * All three honour `currentColor` so callers can tint via
 * `style.color` / `className` (drop-in Lucide compatible).
 *
 * ─── CONSUMER CHECKLIST ───────────────────────────────────────────────────
 * Every place that renders a morning / afternoon icon MUST import from here.
 * When adding a new slot view, add it to this list and use these icons.
 *
 *  ✓ CustomerAvailableDays.tsx  — sneak-peek glyphs on day picker cards
 *  ✓ SlotsMobile.tsx            — window option cards (morning/afternoon/evening)
 *  ✓ SlotsDesktop.tsx           — window option cards
 *  ✓ SlotsMobileLite.tsx        — window option cards
 *  ✓ BookingForm.tsx (Step 5)   — SlotChip morning / afternoon icons
 *  ✓ NextAvailableCard.tsx      — headline icon prefix
 * ──────────────────────────────────────────────────────────────────────────
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
      {/* Top vertical ray — shortened to ~2 units, consistent with diagonals/side rays. */}
      <path d="M12 8v2" />
      {/* Upper-left diagonal ray. */}
      <path d="M4.93 10.93l1.41 1.41" />
      {/* Upper-right diagonal ray. */}
      <path d="M19.07 10.93l-1.41 1.41" />
      {/* Left horizontal side ray. */}
      <path d="M2 18h2" />
      {/* Right horizontal side ray. */}
      <path d="M20 18h2" />
      {/* Horizon line at y=22 (original Lucide position). */}
      <path d="M22 22H2" />
      {/* Semicircle arc at y=18 (standard Lucide Sunrise arc). */}
      <path d="M16 18a4 4 0 0 0-8 0" />
      {/* Intentionally omitted: upward V-chevron "m8 6 4-4 4 4" */}
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
      {/* Solid filled disc — clean midday sun, clearly distinct from
          the half-sun morning horizon and the crescent evening moon. */}
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

export function EveningIcon({
  className,
  style,
  "aria-hidden": ariaHidden = true,
}: IconProps) {
  return (
    <Moon
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    />
  );
}
