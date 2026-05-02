import type { CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Custom and wrapped time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — half-sun sitting ON the horizon: arc base and
 *    horizon share the same y so the sun visually rests on the line.
 *    Two diagonal side rays (upper-left / upper-right) from Lucide
 *    Sunrise, but with the top vertical ray and upward arrow removed.
 *    No upward chevron / directional arrow.
 *  - `AfternoonIcon` — Lucide `Sun` (circle + 8 rays). Full sun high
 *    in the sky, clearly distinct from the half-sun morning horizon.
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
 *
 * NOT in this list (intentional):
 *  - NextAvailableCard.tsx      — headline shows text only, no icon prefix
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
      {/* Diagonal side rays (upper-left / upper-right) — no top ray, no arrow. */}
      <path d="M4.93 10.93l1.41 1.41" />
      <path d="M19.07 10.93l-1.41 1.41" />
      {/* Horizon at y=18, same level as arc base so the sun rests ON it. */}
      <path d="M2 18h20" />
      {/* Semicircle arc: base at y=18, bulges upward. */}
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
