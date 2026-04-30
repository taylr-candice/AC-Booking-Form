// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CALL_TEMPLATES,
  EMAIL_TEMPLATES,
  type AdminBooking,
  type AdminBuilding,
  type AdminUnit,
  type TimelineEntry,
} from "@/state/adminMockData";

import { AwaitingCoordinationView } from "./AwaitingCoordinationView";

afterEach(cleanup);

function makeBuildings(): AdminBuilding[] {
  return [
    {
      id: "bldg-test",
      name: "Test Tower",
      addressLine1: "1 Test St",
      addressLine2: "Suburb NSW 2000",
      acType: "split",
      acBrand: "Daikin",
    },
  ];
}

function makeUnits(): AdminUnit[] {
  return [
    {
      id: "u1",
      addressLine1: "1 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
    {
      id: "u2",
      addressLine1: "2 / 1 Test St",
      addressLine2: "Suburb NSW 2000",
      ac: { type: "split", brand: "", systems: 1, additional: 0 },
      agentId: null,
      buildingId: "bldg-test",
    },
  ];
}

function makeBooking(
  id: string,
  unitId: string,
  serviceTimeline: TimelineEntry[],
): AdminBooking {
  return {
    id,
    unitId,
    customerName: "Test Customer",
    customerEmail: `${id}@example.com`,
    customerPhone: "0411 000 000",
    bookerRole: "owner",
    bookerAgencyId: null,
    bookerAgencyOtherName: "",
    accessMethod: "owner_leased_tenant",
    tenants: [
      {
        first: "T",
        last: "Tenant",
        email: "t@example.com",
        phone: "0411111111",
      },
    ],
    systems: 1,
    additional: 0,
    acType: "split",
    discrepancy: null,
    serviceDate: null,
    serviceSlot: "to_be_coordinated",
    paymentStatus: "paid",
    serviceStatus: "scheduled",
    totalAud: 199,
    paymentTimeline: [],
    serviceTimeline,
    notes: "",
    rolloutId: null,
    createdAt: "2026-04-20T09:00:00+10:00",
    lastContactedAt: null,
  };
}

function callEntry(loggedAt: string, templateLabel: string): TimelineEntry {
  return {
    kind: "call",
    status: "logged_call",
    label: `Logged call · ${templateLabel}`,
    at: "Apr 28 · 11:00",
    by: "Mia (admin)",
    loggedAt,
    templateLabel,
  };
}

function emailEntry(loggedAt: string, templateLabel: string): TimelineEntry {
  return {
    kind: "email",
    status: "logged_email",
    label: `Logged email · ${templateLabel}`,
    at: "Apr 28 · 11:00",
    by: "Mia (admin)",
    loggedAt,
    templateLabel,
  };
}

const NO_DEFAULT_CALL_TEMPLATES = CALL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);
const NO_DEFAULT_EMAIL_TEMPLATES = EMAIL_TEMPLATES.map(
  ({ isDefault: _isDefault, ...t }) => t,
);

function Harness({
  bookings,
  onBulkLogCall = () => {},
  onBulkLogEmail = () => {},
}: {
  bookings: AdminBooking[];
  onBulkLogCall?: (
    ids: string[],
    outcome: "no_answer" | "spoke" | "voicemail",
    note: string,
    templateLabel: string,
  ) => void;
  onBulkLogEmail?: (
    ids: string[],
    subject: string,
    note: string,
    templateLabel: string,
  ) => void;
}) {
  const [filter, setFilter] = useState<"all">("all");
  return (
    <AwaitingCoordinationView
      bookings={bookings}
      units={makeUnits()}
      buildings={makeBuildings()}
      filter={filter}
      onFilter={setFilter as never}
      buildingFilter="all"
      onBuildingFilter={() => {}}
      search=""
      onSearch={() => {}}
      onOpen={() => {}}
      onBulkLogCall={onBulkLogCall}
      onBulkLogEmail={onBulkLogEmail}
      callTemplates={NO_DEFAULT_CALL_TEMPLATES}
      emailTemplates={NO_DEFAULT_EMAIL_TEMPLATES}
    />
  );
}

describe("AwaitingCoordinationView · bulk template picker sparklines", () => {
  it("opens the call-template dropdown and shows a sparkline per option (none on Custom)", () => {
    const voicemailLabel = "No answer — left voicemail";
    const bookings = [
      makeBooking("bk-1", "u1", [
        callEntry("2026-04-28T09:00:00Z", voicemailLabel),
        callEntry("2026-04-29T10:00:00Z", voicemailLabel),
        callEntry("2026-04-30T11:00:00Z", voicemailLabel),
      ]),
      makeBooking("bk-2", "u2", []),
    ];

    render(<Harness bookings={bookings} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));

    // Listbox is closed until the trigger is clicked.
    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();

    const trigger = screen.getByTestId("trigger-bulk-call-template");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    const optionRows = Array.from(listbox.querySelectorAll('[role="option"]'));
    expect(optionRows.length).toBe(NO_DEFAULT_CALL_TEMPLATES.length + 1);

    // Custom row has no sparkline.
    const customRow = screen.getByTestId("option-bulk-call-template-custom");
    expect(
      customRow.querySelector(
        '[data-testid^="call-template-usage-sparkline-bulk-"]',
      ),
    ).toBeNull();

    // Each saved template shows a sparkline.
    for (const tpl of NO_DEFAULT_CALL_TEMPLATES) {
      const row = screen.getByTestId(`option-bulk-call-template-${tpl.id}`);
      const spark = row.querySelector(
        `[data-testid="call-template-usage-sparkline-bulk-${tpl.id}"]`,
      );
      expect(spark, `sparkline missing for ${tpl.name}`).not.toBeNull();
    }

    // Voicemail template has 3 uses this week → "+3" delta.
    const voicemailTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name === voicemailLabel,
    )!;
    expect(
      screen.getByTestId(
        `call-template-usage-sparkline-delta-bulk-${voicemailTpl.id}`,
      ).textContent,
    ).toMatch(/\+3/);

    // A template with no usage has no delta rendered.
    const quietTpl = NO_DEFAULT_CALL_TEMPLATES.find(
      (t) => t.name !== voicemailLabel,
    )!;
    expect(
      screen.queryByTestId(
        `call-template-usage-sparkline-delta-bulk-${quietTpl.id}`,
      ),
    ).toBeNull();
  });

  it("selecting an email-template option syncs the hidden select and closes the popover", () => {
    const sentLinkLabel = "Sent rebook link";
    const bookings = [
      makeBooking("bk-1", "u1", [
        emailEntry("2026-04-29T09:00:00Z", sentLinkLabel),
        emailEntry("2026-04-30T10:00:00Z", sentLinkLabel),
      ]),
      makeBooking("bk-2", "u2", []),
    ];
    render(<Harness bookings={bookings} onBulkLogEmail={vi.fn()} />);

    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));

    fireEvent.click(screen.getByTestId("trigger-bulk-email-template"));
    expect(screen.getByTestId("option-bulk-email-template-listbox"))
      .toBeTruthy();

    const sentLinkTpl = NO_DEFAULT_EMAIL_TEMPLATES.find(
      (t) => t.name === sentLinkLabel,
    )!;
    expect(
      screen.getByTestId(
        `email-template-usage-sparkline-delta-bulk-${sentLinkTpl.id}`,
      ).textContent,
    ).toMatch(/\+2/);

    const select = screen.getByTestId(
      "select-bulk-email-template",
    ) as HTMLSelectElement;
    expect(select.value).not.toBe(sentLinkTpl.id);

    fireEvent.click(
      screen.getByTestId(`option-bulk-email-template-${sentLinkTpl.id}`),
    );

    expect(select.value).toBe(sentLinkTpl.id);
    // Popover closes after a selection.
    expect(
      screen.queryByTestId("option-bulk-email-template-listbox"),
    ).toBeNull();
    // Trigger label reflects the selection.
    expect(
      screen.getByTestId("trigger-bulk-email-template").textContent,
    ).toMatch(sentLinkLabel);
  });
});

describe("AwaitingCoordinationView · bulk template picker keyboard nav", () => {
  function openCallPicker() {
    const bookings = [
      makeBooking("bk-1", "u1", []),
      makeBooking("bk-2", "u2", []),
    ];
    render(<Harness bookings={bookings} />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    return screen.getByTestId("trigger-bulk-call-template");
  }

  function activeOption(prefix: string): HTMLElement | null {
    const list = screen.queryByTestId(`${prefix}-listbox`);
    if (!list) return null;
    return list.querySelector('[data-active="true"]');
  }

  it("ArrowDown on the closed trigger opens the listbox anchored on the current selection", () => {
    const trigger = openCallPicker();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // aria-activedescendant is announced via the listbox (it owns focus).
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      "option-bulk-call-template-custom-opt",
    );
    // The current selection (Custom) is the highlighted option.
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      "custom",
    );
  });

  it("ArrowDown / ArrowUp / Home / End move the highlight inside the open listbox", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    const expectedRows = [
      "custom",
      ...NO_DEFAULT_CALL_TEMPLATES.map((t) => t.id),
    ];

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      expectedRows[1],
    );
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      `option-bulk-call-template-${expectedRows[1]}-opt`,
    );

    fireEvent.keyDown(listbox, { key: "End" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      expectedRows[expectedRows.length - 1],
    );

    fireEvent.keyDown(listbox, { key: "Home" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      expectedRows[0],
    );

    // ArrowUp at the top clamps (does not wrap).
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      expectedRows[0],
    );
  });

  it("Enter on the highlighted option commits the selection and syncs the hidden <select>", () => {
    const trigger = openCallPicker();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const initialValue = select.value;

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    const targetId = NO_DEFAULT_CALL_TEMPLATES[0]!.id;
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      targetId,
    );

    fireEvent.keyDown(listbox, { key: "Enter" });

    expect(select.value).toBe(targetId);
    expect(select.value).not.toBe(initialValue);
    // Listbox is closed after commit.
    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();
    // Trigger reflects the new selection.
    expect(trigger.textContent).toMatch(NO_DEFAULT_CALL_TEMPLATES[0]!.name);
  });

  it("Space on the highlighted option also commits the selection", () => {
    const trigger = openCallPicker();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    fireEvent.keyDown(listbox, { key: "End" });
    const targetId =
      NO_DEFAULT_CALL_TEMPLATES[NO_DEFAULT_CALL_TEMPLATES.length - 1]!.id;

    fireEvent.keyDown(listbox, { key: " " });

    expect(select.value).toBe(targetId);
    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();
  });

  it("Escape closes the listbox without changing the selection", () => {
    const trigger = openCallPicker();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const initialValue = select.value;

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Escape" });

    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();
    expect(select.value).toBe(initialValue);
  });

  it("driving the hidden <select> updates the visible listbox highlight on next open", () => {
    const trigger = openCallPicker();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;
    const targetId = NO_DEFAULT_CALL_TEMPLATES[1]!.id;

    // Simulate a sighted keyboard user driving the hidden mirror select
    // (or any other code path that sets the bulk template id).
    fireEvent.change(select, { target: { value: targetId } });

    // The visible trigger label updates to mirror the hidden select.
    expect(trigger.textContent).toMatch(NO_DEFAULT_CALL_TEMPLATES[1]!.name);

    // Reopening the listbox anchors the highlight on that same option.
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      `option-bulk-call-template-${targetId}-opt`,
    );
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      targetId,
    );
  });

  it("the listbox is wired up as role=listbox with aria-activedescendant + tabindex roving", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const listbox = screen.getByTestId("option-bulk-call-template-listbox");
    expect(listbox.getAttribute("role")).toBe("listbox");
    expect(listbox.getAttribute("tabindex")).toBe("-1");
    expect(listbox.getAttribute("aria-activedescendant")).toBeTruthy();

    // Every option carries tabindex=-1 so focus stays on the listbox and
    // screen readers can follow aria-activedescendant.
    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    expect(options.length).toBeGreaterThan(0);
    for (const opt of options) {
      expect(opt.getAttribute("tabindex")).toBe("-1");
    }
  });
});

describe("AwaitingCoordinationView · bulk template picker type-to-jump", () => {
  function openCallPicker() {
    const bookings = [
      makeBooking("bk-1", "u1", []),
      makeBooking("bk-2", "u2", []),
    ];
    render(<Harness bookings={bookings} />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-call"));
    return screen.getByTestId("trigger-bulk-call-template");
  }

  function openEmailPicker() {
    const bookings = [
      makeBooking("bk-1", "u1", []),
      makeBooking("bk-2", "u2", []),
    ];
    render(<Harness bookings={bookings} />);
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-1"));
    fireEvent.click(screen.getByTestId("checkbox-coordination-row-bk-2"));
    fireEvent.click(screen.getByTestId("button-bulk-log-email"));
    return screen.getByTestId("trigger-bulk-email-template");
  }

  function activeOption(prefix: string): HTMLElement | null {
    const list = screen.queryByTestId(`${prefix}-listbox`);
    if (!list) return null;
    return list.querySelector('[data-active="true"]');
  }

  it("typing a single printable letter jumps the highlight to the first matching option", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    // 'w' → "Wrong number on file" is the only Wxxx option.
    const wrongTpl = NO_DEFAULT_CALL_TEMPLATES.find((t) =>
      /^wrong/i.test(t.name),
    )!;
    fireEvent.keyDown(listbox, { key: "w" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      wrongTpl.id,
    );
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      `option-bulk-call-template-${wrongTpl.id}-opt`,
    );
  });

  it("repeated single-letter presses cycle through matching options (and wrap)", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    // Both "No answer — left voicemail" and "No answer — no voicemail"
    // start with 'n' (they're listed in that order in CALL_TEMPLATES).
    const noOptions = NO_DEFAULT_CALL_TEMPLATES.filter((t) =>
      /^no/i.test(t.name),
    );
    expect(noOptions.length).toBeGreaterThanOrEqual(2);

    fireEvent.keyDown(listbox, { key: "n" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      noOptions[0]!.id,
    );

    fireEvent.keyDown(listbox, { key: "n" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      noOptions[1]!.id,
    );

    // Wraps back to the first match after the last one.
    fireEvent.keyDown(listbox, { key: "n" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      noOptions[0]!.id,
    );
  });

  it("typing multiple different characters quickly narrows the match by prefix", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    // 's' lands on the first Sxxx ("Spoke to them — confirmed window"),
    // then 'p' keeps the buffer as "sp" so it stays / advances to a
    // Spxxx match. Both Spoke entries match — the highlight should
    // land on a "Spoke" option (not "Sent" / etc.).
    fireEvent.keyDown(listbox, { key: "s" });
    fireEvent.keyDown(listbox, { key: "p" });
    const value = activeOption("option-bulk-call-template")?.dataset.value;
    const matched = NO_DEFAULT_CALL_TEMPLATES.find((t) => t.id === value);
    expect(matched?.name).toMatch(/^Sp/i);
  });

  it("the type-to-jump match is case-insensitive", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    const wrongTpl = NO_DEFAULT_CALL_TEMPLATES.find((t) =>
      /^wrong/i.test(t.name),
    )!;
    // Uppercase key event still matches the lowercase-folded label.
    fireEvent.keyDown(listbox, { key: "W" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      wrongTpl.id,
    );
  });

  it("the buffer resets after a short idle so a new prefix can start fresh", async () => {
    vi.useFakeTimers();
    try {
      const trigger = openCallPicker();
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      const listbox = screen.getByTestId("option-bulk-call-template-listbox");

      const noOptions = NO_DEFAULT_CALL_TEMPLATES.filter((t) =>
        /^no/i.test(t.name),
      );
      const wrongTpl = NO_DEFAULT_CALL_TEMPLATES.find((t) =>
        /^wrong/i.test(t.name),
      )!;

      // Build "no" → matches a No-answer entry.
      fireEvent.keyDown(listbox, { key: "n" });
      fireEvent.keyDown(listbox, { key: "o" });
      expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
        noOptions[0]!.id,
      );

      // Wait past the idle window so the buffer drops back to empty.
      vi.advanceTimersByTime(600);

      // 'w' on its own should now jump to "Wrong number on file" — if
      // the buffer hadn't reset it'd be "now" with no matches.
      fireEvent.keyDown(listbox, { key: "w" });
      expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
        wrongTpl.id,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("type-to-jump also works on the email picker", () => {
    const trigger = openEmailPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-email-template-listbox");

    const awaitingTpl = NO_DEFAULT_EMAIL_TEMPLATES.find((t) =>
      /^awaiting/i.test(t.name),
    )!;
    fireEvent.keyDown(listbox, { key: "a" });
    expect(activeOption("option-bulk-email-template")?.dataset.value).toBe(
      awaitingTpl.id,
    );
  });

  it("typing a letter that matches no option leaves the highlight where it was", () => {
    const trigger = openCallPicker();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    // Move to a known starting point first so we can detect any drift.
    fireEvent.keyDown(listbox, { key: "End" });
    const before = activeOption("option-bulk-call-template")?.dataset.value;
    expect(before).toBeTruthy();

    // No template name starts with 'z'.
    fireEvent.keyDown(listbox, { key: "z" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      before,
    );
  });

  it("Enter still commits after a type-to-jump — typing didn't break commit", () => {
    const trigger = openCallPicker();
    const select = screen.getByTestId(
      "select-bulk-call-template",
    ) as HTMLSelectElement;

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const listbox = screen.getByTestId("option-bulk-call-template-listbox");

    const wrongTpl = NO_DEFAULT_CALL_TEMPLATES.find((t) =>
      /^wrong/i.test(t.name),
    )!;
    fireEvent.keyDown(listbox, { key: "w" });
    expect(activeOption("option-bulk-call-template")?.dataset.value).toBe(
      wrongTpl.id,
    );

    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(select.value).toBe(wrongTpl.id);
    // Listbox closed after commit.
    expect(
      screen.queryByTestId("option-bulk-call-template-listbox"),
    ).toBeNull();
  });
});
