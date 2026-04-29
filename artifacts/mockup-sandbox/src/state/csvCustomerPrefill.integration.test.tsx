// @vitest-environment happy-dom

/**
 * Integration test for Task #64.
 *
 * The customer-facing AC step (Step 3 of the booking flow) used to read
 * a hardcoded `UNIT_AC_CATALOG` lookup. That made admin-side unit edits
 * — both the single-unit editor and the bulk CSV import — invisible to
 * the customer's pre-fill, even though both shells were mounted in the
 * same React tree on the canvas. This test walks the round-trip an
 * admin actually performs:
 *
 *   1. Export the units list (formatUnitsCsv).
 *   2. Edit one unit's AC config in the exported CSV text.
 *   3. Re-import the edited CSV (parseUnitsImport + applyUnitsImport).
 *   4. Register the resulting units list as the live source so the
 *      customer flow's helpers (`getAcRecord` / `getAcType`) read it.
 *   5. Drive the customer flow to Step 3 for the edited unit and assert
 *      the rendered "we have on record" panel reflects the new values.
 *
 * Out of scope (per task brief):
 *   - Real backend persistence — the live source is in-memory only.
 *   - CSV column contract changes.
 *   - Customer AC step UI changes.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AcMobile } from "../components/mockups/booking-pages/AcMobile";
import { bookingActions } from "./bookingSession";
import {
  SEEDED_AGENTS,
  SEEDED_UNITS,
  setLiveUnitsSource,
  notifyLiveUnitsChanged,
  type AdminUnit,
} from "./adminMockData";
import {
  applyUnitsImport,
  formatUnitsCsv,
  parseUnitsImport,
} from "./unitsCsv";

beforeEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
});

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.sessionStorage.clear();
  bookingActions.reset();
  // Restore the default getter so other test files start clean.
  setLiveUnitsSource(null);
});

describe("CSV unit edits flow through to customer AC pre-fill", () => {
  it(
    "export → edit AC counts in CSV → re-import → customer Step 3 " +
      "shows the edited 'on file' values",
    () => {
      // ── 1. Start from a unit whose seeded AC config we'll change.
      //
      //   u2 (12 / 88 Marine Parade) is seeded as
      //     { type: "split", systems: 2, additional: 0 }
      //
      //   We'll bump it via CSV to
      //     { type: "ducted", systems: 3, additional: 2 }
      //
      //   so the assertion against the on-file summary card is
      //   unambiguous and can't accidentally match the original.
      const startUnits: readonly AdminUnit[] = SEEDED_UNITS;
      const u2Before = startUnits.find((u) => u.id === "u2");
      expect(u2Before).toBeDefined();
      expect(u2Before!.ac).toEqual({
        type: "split",
        systems: 2,
        additional: 0,
      });

      // ── 2. Export → mutate the row's three AC columns → re-import.
      const exported = formatUnitsCsv(startUnits);

      // The exported CSV uses the documented column order; we rewrite
      // u2's row by string-replacing the recognisable cell signature
      // rather than parsing/regenerating the row by hand. This keeps
      // the test honest about going through the real CSV text.
      const editedCsv = exported.replace(
        /u2,12 \/ 88 Marine Parade,Coogee NSW 2034,split,2,0,/,
        "u2,12 / 88 Marine Parade,Coogee NSW 2034,ducted,3,2,",
      );
      expect(editedCsv).not.toBe(exported); // sanity: replacement landed

      const preview = parseUnitsImport(editedCsv, startUnits, SEEDED_AGENTS);
      expect(preview.fatal).toBeUndefined();
      expect(preview.counts.error).toBe(0);
      // u2 should be classified as an "update", not a "new" row.
      const u2Row = preview.rows.find(
        (r) => r.parsed?.id === "u2" || r.raw.id === "u2",
      );
      expect(u2Row?.status).toBe("update");

      let nextIdSeq = 0;
      const nextId = () => `gen-${++nextIdSeq}`;
      const updatedUnits = applyUnitsImport(startUnits, preview, nextId);

      const u2After = updatedUnits.find((u) => u.id === "u2");
      expect(u2After?.ac).toEqual({
        type: "ducted",
        systems: 3,
        additional: 2,
      });

      // ── 3. Register the edited units as the live source the customer
      //       flow reads from. This mirrors what AdminApp does in its
      //       `useEffect` keyed on `units`.
      setLiveUnitsSource(() => updatedUnits);
      notifyLiveUnitsChanged();

      // ── 4. Drive the customer flow to Step 3 for u2 and render.
      bookingActions.setUnit("u2");

      const { getByTestId } = render(<AcMobile />);

      // The "we have on record" summary card must reflect the new
      // values: 3 ducted systems + 2 extra return-air grilles (ducted's
      // add-on wording is "return-air grille(s)"). If the page were
      // still reading the old hardcoded catalog, it would render
      // "2 split systems" with no "extra" suffix.
      const summary = getByTestId("card-on-file-summary-mobile");
      expect(summary).toHaveTextContent(/3\s+ducted systems/i);
      expect(summary).toHaveTextContent(/\+\s*2\s+extra return-air grilles/i);
    },
  );

  it(
    "single-unit editor edits (in-memory unit list mutation) flow " +
      "through to the customer's on-file summary the same way",
    () => {
      // Mirrors what UnitsView's single-unit editor does: build a new
      // units array with one entry replaced, then setUnits(next). We
      // skip the editor UI here because Task #64 is about the data
      // pipeline, not the editor's own UX (which is already covered).
      const u3Edited: AdminUnit = {
        id: "u3",
        addressLine1: "5B / 14 Bayview Avenue",
        addressLine2: "Mosman NSW 2088",
        ac: { type: "split", systems: 4, additional: 1 },
        agentId: null,
        buildingId: SEEDED_UNITS.find((u) => u.id === "u3")!.buildingId,
      };
      const updatedUnits: AdminUnit[] = SEEDED_UNITS.map((u) =>
        u.id === "u3" ? u3Edited : u,
      );

      setLiveUnitsSource(() => updatedUnits);
      notifyLiveUnitsChanged();

      bookingActions.setUnit("u3");

      const { getByTestId } = render(<AcMobile />);

      // u3 was seeded as "unknown" (no record) so the original page
      // would have shown the full configuration view instead of the
      // summary card. Seeing the summary card with the new counts is
      // direct evidence the customer is reading the live admin units.
      const summary = getByTestId("card-on-file-summary-mobile");
      expect(summary).toHaveTextContent(/4\s+split systems/i);
      expect(summary).toHaveTextContent(/\+\s*1\s+extra indoor unit/i);
    },
  );
});
