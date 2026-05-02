// @vitest-environment happy-dom

/**
 * Waiting-on chip filter on the Awaiting-coordination toolbar.
 *
 * The chip row above the table (All / Awaiting tenant / Awaiting
 * agent) now mirrors the outcome chip treatment: each chip carries
 * its bucket count, and chips whose bucket is empty are visually
 * muted + disabled so a team lead can spot at a glance whether the
 * agent queue is empty without clicking through.
 *
 * The "All" chip is the toolbar's reset affordance, so it is never
 * muted — it always represents the visible total, even when that
 * total is zero. Counts honour the building filter, search, and the
 * active outcome chip but ignore the waiting-on chip itself
 * (otherwise picking "Awaiting tenant" would always tally to itself).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  AdminBooking,
  AdminBuilding,
  AdminUnit,
  TimelineEntry,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

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
      agentId: "agent-1",
      buildingId: "bldg-a",
    },
    {
      id: "u-a2",
      addressLine1: "2 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-a",
    },
    {
      id: "u-a3",
      addressLine1: "3 / 1 A St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: "agent-1",
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

function tenantBooking(overrides: Partial<AdminBooking>): AdminBooking {
  // owner_leased_tenant ⇒ coordinationKindForBooking returns "awaiting_tenant"
  return {
    id: "bk-tenant",
    unitId: "u-a2",
    customerName: "Tenant Customer",
    customerEmail: "tenant@example.com",
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "T",
        last: "Tenant",
        email: "t@example.com",
        phone: "0411111111",
      },
    ],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: "2026-04-28T09:00:00+10:00",
    ...overrides,
  };
}

function agentBooking(overrides: Partial<AdminBooking>): AdminBooking {
  // owner_leased_agent on a unit with an agentId ⇒ "awaiting_agent"
  return tenantBooking({
    id: "bk-agent",
    unitId: "u-a1",
    accessMethod: "owner_leased_agent",
    bookerRole: "owner",
    ...overrides,
  });
}

function callEntry(
  outcome: "Spoke to them" | "No answer" | "Left voicemail",
): TimelineEntry {
  return {
    kind: "call",
    status: "logged_call",
    label: `Logged call · ${outcome}`,
    at: "Just now",
    by: "Mia (admin)",
  };
}

function Harness({
  initial,
  initialBuildingFilter = "all",
  initialSearch = "",
}: {
  initial: AdminBooking[];
  initialBuildingFilter?: string;
  initialSearch?: string;
}) {
  const [filter, setFilter] = useState<
    "all" | "awaiting_tenant" | "awaiting_agent" | "awaiting_scheduling"
  >(
    "all",
  );
  const [buildingFilter, setBuildingFilter] = useState(initialBuildingFilter);
  const [search, setSearch] = useState(initialSearch);
  return (
    <AwaitingCoordinationView
      bookings={initial}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter}
      buildingFilter={buildingFilter}
      onBuildingFilter={setBuildingFilter}
      search={search}
      onSearch={setSearch}
      onOpen={() => {}}
    />
  );
}

function chipCount(key: string): number {
  const text = screen.getByTestId(`chip-waiting-${key}-count`).textContent ?? "";
  const match = text.match(/\((\d+)\)/);
  if (!match) {
    throw new Error(`Could not parse count from chip "${key}": ${text}`);
  }
  return Number(match[1]);
}

function clickWaitingChip(key: string) {
  fireEvent.click(screen.getByTestId(`chip-waiting-${key}`));
}

function clickOutcomeChip(key: string) {
  fireEvent.click(screen.getByTestId(`chip-outcome-${key}`));
}

describe("AwaitingCoordinationView waiting-on chip counts", () => {
  it("renders a count beside each waiting-on chip, with 'All' showing the visible total", () => {
    const bookings = [
      tenantBooking({ id: "bk-t1", unitId: "u-a2" }),
      tenantBooking({ id: "bk-t2", unitId: "u-a2" }),
      agentBooking({ id: "bk-a1", unitId: "u-a1" }),
    ];
    render(<Harness initial={bookings} />);
    expect(chipCount("all")).toBe(3);
    expect(chipCount("awaiting_tenant")).toBe(2);
    expect(chipCount("awaiting_agent")).toBe(1);
  });

  it("counts honour the building filter — Tower B excludes a Tower A row", () => {
    const bookings = [
      tenantBooking({ id: "bk-t-a", unitId: "u-a2" }),
      tenantBooking({ id: "bk-t-b", unitId: "u-b1" }),
      agentBooking({ id: "bk-a-a", unitId: "u-a1" }),
    ];
    render(<Harness initial={bookings} initialBuildingFilter="bldg-b" />);
    // Only the tenant row in Tower B survives.
    expect(chipCount("all")).toBe(1);
    expect(chipCount("awaiting_tenant")).toBe(1);
    expect(chipCount("awaiting_agent")).toBe(0);
  });

  it("counts honour the search query", () => {
    const bookings = [
      tenantBooking({ id: "bk-t-jones", customerName: "Jones", unitId: "u-a2" }),
      tenantBooking({ id: "bk-t-smith", customerName: "Smith", unitId: "u-a2" }),
      agentBooking({ id: "bk-a-jones", customerName: "Jones", unitId: "u-a1" }),
    ];
    render(<Harness initial={bookings} initialSearch="jones" />);
    expect(chipCount("all")).toBe(2);
    expect(chipCount("awaiting_tenant")).toBe(1);
    expect(chipCount("awaiting_agent")).toBe(1);
  });

  it("counts stay independent of which waiting-on chip is active", () => {
    const bookings = [
      tenantBooking({ id: "bk-t1", unitId: "u-a2" }),
      tenantBooking({ id: "bk-t2", unitId: "u-a2" }),
      agentBooking({ id: "bk-a1", unitId: "u-a1" }),
    ];
    render(<Harness initial={bookings} />);
    expect(chipCount("awaiting_tenant")).toBe(2);
    expect(chipCount("awaiting_agent")).toBe(1);
    // Switching the active chip must not change the per-bucket
    // tallies — otherwise picking a chip would always show "(N)"
    // matching the visible total.
    clickWaitingChip("awaiting_tenant");
    expect(chipCount("all")).toBe(3);
    expect(chipCount("awaiting_tenant")).toBe(2);
    expect(chipCount("awaiting_agent")).toBe(1);
  });

  it("counts honour the active outcome chip — switching outcomes recomputes the buckets", () => {
    // Two tenant rows: one whose latest attempt was 'spoke', one
    // 'voicemail'. One agent row whose latest attempt was 'spoke'.
    // Switching the outcome chip from "Spoke" to "Voicemail" should
    // empty the agent bucket and shrink the tenant bucket to one.
    const bookings = [
      tenantBooking({
        id: "bk-t-spoke",
        unitId: "u-a2",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
      tenantBooking({
        id: "bk-t-vm",
        unitId: "u-a2",
        serviceTimeline: [callEntry("Left voicemail")],
      }),
      agentBooking({
        id: "bk-a-spoke",
        unitId: "u-a1",
        serviceTimeline: [callEntry("Spoke to them")],
      }),
    ];
    render(<Harness initial={bookings} />);
    // Default: all rows visible.
    expect(chipCount("all")).toBe(3);
    expect(chipCount("awaiting_tenant")).toBe(2);
    expect(chipCount("awaiting_agent")).toBe(1);
    // Pivot to the "Spoke" outcome — the tenant voicemail row drops
    // out, the agent 'spoke' row stays.
    clickOutcomeChip("spoke");
    expect(chipCount("all")).toBe(2);
    expect(chipCount("awaiting_tenant")).toBe(1);
    expect(chipCount("awaiting_agent")).toBe(1);
    // Pivot to "Voicemail" — only the tenant voicemail row survives,
    // so the agent bucket empties out and dims (asserted below in
    // the dim-empty case).
    clickOutcomeChip("voicemail");
    expect(chipCount("all")).toBe(1);
    expect(chipCount("awaiting_tenant")).toBe(1);
    expect(chipCount("awaiting_agent")).toBe(0);
  });

  it("dims and disables waiting-on chips with a count of zero", () => {
    // Only tenant rows in the queue — the "Awaiting agent" chip
    // should mute itself visually and refuse clicks.
    const bookings = [
      tenantBooking({ id: "bk-t1", unitId: "u-a2" }),
      tenantBooking({ id: "bk-t2", unitId: "u-a2" }),
    ];
    render(<Harness initial={bookings} />);

    expect(chipCount("awaiting_agent")).toBe(0);
    expect(chipCount("awaiting_tenant")).toBe(2);
    expect(chipCount("all")).toBe(2);

    const agentChip = screen.getByTestId(
      "chip-waiting-awaiting_agent",
    ) as HTMLButtonElement;
    expect(agentChip.disabled).toBe(true);
    expect(agentChip.className).toMatch(/opacity-50/);
    expect(agentChip.className).toMatch(/cursor-not-allowed/);
    expect(agentChip.className).toMatch(/text-slate-400/);
    expect(agentChip.className).toMatch(/ring-slate-100/);

    // Non-empty chip stays clickable and uses full-strength styling.
    const tenantChip = screen.getByTestId(
      "chip-waiting-awaiting_tenant",
    ) as HTMLButtonElement;
    expect(tenantChip.disabled).toBe(false);
    expect(tenantChip.className).not.toMatch(/opacity-50/);
    expect(tenantChip.className).toMatch(/text-slate-700/);

    // Clicking the muted chip must not flip the active filter.
    clickWaitingChip("awaiting_agent");
    expect(
      screen.getByTestId("chip-waiting-all").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("chip-waiting-awaiting_agent")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("keeps the 'All' chip un-muted even when every specific bucket is empty", () => {
    // Building filter that matches nothing — every count is zero, but
    // the "All" chip must still render as a live, clickable reset
    // affordance.
    render(<Harness initial={[]} initialBuildingFilter="bldg-a" />);
    expect(chipCount("all")).toBe(0);
    expect(chipCount("awaiting_tenant")).toBe(0);
    expect(chipCount("awaiting_agent")).toBe(0);

    const allChip = screen.getByTestId(
      "chip-waiting-all",
    ) as HTMLButtonElement;
    expect(allChip.disabled).toBe(false);
    expect(allChip.className).not.toMatch(/opacity-50/);
    expect(allChip.className).not.toMatch(/cursor-not-allowed/);

    // The two specific chips, by contrast, are muted + disabled.
    for (const key of ["awaiting_tenant", "awaiting_agent"]) {
      const chip = screen.getByTestId(`chip-waiting-${key}`) as HTMLButtonElement;
      expect(chip.disabled).toBe(true);
      expect(chip.className).toMatch(/opacity-50/);
    }
  });
});
