// @vitest-environment happy-dom

/**
 * Regression test for the default-template hint surfaced on the
 * Awaiting-coordination bulk-action banner (Task #157).
 *
 * The bulk Log call / Log email pill at the bottom of the queue
 * doesn't tell ops which template is going to be pre-selected when
 * they open either form. Adding a small "(Log call default: …)"
 * hint above the pill lets a team lead confirm the active default
 * at a glance without opening the form or jumping to the templates
 * panel.
 *
 * What we lock in here:
 *   1. With at least one default set, the hint banner mounts above
 *      the bulk-action pill and names that default.
 *   2. With no defaults set, the hint banner is omitted entirely
 *      (so the seeded — no-default — catalog stays unchanged).
 *   3. The hint reflects the *live* defaults: flipping the default
 *      in the templates prop updates the hint on the next render,
 *      mirroring how the bulk forms themselves re-resolve the
 *      default on each open.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type CallTemplate,
  type EmailTemplate,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-test",
      name: "Test Tower",
      addressLine1: "1 Test St",
      addressLine2: "Suburb NSW 2000",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
  ];
}

function makeBooking(): AdminBooking {
  return {
    id: "bk-1",
    unitId: "u1",
    customerName: "Test Customer",
    customerEmail: "test@example.com",
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "T",
        last: "Tenant",
        email: "t@example.com",
        phone: "0411111111",
      },
    ],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline: [],
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
  };
}

function Harness({
  callTemplates,
  emailTemplates,
}: {
  callTemplates?: ReadonlyArray<CallTemplate>;
  emailTemplates?: ReadonlyArray<EmailTemplate>;
}) {
  const [filter, setFilter] = useState<"all">("all");
  return (
    <AwaitingCoordinationView
      bookings={[makeBooking()]}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter as never}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      onBulkLogCall={() => {}}
      onBulkLogEmail={() => {}}
      callTemplates={callTemplates}
      emailTemplates={emailTemplates}
    />
  );
}

describe("AwaitingCoordinationView · bulk-action default-template hint", () => {
  it("with no defaults set, the hint banner is omitted (seeded catalogs leave isDefault unset)", () => {
    render(<Harness />);
    // Need a selection to mount the bulk-action bar at all.
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));

    expect(screen.getByTestId("bulk-action-bar-coordination")).toBeTruthy();
    // No default on either channel ⇒ hint banner is not rendered.
    expect(screen.queryByTestId("bulk-action-bar-default-hint")).toBeNull();
    expect(screen.queryByTestId("bulk-action-bar-default-call")).toBeNull();
    expect(screen.queryByTestId("bulk-action-bar-default-email")).toBeNull();
  });

  it("when a call default is set, the hint names that template; flipping the default updates the hint live", () => {
    function App() {
      const [calls, setCalls] = useState<ReadonlyArray<CallTemplate>>(
        CALL_TEMPLATES.map((t, i) =>
          i === 0 ? { ...t, isDefault: true } : t,
        ),
      );
      return (
        <>
          <button
            type="button"
            data-testid="flip-call-default"
            onClick={() =>
              setCalls((prev) =>
                prev.map((t, i) => ({ ...t, isDefault: i === 1 })),
              )
            }
          >
            flip
          </button>
          <Harness callTemplates={calls} />
        </>
      );
    }
    render(<App />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));

    const hint = screen.getByTestId("bulk-action-bar-default-hint");
    expect(hint).toBeTruthy();
    const callHint = screen.getByTestId("bulk-action-bar-default-call");
    expect(callHint.textContent).toContain(CALL_TEMPLATES[0].name);
    // Email side has no default — only the call hint shows.
    expect(screen.queryByTestId("bulk-action-bar-default-email")).toBeNull();

    // Flip the default to a different template — the hint should
    // re-resolve from the live prop on the next render.
    fireEvent.click(screen.getByTestId("flip-call-default"));
    const callHintAfter = screen.getByTestId("bulk-action-bar-default-call");
    expect(callHintAfter.textContent).toContain(CALL_TEMPLATES[1].name);
    expect(callHintAfter.textContent).not.toContain(CALL_TEMPLATES[0].name);
  });

  it("when both channels have a default, the hint names both", () => {
    const calls = CALL_TEMPLATES.map((t, i) =>
      i === 0 ? { ...t, isDefault: true } : t,
    );
    const emails = EMAIL_TEMPLATES.map((t, i) =>
      i === 0 ? { ...t, isDefault: true } : t,
    );
    render(<Harness callTemplates={calls} emailTemplates={emails} />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));

    const callHint = screen.getByTestId("bulk-action-bar-default-call");
    const emailHint = screen.getByTestId("bulk-action-bar-default-email");
    expect(callHint.textContent).toContain(CALL_TEMPLATES[0].name);
    expect(emailHint.textContent).toContain(EMAIL_TEMPLATES[0].name);
  });

  it("when only the email channel has a default, the call half of the hint is omitted", () => {
    const emails = EMAIL_TEMPLATES.map((t, i) =>
      i === 0 ? { ...t, isDefault: true } : t,
    );
    render(<Harness emailTemplates={emails} />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));

    expect(screen.getByTestId("bulk-action-bar-default-hint")).toBeTruthy();
    expect(screen.queryByTestId("bulk-action-bar-default-call")).toBeNull();
    const emailHint = screen.getByTestId("bulk-action-bar-default-email");
    expect(emailHint.textContent).toContain(EMAIL_TEMPLATES[0].name);
  });
});
