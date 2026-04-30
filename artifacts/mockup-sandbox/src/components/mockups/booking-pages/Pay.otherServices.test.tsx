// @vitest-environment happy-dom

/**
 * Pins the Pay-step "other services" summary rows for both PayMobile
 * and PayDesktop: stable `row-pay-other-{id}` testid per selected
 * service, qty-aware name (`{qty} × {name}` when qty > 1) and price
 * (`priceAud × qty + addonPriceAud × (qty − 1)`), and `text-total`
 * consistency with `computeBookingTotal`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentType } from "react";

import { PayMobile } from "./PayMobile";
import { PayDesktop } from "./PayDesktop";
import {
  type OtherServiceRule,
  setOtherServiceLookup,
} from "../../../state/bookingDerived";
import { computeBookingTotal } from "../../../state/bookingHelpers";
import {
  bookingActions,
  getBookingSession,
} from "../../../state/bookingSession";

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
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
  // Mirrors the resolver-override pattern in `otherServices.test.ts`.
  setOtherServiceLookup((id) => RULES[id] ?? null);
});

afterEach(() => {
  cleanup();
  setOtherServiceLookup(null);
  bookingActions.reset();
  if (typeof window !== "undefined") window.sessionStorage.clear();
});

const VARIANTS: ReadonlyArray<{
  label: string;
  Component: ComponentType;
}> = [
  { label: "PayMobile", Component: PayMobile },
  { label: "PayDesktop", Component: PayDesktop },
];

describe.each(VARIANTS)(
  "$label — Pay summary 'other services' rows",
  ({ Component }) => {
    it(
      "renders one row-pay-other-{id} per selected service at qty 1, " +
        "in toggle order, with the bare service name and the base $priceAud",
      () => {
        bookingActions.toggleOtherService(BATHROOM.id);
        bookingActions.toggleOtherService(KITCHEN.id);

        const { getByTestId, queryAllByTestId } = render(<Component />);

        const bathroomRow = getByTestId(`row-pay-other-${BATHROOM.id}`);
        const kitchenRow = getByTestId(`row-pay-other-${KITCHEN.id}`);

        // qty = 1 → name shown bare (no "1 × " prefix).
        expect(bathroomRow).toHaveTextContent(BATHROOM.name);
        expect(kitchenRow).toHaveTextContent(KITCHEN.name);
        expect(bathroomRow).not.toHaveTextContent("×");
        expect(kitchenRow).not.toHaveTextContent("×");

        // qty = 1 → row price = priceAud (no add-on contribution).
        expect(bathroomRow).toHaveTextContent(`$${BATHROOM.priceAud}`);
        expect(kitchenRow).toHaveTextContent(`$${KITCHEN.priceAud}`);

        const allRows = queryAllByTestId(/^row-pay-other-/);
        expect(allRows).toHaveLength(2);
        expect(allRows[0]).toBe(bathroomRow);
        expect(allRows[1]).toBe(kitchenRow);
      },
    );

    it(
      "shows '{qty} × {name}' and qty-aware price (priceAud × qty + addonPriceAud × (qty − 1)) when qty > 1",
      () => {
        bookingActions.setOtherServiceQuantity(BATHROOM.id, 3);
        bookingActions.setOtherServiceQuantity(KITCHEN.id, 1);

        const { getByTestId } = render(<Component />);

        const bathroomRow = getByTestId(`row-pay-other-${BATHROOM.id}`);
        const kitchenRow = getByTestId(`row-pay-other-${KITCHEN.id}`);

        // 3 × Bathroom: $99 × 3 + $25 × 2 = $297 + $50 = $347.
        expect(bathroomRow).toHaveTextContent(`3 × ${BATHROOM.name}`);
        expect(bathroomRow).toHaveTextContent(
          `$${BATHROOM.priceAud * 3 + BATHROOM.addonPriceAud * 2}`,
        );

        // qty = 1 still renders the bare name and base price.
        expect(kitchenRow).toHaveTextContent(KITCHEN.name);
        expect(kitchenRow).not.toHaveTextContent("×");
        expect(kitchenRow).toHaveTextContent(`$${KITCHEN.priceAud}`);
      },
    );

    it(
      "renders no row-pay-other-* rows when other_service_quantities is empty",
      () => {
        const { queryAllByTestId, queryByTestId } = render(<Component />);

        expect(queryAllByTestId(/^row-pay-other-/)).toHaveLength(0);
        expect(queryByTestId(`row-pay-other-${BATHROOM.id}`)).toBeNull();
        expect(queryByTestId(`row-pay-other-${KITCHEN.id}`)).toBeNull();
      },
    );

    it(
      "text-total matches computeBookingTotal when other services are selected",
      () => {
        bookingActions.setOtherServiceQuantity(BATHROOM.id, 2);
        bookingActions.setOtherServiceQuantity(KITCHEN.id, 1);

        const { getByTestId } = render(<Component />);

        const expected = computeBookingTotal(getBookingSession());
        expect(getByTestId("text-total")).toHaveTextContent(`$${expected}`);
      },
    );

    it(
      "text-total matches computeBookingTotal when no other services are selected",
      () => {
        const { getByTestId } = render(<Component />);

        const expected = computeBookingTotal(getBookingSession());
        expect(getByTestId("text-total")).toHaveTextContent(`$${expected}`);
      },
    );
  },
);
