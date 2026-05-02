/**
 * Access-scheduling-mode helpers.
 *
 * The selected window's meaning changes depending on the access method:
 *
 *  WINDOW_REQUIRED
 *    User-managed / window-sensitive access. The property or a key-holder
 *    MUST be available for the entire window. Standard "These are windows,
 *    not set times" copy applies.
 *
 *  FLEXIBLE_TAYLR_MANAGED
 *    Taylr manages the access logistics end-to-end (parcel locker, collect
 *    & return, agent trade key, or leave-key with an unattended sub-option).
 *    Taylr may adjust timing within the selected day to optimise the rollout.
 *    "Flexible access selected" copy applies.
 *
 * Important rules (from spec):
 *  - Both modes still require a selected day AND a selected window.
 *  - Flexible-access users still consume capacity in the selected window.
 *  - "I'll leave a key with someone" is WINDOW_REQUIRED — that person may
 *    need to be available or waiting.
 *  - Taylr-managed adjustment is an internal/admin operation only; it must
 *    not be presented to the customer as a custom appointment offer.
 */

import {
  isAgentTradeMethod,
  isCollectReturnMethod,
  isLeaveKeyMethod,
  isParcelLockerMethod,
  isUnattendedLeaveKeySub,
} from "../../../state/accessMethodCatalog";
import { type AccessMethod, type LeaveKeySubMethod } from "../../../state/bookingSession";

export type AccessSchedulingMode =
  | "FLEXIBLE_TAYLR_MANAGED"
  | "WINDOW_REQUIRED";

/**
 * Returns `true` when Taylr manages the access logistics so the customer
 * does NOT need to be home (or have someone home) during the service window.
 *
 * Taylr-managed flexible methods:
 *  - Parcel-locker access (any `owner_*_parcel_locker` top-level method)
 *  - Collect & Return (`owner_live_collect`, `owner_vacant_collect`)
 *  - Agent trade key (`agent_trade_key`)
 *  - Leave-key with an unattended sub-option:
 *      `with_parcel_locker`, `with_taylr`, `with_building_manager`, `with_concierge`
 *
 * NOT flexible (remains WINDOW_REQUIRED):
 *  - All be-there methods (owner or agent on-site)
 *  - Leave-key + "with someone" (third-party key-holder may need to wait)
 *  - Leave-key with no sub selected yet (cautious default)
 *  - Agent-tenant methods (tenant must coordinate access)
 *  - Managing-agent methods
 *  - null (no method chosen yet — always default to the cautious mode)
 */
export function isTaylrManagedFlexibleAccess(
  accessMethod: AccessMethod | null,
  leaveKeySub?: LeaveKeySubMethod | null,
): boolean {
  if (isParcelLockerMethod(accessMethod)) return true;
  if (isCollectReturnMethod(accessMethod)) return true;
  if (isAgentTradeMethod(accessMethod)) return true;
  if (isLeaveKeyMethod(accessMethod)) {
    return isUnattendedLeaveKeySub(leaveKeySub ?? null);
  }
  return false;
}

/**
 * Derives the scheduling mode from the customer's chosen access method.
 * Defaults to `WINDOW_REQUIRED` when no method is selected (null) so the
 * UI leads with the more cautious copy until a method is confirmed.
 */
export function getAccessSchedulingMode(
  accessMethod: AccessMethod | null,
  leaveKeySub?: LeaveKeySubMethod | null,
): AccessSchedulingMode {
  return isTaylrManagedFlexibleAccess(accessMethod, leaveKeySub)
    ? "FLEXIBLE_TAYLR_MANAGED"
    : "WINDOW_REQUIRED";
}

/**
 * Returns `true` only when all three scheduling requirements are met:
 *  1. A service day has been selected.
 *  2. A service window has been selected.
 *  3. An access method has been confirmed.
 *
 * Flexible-access users must satisfy all three — they still consume
 * capacity in the selected window even though Taylr may later adjust
 * timing within the day for rollout coordination.
 */
export function canContinueScheduling(
  selectedDay: string | null,
  selectedWindow: string | null,
  accessMethod: AccessMethod | null,
): boolean {
  return (
    selectedDay !== null &&
    selectedWindow !== null &&
    accessMethod !== null
  );
}

export type SchedulerNoticeCopy = {
  title: string;
  /** May contain a `\n\n` paragraph break for multi-paragraph bodies. */
  body: string;
};

/**
 * Returns the scheduler notice copy for the given mode.
 *
 * WINDOW_REQUIRED:
 *   "These are windows, not set times" — property / key-holder must be
 *   available for the entire window.
 *
 * FLEXIBLE_TAYLR_MANAGED:
 *   "Flexible access selected" — customer picks the window that suits
 *   their key/access arrangement; Taylr handles the rest and may adjust
 *   timing within the day.
 */
export function getSchedulerNoticeCopy(
  mode: AccessSchedulingMode,
): SchedulerNoticeCopy {
  if (mode === "FLEXIBLE_TAYLR_MANAGED") {
    return {
      title: "Flexible access selected",
      body: "Please choose the service window that works best for your key/access arrangements. Because you've selected a Taylr-managed access option, you don't need to be home during the window.\n\nTaylr may adjust the service timing within your selected service day to help coordinate the building rollout.",
    };
  }
  return {
    title: "These are windows, not set times",
    body: "We can't confirm an exact arrival or finish time within the window you pick, so please make sure the property is available for the entire window.",
  };
}

/**
 * CTA label for the "next available" shortcut card.
 *
 * Both scheduling modes use the same label today. The helper exists so
 * a future divergence only requires one change here, not at every call
 * site.
 */
export function getNextAvailableCtaLabel(
  _mode: AccessSchedulingMode,
): string {
  return "Book window";
}
