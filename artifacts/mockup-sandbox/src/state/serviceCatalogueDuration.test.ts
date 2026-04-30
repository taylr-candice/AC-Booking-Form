/**
 * Service catalogue → booking duration coverage (Task #182).
 *
 * Covers:
 *   1. `getBookingDurationMinutes` reads catalogue base / add-on
 *      minutes for split + ducted, and adds per-system rooftop
 *      overhead from the unit duration context.
 *   2. Per-unit `outdoorPlacementOverride` wins over the building's
 *      `outdoorPlacement`, in either direction.
 *   3. Catalogue lookup falls back to the legacy 45 / 15 defaults
 *      when no entry matches the requested AC type.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  getBookingDurationMinutes,
  setServiceRuleResolver,
  setUnitDurationContextResolver,
  UNSURE_FALLBACK_MINUTES,
  type ServiceRule,
  type UnitDurationContext,
} from "./bookingDerived";
import {
  bookingDurationMinutes,
  DEFAULT_ROOFTOP_OVERHEAD_MINUTES,
  getEffectivePlacementForUnit,
  getServiceRuleForAcType,
  setLiveBuildingsSource,
  setLiveServiceCatalogueSource,
  setLiveUnitsSource,
  type AdminBooking,
  type AdminBuilding,
  type AdminService,
  type AdminUnit,
} from "./adminMockData";

// Distinct numbers so a "split rule applied" assertion can't pass when
// the helper silently fell back to ducted or to the 45/15 defaults.
const TEST_CATALOGUE: readonly AdminService[] = [
  {
    id: "svc-ac",
    name: "Split system service",
    acTypeKey: "split",
    baseMinutes: 50,
    addonLabel: "additional indoor head",
    addonMinutes: 20,
    priceAud: 199,
    addonPriceAud: 49,
    defaultJobMinutes: 50,
  },
  {
    id: "svc-ac-ducted",
    name: "Ducted system service",
    acTypeKey: "ducted",
    baseMinutes: 80,
    addonLabel: "additional return-air grille",
    addonMinutes: 25,
    priceAud: 249,
    addonPriceAud: 59,
    defaultJobMinutes: 80,
  },
];

// `bldg-tower` carries a non-default rooftopOverheadMinutes so we can
// tell building override from the 10-min default in test assertions.
const TEST_BUILDINGS: readonly AdminBuilding[] = [
  {
    id: "bldg-flat",
    name: "Flat Building",
    addressLine1: "1 Flat St",
    addressLine2: "Sydney NSW 2000",
    acType: "split",
    acBrand: "Daikin",
    outdoorPlacement: "in_property",
    rooftopOverheadMinutes: DEFAULT_ROOFTOP_OVERHEAD_MINUTES,
  },
  {
    id: "bldg-tower",
    name: "Tower Building",
    addressLine1: "1 Tower St",
    addressLine2: "Sydney NSW 2000",
    acType: "ducted",
    acBrand: "Daikin",
    outdoorPlacement: "rooftop",
    rooftopOverheadMinutes: 12,
  },
];

// Spans every (building placement × unit override) combination.
const TEST_UNITS: readonly AdminUnit[] = [
  {
    id: "u-flat-default",
    addressLine1: "1A",
    addressLine2: "Sydney NSW 2000",
    ac: { type: "split", brand: "", systems: 1, additional: 0 },
    agentId: null,
    buildingId: "bldg-flat",
  },
  {
    id: "u-flat-rooftop",
    addressLine1: "1B",
    addressLine2: "Sydney NSW 2000",
    ac: { type: "split", brand: "", systems: 1, additional: 0 },
    agentId: null,
    buildingId: "bldg-flat",
    outdoorPlacementOverride: "rooftop",
  },
  {
    id: "u-tower-default",
    addressLine1: "10",
    addressLine2: "Sydney NSW 2000",
    ac: { type: "ducted", brand: "", systems: 2, additional: 1 },
    agentId: null,
    buildingId: "bldg-tower",
  },
  {
    id: "u-tower-flat",
    addressLine1: "11",
    addressLine2: "Sydney NSW 2000",
    ac: { type: "ducted", brand: "", systems: 2, additional: 1 },
    agentId: null,
    buildingId: "bldg-tower",
    outdoorPlacementOverride: "in_property",
  },
];

// Mirrors AdminApp's mount-effect wiring so each test exercises the
// production code path, not bespoke stubs.
function installAdminLikeWiring(): void {
  setLiveServiceCatalogueSource(() => TEST_CATALOGUE);
  setLiveBuildingsSource(() => TEST_BUILDINGS);
  setLiveUnitsSource(() => TEST_UNITS);
  setServiceRuleResolver((acType) => getServiceRuleForAcType(acType));
  setUnitDurationContextResolver((unitId) => {
    const unit = TEST_UNITS.find((u) => u.id === unitId) ?? null;
    const recordedType =
      unit && (unit.ac.type === "split" || unit.ac.type === "ducted")
        ? unit.ac.type
        : null;
    return {
      acType: recordedType,
      placement: getEffectivePlacementForUnit(unitId),
    };
  });
}

afterEach(() => {
  setLiveServiceCatalogueSource(null);
  setLiveBuildingsSource(null);
  setLiveUnitsSource(null);
  setServiceRuleResolver(null);
  setUnitDurationContextResolver(null);
});

describe("getBookingDurationMinutes — catalogue-driven base + add-on", () => {
  it("uses split base/addon when the customer confirmed split", () => {
    installAdminLikeWiring();
    expect(
      getBookingDurationMinutes({
        unit_id: "u-flat-default",
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "split", systems: 2, additional: 1 },
          customer: { type: "split", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 50 + 1 * 20);
  });

  it("uses ducted base/addon when the customer confirmed ducted", () => {
    installAdminLikeWiring();
    expect(
      getBookingDurationMinutes({
        unit_id: "u-tower-flat",
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "ducted", systems: 2, additional: 1 },
          customer: { type: "ducted", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 80 + 1 * 25);
  });

  it("adds rooftop overhead per system on top of the catalogue rule", () => {
    installAdminLikeWiring();
    expect(
      getBookingDurationMinutes({
        unit_id: "u-flat-rooftop",
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "split", systems: 2, additional: 1 },
          customer: { type: "split", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 50 + 1 * 20 + 2 * DEFAULT_ROOFTOP_OVERHEAD_MINUTES);
  });

  it("respects the building's custom rooftopOverheadMinutes", () => {
    installAdminLikeWiring();
    expect(
      getBookingDurationMinutes({
        unit_id: "u-tower-default",
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "ducted", systems: 2, additional: 1 },
          customer: { type: "ducted", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 80 + 1 * 25 + 2 * 12);
  });

  it("falls back to the unit's recorded AC type when the booking carries no discrepancy snapshot", () => {
    installAdminLikeWiring();
    expect(
      getBookingDurationMinutes({
        unit_id: "u-flat-default",
        num_systems: 1,
        num_additional_indoor: 0,
        ac_discrepancy: null,
      }),
    ).toBe(50);
  });

  it("falls back to the legacy 45 / 15 defaults when the catalogue has no entry for the AC type", () => {
    setLiveServiceCatalogueSource(() => []);
    setServiceRuleResolver((acType) => getServiceRuleForAcType(acType));
    expect(
      getBookingDurationMinutes({
        unit_id: null,
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "split", systems: 2, additional: 1 },
          customer: { type: "split", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 45 + 1 * 15);
  });
});

describe("getEffectivePlacementForUnit — per-unit override wins", () => {
  it("inherits in_property when neither the building nor the unit override say otherwise", () => {
    setLiveBuildingsSource(() => TEST_BUILDINGS);
    setLiveUnitsSource(() => TEST_UNITS);
    expect(getEffectivePlacementForUnit("u-flat-default")).toEqual({
      kind: "in_property",
    });
  });

  it("inherits the building's rooftop placement (and overhead) without an override", () => {
    setLiveBuildingsSource(() => TEST_BUILDINGS);
    setLiveUnitsSource(() => TEST_UNITS);
    expect(getEffectivePlacementForUnit("u-tower-default")).toEqual({
      kind: "rooftop",
      overheadMinutes: 12,
    });
  });

  it("flips an in-property building's unit to rooftop when the override says so", () => {
    setLiveBuildingsSource(() => TEST_BUILDINGS);
    setLiveUnitsSource(() => TEST_UNITS);
    expect(getEffectivePlacementForUnit("u-flat-rooftop")).toEqual({
      kind: "rooftop",
      overheadMinutes: DEFAULT_ROOFTOP_OVERHEAD_MINUTES,
    });
  });

  it("flips a rooftop building's unit to in-property when the override says so", () => {
    setLiveBuildingsSource(() => TEST_BUILDINGS);
    setLiveUnitsSource(() => TEST_UNITS);
    expect(getEffectivePlacementForUnit("u-tower-flat")).toEqual({
      kind: "in_property",
    });
  });

  it("returns in_property for a null / unknown unit id", () => {
    setLiveBuildingsSource(() => TEST_BUILDINGS);
    setLiveUnitsSource(() => TEST_UNITS);
    expect(getEffectivePlacementForUnit(null)).toEqual({ kind: "in_property" });
    expect(getEffectivePlacementForUnit("does-not-exist")).toEqual({
      kind: "in_property",
    });
  });

  it("flows the override end-to-end into getBookingDurationMinutes", () => {
    installAdminLikeWiring();
    const flat = getBookingDurationMinutes({
      unit_id: "u-flat-default",
      num_systems: 2,
      num_additional_indoor: 0,
      ac_discrepancy: null,
    });
    const rooftop = getBookingDurationMinutes({
      unit_id: "u-flat-rooftop",
      num_systems: 2,
      num_additional_indoor: 0,
      ac_discrepancy: null,
    });
    expect(rooftop - flat).toBe(2 * DEFAULT_ROOFTOP_OVERHEAD_MINUTES);
  });
});

describe("resolver primitives — explicit per-acType wiring", () => {
  it("returns whatever the registered service rule resolver provides", () => {
    const stubRule: ServiceRule = { baseMinutes: 33, addonMinutes: 7 };
    const stubCtx: UnitDurationContext = {
      acType: "split",
      placement: { kind: "rooftop", overheadMinutes: 5 },
    };
    setServiceRuleResolver(() => stubRule);
    setUnitDurationContextResolver(() => stubCtx);
    expect(
      getBookingDurationMinutes({
        unit_id: "anything",
        num_systems: 3,
        num_additional_indoor: 2,
        ac_discrepancy: null,
      }),
    ).toBe(3 * 33 + 2 * 7 + 3 * 5);
  });
});

// ─── Admin-side `bookingDurationMinutes(b: AdminBooking)` ────────────────────
//
// The admin Bookings list + booking detail breakdown call this helper
// directly (it shares the catalogue + rooftop-overhead pipeline with
// the customer-flow `getBookingDurationMinutes`, but has its own
// `acType === "unsure"` short-circuit). These cases pin every branch
// the admin UI relies on so a future refactor of the catalogue or the
// `AdminBooking` shape can't silently shift the Duration column.

/** Build a minimal `AdminBooking` for duration tests. The fixture
 *  defaults to a paid, scheduled, owner-placed booking — every field
 *  the helper reads (`unitId`, `acType`, `systems`, `additional`) can
 *  be overridden via `over`. */
function makeAdminBooking(over: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: "bk-duration-test",
    unitId: "u-flat-default",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0400 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_live_at_unit",
    tenants: [],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: "2026-04-30",
    serviceSlot: "morning",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-29T09:00:00+10:00",
    lastContactedAt: null,
    ...over,
  };
}

describe("bookingDurationMinutes (admin) — catalogue + rooftop end-to-end", () => {
  it("returns the catalogue split base + addon for an in-property building unit", () => {
    installAdminLikeWiring();
    expect(
      bookingDurationMinutes(
        makeAdminBooking({
          unitId: "u-flat-default",
          acType: "split",
          systems: 2,
          additional: 1,
        }),
      ),
    ).toBe(2 * 50 + 1 * 20);
  });

  it("returns the catalogue ducted base + addon plus per-system rooftop overhead for a rooftop building unit", () => {
    installAdminLikeWiring();
    // `bldg-tower` is rooftop with rooftopOverheadMinutes: 12, so the
    // expected total is base + addon + (systems × 12).
    expect(
      bookingDurationMinutes(
        makeAdminBooking({
          unitId: "u-tower-default",
          acType: "ducted",
          systems: 2,
          additional: 1,
        }),
      ),
    ).toBe(2 * 80 + 1 * 25 + 2 * 12);
  });
});

describe("bookingDurationMinutes (admin) — `unsure` short-circuit", () => {
  it("returns UNSURE_FALLBACK_MINUTES regardless of systems / additional", () => {
    installAdminLikeWiring();
    // Pile on systems + additional values that would dwarf the
    // fallback if the short-circuit ever regressed.
    expect(
      bookingDurationMinutes(
        makeAdminBooking({
          unitId: "u-tower-default",
          acType: "unsure",
          systems: 5,
          additional: 7,
        }),
      ),
    ).toBe(UNSURE_FALLBACK_MINUTES);
    // …and on a rooftop unit, to lock down that the per-system
    // overhead surcharge isn't quietly added either.
    expect(
      bookingDurationMinutes(
        makeAdminBooking({
          unitId: "u-flat-rooftop",
          acType: "unsure",
          systems: 3,
          additional: 2,
        }),
      ),
    ).toBe(UNSURE_FALLBACK_MINUTES);
  });
});

describe("bookingDurationMinutes (admin) — per-unit outdoorPlacementOverride", () => {
  it("flips an in_property building's unit to rooftop end-to-end when the override says so", () => {
    installAdminLikeWiring();
    const inherited = bookingDurationMinutes(
      makeAdminBooking({
        unitId: "u-flat-default",
        acType: "split",
        systems: 2,
        additional: 0,
      }),
    );
    const overridden = bookingDurationMinutes(
      makeAdminBooking({
        // Same building (in_property), but this unit carries
        // outdoorPlacementOverride: "rooftop".
        unitId: "u-flat-rooftop",
        acType: "split",
        systems: 2,
        additional: 0,
      }),
    );
    expect(inherited).toBe(2 * 50);
    expect(overridden).toBe(2 * 50 + 2 * DEFAULT_ROOFTOP_OVERHEAD_MINUTES);
    expect(overridden - inherited).toBe(2 * DEFAULT_ROOFTOP_OVERHEAD_MINUTES);
  });

  it("flips a rooftop building's unit to in_property end-to-end when the override says so", () => {
    installAdminLikeWiring();
    const inherited = bookingDurationMinutes(
      makeAdminBooking({
        unitId: "u-tower-default",
        acType: "ducted",
        systems: 2,
        additional: 1,
      }),
    );
    const overridden = bookingDurationMinutes(
      makeAdminBooking({
        // Same building (rooftop, overhead 12), but this unit carries
        // outdoorPlacementOverride: "in_property".
        unitId: "u-tower-flat",
        acType: "ducted",
        systems: 2,
        additional: 1,
      }),
    );
    expect(inherited).toBe(2 * 80 + 1 * 25 + 2 * 12);
    expect(overridden).toBe(2 * 80 + 1 * 25);
  });
});
