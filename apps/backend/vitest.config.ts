import { defineConfig } from "vitest/config";

/** Backend unit specs run on plain Node — no DOM, no Nest bootstrap. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
