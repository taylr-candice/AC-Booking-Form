// @vitest-environment happy-dom
/**
 * Customer-flow wiring for the Service catalogue's "other" entries
 * (Task #186).
 *
 * Covers:
 * - `bookingActions.toggleOtherService` / `setOtherServices` mutate
 *   the session as expected (toggle on/off, dedupe, preserve order).
 * - `getBookingDurationMinutes` adds Σ (baseMinutes + addonMinutes)
 *   per selected id once the lookup is registered.
 * - `computeBookingTotal` adds Σ (priceAud + addonPriceAud) per
 *   selected id, and silently drops stale ids the catalogue no
 *   longer knows about.
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

describe("bookingActions — selected_other_service_ids", () => {
  it("starts empty for a fresh session", () => {
    expect(getBookingSession().selected_other_service_ids).toEqual([]);
  });

  it("appends new ids in toggle order", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.toggleOtherService(KITCHEN.id);
    expect(getBookingSession().selected_other_service_ids).toEqual([
      BATHROOM.id,
      KITCHEN.id,
    ]);
  });

  it("removes an id when toggled off", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.toggleOtherService(KITCHEN.id);
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingSession().selected_other_service_ids).toEqual([
      KITCHEN.id,
    ]);
  });

  it("setOtherServices dedupes input while preserving first-seen order", () => {
    bookingActions.setOtherServices([
      KITCHEN.id,
      BATHROOM.id,
      KITCHEN.id,
    ]);
    expect(getBookingSession().selected_other_service_ids).toEqual([
      KITCHEN.id,
      BATHROOM.id,
    ]);
  });

  it("setOtherServices is a no-op when the new value matches", () => {
    bookingActions.setOtherServices([BATHROOM.id]);
    const before = getBookingSession();
    bookingActions.setOtherServices([BATHROOM.id]);
    const after = getBookingSession();
    // Under the happy-dom test env every `getBookingSession()` call
    // re-parses sessionStorage, so we cannot rely on object identity
    // to assert "nothing changed". Compare structural equality of
    // the slice the action is responsible for instead — that's the
    // observable contract callers rely on.
    expect(after.selected_other_service_ids).toEqual(
      before.selected_other_service_ids,
    );
    expect(after).toEqual(before);
  });
});

describe("getBookingDurationMinutes — Task #186 contribution", () => {
  it("matches the AC-only baseline when nothing is selected", () => {
    // Default 1 system + 0 extras = 45 minutes (legacy fallback —
    // the test runs with no service-rule resolver registered).
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("adds base + add-on minutes for one selected service", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    // 45 (baseline) + 30 (base) + 10 (add-on) = 85.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);
  });

  it("adds the sum of base + add-on minutes for multiple services", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.toggleOtherService(KITCHEN.id);
    // 45 + (30+10) + (20+5) = 110.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(110);
  });

  it("ignores stale ids the catalogue no longer knows about", () => {
    bookingActions.setOtherServices([BATHROOM.id, "svc-removed"]);
    // 45 + 40 (only bathroom resolves) = 85.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);
  });

  it("composes with the AC stepper inputs", () => {
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    bookingActions.toggleOtherService(KITCHEN.id);
    // 2*45 + 1*15 + (20+5) = 90 + 15 + 25 = 130.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(130);
  });
});

describe("computeBookingTotal — Task #186 contribution", () => {
  it("matches the AC-only baseline when nothing is selected", () => {
    // 1 system × $179 + 0 × $39 = $179.
    expect(computeBookingTotal(getBookingSession())).toBe(179);
  });

  it("adds the catalogue's base + add-on price per selected service", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    // $179 + $99 + $25 = $303.
    expect(computeBookingTotal(getBookingSession())).toBe(303);
  });

  it("adds the sum across multiple selected services", () => {
    bookingActions.toggleOtherService(BATHROOM.id);
    bookingActions.toggleOtherService(KITCHEN.id);
    // $179 + ($99 + $25) + ($60 + $15) = $378.
    expect(computeBookingTotal(getBookingSession())).toBe(378);
  });

  it("silently drops stale ids", () => {
    bookingActions.setOtherServices(["svc-removed", BATHROOM.id]);
    // $179 + ($99 + $25) = $303 (svc-removed is ignored).
    expect(computeBookingTotal(getBookingSession())).toBe(303);
  });

  it("composes with the AC stepper inputs", () => {
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    bookingActions.toggleOtherService(KITCHEN.id);
    // 2*$179 + 1*$39 + ($60 + $15) = $358 + $39 + $75 = $472.
    expect(computeBookingTotal(getBookingSession())).toBe(472);
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
    bookingActions.toggleOtherService(BATHROOM.id);
    // 45 (AC default) + 30 + 10 = 85.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);
    // $179 (AC default) + $99 + $25 = $303.
    expect(computeBookingTotal(getBookingSession())).toBe(303);
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
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);

    // Ops edits the catalogue — bumps base minutes from 30 to 50.
    writeLiveOtherServices([{ ...BATHROOM, baseMinutes: 50 }]);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(105);

    // Ops removes the entry entirely; the customer's stale id is
    // dropped silently and the AC-default baseline is restored.
    writeLiveOtherServices([]);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("writeLiveOtherServices(null) clears the storage key", () => {
    writeLiveOtherServices([BATHROOM]);
    bookingActions.toggleOtherService(BATHROOM.id);
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);

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
  // (untrustworthy) num_systems. But the customer can ALSO toggle on
  // "other" services in unsure mode — those have deterministic
  // catalogue minutes that don't depend on the AC head count, so
  // they must still be added to the unsure baseline. Otherwise the
  // slot picker would size the slot to 45 minutes while the tech
  // actually has e.g. 45 + 30 + 10 = 85 minutes of work to do.

  function markAcUnsure(): void {
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 1, additional: 0 },
      customer: { type: "unsure" },
    });
  }

  it("adds Σ(base+addon) for selected other services to the unsure baseline", () => {
    markAcUnsure();
    bookingActions.toggleOtherService(BATHROOM.id);
    // 45 (unsure fallback) + 30 + 10 = 85.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(85);
  });

  it("returns the bare unsure fallback when no other services are selected", () => {
    markAcUnsure();
    expect(getBookingDurationMinutes(getBookingSession())).toBe(45);
  });

  it("composes multiple other services in unsure mode", () => {
    markAcUnsure();
    bookingActions.setOtherServices([BATHROOM.id, KITCHEN.id]);
    // 45 + (30+10) + (20+5) = 110.
    expect(getBookingDurationMinutes(getBookingSession())).toBe(110);
  });
});
