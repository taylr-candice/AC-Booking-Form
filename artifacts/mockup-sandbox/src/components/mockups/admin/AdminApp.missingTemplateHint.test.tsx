// @vitest-environment happy-dom

/**
 * Regression for the friendly "missing template" hint (Task #166).
 *
 * Pins four behaviours:
 *   1. Removed template ⇒ clicking the chip surfaces a non-blocking
 *      info toast naming the missing template.
 *   2. Renamed template ⇒ same hint (snapshot label no longer matches).
 *   3. Sidebar nav clears the hint (other toasts persist).
 *   4. Clean resolve ⇒ no hint, focused row gets `data-focused`.
 *
 * Fixture: seeded `bk-1043` carries `templateLabel: "Sent agent intro"`
 * matching the seeded `EMAIL_TEMPLATES["agent_intro"]` row.
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApp, buildMissingTemplateHint } from "./AdminApp";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SEEDED_BOOKING_ID = "bk-1043";
const SEEDED_TEMPLATE_NAME = "Sent agent intro";
const SEEDED_TEMPLATE_ROW_ID = "agent_intro";

function gotoEmailTemplates() {
  fireEvent.click(screen.getByRole("button", { name: "Email templates" }));
}

function gotoBookings() {
  fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
}

function openSeededBooking() {
  const row = screen.getByLabelText(
    new RegExp(`Open booking ${SEEDED_BOOKING_ID} `),
  );
  fireEvent.click(row);
}

function clickSeededTemplateChip() {
  // bk-1043 timeline: [0] = status entry, [1] = email entry with the chip.
  const entry = within(screen.getByTestId("timeline-entry-1"));
  fireEvent.click(entry.getByTestId("timeline-entry-1-template"));
}

describe("buildMissingTemplateHint", () => {
  it("names the missing template and the channel it came from", () => {
    expect(buildMissingTemplateHint("email", "Sent agent intro")).toBe(
      `"Sent agent intro" is no longer in the Email templates catalog. Historical timeline entry kept.`,
    );
    expect(buildMissingTemplateHint("call", "No answer — left voicemail")).toBe(
      `"No answer — left voicemail" is no longer in the Call templates catalog. Historical timeline entry kept.`,
    );
  });
});

describe("AdminApp · missing-template hint (Task #166)", () => {
  it("fires an info toast naming the template when its row has been removed from the catalog", () => {
    render(<AdminApp />);

    // Remove the seeded template via the panel (Remove triggers window.confirm).
    gotoEmailTemplates();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByTestId(
        `button-remove-email-template-${SEEDED_TEMPLATE_ROW_ID}`,
      ),
    );
    expect(confirmSpy).toHaveBeenCalled();
    expect(
      screen.queryByTestId(`email-template-row-${SEEDED_TEMPLATE_ROW_ID}`),
    ).toBeNull();

    gotoBookings();
    openSeededBooking();
    clickSeededTemplateChip();

    // Shell switches to Email templates panel and surfaces the hint.
    expect(screen.getByTestId("email-templates-default-header")).toBeTruthy();
    expect(screen.queryByTestId("call-templates-default-header")).toBeNull();
    const toast = screen.getByTestId("toast-info");
    expect(toast.textContent).toContain(SEEDED_TEMPLATE_NAME);
    expect(toast.textContent).toContain("no longer in the Email templates");
    expect(toast.textContent).toContain("Historical timeline entry kept");
    expect(screen.queryByTestId("toast-success")).toBeNull();
  });

  it("fires the info toast when the source template was renamed (snapshot label no longer matches any catalog row)", () => {
    render(<AdminApp />);

    // Rename the seeded row — same id, new name (no longer matches snapshot).
    gotoEmailTemplates();
    fireEvent.click(
      screen.getByTestId(
        `button-edit-email-template-${SEEDED_TEMPLATE_ROW_ID}`,
      ),
    );
    fireEvent.change(screen.getByTestId("input-email-template-name"), {
      target: { value: "Renamed agent intro" },
    });
    fireEvent.click(screen.getByTestId("button-save-email-template"));
    expect(
      screen.getByTestId(`email-template-row-${SEEDED_TEMPLATE_ROW_ID}`),
    ).toBeTruthy();

    gotoBookings();
    openSeededBooking();
    clickSeededTemplateChip();

    // Toast names the OLD snapshot label (what ops clicked), not the renamed row.
    const toast = screen.getByTestId("toast-info");
    expect(toast.textContent).toContain(SEEDED_TEMPLATE_NAME);
    expect(toast.textContent).toContain("no longer in the Email templates");
    // Renamed row must not be highlighted — it's a different template now.
    expect(
      screen
        .getByTestId(`email-template-row-${SEEDED_TEMPLATE_ROW_ID}`)
        .getAttribute("data-focused"),
    ).toBeNull();
  });

  it("clears the hint when the admin navigates via the sidebar", () => {
    render(<AdminApp />);
    gotoEmailTemplates();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByTestId(
        `button-remove-email-template-${SEEDED_TEMPLATE_ROW_ID}`,
      ),
    );
    gotoBookings();
    openSeededBooking();
    clickSeededTemplateChip();

    expect(screen.getByTestId("toast-info")).toBeTruthy();

    // Sidebar nav is the "I've seen the hint" gesture.
    fireEvent.click(screen.getByRole("button", { name: "Bookings" }));
    expect(screen.queryByTestId("toast-info")).toBeNull();
  });

  it("does not fire the hint when the chip resolves cleanly to a catalog row", () => {
    render(<AdminApp />);
    gotoBookings();
    openSeededBooking();
    clickSeededTemplateChip();

    expect(screen.queryByTestId("toast-info")).toBeNull();
    expect(
      screen
        .getByTestId(`email-template-row-${SEEDED_TEMPLATE_ROW_ID}`)
        .getAttribute("data-focused"),
    ).toBe("true");
  });
});
