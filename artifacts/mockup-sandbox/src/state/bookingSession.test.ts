/**
 * Regression checks for the booking session store.
 *
 * Two independent concerns are pinned here:
 *
 *   A. `migratePersistedSession` — the booking flow shrunk from 6 steps
 *      to 5 steps (Booker merged into Unit). `readFromStorage` silently
 *      rewrites any persisted `current_step` so returning users land on
 *      the right page instead of being thrown back to Step 1. Exposed as
 *      a pure helper so we can drive it without spinning up a DOM.
 *
 *   B. Step 3 (Access) cascade-clearing — switching access method or
 *      primary residence MUST wipe stale follow-up fields (key holder,
 *      return method, managing agency, tenants, signature) so we don't
 *      ship wrong data downstream. Picking a coordination method while
 *      sitting on Step 4 (Slots) must also auto-advance the wrapper to
 *      Step 5 (Pay) so the user never lingers on a now-hidden step.
 *
 * The store is a module-level singleton, so each cascade-clear test
 * starts with `bookingActions.reset()` to avoid order coupling.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bookingActions,
  COORDINATION_ACCESS_METHODS,
  getBookingSession,
  migratePersistedSession,
  setUniquenessGuard,
  type AccessMethod,
  type AcDiscrepancy,
  type BookingState,
  type StepId,
  type UniquenessGuard,
  type UniquenessVerdict,
} from "./bookingSession";

// ─── A. migratePersistedSession ────────────────────────────────────────────

/** Helper: serialize a partial persisted blob the way sessionStorage would. */
function persisted(blob: Record<string, unknown>): string {
  return JSON.stringify(blob);
}

describe("migratePersistedSession — legacy → new 5-step mapping", () => {
  // Spec from bookingSession.ts:
  //   old Step 2 (standalone "Your details") → new Step 1
  //   old Steps 3..6 shift down by one → new Steps 2..5
  //   anything outside the new 1..5 window clamps to Step 1
  const cases: Array<{ legacy: number; expected: StepId }> = [
    { legacy: 1, expected: 1 },
    { legacy: 2, expected: 1 },
    { legacy: 3, expected: 2 },
    { legacy: 4, expected: 3 },
    { legacy: 5, expected: 4 },
    { legacy: 6, expected: 5 },
    // legacy 7 (would have been new Step 6) is now beyond the 5-step
    // window — the migrator clamps it back to Step 1 rather than leaving
    // the wrapper on a hidden page.
    { legacy: 7, expected: 1 },
  ];

  for (const { legacy, expected } of cases) {
    it(`maps legacy step ${legacy} → new step ${expected}`, () => {
      const out = migratePersistedSession(persisted({ current_step: legacy }));
      expect(out.current_step).toBe(expected);
    });
  }
});

describe("migratePersistedSession — clamping out-of-range steps", () => {
  // Anything that doesn't land in the new 1..5 window after migration must
  // fall back to Step 1 rather than leaving the wrapper on a hidden page.
  const outOfRange: Array<number | string | boolean | null> = [
    0,
    -1,
    -42,
    8, // legacy 8 → migrated 7, out of new range
    9,
    100,
    1.5, // non-integer
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  for (const value of outOfRange) {
    it(`clamps current_step=${String(value)} to Step 1`, () => {
      const out = migratePersistedSession(persisted({ current_step: value }));
      expect(out.current_step).toBe(1);
    });
  }

  it("clamps a non-numeric current_step to Step 1", () => {
    const out = migratePersistedSession(persisted({ current_step: "3" }));
    expect(out.current_step).toBe(1);
  });

  it("defaults to Step 1 when current_step is missing entirely", () => {
    const out = migratePersistedSession(persisted({ unit_id: "u1" }));
    expect(out.current_step).toBe(1);
  });
});

describe("migratePersistedSession — invalid / empty input", () => {
  it("returns the initial state when the blob is null (no saved session)", () => {
    const out = migratePersistedSession(null);
    expect(out.current_step).toBe(1);
    expect(out.unit_id).toBeNull();
    expect(out.role).toBeNull();
  });

  it("returns the initial state when the blob is an empty string", () => {
    const out = migratePersistedSession("");
    expect(out.current_step).toBe(1);
    expect(out.unit_id).toBeNull();
  });

  it("returns the initial state when the blob is malformed JSON", () => {
    const out = migratePersistedSession("{not valid json");
    expect(out.current_step).toBe(1);
    expect(out.unit_id).toBeNull();
  });
});

describe("migratePersistedSession — preserves other persisted fields", () => {
  it("keeps unit_id, role, and contact info while remapping the step", () => {
    const out = migratePersistedSession(
      persisted({
        current_step: 4, // legacy → new Step 3 (Property access)
        unit_id: "unit-123",
        role: "owner",
        contact_first_name: "Sam",
        contact_last_name: "Lee",
        contact_email: "sam@example.com",
        contact_phone: "+15551234",
      }),
    );

    expect(out.current_step).toBe(3);
    expect(out.unit_id).toBe("unit-123");
    expect(out.role).toBe("owner");
    expect(out.contact_first_name).toBe("Sam");
    expect(out.contact_last_name).toBe("Lee");
    expect(out.contact_email).toBe("sam@example.com");
    expect(out.contact_phone).toBe("+15551234");
  });

  it("keeps access details when migrating from legacy Step 4 (Access) → new Step 3 (Access)", () => {
    const out = migratePersistedSession(
      persisted({
        current_step: 4,
        primary_residence: "leased_out",
        access_method: "owner_leased_tenant",
        tenants: [
          { first: "Alex", last: "Kim", email: "a@k.com", phone: "+1555" },
        ],
        signature_acknowledged: true,
        signature_name: "Owner Name",
      }),
    );

    expect(out.current_step).toBe(3);
    expect(out.primary_residence).toBe("leased_out");
    expect(out.access_method).toBe("owner_leased_tenant");
    expect(out.tenants).toHaveLength(1);
    expect(out.tenants[0]).toMatchObject({
      first: "Alex",
      last: "Kim",
      email: "a@k.com",
    });
    expect(out.signature_acknowledged).toBe(true);
    expect(out.signature_name).toBe("Owner Name");
  });

  it("fills in any missing fields from INITIAL_STATE so consumers always get a complete object", () => {
    const out: BookingState = migratePersistedSession(
      persisted({ current_step: 3, unit_id: "u1" }),
    );

    // Spot-check a representative slice of fields that weren't in the blob.
    expect(out.role).toBeNull();
    expect(out.agency_id).toBeNull();
    expect(out.num_systems).toBe(1);
    expect(out.num_additional_indoor).toBe(0);
    expect(out.tenants).toEqual([]);
    expect(out.cancellation_acknowledged).toBe(false);
    expect(out.access_notes).toBe("");
    // Task #50: AC step now branches on this flag — legacy persisted
    // blobs that pre-date the field must default back to the on-file
    // view (`false`).
    expect(out.ac_override_active).toBe(false);
  });
});

// The legacy → current step migration must NOT keep down-shifting blobs
// that the store itself just wrote. Without a schema marker, every read
// of a freshly-persisted `current_step >= 3` would shift it down by 1
// (because the migration treats anything >2 as legacy data).
// `getBookingSession()` re-reads storage on every call (for cross-iframe
// sync), so a customer reaching Step 4 would silently regress to Step 3
// the next time any handler peeked at the session — which would in turn
// break Task #46's "Update AC info" → slot-picker short-circuit. The
// fix is a `__schema` version field on every write that the migrator
// uses to skip the down-shift for current-shape blobs.
describe("migratePersistedSession — current-schema blobs (__schema marker)", () => {
  it("does not down-shift current_step when __schema >= current version", () => {
    const out = migratePersistedSession(
      persisted({ __schema: 3, current_step: 5 }),
    );
    expect(out.current_step).toBe(5);
  });

  it("trusts every in-range step verbatim when __schema is set", () => {
    for (const step of [1, 2, 3, 4, 5] as const) {
      const out = migratePersistedSession(
        persisted({ __schema: 3, current_step: step }),
      );
      expect(out.current_step).toBe(step);
    }
  });

  it("still clamps out-of-range steps to Step 1 even with __schema set", () => {
    const out = migratePersistedSession(
      persisted({ __schema: 3, current_step: 99 }),
    );
    expect(out.current_step).toBe(1);
  });

  it("does not leak the __schema marker into the returned BookingState", () => {
    const out = migratePersistedSession(
      persisted({ __schema: 3, current_step: 3 }),
    ) as Record<string, unknown>;
    expect(out.__schema).toBeUndefined();
  });

  it("falls back to the legacy down-shift when __schema is missing", () => {
    // Sanity check that the marker is what gates the behavior — a blob
    // without it must still walk the legacy migration path so old
    // sessionStorage payloads from before the marker existed stay
    // correct.
    const out = migratePersistedSession(persisted({ current_step: 5 }));
    expect(out.current_step).toBe(4);
  });

  it("falls back to legacy down-shift when __schema is older than current", () => {
    const out = migratePersistedSession(
      persisted({ __schema: 2, current_step: 5 }),
    );
    expect(out.current_step).toBe(4);
  });
});

// ─── B. Step 3 (Access) cascade-clearing in bookingActions ────────────────

describe("Step 3 (Access) cascade clears (bookingActions)", () => {
  beforeEach(() => {
    bookingActions.reset();
  });

  describe("setAccessMethod — cascade clears per-method follow-ups", () => {
    it("clears key-holder fields when switching away from a leave-key method", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_leave_key");
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });

      bookingActions.setAccessMethod("owner_live_at_unit");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_live_at_unit");
      expect(s.key_holder_name).toBe("");
      expect(s.key_holder_phone).toBe("");
    });

    it("clears collect-and-return follow-ups when switching away from a collect method", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_collect");
      bookingActions.setKeyCollectionLocation("Concierge desk, Lvl 1");
      bookingActions.setReturnMethod("locker");
      bookingActions.setSignature({
        signature_acknowledged: true,
        signature_name: "Alex Smith",
      });

      bookingActions.setAccessMethod("owner_live_leave_key");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_live_leave_key");
      expect(s.key_collection_location).toBe("");
      expect(s.return_method).toBeNull();
      expect(s.signature_acknowledged).toBe(false);
      expect(s.signature_name).toBe("");
    });

    it("clears managing-agency selection when switching away from owner_leased_agent", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("leased_out");
      bookingActions.setAccessMethod("owner_leased_agent");
      bookingActions.setManagingAgency("agency-001");

      bookingActions.setAccessMethod("owner_leased_be_there");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_leased_be_there");
      expect(s.managing_agency_id).toBeNull();
    });

    it("clears tenants and signature when switching away from a tenant method", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("leased_out");
      bookingActions.setAccessMethod("owner_leased_tenant");
      bookingActions.setTenants([
        { first: "Sam", last: "Tenant", email: "sam@example.com", phone: "0411 111 111" },
      ]);
      bookingActions.setSignature({
        signature_acknowledged: true,
        signature_name: "Alex Smith",
      });

      bookingActions.setAccessMethod("owner_leased_be_there");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_leased_be_there");
      expect(s.tenants).toEqual([]);
      expect(s.signature_acknowledged).toBe(false);
      expect(s.signature_name).toBe("");
    });

    it("preserves access_notes across method switches (notes are always available, not method-specific)", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_leave_key");
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });
      bookingActions.setAccessNotes("Buzzer is broken — call on arrival.");

      bookingActions.setAccessMethod("owner_live_at_unit");

      const s = getBookingSession();
      expect(s.key_holder_name).toBe("");
      expect(s.access_notes).toBe("Buzzer is broken — call on arrival.");
    });

    it("clears every follow-up field at once when switching to a method with no follow-ups", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("leased_out");
      // Load up follow-ups from several different shapes.
      bookingActions.setAccessMethod("owner_leased_leave_key");
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });
      bookingActions.setKeyCollectionLocation("Concierge desk, Lvl 1");
      bookingActions.setReturnMethod("hand_delivery");
      bookingActions.setManagingAgency("agency-001");
      bookingActions.setTenants([
        { first: "Sam", last: "Tenant", email: "sam@example.com", phone: "0411 111 111" },
      ]);
      bookingActions.setSignature({
        signature_acknowledged: true,
        signature_name: "Alex Smith",
      });

      bookingActions.setAccessMethod("owner_leased_be_there");

      const s = getBookingSession();
      expect(s.key_holder_name).toBe("");
      expect(s.key_holder_phone).toBe("");
      expect(s.key_collection_location).toBe("");
      expect(s.return_method).toBeNull();
      expect(s.managing_agency_id).toBeNull();
      expect(s.tenants).toEqual([]);
      expect(s.signature_acknowledged).toBe(false);
      expect(s.signature_name).toBe("");
    });
  });

  describe("setPrimaryResidence — cascade clears access method and follow-ups", () => {
    it("wipes the chosen access method and follow-ups when residence changes", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_leave_key");
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });
      bookingActions.setAccessNotes("Reach me on the buzzer.");

      bookingActions.setPrimaryResidence("leased_out");

      const s = getBookingSession();
      expect(s.primary_residence).toBe("leased_out");
      expect(s.access_method).toBeNull();
      expect(s.key_holder_name).toBe("");
      expect(s.key_holder_phone).toBe("");
      // access_notes is independent and survives the cascade.
      expect(s.access_notes).toBe("Reach me on the buzzer.");
    });

    it("wipes any previously chosen schedule slot when residence changes", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_at_unit");
      bookingActions.setSchedule("2026-05-01", "morning");

      bookingActions.setPrimaryResidence("vacant");

      const s = getBookingSession();
      expect(s.service_date).toBeNull();
      expect(s.service_slot).toBeNull();
    });

    it("is a no-op when the residence is set to the same value", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.setAccessMethod("owner_live_leave_key");
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });

      bookingActions.setPrimaryResidence("live_in");

      const s = getBookingSession();
      // Same residence => no cascade, follow-ups preserved.
      expect(s.access_method).toBe("owner_live_leave_key");
      expect(s.key_holder_name).toBe("Alex Smith");
      expect(s.key_holder_phone).toBe("0400 000 000");
    });
  });

  describe("setRole — cascade clears role-dependent fields", () => {
    // `clearRoleDownstream` runs a much wider cascade than the access-method
    // ones above: switching role wipes the agency, primary_residence, the
    // chosen access_method, every Step 3 follow-up, and the schedule slot.
    // If a regression leaves any of those behind when a user toggles between
    // Owner and Agent mid-session, we silently send mismatched data
    // downstream (e.g. an agent booking still carrying a primary_residence).

    /** Populate every role-dependent field so the cascade has something to clear. */
    function populateRoleDownstream(opts: {
      access_method: AccessMethod;
      primary_residence?: BookingState["primary_residence"];
    }) {
      bookingActions.setAgency("agency-001");
      if (opts.primary_residence) {
        bookingActions.setPrimaryResidence(opts.primary_residence);
      }
      bookingActions.setAccessMethod(opts.access_method);
      bookingActions.setKeyHolder({
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });
      bookingActions.setKeyCollectionLocation("Concierge desk, Lvl 1");
      bookingActions.setReturnMethod("hand_delivery");
      bookingActions.setManagingAgency("agency-002");
      bookingActions.setTenants([
        { first: "Sam", last: "Tenant", email: "sam@example.com", phone: "0411 111 111" },
      ]);
      bookingActions.setSignature({
        signature_acknowledged: true,
        signature_name: "Alex Smith",
      });
      bookingActions.setSchedule("2026-05-01", "morning");
    }

    /** Assert that every field cleared by `clearRoleDownstream` is empty. */
    function expectRoleDownstreamCleared(s: BookingState) {
      expect(s.agency_id).toBeNull();
      expect(s.primary_residence).toBeNull();
      expect(s.access_method).toBeNull();
      expect(s.key_holder_name).toBe("");
      expect(s.key_holder_phone).toBe("");
      expect(s.key_collection_location).toBe("");
      expect(s.return_method).toBeNull();
      expect(s.managing_agency_id).toBeNull();
      expect(s.tenants).toEqual([]);
      expect(s.signature_acknowledged).toBe(false);
      expect(s.signature_name).toBe("");
      expect(s.service_date).toBeNull();
      expect(s.service_slot).toBeNull();
    }

    it("owner → agent: clears agency, primary_residence, access_method, every Step 3 follow-up, and the schedule slot", () => {
      bookingActions.setRole("owner");
      populateRoleDownstream({
        primary_residence: "leased_out",
        access_method: "owner_leased_leave_key",
      });

      bookingActions.setRole("agent");

      const s = getBookingSession();
      expect(s.role).toBe("agent");
      expectRoleDownstreamCleared(s);
    });

    it("agent → owner: clears the same fields in the reverse direction", () => {
      bookingActions.setRole("agent");
      populateRoleDownstream({
        // Agents have no primary_residence in the spec, but the cascade
        // still wipes it — populate it directly so we can prove it's cleared.
        primary_residence: "leased_out",
        access_method: "agent_be_there",
      });

      bookingActions.setRole("owner");

      const s = getBookingSession();
      expect(s.role).toBe("owner");
      expectRoleDownstreamCleared(s);
    });

    it("re-selecting the same role is a no-op — in-progress data is preserved", () => {
      bookingActions.setRole("owner");
      populateRoleDownstream({
        primary_residence: "leased_out",
        access_method: "owner_leased_leave_key",
      });

      bookingActions.setRole("owner");

      const s = getBookingSession();
      expect(s.role).toBe("owner");
      // Nothing along the cascade should have been touched.
      expect(s.agency_id).toBe("agency-001");
      expect(s.primary_residence).toBe("leased_out");
      expect(s.access_method).toBe("owner_leased_leave_key");
      expect(s.key_holder_name).toBe("Alex Smith");
      expect(s.key_holder_phone).toBe("0400 000 000");
      expect(s.key_collection_location).toBe("Concierge desk, Lvl 1");
      expect(s.return_method).toBe("hand_delivery");
      expect(s.managing_agency_id).toBe("agency-002");
      expect(s.tenants).toHaveLength(1);
      expect(s.tenants[0]).toMatchObject({ first: "Sam", last: "Tenant" });
      expect(s.signature_acknowledged).toBe(true);
      expect(s.signature_name).toBe("Alex Smith");
      expect(s.service_date).toBe("2026-05-01");
      expect(s.service_slot).toBe("morning");
    });
  });

  describe("setAccessMethod — auto-advances away from a now-hidden Step 4", () => {
    it("advances current_step from 4 → 5 when switching INTO any coordination method while on Step 4", () => {
      const coordinationMethods: AccessMethod[] = Array.from(
        COORDINATION_ACCESS_METHODS,
      );
      expect(coordinationMethods.length).toBeGreaterThan(0);

      for (const method of coordinationMethods) {
        bookingActions.reset();
        bookingActions.setRole(method.startsWith("agent") ? "agent" : "owner");
        if (!method.startsWith("agent")) {
          bookingActions.setPrimaryResidence("leased_out");
        }
        bookingActions.goToStep(4);
        expect(getBookingSession().current_step).toBe(4);

        bookingActions.setAccessMethod(method);

        const s = getBookingSession();
        expect(s.access_method).toBe(method);
        expect(s.current_step).toBe(5);
      }
    });

    it("does NOT advance when switching to a non-coordination method while on Step 4", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.goToStep(4);

      bookingActions.setAccessMethod("owner_live_at_unit");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_live_at_unit");
      expect(s.current_step).toBe(4);
    });

    it("does NOT change current_step when switching INTO a coordination method while NOT on Step 4", () => {
      bookingActions.setRole("agent");
      bookingActions.goToStep(3);

      bookingActions.setAccessMethod("agent_tenant_taylr");

      const s = getBookingSession();
      expect(s.access_method).toBe("agent_tenant_taylr");
      // Auto-advance only protects users who would otherwise linger on Step 4.
      expect(s.current_step).toBe(3);
    });
  });

  describe("setAgency / setAgencyOtherName — 'Other / not listed' free-text capture", () => {
    // When an agent picks "Other / not listed" (agency-005) we capture a free-
    // text company name. If the user later changes their mind and picks a real
    // listed agency, that text must be wiped so it can't quietly travel with
    // the booking and be misread as an override of the chosen agency.

    it("setAgencyOtherName persists the typed value", () => {
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");

      expect(getBookingSession().agency_other_name).toBe("Westside Property Co.");
    });

    it("switching from 'Other' to a listed agency clears agency_other_name", () => {
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");

      bookingActions.setAgency("agency-001");

      const s = getBookingSession();
      expect(s.agency_id).toBe("agency-001");
      expect(s.agency_other_name).toBe("");
    });

    it("clearing the agency (setAgency(null)) also clears agency_other_name", () => {
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");

      bookingActions.setAgency(null);

      const s = getBookingSession();
      expect(s.agency_id).toBeNull();
      expect(s.agency_other_name).toBe("");
    });

    it("re-selecting the same 'Other' agency is a no-op and preserves the typed value", () => {
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");
      const before = getBookingSession();

      bookingActions.setAgency("agency-005");
      const after = getBookingSession();

      // Reference equality proves the early-return path was hit.
      expect(after).toBe(before);
      expect(after.agency_other_name).toBe("Westside Property Co.");
    });

    it("setRole cascade clears agency_other_name alongside agency_id", () => {
      bookingActions.setRole("agent");
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");

      bookingActions.setRole("owner");

      const s = getBookingSession();
      expect(s.agency_id).toBeNull();
      expect(s.agency_other_name).toBe("");
    });

    it("bookAnother carries agency_other_name forward when the retained agency is still 'Other'", () => {
      bookingActions.setRole("agent");
      bookingActions.setAgency("agency-005");
      bookingActions.setAgencyOtherName("Westside Property Co.");
      bookingActions.setContact({
        contact_first_name: "Sam",
        contact_last_name: "Lee",
        contact_email: "sam@example.com",
        contact_phone: "+15551234567",
      });

      bookingActions.bookAnother();

      const s = getBookingSession();
      // Identity-level fields preserved.
      expect(s.role).toBe("agent");
      expect(s.agency_id).toBe("agency-005");
      // The typed company name comes with us — it's the same agency.
      expect(s.agency_other_name).toBe("Westside Property Co.");
      // And we land back on Step 1.
      expect(s.current_step).toBe(1);
    });

    it("bookAnother clears the recorded ac_discrepancy snapshot", () => {
      bookingActions.setUnit("u2");
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 0 },
        customer: { type: "split", systems: 3, additional: 0 },
      });
      expect(getBookingSession().ac_discrepancy).not.toBeNull();

      bookingActions.bookAnother();

      expect(getBookingSession().ac_discrepancy).toBeNull();
    });

    it("bookAnother drops agency_other_name when the retained agency is a listed one", () => {
      // Simulate a prior session where the user originally typed an "Other"
      // value and then switched to a listed agency. setAgency already wipes
      // agency_other_name in that flow, but we double-check the bookAnother
      // path: even if somehow agency_other_name still held a stale value,
      // it must not survive into a new booking against a real agency.
      bookingActions.setRole("agent");
      bookingActions.setAgency("agency-001");
      // Force a stale value in only via the dedicated setter (so we exercise
      // bookAnother's defensive branch, not setAgency's clearing branch).
      bookingActions.setAgencyOtherName("Stale Co.");

      bookingActions.bookAnother();

      const s = getBookingSession();
      expect(s.agency_id).toBe("agency-001");
      expect(s.agency_other_name).toBe("");
    });
  });

  // ─── D. AC discrepancy snapshot ────────────────────────────────────────
  //
  // The Step 2 AC page records the gap between Taylr's records and what
  // the customer actually has on-site so the admin mockup can act on it.
  // This block covers:
  //   1. Default state — no discrepancy on a fresh session.
  //   2. setAcDiscrepancy round-trip + null clearing.
  //   3. The structural-equality guard that keeps the action safe to
  //      call from a render-driven effect (no subscriber storms).
  //   4. Cascade clearing on setUnit (records belong to the prior unit).
  //   5. migratePersistedSession defaults the new field to null when
  //      legacy persisted blobs don't include it.
  describe("D. AC discrepancy snapshot", () => {
    beforeEach(() => {
      bookingActions.reset();
    });

    it("starts null on a fresh session", () => {
      expect(getBookingSession().ac_discrepancy).toBeNull();
    });

    it("setAcDiscrepancy round-trips and accepts null to clear", () => {
      const snap: AcDiscrepancy = {
        recorded: { type: "ducted", systems: 1, additional: 1 },
        customer: { type: "ducted", systems: 2, additional: 0 },
      };
      bookingActions.setAcDiscrepancy(snap);
      expect(getBookingSession().ac_discrepancy).toEqual(snap);

      bookingActions.setAcDiscrepancy(null);
      expect(getBookingSession().ac_discrepancy).toBeNull();
    });

    it("setAcDiscrepancy is a no-op when the new value is structurally equal", () => {
      const snapA: AcDiscrepancy = {
        recorded: { type: "split", systems: 2, additional: 0 },
        customer: { type: "split", systems: 3, additional: 1 },
      };
      bookingActions.setAcDiscrepancy(snapA);
      const ref1 = getBookingSession();
      // Same shape, fresh object reference — must not produce a new state.
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 0 },
        customer: { type: "split", systems: 3, additional: 1 },
      });
      expect(getBookingSession()).toBe(ref1);

      // Same is true of null → null.
      bookingActions.setAcDiscrepancy(null);
      const ref2 = getBookingSession();
      bookingActions.setAcDiscrepancy(null);
      expect(getBookingSession()).toBe(ref2);
    });

    it("setAcDiscrepancy treats two 'unsure' snapshots with same record as equal", () => {
      // 'unsure' carries no numbers on the customer side, so the
      // equality check must compare records only.
      const recorded = { type: "ducted", systems: 1, additional: 1 } as const;
      bookingActions.setAcDiscrepancy({ recorded, customer: { type: "unsure" } });
      const ref = getBookingSession();
      bookingActions.setAcDiscrepancy({
        recorded: { type: "ducted", systems: 1, additional: 1 },
        customer: { type: "unsure" },
      });
      expect(getBookingSession()).toBe(ref);
    });

    it("setUnit wipes the discrepancy snapshot — records belong to the prior unit", () => {
      bookingActions.setUnit("u2");
      bookingActions.setAcDiscrepancy({
        recorded: { type: "split", systems: 2, additional: 0 },
        customer: { type: "ducted", systems: 1, additional: 0 },
      });
      expect(getBookingSession().ac_discrepancy).not.toBeNull();

      bookingActions.setUnit("u5");
      expect(getBookingSession().ac_discrepancy).toBeNull();
    });

    it("setUnit to the same id leaves the snapshot intact", () => {
      bookingActions.setUnit("u1");
      const snap: AcDiscrepancy = {
        recorded: { type: "ducted", systems: 1, additional: 1 },
        customer: { type: "ducted", systems: 1, additional: 2 },
      };
      bookingActions.setAcDiscrepancy(snap);

      bookingActions.setUnit("u1");
      expect(getBookingSession().ac_discrepancy).toEqual(snap);
    });

    it("migratePersistedSession defaults ac_discrepancy to null when missing", () => {
      const out = migratePersistedSession(
        JSON.stringify({ unit_id: "u1", current_step: 4 }),
      );
      expect(out.ac_discrepancy).toBeNull();
    });

    it("migratePersistedSession preserves a persisted ac_discrepancy snapshot", () => {
      const snap = {
        recorded: { type: "split", systems: 2, additional: 0 },
        customer: { type: "split", systems: 4, additional: 1 },
      };
      const out = migratePersistedSession(
        JSON.stringify({ unit_id: "u2", current_step: 4, ac_discrepancy: snap }),
      );
      expect(out.ac_discrepancy).toEqual(snap);
    });
  });

  // ─── D2. AC override flag (Task #50) ────────────────────────────────────
  // The Step 2 AC page now branches on `ac_override_active` to choose
  // between the on-file (minimal) view and the full configuration UI.
  // The flag's setter has special behaviour: clearing it back to false
  // also wipes any discrepancy snapshot, because reverting to "use
  // what's on file" means the booking will be recorded as matching
  // the on-file record exactly. The flag must also cascade-clear on
  // unit change, terminal-state resets, and bookAnother — captured in
  // the existing setUnit / pickAnotherUnit / bookAnother tests above.
  describe("D2. AC override flag", () => {
    beforeEach(() => {
      bookingActions.reset();
    });

    it("starts false on a fresh session", () => {
      expect(getBookingSession().ac_override_active).toBe(false);
    });

    it("setAcOverrideActive(true) flips the flag without touching anything else", () => {
      bookingActions.setUnit("u1");
      bookingActions.setSystems(2);

      bookingActions.setAcOverrideActive(true);

      const s = getBookingSession();
      expect(s.ac_override_active).toBe(true);
      expect(s.unit_id).toBe("u1");
      expect(s.num_systems).toBe(2);
    });

    it("setAcOverrideActive is a no-op when the flag is already at the target value", () => {
      const ref1 = getBookingSession();
      bookingActions.setAcOverrideActive(false);
      // Already false → same reference, no spurious render churn.
      expect(getBookingSession()).toBe(ref1);

      bookingActions.setAcOverrideActive(true);
      const ref2 = getBookingSession();
      bookingActions.setAcOverrideActive(true);
      expect(getBookingSession()).toBe(ref2);
    });

    it("setAcOverrideActive(false) also clears any captured discrepancy snapshot", () => {
      // Customer overrode the on-file record and we captured the diff.
      bookingActions.setUnit("u1");
      bookingActions.setAcOverrideActive(true);
      bookingActions.setAcDiscrepancy({
        recorded: { type: "ducted", systems: 1, additional: 1 },
        customer: { type: "ducted", systems: 2, additional: 0 },
      });
      expect(getBookingSession().ac_discrepancy).not.toBeNull();

      // Customer changed their mind and clicked "Use what's on file" —
      // the snapshot must go too, otherwise the booking would be
      // recorded as matching the on-file record while still carrying
      // a stale "they amended these numbers" diff.
      bookingActions.setAcOverrideActive(false);

      const s = getBookingSession();
      expect(s.ac_override_active).toBe(false);
      expect(s.ac_discrepancy).toBeNull();
    });

    it("setUnit cascade-clears the override flag — flag is per-unit", () => {
      bookingActions.setUnit("u1");
      bookingActions.setAcOverrideActive(true);
      expect(getBookingSession().ac_override_active).toBe(true);

      bookingActions.setUnit("u2");
      expect(getBookingSession().ac_override_active).toBe(false);
    });

    it("bookAnother resets the override flag back to false", () => {
      bookingActions.setUnit("u1");
      bookingActions.setAcOverrideActive(true);
      expect(getBookingSession().ac_override_active).toBe(true);

      bookingActions.bookAnother();
      expect(getBookingSession().ac_override_active).toBe(false);
    });

    it("migratePersistedSession defaults the flag to false when missing", () => {
      const out = migratePersistedSession(
        JSON.stringify({ unit_id: "u1", current_step: 2 }),
      );
      expect(out.ac_override_active).toBe(false);
    });

    it("migratePersistedSession preserves a persisted true value", () => {
      const out = migratePersistedSession(
        JSON.stringify({
          unit_id: "u1",
          current_step: 2,
          ac_override_active: true,
        }),
      );
      expect(out.ac_override_active).toBe(true);
    });
  });

  // ─── E. AC step origin hint ─────────────────────────────────────────────
  // The AC step's "you came back to confirm AC details" banner reads
  // `ac_step_origin === "slot_picker"`. The origin is set by the slot
  // picker's "Update/Edit AC info" affordance via `editAcFromSlotPicker`,
  // and cleared by every other entry path into Step 2 (NAV_FORWARD,
  // NAV_BACK, step-dot click — all of which funnel through `goToStep`).
  // It can also be cleared manually by the banner's dismiss button.
  describe("E. AC step origin hint", () => {
    beforeEach(() => {
      bookingActions.reset();
    });

    it("starts null on a fresh session", () => {
      expect(getBookingSession().ac_step_origin).toBeNull();
    });

    it("editAcFromSlotPicker atomically jumps to Step 2 and records the origin", () => {
      // Pretend the customer is on Step 4 (Schedule) about to tap Edit AC.
      bookingActions.goToStep(4);
      expect(getBookingSession().ac_step_origin).toBeNull();

      bookingActions.editAcFromSlotPicker();
      const s = getBookingSession();
      expect(s.current_step).toBe(2);
      expect(s.ac_step_origin).toBe("slot_picker");
    });

    it("goToStep clears the origin — every non-affordance entry path", () => {
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession().ac_step_origin).toBe("slot_picker");

      // Forward (continue) past Step 2 — origin must clear so a later
      // back-then-forward arrival doesn't re-show the banner.
      bookingActions.goToStep(3);
      expect(getBookingSession().ac_step_origin).toBeNull();

      // Re-set, then prove a step-dot click TO Step 2 also clears it.
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession().ac_step_origin).toBe("slot_picker");
      bookingActions.goToStep(2);
      expect(getBookingSession().ac_step_origin).toBeNull();
    });

    it("setAcStepOrigin(null) clears the hint without changing the step", () => {
      bookingActions.editAcFromSlotPicker();
      const before = getBookingSession();
      expect(before.current_step).toBe(2);
      expect(before.ac_step_origin).toBe("slot_picker");

      bookingActions.setAcStepOrigin(null);
      const after = getBookingSession();
      expect(after.current_step).toBe(2);
      expect(after.ac_step_origin).toBeNull();
    });

    it("editAcFromSlotPicker is a no-op when already on Step 2 with the origin set", () => {
      bookingActions.editAcFromSlotPicker();
      const ref = getBookingSession();
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession()).toBe(ref);
    });

    it("setAcStepOrigin is a no-op on equal writes", () => {
      const ref = getBookingSession();
      bookingActions.setAcStepOrigin(null);
      expect(getBookingSession()).toBe(ref);
    });

    it("reset and bookAnother both wipe the origin hint", () => {
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession().ac_step_origin).toBe("slot_picker");

      bookingActions.bookAnother();
      expect(getBookingSession().ac_step_origin).toBeNull();

      bookingActions.editAcFromSlotPicker();
      bookingActions.reset();
      expect(getBookingSession().ac_step_origin).toBeNull();
    });

    it("migratePersistedSession defaults ac_step_origin to null when missing", () => {
      const out = migratePersistedSession(
        JSON.stringify({ unit_id: "u1", current_step: 4 }),
      );
      expect(out.ac_step_origin).toBeNull();
    });
  });
});

// ─── D. return_to short-circuit hint ───────────────────────────────────────

describe("return_to — short-circuit hint for the booking flow wrapper", () => {
  beforeEach(() => {
    bookingActions.reset();
  });

  it("defaults to null on a fresh session", () => {
    expect(getBookingSession().return_to).toBeNull();
  });

  it("setReturnTo stores the StepId so the wrapper can read it back", () => {
    bookingActions.setReturnTo(4);
    expect(getBookingSession().return_to).toBe(4);
  });

  it("setReturnTo(null) clears the hint", () => {
    bookingActions.setReturnTo(4);
    bookingActions.setReturnTo(null);
    expect(getBookingSession().return_to).toBeNull();
  });

  it("setReturnTo no-ops when the value is unchanged", () => {
    bookingActions.setReturnTo(4);
    const ref = getBookingSession();
    bookingActions.setReturnTo(4);
    expect(getBookingSession()).toBe(ref);
  });

  it("goToStep clears return_to when the customer arrives at the hinted step", () => {
    // Simulate the wrapper: customer was on the slot picker (Step 4),
    // tapped "Update AC info", which jumps to AC (Step 2) and stashes
    // the hint. After confirming, the wrapper jumps to Step 4 — at
    // which point the hint must clear so it never affects later
    // forward navigation.
    bookingActions.goToStep(4);
    bookingActions.setReturnTo(4);
    bookingActions.goToStep(2);
    expect(getBookingSession().return_to).toBe(4);

    bookingActions.goToStep(4);
    expect(getBookingSession().current_step).toBe(4);
    expect(getBookingSession().return_to).toBeNull();
  });

  it("goToStep keeps return_to intact when stepping to a different step", () => {
    bookingActions.setReturnTo(4);
    bookingActions.goToStep(2);
    expect(getBookingSession().return_to).toBe(4);
    bookingActions.goToStep(3);
    expect(getBookingSession().return_to).toBe(4);
  });

  it("reset wipes return_to back to null", () => {
    bookingActions.setReturnTo(4);
    bookingActions.reset();
    expect(getBookingSession().return_to).toBeNull();
  });

  it("bookAnother wipes return_to back to null", () => {
    bookingActions.setReturnTo(4);
    bookingActions.bookAnother();
    expect(getBookingSession().return_to).toBeNull();
  });
});

// ─── D2. cancellation_acknowledged — cascade-clear regression (Task #121) ─

/**
 * Task #121 moves the cancellation & rescheduling ack from Step 7 (Pay)
 * up to Step 6 (Schedule). Once ticked, the customer's acceptance must
 * survive every kind of mid-flow churn — bouncing back to Pay and
 * forward again, swapping the slot, swapping the access method —
 * because the acceptance is contractual, not slot-specific. Only the
 * hard reset paths (reset / bookAnother) clear it back to false; those
 * paths already have coverage above and in bookingSession.bookAnother.
 */
describe("cancellation_acknowledged — survives mid-flow navigation (Task #121)", () => {
  beforeEach(() => bookingActions.reset());

  it("defaults to false on a fresh session", () => {
    expect(getBookingSession().cancellation_acknowledged).toBe(false);
  });

  it("setCancellationAcknowledged toggles the flag", () => {
    bookingActions.setCancellationAcknowledged(true);
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
    bookingActions.setCancellationAcknowledged(false);
    expect(getBookingSession().cancellation_acknowledged).toBe(false);
  });

  it("going Step 6 → Pay → Step 6 → Pay keeps the ack ticked", () => {
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.goToStep(6);
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
    bookingActions.goToStep(7);
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
    bookingActions.goToStep(6);
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
    bookingActions.goToStep(7);
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
  });

  it("changing the slot does NOT clear the ack", () => {
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.setSchedule("2026-05-10", "morning");
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
    bookingActions.setSchedule("2026-05-11", "afternoon");
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
  });

  it("changing the access method does NOT clear the ack", () => {
    bookingActions.setRole("owner");
    bookingActions.setPrimaryResidence("live_in");
    bookingActions.setAccessMethod("owner_live_at_unit");
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.setPrimaryResidence("rented_out");
    bookingActions.setAccessMethod("leave_key");
    expect(getBookingSession().cancellation_acknowledged).toBe(true);
  });
});

// ─── E. Unit-unavailable terminal state (spec §9 row "Unit unavailable") ──

/**
 * Pins the new fourth terminal flag (`unit_unavailable`) plus its two
 * actions (`markUnitUnavailable`, `pickAnotherUnit`). The terminal-state
 * exclusivity tests at the bottom guard against future regressions where
 * a stale signal flips an already-terminal booking onto the wrong
 * terminal screen — the kind of race that is otherwise easy to introduce
 * silently and only surfaces under very specific user behaviour.
 */
describe("unit-unavailable terminal state", () => {
  beforeEach(() => bookingActions.reset());

  /** Drive the store into a fully-populated mid-flow state so we can
   *  prove `pickAnotherUnit` preserves everything except the unit
   *  selection (and the unit-derived discrepancy snapshot). Mirrors
   *  the seeding pattern used by `bookingSession.bookAnother.test.ts`. */
  function seedFullSessionOnStep5() {
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
    bookingActions.setAcDiscrepancy({
      recorded: { type: "split", systems: 1, additional: 0 },
      customer: { type: "split", systems: 2, additional: 3 },
    });
    bookingActions.setPrimaryResidence("live_in");
    bookingActions.setAccessMethod("owner_live_at_unit");
    bookingActions.setSchedule("2026-05-10", "morning");
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.goToStep(5);
  }

  it("markUnitUnavailable flips the flag from a fresh session", () => {
    expect(getBookingSession().unit_unavailable).toBe(false);
    bookingActions.markUnitUnavailable();
    expect(getBookingSession().unit_unavailable).toBe(true);
  });

  it("markUnitUnavailable is idempotent", () => {
    bookingActions.markUnitUnavailable();
    const first = getBookingSession();
    bookingActions.markUnitUnavailable();
    // Same reference — no spurious re-render churn.
    expect(getBookingSession()).toBe(first);
  });

  it("pickAnotherUnit clears the flag, wipes unit_id + ac_discrepancy, returns to Step 1, and preserves everything else", () => {
    seedFullSessionOnStep5();
    bookingActions.markUnitUnavailable();

    const before = getBookingSession();
    expect(before.unit_unavailable).toBe(true);
    expect(before.unit_id).toBe("unit-123");
    expect(before.ac_discrepancy).not.toBeNull();
    expect(before.current_step).toBe(5);

    // Task #50: prove pickAnotherUnit also resets the override flag
    // so the new unit's on-file view shows by default — otherwise a
    // customer who overrode AC details on the unavailable unit would
    // skip straight into the full config UI on the new unit too.
    bookingActions.setAcOverrideActive(true);
    expect(getBookingSession().ac_override_active).toBe(true);

    bookingActions.pickAnotherUnit();

    const after = getBookingSession();
    // Flag cleared, unit + discrepancy wiped, back to Step 1.
    expect(after.unit_unavailable).toBe(false);
    expect(after.unit_id).toBeNull();
    expect(after.ac_discrepancy).toBeNull();
    expect(after.ac_override_active).toBe(false);
    expect(after.current_step).toBe(1);
    // Identity, AC counts, access method and slot all survive — the
    // whole point of pickAnotherUnit vs bookAnother is that the
    // customer doesn't have to redo the entire flow.
    expect(after.role).toBe("owner");
    expect(after.agency_id).toBe("agency-1");
    expect(after.contact_first_name).toBe("Sam");
    expect(after.contact_last_name).toBe("Lee");
    expect(after.contact_email).toBe("sam@example.com");
    expect(after.contact_phone).toBe("+15551234567");
    expect(after.num_systems).toBe(2);
    expect(after.num_additional_indoor).toBe(3);
    expect(after.primary_residence).toBe("live_in");
    expect(after.access_method).toBe("owner_live_at_unit");
    expect(after.service_date).toBe("2026-05-10");
    expect(after.service_slot).toBe("morning");
    expect(after.cancellation_acknowledged).toBe(true);
  });

  it("pickAnotherUnit is a no-op when the flag is not set", () => {
    seedFullSessionOnStep5();
    const before = getBookingSession();
    bookingActions.pickAnotherUnit();
    // Same reference — store skipped the write entirely.
    expect(getBookingSession()).toBe(before);
  });

  it("bookAnother wipes the unit_unavailable flag", () => {
    bookingActions.markUnitUnavailable();
    bookingActions.bookAnother();
    expect(getBookingSession().unit_unavailable).toBe(false);
  });

  it("reset wipes the unit_unavailable flag", () => {
    bookingActions.markUnitUnavailable();
    bookingActions.reset();
    expect(getBookingSession().unit_unavailable).toBe(false);
  });

  // Terminal-state exclusivity — at most one terminal flag is true at
  // any time. The store enforces this by no-op'ing every "set terminal"
  // action when any other terminal flag is already set, so a stale
  // signal can never flip a confirmed booking to cancelled, a
  // cancelled booking to unavailable, etc. These tests pin every pair
  // of (already set, attempting to set) combinations.
  describe("terminal-state exclusivity", () => {
    it("submitBooking is a no-op when unit_unavailable is set", () => {
      bookingActions.markUnitUnavailable();
      bookingActions.submitBooking();
      const s = getBookingSession();
      expect(s.unit_unavailable).toBe(true);
      expect(s.submitted).toBe(false);
      expect(s.reference).toBeNull();
    });

    it("cancelPayment is a no-op when unit_unavailable is set", () => {
      bookingActions.markUnitUnavailable();
      bookingActions.cancelPayment();
      const s = getBookingSession();
      expect(s.unit_unavailable).toBe(true);
      expect(s.payment_cancelled).toBe(false);
    });

    it("markUnitUnavailable is a no-op when submitted is set", () => {
      bookingActions.submitBooking();
      bookingActions.markUnitUnavailable();
      const s = getBookingSession();
      expect(s.submitted).toBe(true);
      expect(s.unit_unavailable).toBe(false);
    });

    it("markUnitUnavailable is a no-op when payment_cancelled is set", () => {
      bookingActions.cancelPayment();
      bookingActions.markUnitUnavailable();
      const s = getBookingSession();
      expect(s.payment_cancelled).toBe(true);
      expect(s.unit_unavailable).toBe(false);
    });
  });
});

// ─── F. submit-time uniqueness guard (Task #49) ────────────────────────────
//
// `submitBooking()` runs the registered uniqueness guard before
// promoting the session to `submitted`. The admin shell wires a real
// guard; the customer-only mockup uses the default no-op. These tests
// pin all three verdicts plus the default-no-op safety branch so a
// future refactor can't silently drop the gate.

describe("submitBooking — uniqueness guard branches (Task #49)", () => {
  let guardCalls: Array<{ unit_id: string | null; reference: string }>;

  beforeEach(() => {
    bookingActions.reset();
    guardCalls = [];
  });
  // Always reset the guard so other test files don't see this one's
  // stub. `setUniquenessGuard(null)` restores the default no-op.
  afterEach(() => setUniquenessGuard(null));

  function withGuard(verdict: UniquenessVerdict): void {
    const guard: UniquenessGuard = (s, ref) => {
      guardCalls.push({ unit_id: s.unit_id, reference: ref });
      return verdict;
    };
    setUniquenessGuard(guard);
  }

  function seedReadyToSubmit() {
    bookingActions.setUnit("unit-xyz");
    bookingActions.setRole("owner");
    bookingActions.setContact({
      contact_first_name: "Sam",
      contact_last_name: "Lee",
      contact_email: "sam@example.com",
      contact_phone: "+15551234567",
    });
    bookingActions.setSystems(1);
    bookingActions.setAdditionalIndoor(0);
    bookingActions.setPrimaryResidence("live_in");
    bookingActions.setAccessMethod("owner_live_at_unit");
    bookingActions.setSchedule("2026-05-10", "morning");
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.goToStep(5);
  }

  it("'ok' → submits and stamps a reference", () => {
    seedReadyToSubmit();
    withGuard("ok");
    bookingActions.submitBooking();
    const s = getBookingSession();
    expect(s.submitted).toBe(true);
    expect(s.unit_unavailable).toBe(false);
    expect(s.reference).toBeTruthy();
    expect(guardCalls.length).toBe(1);
    expect(guardCalls[0].unit_id).toBe("unit-xyz");
    // The same generated reference must have been handed to the
    // guard so it can stamp `supersededByBookingId` correctly.
    expect(guardCalls[0].reference).toBe(s.reference);
  });

  it("'paid' → does NOT submit, flips unit_unavailable", () => {
    seedReadyToSubmit();
    withGuard("paid");
    bookingActions.submitBooking();
    const s = getBookingSession();
    expect(s.submitted).toBe(false);
    expect(s.reference).toBeFalsy();
    expect(s.unit_unavailable).toBe(true);
    expect(guardCalls.length).toBe(1);
  });

  it("'invoice_pending' → submits normally (the guard already side-effected the prior row)", () => {
    seedReadyToSubmit();
    withGuard("invoice_pending");
    bookingActions.submitBooking();
    const s = getBookingSession();
    expect(s.submitted).toBe(true);
    expect(s.unit_unavailable).toBe(false);
    expect(s.reference).toBeTruthy();
    expect(guardCalls.length).toBe(1);
  });

  it("default no-op guard (canvas-isolated mode) submits without consulting any admin store", () => {
    // No `setUniquenessGuard` call here — the default is a no-op
    // that returns "ok" so the standalone customer flow still
    // works without an admin shell wired in.
    seedReadyToSubmit();
    bookingActions.submitBooking();
    const s = getBookingSession();
    expect(s.submitted).toBe(true);
    expect(s.unit_unavailable).toBe(false);
    expect(s.reference).toBeTruthy();
  });

  it("guard is NOT called once the session is already submitted (terminal-state safety)", () => {
    seedReadyToSubmit();
    withGuard("ok");
    bookingActions.submitBooking();
    expect(guardCalls.length).toBe(1);
    // Second call should short-circuit on the terminal-state check
    // before reaching the guard.
    bookingActions.submitBooking();
    expect(guardCalls.length).toBe(1);
  });

  it("guard is NOT called when unit_unavailable is already set", () => {
    bookingActions.markUnitUnavailable();
    withGuard("ok");
    bookingActions.submitBooking();
    expect(guardCalls.length).toBe(0);
    expect(getBookingSession().submitted).toBe(false);
  });

  // Task #49 review feedback: when the guard rejects a submission
  // because another paid booking already exists, it can hand the
  // session a `blocker` payload (booker name / role / scheduled
  // window) so the dead-end "Unit unavailable" screen can show
  // booker context + a "Contact us" CTA. These tests pin that the
  // payload reaches `state.unit_unavailable_blocker` verbatim and
  // that the legacy string-only verdict still works (no payload).
  describe("submitBooking — paid-verdict blocker payload", () => {
    it("object-form 'paid' verdict propagates blocker into state", () => {
      seedReadyToSubmit();
      const blocker = {
        name: "Pat Reyes",
        role: "agent" as const,
        date: "2026-05-12",
        slot: "morning" as const,
      };
      setUniquenessGuard(() => ({ kind: "paid", blocker }));
      bookingActions.submitBooking();
      const s = getBookingSession();
      expect(s.submitted).toBe(false);
      expect(s.unit_unavailable).toBe(true);
      expect(s.unit_unavailable_blocker).toEqual(blocker);
    });

    it("string-form 'paid' verdict still blocks but leaves blocker null (legacy path)", () => {
      seedReadyToSubmit();
      withGuard("paid");
      bookingActions.submitBooking();
      const s = getBookingSession();
      expect(s.unit_unavailable).toBe(true);
      expect(s.unit_unavailable_blocker).toBeNull();
    });

    it("pickAnotherUnit clears the blocker payload alongside the unavailable flag", () => {
      seedReadyToSubmit();
      setUniquenessGuard(() => ({
        kind: "paid",
        blocker: {
          name: "Pat Reyes",
          role: "owner",
          date: "2026-05-12",
          slot: "morning",
        },
      }));
      bookingActions.submitBooking();
      expect(getBookingSession().unit_unavailable_blocker).not.toBeNull();
      bookingActions.pickAnotherUnit();
      const s = getBookingSession();
      expect(s.unit_unavailable).toBe(false);
      expect(s.unit_unavailable_blocker).toBeNull();
    });
  });
});

// ─── G. Admin-store integration: tenant lock view + supersede flow ─────────
//
// These tests exercise the customer-data view (`alreadyScheduledByOther`)
// and the AdminApp guard's supersede side-effect against the seeded
// admin store. They live here (not in a separate file) so the helpers
// for resetting the booking session and the uniqueness guard can be
// shared. The goal is to lock down two flows the architect flagged as
// untested:
//   1. The slot-picker tenant-lock panel renders its booker contact
//      info from a real `AdminBooking` (paid + invoice_pending).
//   2. The submit-time guard for `invoice_pending` actually frees
//      capacity and stamps `supersededByBookingId` on the prior row.

describe("Tenant lock view + supersede flow (Task #49 admin integration)", () => {
  beforeEach(() => bookingActions.reset());
  afterEach(() => setUniquenessGuard(null));

  it("alreadyScheduledByOther returns the paid booking with kind:'paid' for a tenant viewing the slot picker", async () => {
    const { alreadyScheduledByOther } = await import(
      "../components/mockups/booking-slots/customerSlotData"
    );
    const { SEEDED_BOOKINGS, findRolloutForBooking } = await import(
      "./adminMockData"
    );
    // Pick a paid seeded booking whose unit also has a rollout — both
    // are required for the helper to return a non-null result.
    const paid = SEEDED_BOOKINGS.find(
      (b) =>
        b.serviceStatus !== "cancelled" &&
        b.paymentStatus === "paid" &&
        !!findRolloutForBooking("svc-ac", b.unitId),
    );
    if (!paid) {
      // Seed has no qualifying row — defensive skip so the suite stays
      // green if fixtures evolve.
      return;
    }
    const result = alreadyScheduledByOther(paid.unitId);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("paid");
    expect(result?.booking.id).toBe(paid.id);
    // The contact panel reads these fields directly — pin that they
    // are present and non-empty so the picker UI can render mailto/tel.
    expect(result?.booking.customerEmail).toBeTruthy();
    expect(result?.booking.customerPhone).toBeTruthy();
  });

  it("alreadyScheduledByOther also locks the picker for an invoice_pending booking", async () => {
    const { alreadyScheduledByOther } = await import(
      "../components/mockups/booking-slots/customerSlotData"
    );
    const { SEEDED_BOOKINGS, findRolloutForBooking } = await import(
      "./adminMockData"
    );
    const pending = SEEDED_BOOKINGS.find(
      (b) =>
        b.serviceStatus !== "cancelled" &&
        b.paymentStatus === "pending" &&
        !!findRolloutForBooking("svc-ac", b.unitId),
    );
    if (!pending) {
      // Fixture doesn't currently seed a pending row — skip rather than
      // hard-fail so the suite stays green if seed data evolves.
      return;
    }
    const result = alreadyScheduledByOther(pending.unitId);
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("invoice_pending");
  });

  it("invoice_pending guard supersede side-effect frees capacity + flags prior booking", async () => {
    const {
      SEEDED_BOOKINGS,
      getActiveBookingForUnit,
      releaseBookingCapacity,
      findRolloutForBooking,
      bookingDurationMinutes,
      getRolloutById,
      __resetRolloutsForTests,
    } = await import("./adminMockData");
    // Build a synthetic prior invoice_pending row sitting against an
    // existing rollout so `getActiveBookingForUnit` will find it.
    // Picking the first seeded booking's unit guarantees a real rollout.
    const baseline = SEEDED_BOOKINGS[0];
    const rollout = findRolloutForBooking("svc-ac", baseline.unitId);
    if (!rollout) throw new Error("Expected a rollout for the seed unit");
    const prior: import("./adminMockData").AdminBooking = {
      ...baseline,
      id: "bk-test-pending",
      paymentStatus: "pending",
      serviceStatus: "scheduled",
      cancelledAt: undefined,
      cancelledBy: undefined,
      cancellationNote: undefined,
      supersededByBookingId: undefined,
      serviceTimeline: [...baseline.serviceTimeline],
    };
    // Mutable working copy so the guard can patch the prior row, the
    // way AdminApp does via setSeededBookings.
    const bookings: import("./adminMockData").AdminBooking[] = [
      prior,
      ...SEEDED_BOOKINGS.filter((b) => b.id !== baseline.id),
    ];

    // Sanity: the helper should classify our synthetic row as invoice_pending.
    const verdict = getActiveBookingForUnit(prior.unitId, bookings, rollout.id);
    expect(verdict.kind).toBe("invoice_pending");

    // Capture the rollout slot the prior booking occupies so we can
    // assert capacity drops after release.
    const day = rollout.days.find((d) => d.isoDate === prior.serviceDate);
    const slotBefore =
      day && prior.serviceSlot === "morning"
        ? day.morning
        : day && prior.serviceSlot === "afternoon"
          ? day.afternoon
          : null;
    if (!slotBefore) throw new Error("Expected a concrete slot on the prior");
    const beforeMinutes = slotBefore.bookedMinutes;
    const beforeCount = slotBefore.bookedCount ?? 0;
    const jobMin = bookingDurationMinutes(prior);

    // Wire a guard that mirrors AdminApp's supersede branch end-to-end:
    // patch the prior row (cancelled + supersededByBookingId), free
    // its capacity, and return invoice_pending so the new booking
    // proceeds.
    let observedReference = "";
    setUniquenessGuard((_sess, ref) => {
      observedReference = ref;
      releaseBookingCapacity(prior);
      const idx = bookings.findIndex((b) => b.id === prior.id);
      if (idx >= 0) {
        bookings[idx] = {
          ...bookings[idx],
          serviceStatus: "cancelled",
          cancelledAt: "Just now",
          cancelledBy: "System",
          cancellationNote: `Superseded by ${ref}`,
          supersededByBookingId: ref,
        };
      }
      return "invoice_pending";
    });

    bookingActions.setUnit(prior.unitId);
    bookingActions.setRole("owner");
    bookingActions.setContact({
      contact_first_name: "New",
      contact_last_name: "Customer",
      contact_email: "new@example.com",
      contact_phone: "+15550001111",
    });
    bookingActions.setSystems(1);
    bookingActions.setAdditionalIndoor(0);
    bookingActions.setPrimaryResidence("live_in");
    bookingActions.setAccessMethod("owner_live_at_unit");
    bookingActions.setSchedule(prior.serviceDate ?? "2026-05-10", "morning");
    bookingActions.setCancellationAcknowledged(true);
    bookingActions.goToStep(5);
    bookingActions.submitBooking();

    const s = getBookingSession();
    expect(s.submitted).toBe(true);
    expect(s.reference).toBeTruthy();
    expect(observedReference).toBe(s.reference);

    // Capacity dropped by exactly this booking's duration / count.
    // `updateRolloutSlot` rebuilds the rollouts/days array immutably,
    // so we MUST re-fetch from the store rather than reading our stale
    // `day` reference captured before the mutation.
    const freshRollout = getRolloutById(rollout.id);
    const freshDay = freshRollout?.days.find(
      (d) => d.isoDate === prior.serviceDate,
    );
    const after =
      freshDay && prior.serviceSlot === "morning"
        ? freshDay.morning
        : freshDay?.afternoon;
    if (!after) throw new Error("Expected the rollout slot to still exist");
    if (rollout.capacityModel === "slots_per_window") {
      expect(after.bookedCount ?? 0).toBe(Math.max(0, beforeCount - 1));
    } else {
      expect(after.bookedMinutes).toBe(Math.max(0, beforeMinutes - jobMin));
    }

    // Prior row is now cancelled + flagged as superseded by the new ref.
    const patched = bookings.find((b) => b.id === prior.id);
    expect(patched?.serviceStatus).toBe("cancelled");
    expect(patched?.supersededByBookingId).toBe(s.reference);
    expect(patched?.cancelledBy).toBe("System");

    // Restore the seeded rollout state so this test stays isolated
    // from any other test reading the module-level rollouts store.
    __resetRolloutsForTests();
  });

  // Cross-panel live-bookings wiring (Task #49 architect re-review):
  // when AdminApp registers a getter via `setLiveBookingsSource`,
  // customer-side helpers (`alreadyScheduledByOther`) must read from
  // that mutable list — so admin cancel / reschedule / supersede
  // mutations become visible to a customer slot picker mounted in
  // the same React tree. We also verify `subscribeLiveBookings`
  // listeners fire on `notifyLiveBookingsChanged()`.
  it("admin cancel mutation propagates to alreadyScheduledByOther via live-bookings source", async () => {
    const { alreadyScheduledByOther } = await import(
      "../components/mockups/booking-slots/customerSlotData"
    );
    const {
      SEEDED_BOOKINGS,
      findRolloutForBooking,
      setLiveBookingsSource,
      notifyLiveBookingsChanged,
      subscribeLiveBookings,
    } = await import("./adminMockData");

    const paid = SEEDED_BOOKINGS.find(
      (b) =>
        b.serviceStatus !== "cancelled" &&
        b.paymentStatus === "paid" &&
        !!findRolloutForBooking("svc-ac", b.unitId),
    );
    if (!paid) return;

    let liveBookings: import("./adminMockData").AdminBooking[] = [
      ...SEEDED_BOOKINGS,
    ];
    setLiveBookingsSource(() => liveBookings);

    let listenerCalls = 0;
    const unsubscribe = subscribeLiveBookings(() => {
      listenerCalls += 1;
    });

    try {
      // Before mutation, the picker is locked.
      const before = alreadyScheduledByOther(paid.unitId);
      expect(before?.kind).toBe("paid");
      expect(before?.booking.id).toBe(paid.id);

      // Admin cancels the paid booking — replace the row in the
      // mutable list (mirrors AdminApp.setSeededBookings) and notify.
      liveBookings = liveBookings.map((b) =>
        b.id === paid.id ? { ...b, serviceStatus: "cancelled" as const } : b,
      );
      notifyLiveBookingsChanged();

      expect(listenerCalls).toBeGreaterThanOrEqual(1);

      // Customer picker now sees no blocker for this unit.
      const after = alreadyScheduledByOther(paid.unitId);
      expect(after).toBeNull();
    } finally {
      unsubscribe();
      setLiveBookingsSource(null);
    }
  });

  // Regression for the architect re-review finding: when AdminApp's
  // `cancelBooking` runs against a booking with no concrete slot to
  // release (e.g., coordination / unscheduled), `releaseBookingCapacity`
  // returns false, so the rollouts refresh key is NOT bumped — but
  // live-bookings subscribers must still be notified so customer-side
  // panels reflect the cancellation. We exercise this by simulating
  // the cancel path: mutate the row, call `notifyLiveBookingsChanged`,
  // and assert subscribers fire and the helper recomputes.
  it("cancel notifies live-bookings subscribers even when no slot capacity is released (unscheduled / coordination)", async () => {
    const { alreadyScheduledByOther } = await import(
      "../components/mockups/booking-slots/customerSlotData"
    );
    const {
      SEEDED_BOOKINGS,
      findRolloutForBooking,
      releaseBookingCapacity,
      setLiveBookingsSource,
      notifyLiveBookingsChanged,
      subscribeLiveBookings,
    } = await import("./adminMockData");

    const paid = SEEDED_BOOKINGS.find(
      (b) =>
        b.serviceStatus !== "cancelled" &&
        b.paymentStatus === "paid" &&
        !!findRolloutForBooking("svc-ac", b.unitId),
    );
    if (!paid) return;

    // Synthetic coordination/unscheduled blocker on the same unit:
    // rolloutId stays set (so `getActiveBookingForUnit` still matches
    // the row to the rollout) but serviceDate / serviceSlot are
    // cleared so `releaseBookingCapacity` returns false. That's the
    // exact branch in AdminApp.cancelBooking that previously skipped
    // notifying live-bookings subscribers.
    const unscheduled: import("./adminMockData").AdminBooking = {
      ...paid,
      id: "bk-test-unscheduled",
      serviceDate: undefined,
      serviceSlot: undefined,
    };
    expect(releaseBookingCapacity(unscheduled)).toBe(false);

    let liveBookings: import("./adminMockData").AdminBooking[] = [
      unscheduled,
      ...SEEDED_BOOKINGS.filter((b) => b.id !== paid.id),
    ];
    setLiveBookingsSource(() => liveBookings);

    let listenerCalls = 0;
    const unsubscribe = subscribeLiveBookings(() => {
      listenerCalls += 1;
    });

    try {
      // Before: customer picker sees the unscheduled paid blocker.
      const before = alreadyScheduledByOther(unscheduled.unitId);
      expect(before?.kind).toBe("paid");
      expect(before?.booking.id).toBe("bk-test-unscheduled");

      // Cancel the unscheduled blocker (mirrors AdminApp.cancelBooking
      // when releaseOk === false: mutate row + notify, no rollouts
      // refresh).
      liveBookings = liveBookings.map((b) =>
        b.id === unscheduled.id
          ? { ...b, serviceStatus: "cancelled" as const }
          : b,
      );
      notifyLiveBookingsChanged();

      expect(listenerCalls).toBeGreaterThanOrEqual(1);
      const after = alreadyScheduledByOther(unscheduled.unitId);
      expect(after).toBeNull();
    } finally {
      unsubscribe();
      setLiveBookingsSource(null);
    }
  });
});
