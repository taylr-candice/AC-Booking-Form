/**
 * Regression checks for `bookingActions.bookAnother` in `bookingSession.ts`.
 *
 * Spec §12: after a successful submission, a returning user can start a
 * fresh booking from the confirmation screen. To save them re-typing
 * their identity, the store keeps:
 *   - role
 *   - agency_id (and agency_other_name IFF the agency is still "Other")
 *   - contact_first_name / _last_name / _email / _phone
 *
 * Everything else is wiped back to {@link INITIAL_STATE} defaults — unit,
 * AC counts, primary residence, access method, every Step-5 follow-up,
 * the schedule, the cancellation acknowledgement, the AC discrepancy
 * snapshot — and `current_step` returns to 1 so the wrapper reopens on
 * the unit page.
 *
 * This rule has no UI surface (the store enforces it on its own), so a
 * silent regression here would let stale unit / residence / access /
 * schedule answers from the previous booking leak into a brand-new
 * booking with no warning. Tests below pin each piece down.
 *
 * Implementation detail: the store keeps a single module-level `state`
 * variable, so we reset it between tests with `bookingActions.reset()`.
 * Mirrors the pattern used by `bookingSession.cascade.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bookingActions,
  getBookingSession,
  type AccessMethod,
  type Tenant,
} from "./bookingSession";

// ─── Test helpers ──────────────────────────────────────────────────────────

// Mirror of `OTHER_AGENCY_ID_INTERNAL` in `bookingSession.ts`. Duplicated
// here for the same reason it's duplicated in the production module —
// the store is dependency-free, so we can't import it from the catalog.
// If the canonical id changes in `bookingSession.ts`, update this too.
const OTHER_AGENCY_ID = "agency-005";

const SAMPLE_TENANT: Tenant = {
  first: "Alex",
  last: "Kim",
  email: "alex@example.com",
  phone: "+15551110000",
};

/**
 * Drive the store into a fully-populated state so we can prove every
 * non-preserved field is actually wiped (rather than coincidentally
 * matching its initial default).
 */
function seedFullSession(opts: {
  agency_id?: string;
  access_method?: AccessMethod;
  current_step?: 1 | 2 | 3 | 4 | 5 | 6;
} = {}) {
  bookingActions.setUnit("unit-123");
  bookingActions.setRole("owner");
  bookingActions.setAgency(opts.agency_id ?? "agency-1");
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
  bookingActions.setPrimaryResidence("leased_out");
  bookingActions.setAccessMethod(opts.access_method ?? "owner_leased_leave_key");
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
  bookingActions.setCancellationAcknowledged(true);
  if (opts.current_step !== undefined) {
    bookingActions.goToStep(opts.current_step);
  }
}

beforeEach(() => {
  bookingActions.reset();
});

afterEach(() => {
  bookingActions.reset();
});

// ─── Preservation ──────────────────────────────────────────────────────────

describe("bookingActions.bookAnother — preserves identity-level fields", () => {
  it("keeps role across the reset", () => {
    seedFullSession();

    bookingActions.bookAnother();

    expect(getBookingSession().role).toBe("owner");
  });

  it("keeps agency_id across the reset", () => {
    seedFullSession({ agency_id: "agency-1" });

    bookingActions.bookAnother();

    expect(getBookingSession().agency_id).toBe("agency-1");
  });

  it("keeps every contact field across the reset", () => {
    seedFullSession();

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.contact_first_name).toBe("Sam");
    expect(s.contact_last_name).toBe("Lee");
    expect(s.contact_email).toBe("sam@example.com");
    expect(s.contact_phone).toBe("+15551234567");
  });
});

// ─── agency_other_name carry-over rule ─────────────────────────────────────

describe("bookingActions.bookAnother — agency_other_name carry-over", () => {
  it("preserves agency_other_name when the retained agency is the 'Other / not listed' option", () => {
    seedFullSession({ agency_id: OTHER_AGENCY_ID });
    bookingActions.setAgencyOtherName("Mom & Pop Realty");

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.agency_id).toBe(OTHER_AGENCY_ID);
    expect(s.agency_other_name).toBe("Mom & Pop Realty");
  });

  it("clears agency_other_name when the retained agency is a real (non-Other) agency", () => {
    // Stage a non-empty agency_other_name first via the "Other" path so
    // the value really flows through the system, then transition to a
    // real agency. `setAgency` will already scrub the name as a
    // side-effect — and `bookAnother`'s conditional carry-over is the
    // belt-and-braces second line of defence against any future
    // regression that lets a stale name slip past `setAgency`.
    bookingActions.setRole("agent");
    bookingActions.setAgency(OTHER_AGENCY_ID);
    bookingActions.setAgencyOtherName("Mom & Pop Realty");
    bookingActions.setAgency("agency-1");
    bookingActions.setContact({
      contact_first_name: "Sam",
      contact_last_name: "Lee",
      contact_email: "sam@example.com",
      contact_phone: "+15551234567",
    });

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.agency_id).toBe("agency-1");
    expect(s.agency_other_name).toBe("");
  });

  it("clears agency_other_name when no agency was retained (agency_id is null)", () => {
    // Nothing seeded — role / agency / contact all start at defaults.
    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.agency_id).toBeNull();
    expect(s.agency_other_name).toBe("");
  });
});

// ─── Wipe ──────────────────────────────────────────────────────────────────

describe("bookingActions.bookAnother — wipes non-identity fields", () => {
  it("clears the unit selection", () => {
    seedFullSession();

    bookingActions.bookAnother();

    expect(getBookingSession().unit_id).toBeNull();
  });

  it("resets the AC step (systems → 1, additional indoor → 0, discrepancy → null)", () => {
    seedFullSession();

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.num_systems).toBe(1);
    expect(s.num_additional_indoor).toBe(0);
    expect(s.ac_discrepancy).toBeNull();
  });

  it("clears primary residence and access method", () => {
    seedFullSession();

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.primary_residence).toBeNull();
    expect(s.access_method).toBeNull();
  });

  it("clears every Step-5 follow-up field (key holder, collection, return, managing agency, tenants, signature, notes)", () => {
    seedFullSession();

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.key_holder_name).toBe("");
    expect(s.key_holder_phone).toBe("");
    expect(s.key_collection_location).toBe("");
    expect(s.return_method).toBeNull();
    expect(s.managing_agency_id).toBeNull();
    expect(s.tenants).toEqual([]);
    expect(s.signature_acknowledged).toBe(false);
    expect(s.signature_name).toBe("");
    // access_notes survives the per-method cascade in `setAccessMethod`
    // but is NOT identity-level — it's specific to the previous unit's
    // access situation, so bookAnother must wipe it.
    expect(s.access_notes).toBe("");
  });

  it("clears the schedule (date and slot)", () => {
    seedFullSession();

    bookingActions.bookAnother();
    const s = getBookingSession();

    expect(s.service_date).toBeNull();
    expect(s.service_slot).toBeNull();
  });

  it("clears the cancellation acknowledgement", () => {
    seedFullSession();

    bookingActions.bookAnother();

    expect(getBookingSession().cancellation_acknowledged).toBe(false);
  });
});

// ─── Wrapper navigation ────────────────────────────────────────────────────

describe("bookingActions.bookAnother — wrapper navigation", () => {
  it("returns current_step to 1 from the post-submission step", () => {
    seedFullSession({ current_step: 6 });

    bookingActions.bookAnother();

    expect(getBookingSession().current_step).toBe(1);
  });

  it("returns current_step to 1 from any intermediate step", () => {
    for (const step of [1, 2, 3, 4, 5, 6] as const) {
      bookingActions.reset();
      seedFullSession({ current_step: step });

      bookingActions.bookAnother();

      expect(getBookingSession().current_step).toBe(1);
    }
  });
});
