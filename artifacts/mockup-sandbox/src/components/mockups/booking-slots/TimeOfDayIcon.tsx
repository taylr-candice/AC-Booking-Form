import type { CSSProperties } from "react";
import { Moon } from "lucide-react";

/**
 * Custom and wrapped time-of-day icons for the customer slot picker.
 *
 *  - `MorningIcon`   — half-sun sitting on the horizon: a semicircular
 *    arc resting on a straight horizon line, with two short side rays.
 *    No top ray, no diagonal rays, no directional arrow — clean and
 *    unambiguous at small sizes.
 *  - `AfternoonIcon` — solid filled circle (disc). Clearly distinct
 *    from the outline morning half-disc: a bright full sun high in the
 *    sky vs. the sun just cresting the horizon.
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
      {/* Two short horizontal side rays at horizon level. */}
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
      {/* Solid filled circle — full sun high in the sky. */}
      <circle cx="12" cy="12" r="7" />
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
