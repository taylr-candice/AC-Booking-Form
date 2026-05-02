/**
 * Cross-iframe prototype sync layer.
 *
 * All canvas iframes share the same origin, so `localStorage` +
 * `BroadcastChannel` give us a zero-backend sync bus:
 *
 *   - **Rollouts** — when an admin opens/closes a day in
 *     `RolloutScheduleEditor`, `persistRolloutsToStore()` serialises
 *     the current `rollouts` store to localStorage and posts a
 *     `rollouts_changed` message.  Every other iframe receives the
 *     message, deserialises the payload, calls `setRolloutsState()`
 *     which bumps `rolloutsVersion`, and `useCustomerSlotPicker` /
 *     the scheduling canvas components re-render with the new windows.
 *
 *   - **Bookings** — when a customer reaches the confirmation screen
 *     (`BookingFlowConfirmation`), the booking is persisted via
 *     `persistProtoBooking()`.  The admin iframe picks it up via
 *     `subscribeProtoBookings` and prepends it to `seededBookings` so
 *     it appears in the coordination queue immediately.
 *
 *   - **Reset** — `clearProtoStore()` wipes both keys, restores seed
 *     rollouts in the calling iframe, and broadcasts `store_cleared`
 *     so every other iframe follows suit.
 *
 * Call `initProtoStore()` once on `App` mount — it reads any persisted
 * state, applies it to the in-memory stores, and subscribes to the
 * channel.  The returned function tears down the channel on unmount.
 */

import type { AdminBooking, AdminRollout } from "./adminMockData";
import { getRollouts, resetRolloutsToSeed, setRolloutsState } from "./adminMockData";

const CHANNEL_NAME = "taylr-proto";
const ROLLOUTS_KEY = "taylr_proto_rollouts_v1";
const BOOKINGS_KEY = "taylr_proto_bookings_v1";

type BroadcastMsg =
  | { type: "rollouts_changed" }
  | { type: "bookings_changed" }
  | { type: "store_cleared" };

let channel: BroadcastChannel | null = null;

const bookingsListeners = new Set<() => void>();

// ─── Rollouts ─────────────────────────────────────────────────────────────────

/**
 * Serialise the current in-memory rollouts to localStorage and notify
 * all other iframes via BroadcastChannel.  Call this after every admin
 * rollout mutation (day toggle, window release, capacity edit, etc.).
 */
export function persistRolloutsToStore(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROLLOUTS_KEY, JSON.stringify(getRollouts()));
    channel?.postMessage({ type: "rollouts_changed" } satisfies BroadcastMsg);
  } catch {
    /* localStorage quota exceeded or private-browsing restriction — no-op */
  }
}

function applyStoredRollouts(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(ROLLOUTS_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as AdminRollout[];
    setRolloutsState(stored);
  } catch {
    /* malformed JSON — ignore */
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

/**
 * Persist a completed booking from the customer flow.  The booking is
 * prepended (newest-first) and any previous entry with the same id is
 * replaced so re-navigating to the confirmation screen is idempotent.
 */
export function persistProtoBooking(booking: AdminBooking): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getProtoBookings();
    const merged = [booking, ...existing.filter((b) => b.id !== booking.id)];
    localStorage.setItem(BOOKINGS_KEY, JSON.stringify(merged));
    channel?.postMessage({ type: "bookings_changed" } satisfies BroadcastMsg);
    for (const fn of bookingsListeners) fn();
  } catch {
    /* no-op */
  }
}

/** Read all proto bookings from localStorage (empty array on any error). */
export function getProtoBookings(): AdminBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BOOKINGS_KEY);
    return raw ? (JSON.parse(raw) as AdminBooking[]) : [];
  } catch {
    return [];
  }
}

/**
 * Subscribe to proto-bookings changes (new booking persisted or store
 * cleared).  Returns an unsubscribe function.  Safe to call in
 * `useEffect` — the listener fires both when the same-iframe
 * `persistProtoBooking` writes and when a cross-iframe
 * `bookings_changed` message arrives.
 */
export function subscribeProtoBookings(listener: () => void): () => void {
  bookingsListeners.add(listener);
  return () => {
    bookingsListeners.delete(listener);
  };
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Clear persisted rollout overrides and bookings, restore seed rollouts
 * in the calling iframe, and broadcast `store_cleared` so every other
 * canvas iframe follows suit without a page refresh.
 */
export function clearProtoStore(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ROLLOUTS_KEY);
    localStorage.removeItem(BOOKINGS_KEY);
    channel?.postMessage({ type: "store_cleared" } satisfies BroadcastMsg);
    resetRolloutsToSeed();
    for (const fn of bookingsListeners) fn();
  } catch {
    /* no-op */
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Initialise the proto store for the current iframe.
 *
 * 1. Opens the `BroadcastChannel`.
 * 2. Applies any rollouts already persisted from a previous admin action.
 * 3. Subscribes to incoming messages so this iframe stays in sync.
 *
 * Returns a cleanup function — pass it as the `useEffect` return value.
 */
export function initProtoStore(): () => void {
  if (typeof window === "undefined") return () => {};

  channel = new BroadcastChannel(CHANNEL_NAME);

  applyStoredRollouts();

  function handleMessage(e: MessageEvent<BroadcastMsg>): void {
    if (e.data.type === "rollouts_changed") {
      applyStoredRollouts();
    } else if (e.data.type === "bookings_changed") {
      for (const fn of bookingsListeners) fn();
    } else if (e.data.type === "store_cleared") {
      resetRolloutsToSeed();
      for (const fn of bookingsListeners) fn();
    }
  }

  channel.addEventListener("message", handleMessage);

  return () => {
    channel?.removeEventListener("message", handleMessage);
    channel?.close();
    channel = null;
  };
}
