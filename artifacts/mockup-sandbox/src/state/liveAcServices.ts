/**
 * Cross-iframe bridge for the AC service caps (Task #222).
 *
 * Mirrors the {@link import("./liveOtherServices")} bridge pattern:
 * the customer booking flow is rendered inside an `<iframe>` by
 * `BookingFlow{Mobile,Desktop}` (each step loads its preview page in
 * a child JS realm), so module-level state in the parent frame —
 * where `AdminApp` lives — can't be read directly. We project the
 * AC catalogue's per-AC-type max-add-on quantities through
 * sessionStorage (which IS shared across same-origin iframes) so
 * the AC step's indoor-unit stepper can disable "+" at the cap and
 * `bookingActions.setAdditionalIndoor` can clamp without crashing
 * when the parent frame's catalogue can't be reached.
 *
 * The "other" service catalogue uses its own bridge because the
 * customer flow needs the full rule (name, pricing, addon label,
 * etc); for AC we only need the cap by type, so the projection
 * stays small.
 */

/** sessionStorage key for the projected AC caps. Bumped on shape
 *  change; the reader silently returns `null` on a parse mismatch
 *  so legacy data degrades to "no cap" rather than crashing. */
export const LIVE_AC_SERVICES_STORAGE_KEY = "taylr.live-ac-services.v1";

/** Same-window custom event so subscribers in the writer's frame
 *  re-render. Mirrors `liveOtherServices`. */
const SAME_WINDOW_EVENT = "taylr-live-ac-services-changed";

const isBrowser = typeof window !== "undefined";

/** Per-AC-type stepper caps. `null` means "no cap configured" — the
 *  customer flow falls back to the default action ceiling. */
export type LiveAcCaps = {
  split: number | null;
  ducted: number | null;
};

/**
 * Hard-coded per-AC-type defaults (Task #222) — used as the fallback
 * cap when the AdminApp hasn't projected a value into sessionStorage
 * (canvas-isolated previews, direct AC step renders, fresh tabs
 * before AdminApp mounts). These mirror the seeded `AdminService`
 * values in `adminMockData.ts` so editing the catalogue and running
 * a standalone preview agree on the cap by default. AdminApp
 * publishes its current values on top of these via `writeLiveAcCaps`.
 */
export const DEFAULT_AC_INDOOR_CAPS: Readonly<{
  split: number;
  ducted: number;
}> = Object.freeze({ split: 6, ducted: 8 });

const EMPTY_CAPS: LiveAcCaps = Object.freeze({
  split: null,
  ducted: null,
});

let cachedRaw: string | null | undefined = undefined;
let cachedValue: LiveAcCaps = EMPTY_CAPS;

/**
 * Read the latest projected AC caps from sessionStorage. Returns
 * `{split: null, ducted: null}` when storage is missing, empty,
 * or malformed — callers fall back to a default ceiling rather
 * than blocking the customer.
 *
 * The return value is referentially stable until the underlying
 * sessionStorage string changes (required by `useSyncExternalStore`).
 */
export function readLiveAcCapsFromStorage(): LiveAcCaps {
  if (!isBrowser) return EMPTY_CAPS;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(LIVE_AC_SERVICES_STORAGE_KEY);
  } catch {
    return EMPTY_CAPS;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = EMPTY_CAPS;
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      cachedValue = EMPTY_CAPS;
      return cachedValue;
    }
    const obj = parsed as Record<string, unknown>;
    const split = sanitiseCap(obj.split);
    const ducted = sanitiseCap(obj.ducted);
    cachedValue = Object.freeze({ split, ducted });
    return cachedValue;
  } catch {
    cachedValue = EMPTY_CAPS;
    return cachedValue;
  }
}

function sanitiseCap(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.floor(v);
}

/**
 * Look up the cap for a single AC type. Always returns a positive
 * integer: prefers the live projection from AdminApp, otherwise
 * falls back to {@link DEFAULT_AC_INDOOR_CAPS}. The fallback ensures
 * the cap takes effect in canvas-isolated previews and on fresh
 * loads before AdminApp's `useEffect` has run, so the customer
 * stepper is never accidentally uncapped.
 */
export function getLiveAdditionalIndoorCap(
  acTypeKey: "split" | "ducted",
): number {
  const live = readLiveAcCapsFromStorage()[acTypeKey];
  if (live != null && live > 0) return live;
  return DEFAULT_AC_INDOOR_CAPS[acTypeKey];
}

/**
 * Persist the projected AC caps to sessionStorage. Pass `null` to
 * clear — used by AdminApp's unmount cleanup so a stale cap from a
 * previous mount doesn't leak into a fresh page load.
 */
export function writeLiveAcCaps(caps: LiveAcCaps | null): void {
  if (!isBrowser) return;
  try {
    if (caps === null) {
      window.sessionStorage.removeItem(LIVE_AC_SERVICES_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        LIVE_AC_SERVICES_STORAGE_KEY,
        JSON.stringify({ split: caps.split, ducted: caps.ducted }),
      );
    }
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new Event(SAME_WINDOW_EVENT));
  } catch {
    /* CustomEvent isn't constructible in some test envs; ignore */
  }
}

/**
 * Subscribe to "live AC caps changed" notifications. Fires on:
 *
 * - cross-window `storage` events keyed to
 *   {@link LIVE_AC_SERVICES_STORAGE_KEY}, and
 * - same-window custom events dispatched by {@link writeLiveAcCaps}.
 */
export function subscribeLiveAcCaps(listener: () => void): () => void {
  if (!isBrowser) return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== LIVE_AC_SERVICES_STORAGE_KEY) return;
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
