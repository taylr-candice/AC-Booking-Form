import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the success-toast Undo affordance
 * (Task #92) wired into the schedule-coordination flow (Task #78).
 *
 * Walks the live admin mockup through:
 *
 *   1. Capture the rollout slot's pre-scheduling utilisation so the
 *      assertion at the end can compare against a real "before"
 *      number.
 *   2. From the Awaiting-coordination view, open a coordination
 *      booking and click "Schedule appointment".
 *   3. In the SchedulingModal, pick a known-empty date + window and
 *      confirm. The success toast must appear with an "Undo" pill.
 *   4. Click "Undo" on the toast (it auto-dismisses after 4s, so the
 *      click must land first). The toast disappears.
 *   5. Assert the inverse landed:
 *        - the booking is back in "to_be_coordinated" (the
 *          "Schedule appointment" CTA reappears on the detail and
 *          the booking is back on the Awaiting-coordination queue);
 *        - the freshly-appended "Coordinated · {short date} ·
 *          {window}" timeline entry is gone;
 *        - the rollout slot's utilisation is back to the captured
 *          pre-scheduling value (booked count for slots-per-window;
 *          booked minutes for time-budget-per-window).
 *
 * Both capacity models are exercised so the helper that owns the
 * inverse — `revertScheduledToCoordinationPatch` plus the
 * matching `releaseBookingCapacity` rollback in
 * `AdminApp.scheduleCoordinationBooking` — gets covered for the
 * `slots_per_window` (count-based) and `time_budget_per_window`
 * (minute-based) branches.
 *
 * Seed-data references (see `state/adminMockData.ts`):
 *   - `bk-1044` — Mateo Alvarez, unit `u-marine-04` (split / 1 / 0),
 *                 coordination on `rl-ac-marine` (slots-per-window).
 *                 Pre-schedule: 4/29 morning is 0/6.
 *   - `bk-1043` — Priya Kapoor, unit `u-aspen-05` (ducted / 1 / +1),
 *                 coordination on `rl-ac-aspen` (time-budget).
 *                 Pre-schedule: 4/29 morning is 45/240 min;
 *                 booking is 45 + 15 = 60 min, so post-schedule
 *                 would be 105/240 and post-undo back to 45/240.
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const PICK_DATE = "2026-04-29";
const PICK_WINDOW = "morning";

async function gotoAdmin(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  // The sidebar is always rendered — wait on it before clicking around
  // so the very first assertion doesn't race the initial paint.
  await expect(
    page.getByRole("button", { name: "Bookings", exact: true }),
  ).toBeVisible();
}

async function openRolloutEditor(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name: "Rollouts", exact: true }).click();
  await page.getByRole("button", { name }).click();
  // Wait on a deterministic seed-day testid so the day cards have
  // mounted before reading capacity values out of them.
  await expect(page.getByTestId(`rollout-day-${PICK_DATE}`)).toBeVisible();
}

async function backToRollouts(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Back to rollouts" }).click();
}

async function readSlotUtilization(
  page: Page,
  isoDate: string,
  window: "morning" | "afternoon",
): Promise<string> {
  const cell = page.getByTestId(
    `rollout-slot-${isoDate}-${window}-utilization`,
  );
  // The button renders "<count>" / "<budget> min" as the leading span,
  // followed by the edit pencil — read just the leading span.
  return (await cell.locator("span").first().innerText()).trim();
}

async function gotoAwaitingCoordination(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Awaiting coordination", exact: true })
    .click();
}

async function openCoordinationBooking(
  page: Page,
  id: string,
  name: string,
): Promise<void> {
  await page
    .getByRole("button", {
      name: new RegExp(`Open booking ${id} for ${name}`, "i"),
    })
    .click();
  // BookingDetail renders the back affordance — wait on it so the
  // assertions below don't race the route transition.
  await expect(page.getByRole("button", { name: /Back to list/i })).toBeVisible();
}

async function scheduleAndUndo(
  page: Page,
  bookingId: string,
  customerName: string,
  rolloutName: RegExp,
  expectedUtilization: string,
): Promise<void> {
  // ── 1. Capture the seed utilisation for the slot we're about to
  //       schedule into. Doing this through the Rollouts view
  //       (rather than reading mock state directly) keeps the
  //       assertion locked to what an admin would actually see.
  await openRolloutEditor(page, rolloutName);
  const beforeUtil = await readSlotUtilization(page, PICK_DATE, PICK_WINDOW);
  expect(beforeUtil).toBe(expectedUtilization);
  await backToRollouts(page);

  // ── 2. Open the coordination booking and start the schedule flow.
  await gotoAwaitingCoordination(page);
  await openCoordinationBooking(page, bookingId, customerName);

  // The Schedule CTA on the BookingDetail (Schedule card for
  // coordination bookings) is the entry point for ops.
  await page.getByTestId("button-schedule-coordination").click();
  const scheduleModal = page.getByTestId("modal-schedule-booking");
  await expect(scheduleModal).toBeVisible();

  // ── 3. Pick the empty slot we just measured, then confirm.
  await scheduleModal
    .getByTestId(`rollout-pick-slot-${PICK_DATE}__${PICK_WINDOW}`)
    .click();
  await scheduleModal.getByTestId("button-confirm-schedule").click();
  await expect(scheduleModal).toBeHidden();

  // The success toast lands with an Undo pill (Task #92). The toast
  // auto-dismisses after 4s, so the Undo click must land before the
  // timer fires — Playwright's auto-wait + the testid lookup are
  // fast enough to make this reliable.
  const toast = page.getByTestId("toast-success");
  await expect(toast).toBeVisible();
  // Sanity check: the message references the booking + chosen slot.
  await expect(toast).toContainText(bookingId);
  await expect(toast).toContainText("scheduled for 29 Apr · Morning");

  // ── 4. Click Undo on the toast.
  await toast.getByTestId("button-toast-undo").click();
  await expect(toast).toBeHidden();

  // ── 5a. The booking is back in the coordination state — the
  //         Schedule CTA reappears on the detail (only rendered
  //         while serviceSlot === "to_be_coordinated") and the
  //         freshly-stamped "Coordinated · …" timeline entry is
  //         gone.
  await expect(page.getByTestId("button-schedule-coordination")).toBeVisible();
  await expect(
    page.getByText(/Coordinated · 29 Apr · Morning/),
  ).toHaveCount(0);

  // The booking is also back on the Awaiting-coordination queue.
  await page.getByRole("button", { name: /Back to list/i }).click();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`Open booking ${bookingId} for ${customerName}`, "i"),
    }),
  ).toBeVisible();

  // ── 5b. The rollout slot's utilisation is back to the captured
  //         pre-scheduling value — proves the capacity rollback
  //         landed (count-based for slots_per_window, minute-based
  //         for time_budget_per_window).
  await openRolloutEditor(page, rolloutName);
  const afterUtil = await readSlotUtilization(page, PICK_DATE, PICK_WINDOW);
  expect(afterUtil).toBe(beforeUtil);
}

test.describe("Admin · success-toast Undo on schedule-coordination", () => {
  test("rolls back a slots-per-window capacity bump on Undo (bk-1044 → rl-ac-marine)", async ({
    page,
  }) => {
    await gotoAdmin(page);
    await scheduleAndUndo(
      page,
      "bk-1044",
      "Mateo Alvarez",
      /Marine Parade rollout/,
      "0 / 6",
    );
  });

  test("rolls back a time-budget-per-window capacity bump on Undo (bk-1043 → rl-ac-aspen)", async ({
    page,
  }) => {
    await gotoAdmin(page);
    await scheduleAndUndo(
      page,
      "bk-1043",
      "Priya Kapoor",
      /Aspen — Phase 1/,
      "45 / 240 min",
    );
  });
});
