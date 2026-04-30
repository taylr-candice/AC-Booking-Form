// @vitest-environment happy-dom
/**
 * Regression guard for the booking session's sessionStorage round-trip.
 *
 * The bug: `readFromStorage` was unconditionally running
 * `migratePersistedSession` on every call. Because the legacy migration
 * shifts step values down by 1, a wrapper write of e.g. `current_step=5`
 * was being read back as `current_step=4` by the next iframe that
 * re-mounted, then written back as 4, then read as 3, and so on —
 * silently corrupting the booking flow whenever the iframe re-mounted
 * (which is the entire wrapper navigation model).
 *
 * The fix stamps a `__schema` version marker on every write so the
 * migrator can tell already-normalized state apart from a raw legacy
 * blob and skip the one-time migration on every subsequent read.
 *
 * These tests deliberately exercise the public surface (`bookingActions`
 * + `getBookingSession`) instead of reaching into private helpers,
 * because that's the same path real consumers (the wrapper, every
 * iframe page) take. They run under happy-dom so `sessionStorage` is
 * available — the rest of the bookingSession test suite stays in node
 * since it only needs the pure-function API.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { bookingActions, getBookingSession } from "./bookingSession";

const STORAGE_KEY = "taylr.bookingSession.v2";

describe("booking session storage round-trip stability", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    bookingActions.reset();
  });

  it("preserves current_step exactly after a wrapper write and re-read", () => {
    bookingActions.goToStep(5);
    expect(getBookingSession().current_step).toBe(5);

    // Inspect what we actually persisted: the schema version marker
    // MUST be present (otherwise the next reader would treat the blob
    // as legacy and shift current_step down to 4).
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      current_step: number;
      __schema?: number;
    };
    expect(parsed.current_step).toBe(5);
    expect(parsed.__schema).toBe(4);
  });

  it("does not drift current_step across many bookingAction writes", () => {
    // Mirrors what AcMobile's mount-time effects do (set systems,
    // additional, return_to) on top of a wrapper-set current_step.
    // Without the schema marker, every one of these writes would
    // cause the next read to shift current_step down by one.
    bookingActions.goToStep(3);
    bookingActions.setSystems(2);
    bookingActions.setAdditionalIndoor(1);
    bookingActions.setReturnTo(5);

    expect(getBookingSession().current_step).toBe(3);
    expect(getBookingSession().return_to).toBe(5);

    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw as string) as {
      current_step: number;
      return_to: number | null;
    };
    expect(parsed.current_step).toBe(3);
    expect(parsed.return_to).toBe(5);
  });

  it("storage events from a 'remote' write update the local store without re-shifting", () => {
    // Simulate the cross-iframe sync path: another window writes a
    // versioned blob and dispatches a `storage` event. The receiver's
    // listener calls readFromStorage, which MUST trust the persisted
    // current_step (since `__schema === 3`) and not shift it.
    bookingActions.goToStep(1); // start somewhere known
    const remote = {
      __schema: 3,
      ...getBookingSession(),
      current_step: 4,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(remote),
      }),
    );

    expect(getBookingSession().current_step).toBe(4);
  });

  it("still applies the legacy step migration to UNVERSIONED persisted blobs", () => {
    // A returning user with legacy state in sessionStorage should still
    // be migrated correctly on first load: legacy step 5 → new step 4.
    // (The schema marker only short-circuits future reads of state
    // that THIS app has written.)
    const legacyBlob = JSON.stringify({ current_step: 5, unit_id: "u1" });
    window.sessionStorage.setItem(STORAGE_KEY, legacyBlob);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: legacyBlob,
      }),
    );

    expect(getBookingSession().current_step).toBe(4);
  });
});
