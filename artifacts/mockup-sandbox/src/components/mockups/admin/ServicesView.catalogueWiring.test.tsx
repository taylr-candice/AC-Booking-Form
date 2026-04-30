// @vitest-environment happy-dom

/**
 * Pins down the ServicesView → live catalogue → duration helper
 * propagation path (Task #182): editing a service entry must update
 * `getServiceRuleForAcType` and `getBookingDurationMinutes` for the
 * matching AC type, and leave other entries untouched.
 *
 * The Harness mirrors AdminApp's mount-effect wiring so the test
 * exercises the production source-registration flow.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getBookingDurationMinutes,
  setServiceRuleResolver,
  setUnitDurationContextResolver,
} from "@/state/bookingDerived";
import {
  getServiceRuleForAcType,
  notifyLiveServiceCatalogueChanged,
  SEEDED_SERVICES,
  setLiveServiceCatalogueSource,
  type AdminService,
} from "@/state/adminMockData";

import { ServicesView } from "./ServicesView";

afterEach(() => {
  cleanup();
  setLiveServiceCatalogueSource(null);
  setServiceRuleResolver(null);
  setUnitDurationContextResolver(null);
});

function Harness({ initial }: { initial: AdminService[] }) {
  const [services, setServices] = useState<AdminService[]>(initial);
  useEffect(() => {
    setLiveServiceCatalogueSource(() => services);
    notifyLiveServiceCatalogueChanged();
    setServiceRuleResolver((acType) => getServiceRuleForAcType(acType));
    return () => {
      setLiveServiceCatalogueSource(null);
      setServiceRuleResolver(null);
    };
  }, [services]);
  return <ServicesView services={services} setServices={setServices} />;
}

// ServicesView's per-row Edit / Remove buttons share accessible names
// across cards; this scopes a query to one row by walking up to the
// card root.
function findCardForName(name: string): HTMLElement {
  const heading = screen.getByText(name);
  const card = heading.closest("div.rounded-lg") as HTMLElement | null;
  if (!card) {
    throw new Error(`Could not find catalogue card for "${name}"`);
  }
  return card;
}

describe("ServicesView edits propagate into the live catalogue + duration helper", () => {
  it("editing the Split entry updates getServiceRuleForAcType('split') AND the booking duration", () => {
    render(<Harness initial={SEEDED_SERVICES.map((s) => ({ ...s }))} />);

    expect(getServiceRuleForAcType("split")).toEqual({
      baseMinutes: 45,
      addonMinutes: 15,
    });

    const splitCard = findCardForName("Split system service");
    fireEvent.click(within(splitCard).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/Base time/i), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByLabelText(/Add-on time/i), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(getServiceRuleForAcType("split")).toEqual({
      baseMinutes: 60,
      addonMinutes: 25,
    });
    expect(
      getBookingDurationMinutes({
        unit_id: null,
        num_systems: 2,
        num_additional_indoor: 1,
        ac_discrepancy: {
          recorded: { type: "split", systems: 2, additional: 1 },
          customer: { type: "split", systems: 2, additional: 1 },
        },
      }),
    ).toBe(2 * 60 + 1 * 25);

    // Ducted entry untouched.
    expect(getServiceRuleForAcType("ducted")).toEqual({
      baseMinutes: 45,
      addonMinutes: 15,
    });
  });

  it("editing the Ducted entry updates only the ducted rule", () => {
    render(<Harness initial={SEEDED_SERVICES.map((s) => ({ ...s }))} />);

    const ductedCard = findCardForName("Ducted system service");
    fireEvent.click(within(ductedCard).getByRole("button", { name: /edit/i }));

    fireEvent.change(screen.getByLabelText(/Add-on time/i), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(getServiceRuleForAcType("ducted")).toEqual({
      baseMinutes: 45,
      addonMinutes: 30,
    });
    expect(getServiceRuleForAcType("split")).toEqual({
      baseMinutes: 45,
      addonMinutes: 15,
    });

    expect(
      getBookingDurationMinutes({
        unit_id: null,
        num_systems: 1,
        num_additional_indoor: 2,
        ac_discrepancy: {
          recorded: { type: "ducted", systems: 1, additional: 2 },
          customer: { type: "ducted", systems: 1, additional: 2 },
        },
      }),
    ).toBe(45 + 2 * 30);
  });
});
