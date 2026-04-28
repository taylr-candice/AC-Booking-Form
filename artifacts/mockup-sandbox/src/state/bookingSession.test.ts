/**
 * Regression checks for the booking session store.
 *
 * Two independent concerns are pinned here:
 *
 *   A. `migratePersistedSession` — the booking flow shrunk from 7 steps
 *      to 6 steps. `readFromStorage` silently rewrites any persisted
 *      `current_step` so returning users land on the right page instead
 *      of being thrown back to Step 1. Exposed as a pure helper so we
 *      can drive it without spinning up a DOM.
 *
 *   B. Step 5 cascade-clearing — switching access method or primary
 *      residence MUST wipe stale follow-up fields (key holder, return
 *      method, managing agency, tenants, signature) so we don't ship
 *      wrong data downstream. Picking a coordination method while sitting
 *      on Step 5 must also auto-advance the wrapper to Step 6 so the
 *      user never lingers on a now-hidden step.
 *
 * The store is a module-level singleton, so each cascade-clear test
 * starts with `bookingActions.reset()` to avoid order coupling.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  bookingActions,
  COORDINATION_ACCESS_METHODS,
  getBookingSession,
  migratePersistedSession,
  type AccessMethod,
  type AcDiscrepancy,
  type BookingState,
  type StepId,
} from "./bookingSession";

// ─── A. migratePersistedSession ────────────────────────────────────────────

/** Helper: serialize a partial persisted blob the way sessionStorage would. */
function persisted(blob: Record<string, unknown>): string {
  return JSON.stringify(blob);
}

describe("migratePersistedSession — legacy 7-step → new 6-step mapping", () => {
  // Spec from bookingSession.ts:
  //   old Step 2 (standalone "Your role") → new Step 1
  //   old Steps 3..7 shift down by one → new Steps 2..6
  const cases: Array<{ legacy: number; expected: StepId }> = [
    { legacy: 1, expected: 1 },
    { legacy: 2, expected: 1 },
    { legacy: 3, expected: 2 },
    { legacy: 4, expected: 3 },
    { legacy: 5, expected: 4 },
    { legacy: 6, expected: 5 },
    { legacy: 7, expected: 6 },
  ];

  for (const { legacy, expected } of cases) {
    it(`maps legacy step ${legacy} → new step ${expected}`, () => {
      const out = migratePersistedSession(persisted({ current_step: legacy }));
      expect(out.current_step).toBe(expected);
    });
  }
});

describe("migratePersistedSession — clamping out-of-range steps", () => {
  // Anything that doesn't land in the new 1..6 window after migration must
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
        current_step: 4, // legacy → new Step 3 (Contact)
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

  it("keeps Step 5 (access) details when migrating from legacy Step 6 → new Step 5", () => {
    const out = migratePersistedSession(
      persisted({
        current_step: 6,
        primary_residence: "leased_out",
        access_method: "owner_leased_tenant",
        tenants: [
          { first: "Alex", last: "Kim", email: "a@k.com", phone: "+1555" },
        ],
        signature_acknowledged: true,
        signature_name: "Owner Name",
      }),
    );

    expect(out.current_step).toBe(5);
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
  });
});

// ─── B. Step 5 cascade-clearing in bookingActions ──────────────────────────

describe("Step 5 cascade clears (bookingActions)", () => {
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
    // chosen access_method, every Step 5 follow-up, and the schedule slot.
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

    it("owner → agent: clears agency, primary_residence, access_method, every Step 5 follow-up, and the schedule slot", () => {
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

  describe("setAccessMethod — auto-advances away from a now-hidden Step 5", () => {
    it("advances current_step from 5 → 6 when switching INTO any coordination method while on Step 5", () => {
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
        bookingActions.goToStep(5);
        expect(getBookingSession().current_step).toBe(5);

        bookingActions.setAccessMethod(method);

        const s = getBookingSession();
        expect(s.access_method).toBe(method);
        expect(s.current_step).toBe(6);
      }
    });

    it("does NOT advance when switching to a non-coordination method while on Step 5", () => {
      bookingActions.setRole("owner");
      bookingActions.setPrimaryResidence("live_in");
      bookingActions.goToStep(5);

      bookingActions.setAccessMethod("owner_live_at_unit");

      const s = getBookingSession();
      expect(s.access_method).toBe("owner_live_at_unit");
      expect(s.current_step).toBe(5);
    });

    it("does NOT change current_step when switching INTO a coordination method while NOT on Step 5", () => {
      bookingActions.setRole("agent");
      bookingActions.goToStep(4);

      bookingActions.setAccessMethod("agent_tenant_taylr");

      const s = getBookingSession();
      expect(s.access_method).toBe("agent_tenant_taylr");
      // Auto-advance only protects users who would otherwise linger on Step 5.
      expect(s.current_step).toBe(4);
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
  // The Step 4 AC page records the gap between Taylr's records and what
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

  // ─── E. AC step origin hint ─────────────────────────────────────────────
  // The AC step's "you came back to confirm AC details" banner reads
  // `ac_step_origin === "slot_picker"`. The origin is set by the slot
  // picker's "Update/Edit AC info" affordance via `editAcFromSlotPicker`,
  // and cleared by every other entry path into Step 3 (NAV_FORWARD,
  // NAV_BACK, step-dot click — all of which funnel through `goToStep`).
  // It can also be cleared manually by the banner's dismiss button.
  describe("E. AC step origin hint", () => {
    beforeEach(() => {
      bookingActions.reset();
    });

    it("starts null on a fresh session", () => {
      expect(getBookingSession().ac_step_origin).toBeNull();
    });

    it("editAcFromSlotPicker atomically jumps to Step 3 and records the origin", () => {
      // Pretend the customer is on Step 5 (Schedule) about to tap Edit AC.
      bookingActions.goToStep(5);
      expect(getBookingSession().ac_step_origin).toBeNull();

      bookingActions.editAcFromSlotPicker();
      const s = getBookingSession();
      expect(s.current_step).toBe(3);
      expect(s.ac_step_origin).toBe("slot_picker");
    });

    it("goToStep clears the origin — every non-affordance entry path", () => {
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession().ac_step_origin).toBe("slot_picker");

      // Forward (continue) past Step 3 — origin must clear so a later
      // back-then-forward arrival doesn't re-show the banner.
      bookingActions.goToStep(4);
      expect(getBookingSession().ac_step_origin).toBeNull();

      // Re-set, then prove a step-dot click TO Step 3 also clears it.
      bookingActions.editAcFromSlotPicker();
      expect(getBookingSession().ac_step_origin).toBe("slot_picker");
      bookingActions.goToStep(3);
      expect(getBookingSession().ac_step_origin).toBeNull();
    });

    it("setAcStepOrigin(null) clears the hint without changing the step", () => {
      bookingActions.editAcFromSlotPicker();
      const before = getBookingSession();
      expect(before.current_step).toBe(3);
      expect(before.ac_step_origin).toBe("slot_picker");

      bookingActions.setAcStepOrigin(null);
      const after = getBookingSession();
      expect(after.current_step).toBe(3);
      expect(after.ac_step_origin).toBeNull();
    });

    it("editAcFromSlotPicker is a no-op when already on Step 3 with the origin set", () => {
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
    bookingActions.setReturnTo(5);
    expect(getBookingSession().return_to).toBe(5);
  });

  it("setReturnTo(null) clears the hint", () => {
    bookingActions.setReturnTo(5);
    bookingActions.setReturnTo(null);
    expect(getBookingSession().return_to).toBeNull();
  });

  it("setReturnTo no-ops when the value is unchanged", () => {
    bookingActions.setReturnTo(5);
    const ref = getBookingSession();
    bookingActions.setReturnTo(5);
    expect(getBookingSession()).toBe(ref);
  });

  it("goToStep clears return_to when the customer arrives at the hinted step", () => {
    // Simulate the wrapper: customer was on the slot picker (Step 5),
    // tapped "Update AC info", which jumps to AC (Step 3) and stashes
    // the hint. After confirming, the wrapper jumps to Step 5 — at
    // which point the hint must clear so it never affects later
    // forward navigation.
    bookingActions.goToStep(5);
    bookingActions.setReturnTo(5);
    bookingActions.goToStep(3);
    expect(getBookingSession().return_to).toBe(5);

    bookingActions.goToStep(5);
    expect(getBookingSession().current_step).toBe(5);
    expect(getBookingSession().return_to).toBeNull();
  });

  it("goToStep keeps return_to intact when stepping to a different step", () => {
    bookingActions.setReturnTo(5);
    bookingActions.goToStep(2);
    expect(getBookingSession().return_to).toBe(5);
    bookingActions.goToStep(4);
    expect(getBookingSession().return_to).toBe(5);
  });

  it("reset wipes return_to back to null", () => {
    bookingActions.setReturnTo(5);
    bookingActions.reset();
    expect(getBookingSession().return_to).toBeNull();
  });

  it("bookAnother wipes return_to back to null", () => {
    bookingActions.setReturnTo(5);
    bookingActions.bookAnother();
    expect(getBookingSession().return_to).toBeNull();
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
  function seedFullSessionOnStep6() {
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
    bookingActions.goToStep(6);
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
    seedFullSessionOnStep6();
    bookingActions.markUnitUnavailable();

    const before = getBookingSession();
    expect(before.unit_unavailable).toBe(true);
    expect(before.unit_id).toBe("unit-123");
    expect(before.ac_discrepancy).not.toBeNull();
    expect(before.current_step).toBe(6);

    bookingActions.pickAnotherUnit();

    const after = getBookingSession();
    // Flag cleared, unit + discrepancy wiped, back to Step 1.
    expect(after.unit_unavailable).toBe(false);
    expect(after.unit_id).toBeNull();
    expect(after.ac_discrepancy).toBeNull();
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
    seedFullSessionOnStep6();
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
