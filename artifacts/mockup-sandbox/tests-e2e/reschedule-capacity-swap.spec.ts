import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin Reschedule action's
 * rollout-capacity swap (Task #99).
 *
 * `rescheduleAppointment` in `AdminApp.tsx`:
 *   1. releases the booking's footprint from its current rollout slot,
 *   2. consumes that footprint at the newly-picked slot,
 *   3. appends a "Rescheduled · {short date} · {window}" timeline entry
 *      attributed to "Mia (admin)".
 *
 * Existing unit tests cover the timeline-entry helper in isolation; this
 * spec drives the live admin shell so the AdminApp wiring + the
 * RolloutScheduleEditor's capacity readouts stay in lockstep.
 *
 * Seed (see `state/adminMockData.ts`):
 *   - bk-1041   — Amal Khoury, scheduled on Marine Apr 30 PM (slot count = 1/6).
 *   - rl-ac-marine — slots-per-window rollout, 6 slots per window. Apr 29 AM
 *                    is empty (0/6) and openByAdmin, so it's a clean
 *                    reschedule destination.
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const BOOKING_ID = "bk-1041";
const FROM_DATE = "2026-04-30";
const FROM_WINDOW = "afternoon";
const TO_DATE = "2026-04-29";
const TO_WINDOW = "morning";
const ROLLOUT_NAME = /Marine Parade rollout/;

async function openMarineRolloutEditor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Rollouts", exact: true }).click();
  await page.getByRole("button", { name: ROLLOUT_NAME }).click();
  // The editor's day cards only render once the editor is mounted; wait
  // on a deterministic seed-day testid before reading capacity values.
  await expect(page.getByTestId(`rollout-day-${FROM_DATE}`)).toBeVisible();
}

async function readSlotUtilization(
  page: Page,
  isoDate: string,
  window: "morning" | "afternoon",
): Promise<string> {
  const cell = page.getByTestId(
    `rollout-slot-${isoDate}-${window}-utilization`,
  );
  // The button renders "<bookedCount> / <slotCount>" with the count text
  // first, so the leading span is what we care about.
  return (await cell.locator("span").first().innerText()).trim();
}

async function backToRolloutList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back to rollouts" }).click();
}

test.describe("Admin reschedule swaps rollout capacity", () => {
  test("decrements the old slot, increments the new slot, and stamps the timeline", async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);

    // ── 1. Capture the seed capacity for both slots so the assertions
    //       below are anchored to a real "before / after" delta.
    await openMarineRolloutEditor(page);
    const beforeSource = await readSlotUtilization(page, FROM_DATE, FROM_WINDOW);
    const beforeDest = await readSlotUtilization(page, TO_DATE, TO_WINDOW);
    expect(beforeSource).toBe("1 / 6");
    expect(beforeDest).toBe("0 / 6");
    await backToRolloutList(page);

    // ── 2. Drive the admin reschedule from the booking's detail page.
    await page.getByRole("button", { name: "Bookings", exact: true }).click();
    const bookingRow = page.getByRole("button", {
      name: new RegExp(`Open booking ${BOOKING_ID}`),
    });
    await bookingRow.click();

    // Sanity-check the booking lands on its seeded slot before we move
    // it. The detail's Schedule-card SlotCell (chips.SlotCell) is the
    // only spot on the page that prints the raw ISO date, so it's a
    // reliable anchor for "current slot".
    await expect(page.getByText(FROM_DATE, { exact: true })).toBeVisible();

    await page.getByTestId("button-reschedule-appointment").click();

    const modal = page.getByTestId("modal-reschedule-booking");
    await expect(modal).toBeVisible();
    // Header echoes the current slot so an admin can sanity-check what
    // they're about to move.
    await expect(modal).toContainText(
      new RegExp(`Currently ${FROM_DATE} · ${FROM_WINDOW}`),
    );

    const confirm = modal.getByTestId("button-confirm-reschedule");
    // Same-as-current is gated → confirm starts disabled until the
    // admin picks a different slot.
    await expect(confirm).toBeDisabled();

    await modal
      .getByTestId(`rollout-pick-slot-${TO_DATE}__${TO_WINDOW}`)
      .click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(modal).toBeHidden();

    // ── 3. Toast confirms the swap landed (auto-dismisses after 4s, so
    //       check this first — uses the same short-date formatter as
    //       the timeline entry below).
    await expect(
      page.getByText(`${BOOKING_ID} rescheduled to 29 Apr · Morning`),
    ).toBeVisible();

    // Booking detail now reflects the new slot — the chips.SlotCell is
    // the only spot on the page that prints the raw ISO date.
    await expect(page.getByText(TO_DATE, { exact: true })).toBeVisible();
    await expect(page.getByText(FROM_DATE, { exact: true })).toHaveCount(0);

    // The service timeline picked up the rescheduled-by-Mia entry.
    // Last timeline-entry on the page belongs to the Service timeline
    // (Payment timeline runs above it on the detail page).
    const lastTimelineEntry = page
      .locator('[data-testid^="timeline-entry-"]')
      .last();
    await expect(lastTimelineEntry).toContainText(
      "Rescheduled · 29 Apr · Morning",
    );
    await expect(lastTimelineEntry).toContainText("Mia (admin)");
    await expect(lastTimelineEntry).toContainText("Just now");

    // ── 4. Rollouts editor: the source slot freed a count and the
    //       destination slot picked one up.
    await openMarineRolloutEditor(page);
    const afterSource = await readSlotUtilization(page, FROM_DATE, FROM_WINDOW);
    const afterDest = await readSlotUtilization(page, TO_DATE, TO_WINDOW);
    expect(afterSource).toBe("0 / 6");
    expect(afterDest).toBe("1 / 6");
  });
});
