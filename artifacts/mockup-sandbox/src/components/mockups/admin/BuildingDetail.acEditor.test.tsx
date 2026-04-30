// @vitest-environment happy-dom

/**
 * Task #110 follow-up: ops can now edit a building's authoritative
 * AC type (`split` / `ducted`) and brand directly from
 * {@link BuildingDetail}'s summary card. This test pins the editor's
 * behaviour:
 *
 *   1. The Split / Ducted segmented control reflects the current
 *      `acType` and round-trips a click into `setBuildings`.
 *   2. The brand input commits non-empty edits on change, and a
 *      one-click suggestion chip commits the same way.
 *   3. The brand input keeps a local draft so admins can momentarily
 *      clear the field while typing, but on blur an empty value
 *      snaps back to the last committed brand — `acBrand` is a
 *      mandatory non-empty field on AdminBuilding (Task #110).
 *
 * The third clause is the important guard: without it, the trim
 * check in `commitAcBrand` would silently swallow the keystroke and
 * leave the input desynced from the stored brand.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
} from "@/state/adminMockData";

import { BuildingDetail } from "./BuildingDetail";

afterEach(cleanup);

const BUILDING_ID = "bldg-test";

function makeBuilding(): AdminBuilding {
  return {
    id: BUILDING_ID,
    name: "Test Tower",
    addressLine1: "1 Test St",
    addressLine2: "Suburb NSW 2000",
    acType: "split",
    acBrand: "Daikin",
  };
}

function makeUnit(): AdminUnit {
  return {
    id: "u1",
    addressLine1: "1 / 1 Test St",
    addressLine2: "Suburb NSW 2000",
    ac: { type: "split", brand: "", systems: 1, additional: 0 },
    agentId: null,
    buildingId: BUILDING_ID,
  };
}

function Harness({
  initial = makeBuilding(),
  onChange,
}: {
  initial?: AdminBuilding;
  onChange?: (next: AdminBuilding) => void;
}) {
  const [buildings, setBuildings] = useState<AdminBuilding[]>([initial]);
  return (
    <BuildingDetail
      buildingId={BUILDING_ID}
      buildings={buildings}
      setBuildings={(next) => {
        setBuildings(next);
        const updated = next.find((b) => b.id === BUILDING_ID);
        if (updated && onChange) onChange(updated);
      }}
      units={[makeUnit()]}
      bookings={[] as AdminBooking[]}
      onBack={() => {}}
      onOpenBooking={() => {}}
      onOpenAllBookings={() => {}}
      onNewBooking={() => {}}
      onOpenRollout={() => {}}
    />
  );
}

function getBrandInput(): HTMLInputElement {
  return screen.getByLabelText("AC brand") as HTMLInputElement;
}

describe("BuildingDetail · AC type & brand editor (Task #110 follow-up)", () => {
  it("Split / Ducted segmented control toggles the building's acType", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    const splitButton = screen.getByRole("button", { name: "Split" });
    const ductedButton = screen.getByRole("button", { name: "Ducted" });
    expect(splitButton.getAttribute("aria-pressed")).toBe("true");
    expect(ductedButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(ductedButton);
    expect(latest).not.toBeNull();
    expect(latest!.acType).toBe("ducted");
    // Re-rendered control reflects the new selection.
    expect(
      screen.getByRole("button", { name: "Ducted" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("typing in the brand input keeps the local draft; commit happens on blur", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    const input = getBrandInput();
    expect(input.value).toBe("Daikin");

    // Per-keystroke updates only flow into the local draft — the
    // parent buildings list is not churned on every character.
    fireEvent.change(input, { target: { value: "MyBrand" } });
    expect(input.value).toBe("MyBrand");
    expect(latest).toBeNull();

    // Blur commits the trimmed draft.
    fireEvent.blur(input);
    expect(latest).not.toBeNull();
    expect(latest!.acBrand).toBe("MyBrand");
    expect(getBrandInput().value).toBe("MyBrand");
  });

  it("Enter key commits the draft (same path as blur)", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    const input = getBrandInput();
    fireEvent.change(input, { target: { value: "Toshiba" } });
    expect(latest).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(latest).not.toBeNull();
    expect(latest!.acBrand).toBe("Toshiba");
  });

  it("commits the trimmed draft (leading / trailing whitespace stripped) on blur", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    const input = getBrandInput();
    fireEvent.change(input, { target: { value: "  Hitachi  " } });
    fireEvent.blur(input);
    expect(latest).not.toBeNull();
    expect(latest!.acBrand).toBe("Hitachi");
  });

  it("clicking a suggestion chip commits that brand", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    fireEvent.click(screen.getByRole("button", { name: "Mitsubishi" }));
    expect(latest).not.toBeNull();
    expect(latest!.acBrand).toBe("Mitsubishi");
    expect(getBrandInput().value).toBe("Mitsubishi");
    expect(
      screen
        .getByRole("button", { name: "Mitsubishi" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("clearing the input keeps the local draft empty (with a validation hint) but does NOT commit, and blur snaps back to the last saved brand", () => {
    let latest: AdminBuilding | null = null;
    render(<Harness onChange={(b) => (latest = b)} />);

    const input = getBrandInput();
    fireEvent.change(input, { target: { value: "" } });
    // Local draft cleared, validation hint surfaced…
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText(/brand can't be empty/i),
    ).toBeTruthy();
    // …but the building was never patched with the empty value.
    expect(latest).toBeNull();

    // On blur the input snaps back to the last committed brand so
    // the editor never leaves the building in an inconsistent state.
    fireEvent.blur(input);
    expect(getBrandInput().value).toBe("Daikin");
    expect(latest).toBeNull();
  });

  it("re-syncs the brand input when the building's stored brand changes from outside (e.g. a suggestion click)", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Fujitsu" }));
    expect(getBrandInput().value).toBe("Fujitsu");

    fireEvent.click(screen.getByRole("button", { name: "Panasonic" }));
    expect(getBrandInput().value).toBe("Panasonic");
  });
});
