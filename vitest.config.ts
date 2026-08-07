import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/tests/**/*.test.ts",
      "examples/*/tests/**/*.test.ts",
    ],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "packages/*/lib/**/*.{ts,js}",
        "packages/oxlint-plugin/index.ts",
      ],
      exclude: [
        "**/dist/**",
        "**/tests/**",
        "**/node_modules/**",
        "**/*.d.ts",
      ],
    },
  },
});
