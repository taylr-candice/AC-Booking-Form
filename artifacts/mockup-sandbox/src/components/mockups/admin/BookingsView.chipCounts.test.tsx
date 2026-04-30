// @vitest-environment happy-dom

/**
 * Status / payment chip counts on the main bookings list toolbar.
 *
 * The chip row above the table now mirrors the Awaiting-coordination
 * treatment: each chip carries its bucket count, and chips whose
 * bucket is empty are visually muted + disabled so a team lead can
 * pivot between the two views with the same visual language.
 *
 * The "All" chip is the toolbar's reset affordance, so it is never
 * muted — it always represents the visible total, even when that
 * total is zero. Counts honour the building filter, search, and (for
 * the per-status chips) the cancelled-hiding rule as it would behave
 * with that chip active — so the "Cancelled" chip's count surfaces
 * the cancelled rows it would reveal even when "Show cancelled" is
 * off.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  PaymentStatus,
  ServiceStatus,
} from "@/state/adminMockData";

import { BookingsView } from "./BookingsView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-a",
      name: "Tower A",
      addressLine1: "1 A St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
    {
      id: "bldg-b",
      name: "Tower B",
      addressLine1: "2 B St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u-a1",
      addressLine1: "1 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-b1",
      addressLine1: "1 / 2 B St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-b",
    },
  ];
}

function makeBooking(overrides: Partial<AdminBooking>): AdminBooking {
  return {
    id: "bk-x",
    unitId: "u-a1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-05-10",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
    ...overrides,
  };
}

function Harness({
  initial,
  paymentMode = false,
  initialBuildingFilter = "all",
  initialSearch = "",
}: {
  initial: AdminBooking[];
  paymentMode?: boolean;
  initialBuildingFilter?: string;
  initialSearch?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | ServiceStatus | PaymentStatus
  >("all");
  const [buildingFilter, setBuildingFilter] = useState(initialBuildingFilter);
  const [search, setSearch] = useState(initialSearch);
  return (
    <BookingsView
      bookings={initial}
      units={makeUnits()}
      buildings={makeBuildings()}
      statusFilter={statusFilter}
      onStatusFilter={setStatusFilter}
      buildingFilter={buildingFilter}
      onBuildingFilter={setBuildingFilter}
      search={search}
      onSearch={setSearch}
      onOpen={() => {}}
      onNewBooking={() => {}}
      paymentMode={paymentMode}
      onAcknowledgeSupersede={() => {}}
    />
  );
}

function chipCount(key: string): number {
  const text = screen.getByTestId(`chip-bookings-${key}-count`).textContent ?? "";
  const match = text.match(/\((\d+)\)/);
  if (!match) {
    throw new Error(`Could not parse count from chip "${key}": ${text}`);
  }
  return Number(match[1]);
}

function clickChip(key: string) {
  fireEvent.click(screen.getByTestId(`chip-bookings-${key}`));
}

describe("BookingsView status chip counts", () => {
  it("renders a count beside each status chip, with 'All' showing the visible total", () => {
    const bookings = [
      makeBooking({ id: "bk-1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-2", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-3", serviceStatus: "complete" }),
    ];
    render(<Harness initial={bookings} />);
    expect(chipCount("all")).toBe(3);
    expect(chipCount("scheduled")).toBe(2);
    expect(chipCount("on_site")).toBe(0);
    expect(chipCount("complete")).toBe(1);
  });

  it("counts honour the building filter — Tower B excludes a Tower A row", () => {
    const bookings = [
      makeBooking({ id: "bk-a1", unitId: "u-a1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-b1", unitId: "u-b1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-b2", unitId: "u-b1", serviceStatus: "complete" }),
    ];
    render(<Harness initial={bookings} initialBuildingFilter="bldg-b" />);
    expect(chipCount("all")).toBe(2);
    expect(chipCount("scheduled")).toBe(1);
    expect(chipCount("complete")).toBe(1);
    expect(chipCount("on_site")).toBe(0);
  });

  it("counts honour the search query", () => {
    const bookings = [
      makeBooking({ id: "bk-jones-1", customerName: "Jones", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-smith-1", customerName: "Smith", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-jones-2", customerName: "Jones", serviceStatus: "complete" }),
    ];
    render(<Harness initial={bookings} initialSearch="jones" />);
    expect(chipCount("all")).toBe(2);
    expect(chipCount("scheduled")).toBe(1);
    expect(chipCount("complete")).toBe(1);
  });

  it("counts stay independent of which status chip is active", () => {
    const bookings = [
      makeBooking({ id: "bk-1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-2", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-3", serviceStatus: "complete" }),
    ];
    render(<Harness initial={bookings} />);
    // Switching the active chip must not change the per-bucket
    // tallies — otherwise picking "scheduled" would always show "(N)"
    // matching the visible total.
    clickChip("scheduled");
    expect(chipCount("all")).toBe(3);
    expect(chipCount("scheduled")).toBe(2);
    expect(chipCount("complete")).toBe(1);
  });

  it("the 'Cancelled' chip count surfaces cancelled rows even when 'Show cancelled' is off", () => {
    // Two cancelled rows hidden by default + one scheduled row
    // visible. The "Cancelled" chip's count must reflect what
    // clicking it would reveal (2), not the currently-visible
    // count (0) — otherwise the bucket would always read zero
    // until the toggle flipped on.
    const bookings = [
      makeBooking({ id: "bk-s1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-c1", serviceStatus: "cancelled" }),
      makeBooking({ id: "bk-c2", serviceStatus: "cancelled" }),
    ];
    render(<Harness initial={bookings} />);
    expect(chipCount("all")).toBe(1);
    expect(chipCount("scheduled")).toBe(1);
    expect(chipCount("cancelled")).toBe(2);
  });

  it("dims and disables status chips with a count of zero", () => {
    // Only scheduled rows in the queue — every other status chip
    // (on_site / complete / cancelled) should mute itself
    // visually and refuse clicks.
    const bookings = [
      makeBooking({ id: "bk-1", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-2", serviceStatus: "scheduled" }),
    ];
    render(<Harness initial={bookings} />);

    expect(chipCount("scheduled")).toBe(2);
    expect(chipCount("on_site")).toBe(0);
    expect(chipCount("complete")).toBe(0);
    expect(chipCount("cancelled")).toBe(0);

    for (const key of ["on_site", "complete", "cancelled"]) {
      const chip = screen.getByTestId(
        `chip-bookings-${key}`,
      ) as HTMLButtonElement;
      expect(chip.disabled).toBe(true);
      expect(chip.className).toMatch(/opacity-50/);
      expect(chip.className).toMatch(/cursor-not-allowed/);
      expect(chip.className).toMatch(/text-slate-400/);
      expect(chip.className).toMatch(/ring-slate-100/);
    }

    // Non-empty chip stays clickable and uses full-strength styling.
    const scheduledChip = screen.getByTestId(
      "chip-bookings-scheduled",
    ) as HTMLButtonElement;
    expect(scheduledChip.disabled).toBe(false);
    expect(scheduledChip.className).not.toMatch(/opacity-50/);
    expect(scheduledChip.className).toMatch(/text-slate-700/);

    // Clicking a muted chip must not flip the active filter.
    clickChip("on_site");
    expect(
      screen.getByTestId("chip-bookings-all").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("chip-bookings-on_site")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("mutes an active chip whose bucket later drains to zero", async () => {
    // Pin a chip to "scheduled", then change the search so no
    // scheduled rows remain. The chip is now both `active` and
    // empty — the muted treatment must win over the brand-coloured
    // active pill, otherwise the toolbar would lie about which
    // buckets currently hold rows.
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    const bookings = [
      makeBooking({ id: "bk-jones", customerName: "Jones", serviceStatus: "scheduled" }),
      makeBooking({ id: "bk-smith", customerName: "Smith", serviceStatus: "complete" }),
    ];
    render(<Harness initial={bookings} />);

    clickChip("scheduled");
    expect(
      screen.getByTestId("chip-bookings-scheduled").getAttribute("aria-pressed"),
    ).toBe("true");

    // Narrow the search so the only "scheduled" row drops out.
    await user.type(
      screen.getByPlaceholderText("Search by customer, ID, or address…"),
      "smith",
    );

    expect(chipCount("scheduled")).toBe(0);
    const scheduledChip = screen.getByTestId(
      "chip-bookings-scheduled",
    ) as HTMLButtonElement;
    expect(scheduledChip.disabled).toBe(true);
    expect(scheduledChip.className).toMatch(/opacity-50/);
    expect(scheduledChip.className).toMatch(/text-slate-400/);
    // The brand-coloured "active" pill must NOT be applied to the
    // now-empty chip even though it is still the `aria-pressed`
    // selection.
    expect(scheduledChip.className).not.toMatch(/text-white/);
    expect(scheduledChip.style.backgroundColor).toBe("");
  });

  it("keeps the 'All' chip un-muted even when every specific bucket is empty", () => {
    // Building filter that matches nothing — every count is zero,
    // but the "All" chip must still render as a live, clickable
    // reset affordance.
    render(<Harness initial={[]} initialBuildingFilter="bldg-a" />);
    expect(chipCount("all")).toBe(0);
    expect(chipCount("scheduled")).toBe(0);
    expect(chipCount("on_site")).toBe(0);
    expect(chipCount("complete")).toBe(0);
    expect(chipCount("cancelled")).toBe(0);

    const allChip = screen.getByTestId(
      "chip-bookings-all",
    ) as HTMLButtonElement;
    expect(allChip.disabled).toBe(false);
    expect(allChip.className).not.toMatch(/opacity-50/);
    expect(allChip.className).not.toMatch(/cursor-not-allowed/);

    // The four specific chips, by contrast, are muted + disabled.
    for (const key of ["scheduled", "on_site", "complete", "cancelled"]) {
      const chip = screen.getByTestId(
        `chip-bookings-${key}`,
      ) as HTMLButtonElement;
      expect(chip.disabled).toBe(true);
      expect(chip.className).toMatch(/opacity-50/);
    }
  });
});

describe("BookingsView payment chip counts", () => {
  it("renders a count beside each payment chip and dims empty buckets", () => {
    // Payments mode swaps the chip set for paid / pending /
    // refund_pending. Cancelled rows are NOT hidden in this mode
    // (cancellations naturally flip payment to refund_pending, so
    // the cancelled row IS the refund queue's day-to-day work),
    // which makes the expected counts straightforward.
    const bookings = [
      makeBooking({ id: "bk-paid-1", paymentStatus: "paid" }),
      makeBooking({ id: "bk-paid-2", paymentStatus: "paid" }),
      makeBooking({
        id: "bk-refund",
        paymentStatus: "refund_pending",
        serviceStatus: "cancelled",
      }),
    ];
    render(<Harness initial={bookings} paymentMode />);
    expect(chipCount("all")).toBe(3);
    expect(chipCount("paid")).toBe(2);
    expect(chipCount("pending")).toBe(0);
    expect(chipCount("refund_pending")).toBe(1);

    const pendingChip = screen.getByTestId(
      "chip-bookings-pending",
    ) as HTMLButtonElement;
    expect(pendingChip.disabled).toBe(true);
    expect(pendingChip.className).toMatch(/opacity-50/);

    const paidChip = screen.getByTestId(
      "chip-bookings-paid",
    ) as HTMLButtonElement;
    expect(paidChip.disabled).toBe(false);
  });
});
