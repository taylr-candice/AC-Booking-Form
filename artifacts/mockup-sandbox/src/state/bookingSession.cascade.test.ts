/**
 * Regression checks for cascade-clearing in `bookingSession.ts`.
 *
 * Three actions in `bookingActions` mutate state in non-obvious ways:
 *   - `setRole`              clears agency, residence, access method,
 *                            schedule, AND every Step-3 (Access)
 *                            follow-up.
 *   - `setPrimaryResidence`  clears access method, schedule, AND every
 *                            Step-3 (Access) follow-up.
 *   - `setAccessMethod`      clears every Step-3 (Access) follow-up;
 *                            clears the schedule when the new method
 *                            crosses the coordination boundary;
 *                            auto-advances the wrapper from Step 4
 *                            (Slots) → Step 5 (Pay) when the new method
 *                            is a coordination flow (Step 4 is hidden in
 *                            that case).
 *
 * These rules are the only thing stopping a returning user from
 * submitting answers from a previous selection (e.g. the tenants array
 * for an "owner + leased out + tenant" choice surviving a role flip to
 * "agent"). They have no UI surface — only the store enforces them — so
 * a silent regression here would ship straight to production. Tests
 * below pin down each rule.
 *
 * Implementation detail: the store keeps a single module-level `state`
 * variable, so we reset it between tests with `bookingActions.reset()`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bookingActions,
  COORDINATION_ACCESS_METHODS,
  getBookingSession,
  type AccessMethod,
  type Tenant,
} from "./bookingSession";

// ─── Test helpers ──────────────────────────────────────────────────────────

const SAMPLE_TENANT: Tenant = {
  first: "Alex",
  last: "Kim",
  email: "alex@example.com",
  phone: "+15551110000",
};

/**
 * Drive the store into a fully-populated state — every Step-3 (Access)
 * follow-up filled, plus a schedule selection — so we can prove that
 * subsequent cascade-clearing actually removes them rather than
 * coincidentally leaving them empty.
 */
function seedFullSession(opts: {
  access_method: AccessMethod;
  current_step?: 1 | 2 | 3 | 4 | 5;
}) {
  bookingActions.setUnit("unit-123");
  bookingActions.setRole("owner");
  bookingActions.setAgency("agency-1");
  bookingActions.setContact({
    contact_first_name: "Sam",
    contact_last_name: "Lee",
    contact_email: "sam@example.com",
    contact_phone: "+15551234567",
  });
  bookingActions.setSystems(2);
  bookingActions.setAdditionalIndoor(3);
  bookingActions.setPrimaryResidence("leased_out");
  bookingActions.setAccessMethod(opts.access_method);
  bookingActions.setKeyHolder({
    key_holder_name: "Jordan",
    key_holder_phone: "+15559998888",
  });
  bookingActions.setKeyCollectionLocation("Front desk concierge");
  bookingActions.setReturnMethod("locker");
  bookingActions.setManagingAgency("agency-managing-1");
  bookingActions.setTenants([SAMPLE_TENANT]);
  bookingActions.setSignature({
    signature_acknowledged: true,
    signature_name: "Sam Lee",
  });
  bookingActions.setAccessNotes("Side gate code is 1234");
  bookingActions.setSchedule("2026-05-10", "morning");
  if (opts.current_step !== undefined) {
    bookingActions.goToStep(opts.current_step);
  }
}

/** Assert every Step-3 (Access) follow-up is back to its empty / null default. */
function expectAccessFollowUpsCleared() {
  const s = getBookingSession();
  expect(s.key_holder_name).toBe("");
  expect(s.key_holder_phone).toBe("");
  expect(s.key_collection_location).toBe("");
  expect(s.return_method).toBeNull();
  expect(s.managing_agency_id).toBeNull();
  expect(s.tenants).toEqual([]);
  expect(s.signature_acknowledged).toBe(false);
  expect(s.signature_name).toBe("");
}

beforeEach(() => {
  bookingActions.reset();
});

afterEach(() => {
  bookingActions.reset();
});

// ─── setRole ───────────────────────────────────────────────────────────────

describe("bookingActions.setRole — cascade clearing", () => {
  it("wipes agency, residence, access method, schedule, and every Step-3 follow-up when the role changes", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });

    bookingActions.setRole("agent");
    const s = getBookingSession();

    // Role itself updated.
    expect(s.role).toBe("agent");

    // Everything that depends on role is gone.
    expect(s.agency_id).toBeNull();
    expect(s.primary_residence).toBeNull();
    expect(s.access_method).toBeNull();
    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
    expectAccessFollowUpsCleared();
  });

  it("preserves identity-level fields (unit, contact, system counts, access notes) when the role changes", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });

    bookingActions.setRole("agent");
    const s = getBookingSession();

    expect(s.unit_id).toBe("unit-123");
    expect(s.contact_first_name).toBe("Sam");
    expect(s.contact_last_name).toBe("Lee");
    expect(s.contact_email).toBe("sam@example.com");
    expect(s.contact_phone).toBe("+15551234567");
    expect(s.num_systems).toBe(2);
    expect(s.num_additional_indoor).toBe(3);
    // access_notes is intentionally independent of the cascade.
    expect(s.access_notes).toBe("Side gate code is 1234");
  });

  it("is a no-op when the role does not actually change (downstream answers are kept)", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });
    const before = getBookingSession();

    bookingActions.setRole("owner"); // same role
    const after = getBookingSession();

    // Reference equality proves the early-return path was hit (no new object).
    expect(after).toBe(before);
    // And the downstream answers are still intact.
    expect(after.tenants).toHaveLength(1);
    expect(after.signature_acknowledged).toBe(true);
    expect(after.service_date).toBe("2026-05-10");
  });

  it("does not change the wrapper's current_step (the role page itself decides where to go next)", () => {
    seedFullSession({ access_method: "owner_leased_tenant", current_step: 3 });

    bookingActions.setRole("agent");

    expect(getBookingSession().current_step).toBe(3);
  });
});

// ─── setPrimaryResidence ───────────────────────────────────────────────────

describe("bookingActions.setPrimaryResidence — cascade clearing", () => {
  it("clears access method, schedule, and every Step-3 follow-up when residence changes", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });

    bookingActions.setPrimaryResidence("vacant");
    const s = getBookingSession();

    expect(s.primary_residence).toBe("vacant");
    expect(s.access_method).toBeNull();
    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
    expectAccessFollowUpsCleared();
  });

  it("keeps role, agency, contact, and system counts (cascade stops above residence)", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });

    bookingActions.setPrimaryResidence("vacant");
    const s = getBookingSession();

    expect(s.role).toBe("owner");
    expect(s.agency_id).toBe("agency-1");
    expect(s.contact_email).toBe("sam@example.com");
    expect(s.num_systems).toBe(2);
    expect(s.num_additional_indoor).toBe(3);
    expect(s.unit_id).toBe("unit-123");
  });

  it("is a no-op when the residence does not change", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });
    const before = getBookingSession();

    bookingActions.setPrimaryResidence("leased_out"); // same residence
    const after = getBookingSession();

    expect(after).toBe(before);
    expect(after.tenants).toHaveLength(1);
    expect(after.access_method).toBe("owner_leased_tenant");
    expect(after.service_date).toBe("2026-05-10");
  });
});

// ─── setAccessMethod ───────────────────────────────────────────────────────

describe("bookingActions.setAccessMethod — cascade clearing", () => {
  it("clears every Step-3 follow-up when the access method changes", () => {
    seedFullSession({ access_method: "owner_leased_leave_key" });

    bookingActions.setAccessMethod("owner_leased_be_there");

    expect(getBookingSession().access_method).toBe("owner_leased_be_there");
    expectAccessFollowUpsCleared();
  });

  it("is a no-op when the same access method is re-selected", () => {
    seedFullSession({ access_method: "owner_leased_leave_key" });
    const before = getBookingSession();

    bookingActions.setAccessMethod("owner_leased_leave_key");

    expect(getBookingSession()).toBe(before);
  });

  it("keeps a previously chosen schedule when both the old and new methods are non-coordination", () => {
    seedFullSession({ access_method: "owner_leased_leave_key" });

    bookingActions.setAccessMethod("owner_leased_be_there");
    const s = getBookingSession();

    // Neither method is in COORDINATION_ACCESS_METHODS, so the boundary
    // wasn't crossed and the schedule survives.
    expect(s.service_date).toBe("2026-05-10");
    expect(s.service_slot).toBe("morning");
  });

  it("clears the schedule when switching from a non-coordination method into a coordination method", () => {
    seedFullSession({ access_method: "owner_leased_leave_key" });

    bookingActions.setAccessMethod("owner_leased_tenant");
    const s = getBookingSession();

    expect(COORDINATION_ACCESS_METHODS.has("owner_leased_tenant")).toBe(true);
    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
  });

  it("clears the schedule when switching from a coordination method back to a non-coordination method", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });
    // Coordination flow skips Step 4, but a returning user could still
    // have a stale schedule selection — re-add one to prove it's cleared.
    bookingActions.setSchedule("2026-05-10", "morning");

    bookingActions.setAccessMethod("owner_leased_leave_key");
    const s = getBookingSession();

    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
  });

  it("keeps the schedule when switching between two coordination methods (boundary not crossed)", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });
    bookingActions.setSchedule("2026-05-10", "morning");

    bookingActions.setAccessMethod("owner_leased_agent");
    const s = getBookingSession();

    expect(COORDINATION_ACCESS_METHODS.has("owner_leased_tenant")).toBe(true);
    expect(COORDINATION_ACCESS_METHODS.has("owner_leased_agent")).toBe(true);
    expect(s.service_date).toBe("2026-05-10");
    expect(s.service_slot).toBe("morning");
  });

  it("clears the schedule when the access method is set to null from a coordination method", () => {
    seedFullSession({ access_method: "owner_leased_tenant" });
    bookingActions.setSchedule("2026-05-10", "morning");

    bookingActions.setAccessMethod(null);
    const s = getBookingSession();

    // null counts as non-coordination, so the boundary is crossed.
    expect(s.access_method).toBeNull();
    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
  });

  it("does not clear access_notes (notes are independent of the per-method follow-ups)", () => {
    seedFullSession({ access_method: "owner_leased_leave_key" });

    bookingActions.setAccessMethod("owner_leased_tenant");

    expect(getBookingSession().access_notes).toBe("Side gate code is 1234");
  });
});

// ─── setAccessMethod: auto-jump Step 4 → Step 5 ───────────────────────────

describe("bookingActions.setAccessMethod — auto-advance from Step 4 to Step 5", () => {
  it("jumps the wrapper from Step 4 to Step 5 when the new method is a coordination flow (Step 4 becomes hidden)", () => {
    seedFullSession({
      access_method: "owner_leased_leave_key",
      current_step: 4,
    });

    bookingActions.setAccessMethod("owner_leased_tenant");

    expect(getBookingSession().current_step).toBe(5);
  });

  it("jumps to Step 5 for every coordination access method when the user is on Step 4", () => {
    for (const method of COORDINATION_ACCESS_METHODS) {
      bookingActions.reset();
      seedFullSession({
        access_method: "owner_leased_leave_key",
        current_step: 4,
      });

      bookingActions.setAccessMethod(method);

      expect(getBookingSession().current_step).toBe(5);
    }
  });

  it("does NOT change the wrapper step when switching to a non-coordination method on Step 4", () => {
    seedFullSession({
      access_method: "owner_leased_leave_key",
      current_step: 4,
    });

    bookingActions.setAccessMethod("owner_leased_be_there");

    expect(getBookingSession().current_step).toBe(4);
  });

  it("does NOT auto-jump when the user is not on Step 4, even if switching into a coordination method", () => {
    // E.g. user is editing access details from the Step 4 page that wraps
    // the access-method picker (Step 3 in some flows, Step 5 review, etc.).
    seedFullSession({
      access_method: "owner_leased_leave_key",
      current_step: 3,
    });

    bookingActions.setAccessMethod("owner_leased_tenant");

    expect(getBookingSession().current_step).toBe(3);
  });

  it("does NOT auto-jump when current_step is already past Step 4 (e.g. user on Step 5 swaps to a coordination method)", () => {
    seedFullSession({
      access_method: "owner_leased_leave_key",
      current_step: 5,
    });

    bookingActions.setAccessMethod("owner_leased_tenant");

    expect(getBookingSession().current_step).toBe(5);
  });

  it("does NOT auto-jump when the new method is null (even if user is on Step 4)", () => {
    seedFullSession({
      access_method: "owner_leased_leave_key",
      current_step: 4,
    });

    bookingActions.setAccessMethod(null);

    expect(getBookingSession().current_step).toBe(4);
  });
});
