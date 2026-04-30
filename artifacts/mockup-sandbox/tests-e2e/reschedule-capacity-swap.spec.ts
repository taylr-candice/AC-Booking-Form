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
    // they're about to move. The header uses the human-formatted slot
    // label ("30 Apr · Afternoon"), not the ISO/window-key form.
    await expect(modal).toContainText(/Currently 30 Apr · Afternoon/);

    // The reschedule flow is a two-step wizard: "pick" → "confirm". On
    // the pick step the primary CTA is "Review reschedule"; same-as-
    // current is gated → it starts disabled until the admin picks a
    // different slot. After Review, the modal swaps to the confirm
    // step where the primary CTA is "Confirm reschedule" and an
    // optional note can be added (skipped here).
    const reviewBtn = modal.getByTestId("button-review-reschedule");
    await expect(reviewBtn).toBeDisabled();

    // Task #241: focus the calendar day to reveal that day's window
    // picker before tapping the window button.
    await modal.getByTestId(`rollout-day-${TO_DATE}`).click();
    await modal
      .getByTestId(`rollout-pick-slot-${TO_DATE}__${TO_WINDOW}`)
      .click();
    await expect(reviewBtn).toBeEnabled();
    await reviewBtn.click();

    const confirm = modal.getByTestId("button-confirm-reschedule");
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

/**
 * Companion coverage for the "no-op" branches of the Reschedule modal
 * (gated entirely inside `SchedulingModal.tsx` when `mode === "reschedule"`):
 *
 *   1. Re-picking the booking's CURRENT slot must keep the Review /
 *      Confirm CTA disabled (the `isSameAsCurrent` guard) and must not
 *      append a service-timeline entry once the modal is dismissed.
 *
 *   2. Cells that are admin-closed (`openByAdmin: false`) or fully
 *      booked must stay unpickable, surface a "no capacity" / "closed"
 *      affordance, and never enable the Review CTA — this is the
 *      protection that stops admins from rescheduling onto a window
 *      the customer-side picker would also refuse.
 *
 * Both branches are easy to regress because they live behind the
 * `canPick` predicate (slot button) and the `canAdvance` predicate
 * (modal footer); the happy-path test above only spot-checks the
 * footer's initial disabled state.
 */
test.describe("Reschedule modal — same-slot guard", () => {
  // bk-1042 (Henrik Olsen, Aspen, time-budget rollout) is on a slot
  // that's openByAdmin and well under its 240-min budget, so the
  // picker button for the booking's CURRENT slot is clickable. That
  // lets us actually exercise the guard by picking elsewhere first
  // and then re-picking the original cell — which is what would
  // happen if an admin briefly entertained a different window before
  // changing their mind.
  const BOOKING_ID = "bk-1042";
  const CURRENT_DATE = "2026-04-29";
  const CURRENT_WINDOW = "morning";
  // Same day, different window — Aspen 4/29 PM has 105/300 mins
  // booked so a 60-min job (Henrik's: 1 system + 1 additional indoor)
  // fits comfortably. Picking it flips the Review CTA on.
  const OTHER_DATE = "2026-04-29";
  const OTHER_WINDOW = "afternoon";

  test("re-picking the current slot keeps Review disabled and leaves the timeline untouched", async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);
    await page.getByRole("button", { name: "Bookings", exact: true }).click();
    await page
      .getByRole("button", {
        name: new RegExp(`Open booking ${BOOKING_ID}`),
      })
      .click();

    // Snapshot the timeline length before opening the modal so we can
    // assert no Rescheduled entry (or any other side effect) sneaks in
    // when the admin clicks around and then bails out. Both the
    // payment + service Timeline cards render `timeline-entry-${i}`
    // testids, so the combined count covers the whole detail page.
    const timelineEntries = page.locator('[data-testid^="timeline-entry-"]');
    const initialCount = await timelineEntries.count();

    await page.getByTestId("button-reschedule-appointment").click();

    const modal = page.getByTestId("modal-reschedule-booking");
    await expect(modal).toBeVisible();
    // Header echoes the booking's current slot — sanity-check that
    // the modal really did open against bk-1042's seeded 4/29 morning.
    await expect(modal).toContainText(/Currently 29 Apr · Morning/);

    const reviewBtn = modal.getByTestId("button-review-reschedule");

    // Initial state: the modal pre-selects the booking's current slot,
    // so the same-slot guard is already firing.
    await expect(reviewBtn).toBeDisabled();

    // Pick a different slot — Review flips on, proving the guard is
    // the *only* thing keeping it disabled (and not e.g. a missing
    // pickedDate / pickedWindow).
    // Task #241: each calendar day's window picker only renders for
    // the focused day, so we focus the day before tapping its window.
    await modal.getByTestId(`rollout-day-${OTHER_DATE}`).click();
    await modal
      .getByTestId(`rollout-pick-slot-${OTHER_DATE}__${OTHER_WINDOW}`)
      .click();
    await expect(reviewBtn).toBeEnabled();

    // Re-pick the booking's CURRENT slot. `setPickedDate` /
    // `setPickedWindow` write the same values back, but `isSameAsCurrent`
    // re-evaluates true and the Review CTA must drop back to disabled.
    await modal.getByTestId(`rollout-day-${CURRENT_DATE}`).click();
    await modal
      .getByTestId(`rollout-pick-slot-${CURRENT_DATE}__${CURRENT_WINDOW}`)
      .click();
    await expect(reviewBtn).toBeDisabled();

    // Bail out of the modal — there should be nothing to commit.
    await modal.getByTestId("button-cancel-reschedule").click();
    await expect(modal).toBeHidden();

    // No Rescheduled entry, no incidental side effects: the timeline
    // length must match the pre-modal snapshot exactly.
    await expect(timelineEntries).toHaveCount(initialCount);
  });
});

test.describe("Reschedule modal — closed / full alternative cells", () => {
  // bk-1041 sits on Marine (slots-per-window) and the seed deliberately
  // mixes one admin-closed window (5/5 morning, `morningOpen: false`)
  // and one fully-booked window (5/7 morning, 6/6) into the same
  // rollout. That lets one spec lock down both branches of the
  // `rolloutSlotStatus` "unbookable" copy in a single open-modal pass.
  const BOOKING_ID = "bk-1041";
  const CLOSED_DATE = "2026-05-05";
  const CLOSED_WINDOW = "morning";
  const FULL_DATE = "2026-05-07";
  const FULL_WINDOW = "morning";

  test("admin-closed and fully-booked cells stay unpickable with a visible reason", async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);
    await page.getByRole("button", { name: "Bookings", exact: true }).click();
    await page
      .getByRole("button", {
        name: new RegExp(`Open booking ${BOOKING_ID}`),
      })
      .click();

    // Snapshot timeline length so we can prove nothing is committed
    // when the admin can't find a bookable cell.
    const timelineEntries = page.locator('[data-testid^="timeline-entry-"]');
    const initialCount = await timelineEntries.count();

    await page.getByTestId("button-reschedule-appointment").click();

    const modal = page.getByTestId("modal-reschedule-booking");
    await expect(modal).toBeVisible();

    const reviewBtn = modal.getByTestId("button-review-reschedule");
    // Same-slot guard kicks in from the initial pre-selection — Review
    // starts disabled before we even inspect the closed/full cells.
    await expect(reviewBtn).toBeDisabled();

    // Admin-closed window — `openByAdmin: false` short-circuits to
    // "not_yet_open" so the slot button must be disabled and surface
    // the "Morning not yet open for booking" reason next to the cell.
    // Task #241: focus the day on the calendar so its window picker
    // panel becomes visible. The day cell itself stays clickable for
    // open days even when no window is bookable, so the admin can
    // still inspect the disabled-state copy.
    await modal.getByTestId(`rollout-day-${CLOSED_DATE}`).click();
    const closedSlot = modal.getByTestId(
      `rollout-pick-slot-${CLOSED_DATE}__${CLOSED_WINDOW}`,
    );
    await expect(closedSlot).toBeVisible();
    await expect(closedSlot).toBeDisabled();
    await expect(closedSlot).toContainText(
      "Morning not yet open for booking",
    );

    // Fully-booked window (6/6) — slots-per-window mode prints the
    // exact "is full (booked/total)" copy so an admin can see the
    // capacity readout without hovering.
    await modal.getByTestId(`rollout-day-${FULL_DATE}`).click();
    const fullSlot = modal.getByTestId(
      `rollout-pick-slot-${FULL_DATE}__${FULL_WINDOW}`,
    );
    await expect(fullSlot).toBeVisible();
    await expect(fullSlot).toBeDisabled();
    await expect(fullSlot).toContainText("Morning is full (6/6)");

    // Neither cell is pickable, so the Review CTA must stay disabled
    // for the duration of the modal — there is no path to Confirm.
    await expect(reviewBtn).toBeDisabled();

    await modal.getByTestId("button-cancel-reschedule").click();
    await expect(modal).toBeHidden();

    // Nothing was committed — the service timeline is untouched and
    // the booking is still anchored to its original 4/30 PM slot.
    await expect(timelineEntries).toHaveCount(initialCount);
    await expect(page.getByText(FROM_DATE, { exact: true })).toBeVisible();
  });
});
