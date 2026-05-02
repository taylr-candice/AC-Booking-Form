/**
 * SchedulingOpsView
 *
 * Canvas view — the Taylr ops "Awaiting scheduling" queue, shown as a
 * standalone page so the team can see what the back-office looks like
 * for post-booking scheduling without navigating the full AdminApp.
 *
 * Pre-filtered to the "Awaiting scheduling" chip so the two Lakeside
 * seed bookings are immediately visible:
 *
 *   bk-lakeside-01  Sophie Brennan · 7/45 Lakeside Drive
 *                   access: owner will be present (Will be present tag)
 *
 *   bk-lakeside-02  Daniel Yuen · 12/45 Lakeside Drive
 *                   access: collect-and-return parcel locker (Flexible access tag)
 *
 * The full filter toolbar is still functional — ops can switch to
 * "Awaiting tenant", "Awaiting agent", or "All" to see the rest of
 * the coordination queue.
 *
 * Renders at 1440 × 900 to match the Admin · Ops canvas placeholder.
 */

import { useState } from "react";
import { AwaitingCoordinationView } from "../admin/AwaitingCoordinationView";
import type { OutcomeFilter } from "../admin/AwaitingCoordinationView";
import {
  SEEDED_BOOKINGS,
  SEEDED_UNITS,
  SEEDED_BUILDINGS,
  type AdminBooking,
  type CoordinationKind,
} from "@/state/adminMockData";

type Filter = "all" | CoordinationKind;

export function SchedulingOpsView() {
  const [filter, setFilter] = useState<Filter>("awaiting_scheduling");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");

  return (
    <div className="h-screen w-screen overflow-hidden font-['Inter'] bg-white">
      <AwaitingCoordinationView
        bookings={Array.from(SEEDED_BOOKINGS) as AdminBooking[]}
        units={Array.from(SEEDED_UNITS)}
        buildings={Array.from(SEEDED_BUILDINGS)}
        filter={filter}
        onFilter={setFilter}
        buildingFilter={buildingFilter}
        onBuildingFilter={setBuildingFilter}
        search={search}
        onSearch={setSearch}
        outcomeFilter={outcomeFilter}
        onOutcomeFilter={setOutcomeFilter}
        onOpen={() => {}}
      />
    </div>
  );
}
