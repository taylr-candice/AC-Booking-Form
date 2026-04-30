// @vitest-environment happy-dom
/**
 * Customer-flow wiring for the Service catalogue's "other" entries
 * (Task #186 + Task #201 quantity rollup).
 *
 * Covers:
 * - `bookingActions.toggleOtherService` /
 *   `bookingActions.setOtherServiceQuantity` /
 *   `bookingActions.setOtherServices` mutate the
 *   `other_service_quantities` map as expected (toggle on/off,
 *   stepper bump, dedupe, preserve insertion order, clamp 0..99).
 * - `getBookingDurationMinutes` adds
 *   `baseMinutes × qty + addonMinutes × (qty − 1)` minutes per
 *   selected id once the lookup is registered.
 * - `computeBookingTotal` adds
 *   `priceAud × qty + addonPriceAud × (qty − 1)` per selected id,
 *   and silently drops stale ids the catalogue no longer knows
 *   about.
 * - `migratePersistedSession` upgrades pre-Task-#201 blobs that
 *   stored `selected_other_service_ids: string[]` into the new
 *   quantity map (each id promoted to qty 1).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type OtherServiceRule,
  getBookingDurationMinutes,
  setOtherServiceLookup,
} from "./bookingDerived";
import { computeBookingTotal } from "./bookingHelpers";
import {
  bookingActions,
  getBookingSession,
  migratePersistedSession,
} from "./bookingSession";
import {
  LIVE_OTHER_SERVICES_STORAGE_KEY,
  writeLiveOtherServices,
} from "./liveOtherServices";

const BATHROOM: OtherServiceRule = {
  id: "svc-bath",
  name: "Bathroom extraction service",
  baseMinutes: 30,
  addonMinutes: 10,
  priceAud: 99,
  addonPriceAud: 25,
  appliesToNote: "applies to: bathroom extraction",
  addonLabel: "additional bathroom",
};

const KITCHEN: OtherServiceRule = {
  id: "svc-kitchen",
  name: "Kitchen rangehood clean",
  baseMinutes: 20,
  addonMinutes: 5,
  priceAud: 60,
  addonPriceAud: 15,
  addonLabel: "additional rangehood",
};

const RULES: Record<string, OtherServiceRule> = {
  [BATHROOM.id]: BATHROOM,
  [KITCHEN.id]: KITCHEN,
};

beforeEach(() => {
  bookingActions.reset();
  // Tests in this file install a custom in-process resolver so we
  // don't need to seed sessionStorage. Production wiring goes
  // through sessionStorage (see the cross-iframe test below); the
  // resolver-override path remains available for unit tests that
  // don't need the storage round-trip.
  setOtherServiceLookup((id) => RULES[id] ?? null);
  // Defensive: clear any catalogue blob a previous test might have
  // written so the storage-backed default starts from zero.
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(LIVE_OTHER_SERVICES_STORAGE_KEY);
  }
});

afterEach(() => {
  bookingActions.reset();
  setOtherServiceLookup(null);
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(LIVE_OTHER_SERVICES_STORAGE_KEY);
  }
});

describe("bookingActions — other_service_quantities", () => {
  it("starts empty for a fresh session", () => {
    expect(getBookingSession().other_service_quantities).toEqual({});
  });

  it("toggleOtherService appends new ids at qty 1 in toggle order", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.toggleOtherService(KITCHEN.id);
    const map = getBookingSession().other_service_quantities;
    expect(map).toEqual({ [BATHROOM.id]: 1, [KITCHEN.id]: 1 });
    // Insertion order matters for the price card row order.
    expect(Object.keys(map)).toEqual([BATHROOM.id, KITCHEN.id]);
  });

  it("toggleOtherService removes the id (regardless of qty) on the second tap", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 4);
    bookingActions.toggleOtherService(KITCHEN.id);
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingSession().other_service_quantities).toEqual({
      [KITCHEN.id]: 1,
    });
  });

  it("setOtherServiceQuantity creates / updates entries and preserves insertion order", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 1);
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 5);
    const map = getBookingSession().other_service_quantities;
    expect(map).toEqual({ [BATHROOM.id]: 5, [KITCHEN.id]: 1 });
    expect(Object.keys(map)).toEqual([BATHROOM.id, KITCHEN.id]);
  });

  it("setOtherServiceQuantity(_, 0) removes the entry without disturbing siblings", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 3);
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 0);
    expect(getBookingSession().other_service_quantities).toEqual({
      [KITCHEN.id]: 3,
    });
  });

  it("setOtherServiceQuantity clamps to 0..99 and floors floats", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, -5);
    expect(getBookingSession().other_service_quantities).toEqual({});

    bookingActions.setOtherServiceQuantity(BATHROOM.id, 250);
    expect(getBookingSession().other_service_quantities).toEqual({
      [BATHROOM.id]: 99,
    });

    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2.7);
    expect(getBookingSession().other_service_quantities).toEqual({
      [BATHROOM.id]: 2,
    });
  });

  describe("setOtherServiceQuantity per-service maxQty", () => {
    it("clamps to the rule's maxQty when set", () => {
      writeLiveOtherServices([{ ...BATHROOM, maxQty: 4 }]);
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 20);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 4,
      });
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 3);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 3,
      });
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 99);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 4,
      });
    });

    it("falls back to the global 99 ceiling when the rule has no maxQty", () => {
      writeLiveOtherServices([BATHROOM]);
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 250);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 99,
      });
    });

    it("falls back to the global 99 ceiling for stale / unknown ids", () => {
      bookingActions.setOtherServiceQuantity("svc-mystery", 250);
      expect(
        getBookingSession().other_service_quantities["svc-mystery"],
      ).toBe(99);
    });

    it("treats a non-positive maxQty as missing and uses the global ceiling", () => {
      writeLiveOtherServices([{ ...BATHROOM, maxQty: 0 }]);
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 50);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 50,
      });
    });

    it("floors a non-integer maxQty before clamping", () => {
      writeLiveOtherServices([{ ...BATHROOM, maxQty: 4.7 }]);
      bookingActions.setOtherServiceQuantity(BATHROOM.id, 10);
      expect(getBookingSession().other_service_quantities).toEqual({
        [BATHROOM.id]: 4,
      });
    });
  });

  it("setOtherServices accepts a string array (each id promoted to qty 1, dedup'd)", () => {
    bookingActions.setOtherServices([
      KITCHEN.id,
      BATHROOM.id,
      KITCHEN.id,
    ]);
    const map = getBookingSession().other_service_quantities;
    expect(map).toEqual({ [KITCHEN.id]: 1, [BATHROOM.id]: 1 });
    expect(Object.keys(map)).toEqual([KITCHEN.id, BATHROOM.id]);
  });

  it("setOtherServices accepts a quantity map and drops non-positive entries", () => {
    bookingActions.setOtherServices({
      [BATHROOM.id]: 3,
      [KITCHEN.id]: 0,
      "svc-noise": -1,
    });
    expect(getBookingSession().other_service_quantities).toEqual({
      [BATHROOM.id]: 3,
    });
  });

  it("setOtherServices is a no-op when the new value matches", () => {
    bookingActions.setOtherServices({ [BATHROOM.id]: 2 });
    const before = getBookingSession();
    bookingActions.setOtherServices({ [BATHROOM.id]: 2 });
    const after = getBookingSession();
    // Under happy-dom every `getBookingSession()` call re-parses
    // sessionStorage, so we cannot rely on object identity to
    // assert "nothing changed". Compare structural equality of the
    // slice the action is responsible for instead — that's the
    // observable contract callers rely on.
    expect(after.other_service_quantities).toEqual(
      before.other_service_quantities,
    );
    expect(after).toEqual(before);
  });
});

describe("getBookingDurationMinutes — Task #201 quantity contribution", () => {
  it("matches the AC-only baseline when nothing is selected", () => {
    // Default 1 system + 0 extras = 45 minutes (legacy fallback —
    // the test runs with no service-rule resolver registered).
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("adds baseMinutes for qty 1 (no add-on at qty 1)", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    // 45 (baseline) + 30 (base × 1) + 10 × 0 = 75.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(75);
  });

  it("adds base × qty + addon × (qty − 1) for qty 2", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    // 45 + (30*2 + 10*1) = 45 + 70 = 115.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(115);
  });

  it("adds base × qty + addon × (qty − 1) for qty 3", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 3);
    // 45 + (30*3 + 10*2) = 45 + 110 = 155.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(155);
  });

  it("sums minutes across multiple services with mixed quantities", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 1);
    // 45 + (30*2 + 10*1) + (20*1 + 5*0) = 45 + 70 + 20 = 135.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(135);
  });

  it("ignores stale ids the catalogue no longer knows about", () => {
    bookingActions.setOtherServices({
      [BATHROOM.id]: 1,
      "svc-removed": 4,
    });
    // 45 + (30*1 + 10*0) = 75.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(75);
  });

  it("composes with the AC stepper inputs", () => {
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 2);
    // 2*45 + 1*15 + (20*2 + 5*1) = 90 + 15 + 45 = 150.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(150);
  });
});

describe("computeBookingTotal — Task #201 quantity contribution", () => {
  it("matches the AC-only baseline when nothing is selected", () => {
    // 1 system × $179 + 0 × $39 = $179.
    expect(computeBookingTotal(getBookingSession())).toBe(179);
  });

  it("adds the catalogue's base price for qty 1 (no add-on at qty 1)", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    // $179 + $99 + $25*0 = $278.
    expect(computeBookingTotal(getBookingSession())).toBe(278);
  });

  it("adds base × qty + addon × (qty − 1) for qty 2", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    // $179 + ($99*2 + $25*1) = $179 + $223 = $402.
    expect(computeBookingTotal(getBookingSession())).toBe(402);
  });

  it("adds base × qty + addon × (qty − 1) for qty 3", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 3);
    // $179 + ($99*3 + $25*2) = $179 + $347 = $526.
    expect(computeBookingTotal(getBookingSession())).toBe(526);
  });

  it("sums the price across multiple services with mixed quantities", () => {
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 1);
    // $179 + ($99*2 + $25*1) + ($60*1 + $15*0)
    //  = $179 + $223 + $60 = $462.
    expect(computeBookingTotal(getBookingSession())).toBe(462);
  });

  it("silently drops stale ids", () => {
    bookingActions.setOtherServices({
      "svc-removed": 5,
      [BATHROOM.id]: 1,
    });
    // $179 + $99 = $278.
    expect(computeBookingTotal(getBookingSession())).toBe(278);
  });

  it("composes with the AC stepper inputs", () => {
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    bookingActions.setOtherServiceQuantity(KITCHEN.id, 3);
    // 2*$179 + 1*$39 + ($60*3 + $15*2) = $358 + $39 + $210 = $607.
    expect(computeBookingTotal(getBookingSession())).toBe(607);
  });
});

describe("cross-iframe sessionStorage bridge (mirrors AdminApp ↔ booking iframe)", () => {
  // The customer booking flow renders each step inside an `<iframe>`
  // (see `BookingFlow{Mobile,Desktop}.tsx`). Module-level state from
  // `AdminApp`'s parent frame is invisible there, so the live "other"
  // services list must travel via sessionStorage — which IS shared
  // across same-origin iframes. These tests assert the storage-backed
  // default lookup behaves correctly without any in-process resolver
  // override, which is exactly what the iframe sees.

  beforeEach(() => {
    // Drop the in-process resolver `beforeEach` installed so we
    // exercise the sessionStorage-backed default path the iframe
    // hits in production.
    setOtherServiceLookup(null);
  });

  it("reads catalogue entries the parent frame wrote to sessionStorage", () => {
    writeLiveOtherServices([BATHROOM, KITCHEN]);
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    // 45 (AC default) + (30*2 + 10*1) = 115.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(115);
    // $179 (AC default) + ($99*2 + $25*1) = $402.
    expect(computeBookingTotal(getBookingSession())).toBe(402);
  });

  it("returns the AC-default duration / total when the bridge is empty", () => {
    // No `writeLiveOtherServices` call — sessionStorage is clean.
    bookingActions.toggleOtherService(BATHROOM.id);
    // The id is selected but the storage-backed lookup can't resolve
    // it, so it's silently dropped. The duration / total stay at the
    // AC-default baseline rather than crashing the booking flow.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
    expect(computeBookingTotal(getBookingSession())).toBe(179);
  });

  it("re-reads sessionStorage on every call so admin edits flow live", () => {
    writeLiveOtherServices([BATHROOM]);
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    // 45 + (30*2 + 10*1) = 115.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(115);

    // Ops edits the catalogue — bumps base minutes from 30 to 50.
    writeLiveOtherServices([{ ...BATHROOM, baseMinutes: 50 }]);
    // 45 + (50*2 + 10*1) = 155.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(155);

    // Ops removes the entry entirely; the customer's stale qty is
    // dropped silently and the AC-default baseline is restored.
    writeLiveOtherServices([]);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("writeLiveOtherServices(null) clears the storage key", () => {
    writeLiveOtherServices([BATHROOM]);
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(75);

    writeLiveOtherServices(null);
    expect(
      window.sessionStorage.getItem(LIVE_OTHER_SERVICES_STORAGE_KEY),
    ).toBeNull();
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("ignores corrupt sessionStorage payloads", () => {
    window.sessionStorage.setItem(
      LIVE_OTHER_SERVICES_STORAGE_KEY,
      "not valid json {[",
    );
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });
});

describe("unsure-AC fallback still includes selected other-service minutes", () => {
  // When the customer answers "I'm not sure" on the AC step,
  // `getBookingDurationMinutes` falls back to UNSURE_FALLBACK_MINUTES
  // (= MINUTES_PER_SYSTEM = 45) instead of multiplying by the
  // (untrustworthy) num_systems. But the customer can ALSO set
  // quantities for "other" services in unsure mode — those have
  // deterministic catalogue minutes that don't depend on the AC head
  // count, so they must still be added to the unsure baseline.
  // Otherwise the slot picker would size the slot to 45 minutes
  // while the tech actually has a longer queue of work to do.

  function markAcUnsure(): void {
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 1, additional: 0 },
      customer: { type: "unsure" },
    });
  }

  it("adds qty-aware minutes for selected other services to the unsure baseline", () => {
    markAcUnsure();
    bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
    // 45 (unsure fallback) + (30*2 + 10*1) = 115.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(115);
  });

  it("returns the bare unsure fallback when no other services are selected", () => {
    markAcUnsure();
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("composes multiple other services with mixed quantities in unsure mode", () => {
    markAcUnsure();
    bookingActions.setOtherServices({
      [BATHROOM.id]: 1,
      [KITCHEN.id]: 2,
    });
    // 45 + (30*1 + 10*0) + (20*2 + 5*1) = 45 + 30 + 45 = 120.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(120);
  });
});

describe("migratePersistedSession — schema 4 quantity rename", () => {
  // Pre-Task-#201 sessions persisted "other" service selections as
  // `selected_other_service_ids: string[]`. The schema 4 migration
  // promotes each id to qty 1 in the new
  // `other_service_quantities` map and drops the legacy field.
  // These tests assert the migration is lossless for the common
  // case and tolerant of corruption.

  it("promotes a legacy id array to qty-1 entries (schema bumped from 3)", () => {
    const blob = JSON.stringify({
      __schema: 3,
      current_step: 2,
      selected_other_service_ids: [BATHROOM.id, KITCHEN.id],
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({
      [BATHROOM.id]: 1,
      [KITCHEN.id]: 1,
    });
    // Insertion order = legacy array order — the price card and
    // stepper section both depend on it.
    expect(Object.keys(out.other_service_quantities)).toEqual([
      BATHROOM.id,
      KITCHEN.id,
    ]);
    // Schema 3 already passed the step down-shift, so step 2 is
    // preserved verbatim (not re-shifted to step 1).
    expect(out.current_step).toBe(2);
    // The legacy field MUST be stripped off the returned state —
    // anything left would leak through `...rest` into the runtime
    // session and confuse downstream consumers.
    expect(
      (out as unknown as { selected_other_service_ids?: unknown })
        .selected_other_service_ids,
    ).toBeUndefined();
  });

  it("starts empty when a pre-Task-#186 blob has no field at all", () => {
    const blob = JSON.stringify({
      __schema: 3,
      current_step: 1,
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({});
  });

  it("dedupes and skips non-string ids in the legacy array", () => {
    const blob = JSON.stringify({
      __schema: 3,
      selected_other_service_ids: [
        BATHROOM.id,
        BATHROOM.id,
        "",
        null,
        42,
        KITCHEN.id,
      ],
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({
      [BATHROOM.id]: 1,
      [KITCHEN.id]: 1,
    });
  });

  it("preserves an already-current quantity map at schema 4 (no double migration)", () => {
    const blob = JSON.stringify({
      __schema: 4,
      other_service_quantities: { [BATHROOM.id]: 3, [KITCHEN.id]: 2 },
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({
      [BATHROOM.id]: 3,
      [KITCHEN.id]: 2,
    });
  });

  it("normalises a corrupt quantity map at schema 4 (drops non-positive / non-numeric)", () => {
    const blob = JSON.stringify({
      __schema: 4,
      other_service_quantities: {
        [BATHROOM.id]: 2,
        [KITCHEN.id]: 0,
        "svc-noise": "lots",
        "svc-neg": -3,
      },
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({
      [BATHROOM.id]: 2,
    });
  });

  it("ignores a stale quantity-map field on a pre-schema-4 blob and uses the legacy array", () => {
    // A legacy schema-3 blob shouldn't be carrying a quantity map,
    // but if some test fixture or hand-edit produced one we must
    // still trust the legacy array (the schema gate is the source
    // of truth for which field is canonical).
    const blob = JSON.stringify({
      __schema: 3,
      selected_other_service_ids: [BATHROOM.id],
      other_service_quantities: { [KITCHEN.id]: 99 },
    });
    const out = migratePersistedSession(blob);
    expect(out.other_service_quantities).toEqual({
      [BATHROOM.id]: 1,
    });
  });
});
