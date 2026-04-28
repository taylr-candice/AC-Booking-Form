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
  },
});
