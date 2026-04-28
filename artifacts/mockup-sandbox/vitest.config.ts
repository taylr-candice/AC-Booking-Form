import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // The component-level tests (`*.test.tsx`) render React with JSX, so
  // we need the React plugin to transpile them. The bare-state unit
  // tests (`*.test.ts`) don't use it but the plugin is a no-op for
  // them.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Default environment stays `node` for the existing state-only
    // unit tests. Component tests opt into a DOM environment with a
    // `// @vitest-environment happy-dom` directive at the top of the
    // file.
    environment: "node",
    // The booking-flow wrapper renders each step inside an `<iframe>`
    // whose `src` points at a Vite dev-server preview URL that doesn't
    // resolve under happy-dom. The wrapper's tests swap in a
    // deterministic `srcdoc` once the iframe has mounted, but happy-dom
    // still tries to navigate to the original `src` first. We turn off
    // its real iframe page loading so it never opens a socket — `srcdoc`
    // is unaffected because happy-dom handles it on a separate code path
    // that doesn't touch the network. Production behaviour is unchanged
    // (this setting only exists inside the test environment).
    environmentOptions: {
      happyDOM: {
        settings: {
          disableIframePageLoading: true,
        },
      },
    },
    // Quiet the NotSupportedError that happy-dom now logs in place of
    // the network attempt. With `disableIframePageLoading` on,
    // `HTMLIFrameElement.#loadPage` reports "Failed to load iframe page
    // ... Iframe page loading is disabled." through `page.console.error`,
    // which Vitest pipes to the test's stderr (vitest's happy-dom env
    // wires the browser's console straight to `globalThis.console`).
    // The message is purely informational — the wrapper's tests don't
    // depend on iframe `src` resolving — so swallow only this exact
    // pattern and let everything else through unchanged so a real
    // failure is still visible.
    onConsoleLog(log) {
      if (log.includes("Iframe page loading is disabled.")) {
        return false;
      }
    },
  },
});
