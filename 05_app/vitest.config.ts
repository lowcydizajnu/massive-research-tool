import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // React's automatic JSX runtime (same as Next) so `.tsx` under test doesn't
  // need an explicit `import React` — e.g. the @react-pdf document component.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  resolve: {
    // Mirror tsconfig "paths": "@/*" -> "./*"
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
