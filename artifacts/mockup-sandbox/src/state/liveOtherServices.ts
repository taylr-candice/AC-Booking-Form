/**
 * Cross-iframe bridge for the live "other" service catalogue (Task #186).
 *
 * The customer booking flow is rendered inside an `<iframe>` by
 * `BookingFlow{Mobile,Desktop}` (each step loads `/preview/booking-pages/...`
 * in a child JS realm). Module-level state in the parent frame — where
 * `AdminApp` lives — therefore can't be read from the iframe directly:
 * each frame instantiates its own copy of every module.
 *
 * `bookingSession.ts` already solves the same problem by serialising
 * to `window.sessionStorage` (which IS shared across same-origin
 * iframes) and using the cross-frame `storage` event to notify
 * subscribers. This module mirrors that pattern for the projected
 * "other" service catalogue:
 *
 * - Parent frame (`AdminApp`) calls {@link writeLiveOtherServices} on
 *   every Service-catalogue edit so the iframe sees the latest list.
 * - The customer-flow's resolver
 *   ({@link import("./bookingDerived").resolveOtherServiceRules}) and
 *   the AC step's `useLiveOtherServices` hook both read from
 *   sessionStorage via {@link readLiveOtherServicesFromStorage}.
 * - Subscribers get notified via {@link subscribeLiveOtherServices},
 *   which fires on cross-window `storage` events AND on a same-window
 *   custom event so the writer's own subscribers re-render too.
 *
 * Stale ids are NEVER pruned here — the resolver in `bookingDerived`
 * silently drops unknown ids so the customer can carry an id forward
 * across catalogue edits without crashing the booking flow.
 */

import type { OtherServiceRule } from "./bookingDerived";

/** sessionStorage key for the projected catalogue. Bumped on shape
 *  change; the reader silently returns `[]` on a parse mismatch so
 *  legacy data degrades to "no other services" rather than crashing. */
export const LIVE_OTHER_SERVICES_STORAGE_KEY = "taylr.live-other-services.v1";

/** Same-window custom event so subscribers in the writer's frame
 *  re-render. The cross-window `storage` event handles same-origin
 *  iframes; this event covers the writer's own listeners. */
const SAME_WINDOW_EVENT = "taylr-live-other-services-changed";

const isBrowser = typeof window !== "undefined";

/** Module-level snapshot cache so {@link readLiveOtherServicesFromStorage}
 *  returns the SAME array reference between calls when the underlying
 *  sessionStorage payload hasn't changed. `useSyncExternalStore` relies
 *  on referential stability of `getSnapshot()` to decide whether to
 *  rerender — without this cache it would loop forever (every render
 *  would see a "new" array and schedule another render).
 *
 *  Keyed by the raw JSON string so we can detect changes without
 *  re-parsing. The empty-array branch shares a single sentinel for the
 *  same reason. */
const EMPTY: readonly OtherServiceRule[] = Object.freeze([]);
let cachedRaw: string | null | undefined = undefined;
let cachedValue: readonly OtherServiceRule[] = EMPTY;

/**
 * Read the latest projected "other" services from sessionStorage.
 * Returns `[]` when storage is missing, empty, or contains anything
 * other than a JSON-encoded `OtherServiceRule[]` — the customer flow
 * just sees "no other services" rather than throwing in any of those
 * edge cases.
 *
 * The return value is cached: callers receive the SAME array reference
 * until the underlying sessionStorage string changes. This is required
 * by `useSyncExternalStore` (see {@link cachedRaw}).
 */
export function readLiveOtherServicesFromStorage(): readonly OtherServiceRule[] {
  if (!isBrowser) return EMPTY;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(LIVE_OTHER_SERVICES_STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = EMPTY;
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedValue = EMPTY;
      return cachedValue;
    }
    // Drop entries that don't have at least the fields the resolver +
    // PriceBlock will dereference. Keeps the rest of the codebase
    // free of `as unknown` casts.
    const filtered = parsed.filter(
      (e: unknown): e is OtherServiceRule =>
        e != null &&
        typeof e === "object" &&
        typeof (e as OtherServiceRule).id === "string" &&
        typeof (e as OtherServiceRule).name === "string" &&
        typeof (e as OtherServiceRule).baseMinutes === "number" &&
        typeof (e as OtherServiceRule).addonMinutes === "number" &&
        typeof (e as OtherServiceRule).priceAud === "number" &&
        typeof (e as OtherServiceRule).addonPriceAud === "number" &&
        typeof (e as OtherServiceRule).addonLabel === "string" &&
        ((e as OtherServiceRule).maxQty === undefined ||
          typeof (e as OtherServiceRule).maxQty === "number"),
    );
    cachedValue = filtered.length === 0 ? EMPTY : Object.freeze(filtered);
    return cachedValue;
  } catch {
    cachedValue = EMPTY;
    return cachedValue;
  }
}

/**
 * Look up a single projected "other" service rule by id. Returns
 * `null` when storage is empty or the id is unknown — callers
 * (notably `bookingActions.setOtherServiceQuantity`) treat that as
 * "use the global fallback ceiling" so a stale session id never
 * blocks the customer.
 */
export function findLiveOtherServiceRuleById(
  id: string,
): OtherServiceRule | null {
  if (!id) return null;
  const all = readLiveOtherServicesFromStorage();
  return all.find((r) => r.id === id) ?? null;
}

/**
 * Persist the projected list of "other" services to sessionStorage,
 * making it visible to every same-origin iframe. Pass `null` to
 * clear the key — used by AdminApp's unmount cleanup so a fresh
 * page load doesn't see a stale catalogue from a previous mount.
 *
 * Subscribers in the writer's frame get notified via a same-window
 * custom event; subscribers in OTHER same-origin iframes get
 * notified by the browser's cross-window `storage` event (which
 * fires only in non-writer windows).
 */
export function writeLiveOtherServices(
  rules: readonly OtherServiceRule[] | null,
): void {
  if (!isBrowser) return;
  try {
    if (rules === null) {
      window.sessionStorage.removeItem(LIVE_OTHER_SERVICES_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        LIVE_OTHER_SERVICES_STORAGE_KEY,
        JSON.stringify(rules),
      );
    }
  } catch {
    // sessionStorage can throw in private mode / on quota; swallow so
    // the admin shell stays responsive. Subscribers won't fire, but
    // the next read will still hit the latest committed value.
    return;
  }
  try {
    window.dispatchEvent(new Event(SAME_WINDOW_EVENT));
  } catch {
    /* CustomEvent isn't constructible in some test envs; ignore */
  }
}

/**
 * Subscribe to "live other services changed" notifications. Fires on:
 *
 * - cross-window `storage` events keyed to
 *   {@link LIVE_OTHER_SERVICES_STORAGE_KEY} (same-origin iframes), and
 * - same-window custom events dispatched by {@link writeLiveOtherServices}.
 *
 * Returns an unsubscribe callback. Safe to call during SSR — it's
 * a no-op when `window` is undefined.
 */
export function subscribeLiveOtherServices(listener: () => void): () => void {
  if (!isBrowser) return () => {};
  const onStorage = (e: StorageEvent) => {
    // `e.key` is `null` when storage is cleared wholesale. Forward
    // those events too so a `sessionStorage.clear()` from another
    // frame still drops the catalogue.
    if (e.key !== null && e.key !== LIVE_OTHER_SERVICES_STORAGE_KEY) return;
    listener();
  };
  const onSameWindow = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_WINDOW_EVENT, onSameWindow);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_WINDOW_EVENT, onSameWindow);
  };
}
