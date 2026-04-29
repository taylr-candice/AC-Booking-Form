import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin Units → Import CSV modal.
 *
 * Drives the live admin mockup in headless Chromium so the full
 * Vite-built bundle is exercised (Radix portals, real React state).
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `u1`         — "G01 / 335 Aspen Boulevard", ducted/1/1
 *   - `u-aspen-02` — "G02 / 335 Aspen Boulevard", ducted/1/0
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

async function goToUnits(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.getByRole("button", { name: "Units", exact: true }).click();
  await expect(page.getByTestId("button-units-import")).toBeVisible();
}

async function openImportModal(page: Page): Promise<Locator> {
  await page.getByTestId("button-units-import").click();
  const modal = page.getByTestId("modal-units-import");
  await expect(modal).toBeVisible();
  return modal;
}

async function pasteCsv(modal: Locator, csvText: string): Promise<void> {
  await modal.getByTestId("textarea-units-import-csv").fill(csvText);
}

async function countFor(modal: Locator, label: string): Promise<number> {
  const chip = modal
    .getByTestId("text-units-import-counts")
    .locator(`xpath=.//span[normalize-space(text())='${label}']/..`)
    .first();
  const text = await chip.innerText();
  return Number(text.replace(label, "").replace(/\s+/g, ""));
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

    const u1RowBefore = page
      .getByRole("row", { name: /G01 \/ 335 Aspen Boulevard/i })
      .first();
    await expect(u1RowBefore).toContainText("ducted");
    await expect(u1RowBefore.locator("td").nth(2)).toHaveText("1");

    const modal = await openImportModal(page);
    const apply = modal.getByTestId("button-units-import-apply");
    await expect(apply).toBeDisabled();

    const mixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
      ",30 Bad Lane,,foo,1,0,",
    ].join("\n");
    await pasteCsv(modal, mixedCsv);

    await expectCounts(modal, { new: 1, update: 1, unchanged: 0, error: 1 });

    const updateRow = modal.getByTestId("row-units-import-2");
    await expect(updateRow).toContainText("Update");
    // Diff is rendered in the row's last cell; scope here so the AC
    // config column (which echoes the new acType) doesn't false-match.
    const updateDiffCell = updateRow.locator("td").nth(5);
    await expect(updateDiffCell).toContainText("acType:");
    await expect(updateDiffCell).toContainText("ducted");
    await expect(updateDiffCell).toContainText("split");
    await expect(updateDiffCell).toContainText("systems:");

    const errorRow = modal.getByTestId("row-units-import-4");
    await expect(errorRow).toContainText("Error");
    await expect(errorRow).toContainText(/Unknown AC type "foo"/);

    await expect(apply).toBeDisabled();
    await expect(modal).toContainText(/Fix the error rows before applying/);

    const fixedCsv = [
      "id,addressLine1,addressLine2,acType,systems,additional,agentId",
      "u1,G01 / 335 Aspen Boulevard,Greenway ACT 2900,split,2,1,ag-001",
      ",99 Brand New Lane,Lot 99,split,1,0,",
    ].join("\n");
    await pasteCsv(modal, fixedCsv);

    await expectCounts(modal, { new: 1, update: 1, unchanged: 0, error: 0 });
    await expect(apply).toBeEnabled();
    await expect(apply).toContainText(/Apply 2 changes/);

    await apply.click();
    await expect(modal).toBeHidden();

    const u1RowAfter = page
      .getByRole("row", { name: /G01 \/ 335 Aspen Boulevard/i })
      .first();
    await expect(u1RowAfter).toContainText("split");
    await expect(u1RowAfter.locator("td").nth(2)).toHaveText("2");
    await expect(u1RowAfter.locator("td").nth(3)).toHaveText("1");

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

    await modal.getByTestId("button-units-import-cancel").click();
    await expect(modal).toBeHidden();
  });
});
