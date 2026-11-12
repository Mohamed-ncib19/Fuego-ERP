/**
 * Sanity checks after install. better-sqlite3 v13 ships N-API prebuilds in
 * the package itself, so it loads in both plain Node and Electron with no
 * rebuild step. This script verifies that claim early instead of failing at
 * first boot.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// better-sqlite3 is a dependency of the backend workspace package.
const req = createRequire(path.join(root, "apps", "backend", "package.json"));

try {
  const Database = req("better-sqlite3");
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t(x)");
  db.close();
  console.log("✓ better-sqlite3 loads (N-API prebuild)");
} catch (err) {
  console.error("✗ better-sqlite3 failed to load — native prebuild problem:");
  console.error(err);
  process.exitCode = 1;
}
