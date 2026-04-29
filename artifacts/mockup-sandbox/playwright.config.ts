import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// The dev server binds to PORT (default 8081) and serves the app under
// BASE_PATH (default /__mockup). Drive the test traffic straight at the
// dev server so the spec is portable across CIs that don't have the
// Replit reverse proxy on :80.
const PORT = Number(process.env.PORT ?? "8081");
const BASE_PATH = process.env.BASE_PATH ?? "/__mockup";
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Resolve a Chromium binary that already has its shared libraries
 * available. Playwright's bundled chrome-headless-shell relies on
 * libglib / libnss etc. that aren't part of the default Replit Nix
 * profile, so we fall back to the system `chromium` package
 * (installed via `installSystemDependencies(["chromium"])`).
 *
 *   1. Honour PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if explicitly set.
 *   2. Otherwise resolve `chromium` via PATH.
 *   3. Finally let Playwright fall back to its bundled binary (so
 *      this config still works on machines where the bundled
 *      browser is the right answer).
 */
function resolveChromium(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit) return explicit;
  try {
    return execSync("command -v chromium", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}

const chromiumExecutable = resolveChromium();

export default defineConfig({
  testDir: "./tests-e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutable
          ? { launchOptions: { executablePath: chromiumExecutable } }
          : {}),
      },
    },
  ],
  // Boot the Vite dev server automatically when running on a fresh
  // CI machine; reuse the workflow-managed server during local dev so
  // we don't fight over the port.
  webServer: {
    command: "pnpm run dev",
    url: `http://127.0.0.1:${PORT}${BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      BASE_PATH,
    },
  },
});
