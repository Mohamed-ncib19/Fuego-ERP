import { defineConfig } from "drizzle-kit";

/**
 * Schema management: `pnpm db:push` applies src/db/schema.ts to the SQLite
 * database. Phase 0 keeps push-based flow (single dev machine); versioned
 * migrations arrive with the first release (Phase 3), like the reference.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/fuego.db",
  },
});
