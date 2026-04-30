import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end regression test for the admin Reschedule action's
 * pick → confirm wizard and the optional reason note (Task #115).
 *
 * The reschedule modal is a two-step flow:
 *   1. "pick" — admin picks a different rollout slot. The primary CTA
 *      is "Review reschedule" and is gated until the picked slot
 *      differs from the current one.
 *   2. "confirm" — admin reviews From → To and may type a short
 *      reason. The primary CTA is "Confirm reschedule"; "Cancel" and
 *      "Back" both leave the booking unchanged.
 *
 * `buildRescheduledTimelineEntry` (in `state/adminMockData.ts`) appends
 * the trimmed note to the new "Rescheduled · {short date} · {window}"
 * label as " · {note}" when present. A unit test covers that helper
 * in isolation, but only this spec exercises the full wiring:
 * SchedulingModal → AdminApp.handleSchedulingConfirm →
 * AdminApp.rescheduleAppointment → buildRescheduledTimelineEntry →
 * the booking-detail Service timeline.
 *
 * Seed (see `state/adminMockData.ts`):
 *   - bk-1041 — Amal Khoury, scheduled on Marine Apr 30 PM. Its
 *     seeded service timeline has two entries ("Slot booked …" and
 *     "Arrived on site"), so a successful reschedule grows it to
 *     three and a cancelled one leaves it at two.
 *   - rl-ac-marine — Apr 29 AM is empty and openByAdmin, so it's a
 *     clean reschedule destination.
 */

const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const ADMIN_URL = `${BASE_PATH}/preview/admin/AdminApp`;

const BOOKING_ID = "bk-1041";
const FROM_DATE = "2026-04-30";
const TO_DATE = "2026-04-29";
const TO_WINDOW = "morning";
const TO_SLOT_LABEL = "29 Apr · Morning";

async function openBookingDetail(page: Page): Promise<void> {
  await page.goto(ADMIN_URL);
  await page.getByRole("button", { name: "Bookings", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`Open booking ${BOOKING_ID}`) })
    .click();
  // The Schedule-card SlotCell is the only spot on the page that
  // prints the raw ISO date — wait for it before driving the modal.
  await expect(page.getByText(FROM_DATE, { exact: true })).toBeVisible();
}

async function advanceToConfirmStep(page: Page) {
  await page.getByTestId("button-reschedule-appointment").click();
  const modal = page.getByTestId("modal-reschedule-booking");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(/Currently 30 Apr · Afternoon/);

  // Task #241: the calendar's window picker only renders for the
  // currently-focused day, so the new TO_DATE day cell has to be
  // clicked first to swap the panel away from FROM_DATE.
  await modal.getByTestId(`rollout-day-${TO_DATE}`).click();
  await modal
    .getByTestId(`rollout-pick-slot-${TO_DATE}__${TO_WINDOW}`)
    .click();

  const review = modal.getByTestId("button-review-reschedule");
  await expect(review).toBeEnabled();
  await review.click();

  // Confirm-step sanity: the From → To recap and the note field are
  // both rendered, and the primary CTA is now "Confirm reschedule".
  await expect(modal.getByTestId("reschedule-summary")).toBeVisible();
  await expect(modal.getByTestId("reschedule-summary-new")).toContainText(
    TO_SLOT_LABEL,
  );
  await expect(modal.getByTestId("button-confirm-reschedule")).toBeVisible();
  return modal;
}

test.describe("Admin reschedule confirm step + reason note", () => {
  test("appends the trimmed reason to the new timeline entry's label", async ({
    page,
  }) => {
    await openBookingDetail(page);
    const modal = await advanceToConfirmStep(page);

    const note = "tenant called back";
    await modal.getByTestId("input-reschedule-note").fill(note);
    await modal.getByTestId("button-confirm-reschedule").click();
    await expect(modal).toBeHidden();

    // Booking detail now reflects the new slot.
    await expect(page.getByText(TO_DATE, { exact: true })).toBeVisible();

    // The Service timeline (rendered below the Payment timeline) gets
    // a new "Rescheduled · {short date} · {window} · {note}" entry as
    // its trailing row.
    const lastTimelineEntry = page
      .locator('[data-testid^="timeline-entry-"]')
      .last();
    await expect(lastTimelineEntry).toContainText(
      `Rescheduled · ${TO_SLOT_LABEL} · ${note}`,
    );
    await expect(lastTimelineEntry).toContainText("Mia (admin)");

    // Tighten the suffix semantics: the label line itself (the first
    // text row inside the entry — the timestamp/by line is rendered
    // separately below it) must equal the expected string exactly.
    // This guards against the helper accidentally double-appending,
    // reordering the note vs. the window, or leaving stray
    // punctuation after the note.
    const expectedLabel = `Rescheduled · ${TO_SLOT_LABEL} · ${note}`;
    const labelLine = await lastTimelineEntry
      .locator("div.font-medium")
      .first()
      .innerText();
    expect(labelLine.trim()).toBe(expectedLabel);
  });

  test("Cancel from the confirm step leaves the booking unchanged", async ({
    page,
  }) => {
    await openBookingDetail(page);

    // Capture the seed timeline length so we can assert "no new
    // entry" once Cancel runs.
    const seededTimelineCount = await page
      .locator('[data-testid^="timeline-entry-"]')
      .count();

    const modal = await advanceToConfirmStep(page);

    // Type a note to prove that Back/Cancel discards in-flight input
    // — the booking should look identical to before the modal opened.
    await modal.getByTestId("input-reschedule-note").fill("oops, wrong slot");

    // Back from confirm returns to the pick step (review CTA visible
    // again, confirm CTA gone) and does NOT apply the reschedule.
    // This is the other half of the Cancel/Back regression risk: a
    // future change that mis-wires Back to the confirm handler would
    // mutate the booking here.
    await modal.getByTestId("button-back-reschedule").click();
    await expect(modal.getByTestId("button-review-reschedule")).toBeVisible();
    await expect(
      modal.getByTestId("button-confirm-reschedule"),
    ).toHaveCount(0);

    // Re-advance and Cancel from confirm — the modal closes without
    // any booking-side mutation either.
    await modal.getByTestId("button-review-reschedule").click();
    await expect(modal.getByTestId("button-confirm-reschedule")).toBeVisible();
    await modal.getByTestId("button-cancel-reschedule-confirm").click();
    await expect(modal).toBeHidden();

    // Booking detail still shows the original slot, no new entry.
    await expect(page.getByText(FROM_DATE, { exact: true })).toBeVisible();
    await expect(page.getByText(TO_DATE, { exact: true })).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="timeline-entry-"]'),
    ).toHaveCount(seededTimelineCount);
  });

  test("no-note path leaves no trailing ' · …' after the window", async ({
    page,
  }) => {
    await openBookingDetail(page);
    const modal = await advanceToConfirmStep(page);

    // Whitespace-only notes are trimmed by buildRescheduledTimelineEntry
    // and should produce the same label as an empty input.
    await modal.getByTestId("input-reschedule-note").fill("   ");
    await modal.getByTestId("button-confirm-reschedule").click();
    await expect(modal).toBeHidden();

    await expect(page.getByText(TO_DATE, { exact: true })).toBeVisible();

    const lastTimelineEntry = page
      .locator('[data-testid^="timeline-entry-"]')
      .last();
    const labelLine = await lastTimelineEntry
      .locator("div.font-medium")
      .first()
      .innerText();

    // The label line must equal "Rescheduled · 29 Apr · Morning"
    // exactly — no trailing " · …" appended after Morning when the
    // note is empty/whitespace.
    expect(labelLine.trim()).toBe(`Rescheduled · ${TO_SLOT_LABEL}`);
  });
});
