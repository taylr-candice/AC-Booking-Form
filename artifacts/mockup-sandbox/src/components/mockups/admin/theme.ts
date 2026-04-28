/**
 * Brand palette + tiny color helpers shared across the admin mockup
 * screens. Kept in its own file so the per-screen components don't all
 * have to redeclare the brand constants.
 */

export const BRAND = "#ED017F";
export const BRAND_SOFT = "#FCE7F1";
export const BRAND_DEEP = "#A30058";

/** Accent color for a slot's mode pill / progress bar. */
export function modeColor(mode: "time_based" | "count_based"): string {
  return mode === "count_based" ? "#3B82F6" : BRAND;
}
