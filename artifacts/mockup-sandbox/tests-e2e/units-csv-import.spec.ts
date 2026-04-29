import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin Units → Import CSV modal.
 *
 * Drives the real admin mockup (`/__mockup/preview/admin/AdminApp`) in
 * a headless Chromium so we exercise the full Vite-built bundle the
 * user actually sees, including Radix portals and react-day-picker
 * widgets that React Testing Library's happy-dom can mis-render.
 *
 * Coverage:
 *   1. Open Units → Import CSV → modal renders with Apply disabled.
 *   2. Paste a mixed CSV (1 update + 1 new + 1 error) → counts bar
 *      reads {New:1, Updates:1, Unchanged:0, Errors:1}, the update
 *      row's diff is rendered, the error row's message is rendered,
 *      Apply is disabled with the "Fix the error rows" hint.
 *   3. Fix the CSV → counts re-compute, Apply re-enables with
 *      "Apply 2 changes", click Apply → modal closes, the rendered
 *      Units table reflects the changes (`u1` acType "split", new
 *      "99 Brand New Lane" row added).
 *   4. Round-trip: paste a CSV that exactly matches an existing unit
 *      (`u-aspen-02`) → row is "Unchanged", Apply is disabled with
 *      "Nothing to change", Cancel closes the modal cleanly.
 *
 * Seed-data assumptions (see `state/adminMockData.ts`):
 *   • `u1`         — "G01 / 335 Aspen Boulevard", Greenway ACT 2900,
 *                    ac { type: "ducted", systems: 1, additional: 1 }
 *   • `u-aspen-02` — "G02 / 335 Aspen Boulevard", Greenway ACT 2900,
 *                    ac { type: "ducted", systems: 1, additional: 0 }
 */

// Append the path to the configured BASE_PATH so the spec is portable
// across CIs that may host the dev server under a different prefix.
const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

async function goToUnits(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  // Sidebar nav: switch from default "Bookings" to "Units".
  await page.getByRole("button", { name: "Units", exact: true }).click();
  // The toolbar button "Import CSV" is the unambiguous signal that the
  // Units view has finished mounting.
  await expect(page.getByTestId("button-units-import")).toBeVisible();
}

async function openImportModal(page: Page): Promise<Locator> {
  await page.getByTestId("button-units-import").click();
  const modal = page.getByTestId("modal-units-import");
  await expect(modal).toBeVisible();
  return modal;
}

async function pasteCsv(modal: Locator, csvText: string): Promise<void> {
  // `fill` clears first, so a second paste fully replaces (rather than
  // appends to) the previous CSV content — same semantics the textarea
  // would see from a real paste-and-overwrite.
  await modal.getByTestId("textarea-units-import-csv").fill(csvText);
}

/**
 * Read the count for a given chip label (`New`, `Updates`, `Unchanged`,
 * `Errors`) out of the counts bar. Each chip renders as
 * `<span>{count}</span><span>{label}</span>` inside a wrapper.
 */
async function countFor(modal: Locator, label: string): Promise<number> {
  const counts = modal.getByTestId("text-units-import-counts");
  const chip = counts
    .locator(`xpath=.//span[normalize-space(text())='${label}']/..`)
    .first();
  const text = await chip.innerText();
  // The chip text is "<count>\n<label>" or "<count> <label>". Strip
  // the label and any whitespace, parse the rest as an integer.
  const cleaned = text.replace(label, "").replace(/\s+/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`Could not parse count for "${label}" from "${text}"`);
  }
  return n;
}

async function expectCounts(
  modal: Locator,
  expected: { new: number; update: number; unchanged: number; error: number },
): Promise<void> {
  expect(await countFor(modal, "New")).toBe(expected.new);
  expect(await countFor(modal, "Updates")).toBe(expected.update);
  expect(await countFor(modal, "Unchanged")).toBe(expected.unchanged);
  expect(await countFor(modal, "Errors")).toBe(expected.error);
}

test.describe("Admin Units → Import CSV", () => {
  test("previews mixed CSV, gates Apply on errors, then applies the fixed CSV into the table", async ({
    page,
  }) => {
    await goToUnits(page);

    // Sanity: seeded `u1` shows "G01 / 335 Aspen Boulevard" with AC
    // type "ducted" and systems "1".
    const u1RowBefore = page
      .getByRole("row", { name: /G01 \/ 335 Aspen Boulevard/i })
      .first();
    await expect(u1RowBefore).toContainText("ducted");
    await expect(u1RowBefore.locator("td").nth(2)).toHaveText("1");

    // ── Open modal ──────────────────────────────────────────────────
    const modal = await openImportModal(page);
    const apply = modal.getByTestId("button-units-import-apply");
    // Before any CSV is pasted, Apply is disabled (no preview yet).
    await expect(apply).toBeDisabled();

    // ── Paste a mixed CSV: 1 update + 1 new + 1 error ───────────────
    const mixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      // Update u1: ducted → split, systems 1 → 2
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      // New unit (no id)
      ",99 Brand New Lane,Lot 99,split,1,0,",
      // Error: unknown AC type "foo"
      ",30 Bad Lane,,foo,1,0,",
    ].join("\n");
    await pasteCsv(modal, mixedCsv);

    // ── Counts bar ──────────────────────────────────────────────────
    await expectCounts(modal, { new: 1, update: 1, unchanged: 0, error: 1 });

    // ── Update-row diff (Notes column, last cell of the row) ────────
    // The parser numbers rows from 1 (header), so the update row is
    // row 2 in the preview table.
    const updateRow = modal.getByTestId("row-units-import-2");
    await expect(updateRow).toContainText("Update");
    // The diff is rendered inside the row's last cell. Scope the
    // assertion there to avoid matching the AC-config column (which
    // echoes the new acType verbatim).
    const updateDiffCell = updateRow.locator("td").nth(5);
    await expect(updateDiffCell).toContainText("acType:");
    await expect(updateDiffCell).toContainText("ducted");
    await expect(updateDiffCell).toContainText("split");
    await expect(updateDiffCell).toContainText("systems:");

    // ── Error row visible with its message ──────────────────────────
    const errorRow = modal.getByTestId("row-units-import-4");
    await expect(errorRow).toContainText("Error");
    await expect(errorRow).toContainText(/Unknown AC type "foo"/);

    // ── Apply gated by the error row ────────────────────────────────
    await expect(apply).toBeDisabled();
    await expect(modal).toContainText(/Fix the error rows before applying/);

    // ── Fix the CSV: drop the bad row, keep the update + new ────────
    const fixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
    ].join("\n");
    await pasteCsv(modal, fixedCsv);

    await expectCounts(modal, { new: 1, update: 1, unchanged: 0, error: 0 });
    await expect(apply).toBeEnabled();
    await expect(apply).toContainText(/Apply 2 changes/);

    // ── Apply ───────────────────────────────────────────────────────
    await apply.click();
    await expect(modal).toBeHidden();

    // ── Table reflects the changes ──────────────────────────────────
    // u1 row: AC type now "split" (was "ducted"); systems cell (3rd
    // column) reads "2" and extras (4th column) reads "1".
    const u1RowAfter = page
      .getByRole("row", { name: /G01 \/ 335 Aspen Boulevard/i })
      .first();
    await expect(u1RowAfter).toContainText("split");
    await expect(u1RowAfter.locator("td").nth(2)).toHaveText("2");
    await expect(u1RowAfter.locator("td").nth(3)).toHaveText("1");

    // The freshly-created unit shows up as its own row.
    const newRow = page
      .getByRole("row", { name: /99 Brand New Lane/i })
      .first();
    await expect(newRow).toBeVisible();
    await expect(newRow).toContainText("split");
  });

  test("flags an exact-match CSV as Unchanged and keeps Apply disabled", async ({
    page,
  }) => {
    await goToUnits(page);

    const modal = await openImportModal(page);

    // Round-trip: paste a CSV that exactly matches the seeded
    // `u-aspen-02` unit — no field changes at all.
    const matchingCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u-aspen-02,G02 / 335 Aspen Boulevard,Greenway ACT 2900,ducted,1,0,ag-001",
    ].join("\n");
    await pasteCsv(modal, matchingCsv);

    await expectCounts(modal, { new: 0, update: 0, unchanged: 1, error: 0 });

    const unchangedRow = modal.getByTestId("row-units-import-2");
    await expect(unchangedRow).toContainText("Unchanged");
    await expect(unchangedRow).toContainText(
      /Already matches the record on file/,
    );

    const apply = modal.getByTestId("button-units-import-apply");
    await expect(apply).toBeDisabled();
    await expect(modal).toContainText(/Nothing to change/);

    // Cancel closes the modal cleanly.
    await modal.getByTestId("button-units-import-cancel").click();
    await expect(modal).toBeHidden();
  });
});
