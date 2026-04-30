/**
 * Shared "Template used" filter — extracted so the bookings list and
 * the awaiting-coordination queue can apply the same matching rule
 * without copy-paste drift. Both surfaces let an ops lead narrow
 * their list to bookings whose timeline references a specific
 * Call/Email template by snapshot name.
 *
 * The shape and predicate are deliberately identical across views so
 * a chip clicked on one screen and the toolbar select on the other
 * can never disagree about which bookings count: both go through
 * {@link matchesTemplateFilter}, which delegates to
 * {@link bookingTimelineReferencesTemplate} (snapshot-on-use match
 * against the entry's literal `templateLabel` string).
 */

import {
  bookingTimelineReferencesTemplate,
  type AdminBooking,
} from "@/state/adminMockData";

/**
 * Identifies a Call/Email template by `kind` + snapshot-on-use
 * `name`, the same shape `findUsageBookingsForTemplate` matches
 * against. `null` means "no template filter" — the toolbar's reset
 * state.
 */
export type BookingsTemplateFilter = {
  kind: "call" | "email";
  name: string;
} | null;

/**
 * Predicate for the "Template used" filter. A `null` filter is
 * treated as "no filter applied" so this can be composed alongside
 * the building / search / status filters without a separate guard at
 * every call site. The match itself delegates to the shared
 * {@link bookingTimelineReferencesTemplate} helper so this filter
 * and the templates popover's "Bookings using this template"
 * drill-down can never disagree about which bookings count — both
 * read from the same predicate.
 *
 * Blank-name filters are also treated as "no filter applied" (the
 * shared predicate would return `false` for every row otherwise,
 * which would surprise an admin who somehow ended up with an
 * unnamed selection).
 */
export function matchesTemplateFilter(
  booking: AdminBooking,
  filter: BookingsTemplateFilter,
): boolean {
  if (filter === null) return true;
  if (filter.name.trim().length === 0) return true;
  return bookingTimelineReferencesTemplate(booking, filter.kind, filter.name);
}

/**
 * Encode / decode the {@link BookingsTemplateFilter} as a single
 * `<select>` value so the dropdown stays a controlled component
 * without a custom popover. We prefix the channel so a Call template
 * and an Email template that happen to share a name (admins can
 * rename freely) stay distinguishable. `"all"` is the toolbar's
 * reset value.
 */
export const TEMPLATE_FILTER_ALL_VALUE = "all";

export function encodeTemplateFilter(filter: BookingsTemplateFilter): string {
  if (filter === null) return TEMPLATE_FILTER_ALL_VALUE;
  return `${filter.kind}::${filter.name}`;
}

export function decodeTemplateFilter(value: string): BookingsTemplateFilter {
  if (value === TEMPLATE_FILTER_ALL_VALUE) return null;
  const sepIdx = value.indexOf("::");
  if (sepIdx <= 0) return null;
  const kind = value.slice(0, sepIdx);
  const name = value.slice(sepIdx + 2);
  if (kind !== "call" && kind !== "email") return null;
  if (name.length === 0) return null;
  return { kind, name };
}
