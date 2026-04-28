/**
 * Regression checks for `isStep5Valid` — the gatekeeper that decides
 * whether the user can move past the Access step.
 *
 * `isStep5Valid` branches on every supported access-method family and
 * inspects a different set of follow-up fields per branch (spec §6.3 +
 * §6.7). A single missed branch means the Continue button lights up on
 * a half-filled form, so each family is pinned here:
 *
 *   - Layer A: role + residence preconditions, plus the
 *     `agent_tenant_pending` sentinel rejection.
 *   - Layer B: the chosen method must be valid for the
 *     (role, residence) pair.
 *   - Layer C: the per-family follow-up requirements
 *     (leave-key, parcel-locker, collect-and-return, tenant,
 *     managing-agent, agent trade key, be-there / at-unit /
 *     agent_tenant_self).
 *
 * `isStep5Valid` is a pure function over `BookingState`, so each test
 * builds a fresh full-state object via `baseState()` rather than
 * driving the singleton store — that keeps the tests independent and
 * fast, and it lets us assert "missing exactly this one field flips
 * the result" with no setup coupling between cases.
 */

import { describe, expect, it } from "vitest";

import { isStep5Valid } from "./accessMethodCatalog";
import type {
  AccessMethod,
  BookingState,
  PrimaryResidence,
  Role,
} from "./bookingSession";

// ─── Test helper ────────────────────────────────────────────────────────────

/** Build a complete BookingState with sensible empty defaults so each test
 *  only needs to spell out the fields it cares about. */
function baseState(overrides: Partial<BookingState> = {}): BookingState {
  return {
    current_step: 5,
    unit_id: "unit-1",
    role: null,
    agency_id: null,
    contact_first_name: "",
    contact_last_name: "",
    contact_email: "",
    contact_phone: "",
    num_systems: 1,
    num_additional_indoor: 0,
    primary_residence: null,
    access_method: null,
    key_holder_name: "",
    key_holder_phone: "",
    key_collection_location: "",
    return_method: null,
    managing_agency_id: null,
    tenants: [],
    signature_acknowledged: false,
    signature_name: "",
    access_notes: "",
    service_date: null,
    service_slot: null,
    cancellation_acknowledged: false,
    ...overrides,
  };
}

// ─── Layer A: role / residence / sentinel ──────────────────────────────────

describe("isStep5Valid — Layer A (role + residence preconditions)", () => {
  it("rejects when role is null", () => {
    expect(isStep5Valid(baseState())).toBe(false);
  });

  it("rejects an owner with no primary_residence selected", () => {
    expect(isStep5Valid(baseState({ role: "owner" }))).toBe(false);
  });

  it("rejects when access_method is null even after role + residence are set", () => {
    expect(
      isStep5Valid(baseState({ role: "owner", primary_residence: "live_in" })),
    ).toBe(false);
  });

  it("rejects an access_method that doesn't belong to the (role, residence) pair", () => {
    // owner_leased_be_there is a leased-out option — not valid for live_in.
    expect(
      isStep5Valid(
        baseState({
          role: "owner",
          primary_residence: "live_in",
          access_method: "owner_leased_be_there",
        }),
      ),
    ).toBe(false);
  });

  it("rejects an owner method picked while role is agent", () => {
    expect(
      isStep5Valid(
        baseState({
          role: "agent",
          access_method: "owner_live_at_unit",
        }),
      ),
    ).toBe(false);
  });
});

describe("isStep5Valid — agent_tenant_pending sentinel", () => {
  it("is rejected when nothing else is filled", () => {
    expect(
      isStep5Valid(
        baseState({
          role: "agent",
          access_method: "agent_tenant_pending",
        }),
      ),
    ).toBe(false);
  });

  it("is rejected even when every other field is fully populated", () => {
    // The user MUST explicitly pick a coordination sub-option; the sentinel
    // can never count as "complete" no matter how much else is filled in.
    expect(
      isStep5Valid(
        baseState({
          role: "agent",
          access_method: "agent_tenant_pending",
          tenants: [
            {
              first: "Sarah",
              last: "Lee",
              email: "sarah.lee@example.com",
              phone: "0412 345 678",
            },
          ],
          signature_acknowledged: true,
          signature_name: "Agent Smith",
        }),
      ),
    ).toBe(false);
  });
});

// ─── Layer C: per-family follow-up requirements ────────────────────────────

describe("isStep5Valid — leave-key family", () => {
  const leaveKeyMethods: Array<{
    method: AccessMethod;
    residence: PrimaryResidence;
  }> = [
    { method: "owner_live_leave_key", residence: "live_in" },
    { method: "owner_leased_leave_key", residence: "leased_out" },
    { method: "owner_vacant_leave_key", residence: "vacant" },
  ];

  for (const { method, residence } of leaveKeyMethods) {
    describe(method, () => {
      const valid = baseState({
        role: "owner",
        primary_residence: residence,
        access_method: method,
        key_holder_name: "Alex Smith",
        key_holder_phone: "0400 000 000",
      });

      it("returns true with both key-holder name and phone", () => {
        expect(isStep5Valid(valid)).toBe(true);
      });

      it("rejects when key_holder_name is empty", () => {
        expect(isStep5Valid({ ...valid, key_holder_name: "" })).toBe(false);
      });

      it("rejects when key_holder_phone is empty", () => {
        expect(isStep5Valid({ ...valid, key_holder_phone: "" })).toBe(false);
      });

      it("rejects when key_holder_name is whitespace-only", () => {
        expect(isStep5Valid({ ...valid, key_holder_name: "   " })).toBe(false);
      });

      it("rejects when key_holder_phone is whitespace-only", () => {
        expect(isStep5Valid({ ...valid, key_holder_phone: "   " })).toBe(false);
      });
    });
  }
});

describe("isStep5Valid — parcel-locker family", () => {
  // Parcel-locker methods are unattended — the customer authorises Taylr to
  // retrieve the key, access the unit, and return the key without anyone
  // present. The signature lives on the access step (so the slot picker
  // doesn't need its own checkbox), and the gate requires both the
  // acknowledgement and a typed name before Step 5 is valid.
  const parcelLockerMethods: Array<{
    method: AccessMethod;
    residence: PrimaryResidence;
  }> = [
    { method: "owner_live_parcel_locker", residence: "live_in" },
    { method: "owner_leased_parcel_locker", residence: "leased_out" },
    { method: "owner_vacant_parcel_locker", residence: "vacant" },
  ];

  for (const { method, residence } of parcelLockerMethods) {
    const valid = baseState({
      role: "owner",
      primary_residence: residence,
      access_method: method,
      signature_acknowledged: true,
      signature_name: "Pat Owner",
    });

    describe(method, () => {
      it("accepts when the access-authorisation signature is captured", () => {
        expect(isStep5Valid(valid)).toBe(true);
      });

      it("rejects when the acknowledgement checkbox is unchecked", () => {
        expect(
          isStep5Valid({ ...valid, signature_acknowledged: false }),
        ).toBe(false);
      });

      it("rejects when the typed signature name is empty", () => {
        expect(isStep5Valid({ ...valid, signature_name: "" })).toBe(false);
      });

      it("rejects when the typed signature name is whitespace only", () => {
        expect(isStep5Valid({ ...valid, signature_name: "   " })).toBe(false);
      });
    });
  }
});

describe("isStep5Valid — collect-and-return family", () => {
  const collectMethods: Array<{
    method: AccessMethod;
    residence: PrimaryResidence;
  }> = [
    { method: "owner_live_collect", residence: "live_in" },
    { method: "owner_vacant_collect", residence: "vacant" },
  ];

  for (const { method, residence } of collectMethods) {
    describe(method, () => {
      const valid = baseState({
        role: "owner",
        primary_residence: residence,
        access_method: method,
        key_collection_location: "Concierge desk, Lvl 1",
        return_method: "locker",
        signature_acknowledged: true,
        signature_name: "Alex Smith",
      });

      it("returns true with location, return method and signature filled in", () => {
        expect(isStep5Valid(valid)).toBe(true);
      });

      it("rejects when key_collection_location is empty", () => {
        expect(
          isStep5Valid({ ...valid, key_collection_location: "" }),
        ).toBe(false);
      });

      it("rejects when key_collection_location is whitespace-only", () => {
        expect(
          isStep5Valid({ ...valid, key_collection_location: "   " }),
        ).toBe(false);
      });

      it("rejects when return_method is null", () => {
        expect(isStep5Valid({ ...valid, return_method: null })).toBe(false);
      });

      it("rejects when signature is not acknowledged", () => {
        expect(
          isStep5Valid({ ...valid, signature_acknowledged: false }),
        ).toBe(false);
      });

      it("rejects when signature_name is empty", () => {
        expect(isStep5Valid({ ...valid, signature_name: "" })).toBe(false);
      });
    });
  }
});

describe("isStep5Valid — tenant family (owner_leased_tenant + agent_tenant_taylr)", () => {
  const tenantMethods: Array<{
    method: AccessMethod;
    role: Role;
    residence: PrimaryResidence | null;
  }> = [
    { method: "owner_leased_tenant", role: "owner", residence: "leased_out" },
    { method: "agent_tenant_taylr", role: "agent", residence: null },
  ];

  const goodTenant = {
    first: "Sarah",
    last: "Lee",
    email: "sarah.lee@example.com",
    phone: "0412 345 678",
  };

  for (const { method, role, residence } of tenantMethods) {
    describe(method, () => {
      const valid = baseState({
        role,
        primary_residence: residence,
        access_method: method,
        tenants: [{ ...goodTenant }],
        signature_acknowledged: true,
        signature_name: "Owner Name",
      });

      it("returns true with one valid tenant + signed authorisation", () => {
        expect(isStep5Valid(valid)).toBe(true);
      });

      it("rejects when there are zero tenants", () => {
        expect(isStep5Valid({ ...valid, tenants: [] })).toBe(false);
      });

      it("rejects when any tenant first name is missing", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, first: "" }],
          }),
        ).toBe(false);
      });

      it("rejects when any tenant last name is missing", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, last: "" }],
          }),
        ).toBe(false);
      });

      it('rejects when any tenant email fails the email-shape check (e.g. "not-an-email")', () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, email: "not-an-email" }],
          }),
        ).toBe(false);
      });

      it("rejects an email that is missing the domain (e.g. \"user@\")", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, email: "user@" }],
          }),
        ).toBe(false);
      });

      it("rejects an email that is missing the TLD (e.g. \"user@host\")", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, email: "user@host" }],
          }),
        ).toBe(false);
      });

      it("rejects when any tenant phone is missing", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [{ ...goodTenant, phone: "" }],
          }),
        ).toBe(false);
      });

      it("rejects when even one tenant in a multi-tenant list is invalid", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [
              { ...goodTenant },
              { ...goodTenant, email: "not-an-email" },
            ],
          }),
        ).toBe(false);
      });

      it("returns true with multiple fully-valid tenants", () => {
        expect(
          isStep5Valid({
            ...valid,
            tenants: [
              { ...goodTenant },
              {
                first: "Michael",
                last: "Wong",
                email: "m.wong@example.com",
                phone: "0498 765 432",
              },
            ],
          }),
        ).toBe(true);
      });

      it("rejects when signature is not acknowledged", () => {
        expect(
          isStep5Valid({ ...valid, signature_acknowledged: false }),
        ).toBe(false);
      });

      it("rejects when signature_name is empty", () => {
        expect(isStep5Valid({ ...valid, signature_name: "" })).toBe(false);
      });
    });
  }
});

describe("isStep5Valid — managing-agent family (owner_leased_agent)", () => {
  const valid = baseState({
    role: "owner",
    primary_residence: "leased_out",
    access_method: "owner_leased_agent",
    managing_agency_id: "agency-001",
  });

  it("returns true once a managing agency has been picked", () => {
    expect(isStep5Valid(valid)).toBe(true);
  });

  it("rejects when no managing agency has been picked", () => {
    expect(isStep5Valid({ ...valid, managing_agency_id: null })).toBe(false);
  });
});

describe("isStep5Valid — agent trade-key family (agent_trade_key)", () => {
  const valid = baseState({
    role: "agent",
    access_method: "agent_trade_key",
    signature_acknowledged: true,
    signature_name: "Agent Smith",
  });

  it("returns true once the access authorisation is signed", () => {
    expect(isStep5Valid(valid)).toBe(true);
  });

  it("rejects when signature is not acknowledged", () => {
    expect(
      isStep5Valid({ ...valid, signature_acknowledged: false }),
    ).toBe(false);
  });

  it("rejects when signature_name is empty", () => {
    expect(isStep5Valid({ ...valid, signature_name: "" })).toBe(false);
  });

  it("rejects when signature_name is whitespace-only", () => {
    expect(isStep5Valid({ ...valid, signature_name: "   " })).toBe(false);
  });
});

describe("isStep5Valid — be-there / at-unit / agent_tenant_self (no follow-ups)", () => {
  // These methods only require Layer A + Layer B. Once selected, Step 5 is
  // immediately valid — no extra fields, no signature, no agency pick.
  const noFollowUpCases: Array<{ label: string; state: BookingState }> = [
    {
      label: "owner_live_at_unit",
      state: baseState({
        role: "owner",
        primary_residence: "live_in",
        access_method: "owner_live_at_unit",
      }),
    },
    {
      label: "owner_leased_be_there",
      state: baseState({
        role: "owner",
        primary_residence: "leased_out",
        access_method: "owner_leased_be_there",
      }),
    },
    {
      label: "owner_vacant_be_there",
      state: baseState({
        role: "owner",
        primary_residence: "vacant",
        access_method: "owner_vacant_be_there",
      }),
    },
    {
      label: "agent_be_there",
      state: baseState({
        role: "agent",
        access_method: "agent_be_there",
      }),
    },
    {
      label: "agent_tenant_self",
      state: baseState({
        role: "agent",
        access_method: "agent_tenant_self",
      }),
    },
  ];

  for (const { label, state } of noFollowUpCases) {
    it(`${label}: requires nothing beyond Layer A/B`, () => {
      expect(isStep5Valid(state)).toBe(true);
    });
  }
});
