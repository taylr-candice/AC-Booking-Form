/**
 * Regression checks for the saved-session migration in `bookingSession.ts`.
 *
 * The booking flow shrunk from 7 steps to 6 steps, and `readFromStorage`
 * silently rewrites any persisted `current_step` so returning users land
 * on the right page instead of being thrown back to Step 1. If this ever
 * regresses, every returning user with a stored session breaks — and the
 * symptom is invisible in dev (sessionStorage is per-tab).
 *
 * The migration is exposed as a pure helper (`migratePersistedSession`)
 * so we can drive it directly here without spinning up a DOM.
 */

import { describe, expect, it } from "vitest";

import {
  migratePersistedSession,
  type BookingState,
  type StepId,
} from "./bookingSession";

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
