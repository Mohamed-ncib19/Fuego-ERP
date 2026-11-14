/**
 * Prepares apps/desktop/bundle/ — everything the installer ships, with no
 * node_modules tree to resolve at packaging time:
 *
 *   bundle/main.js, preload.js      Electron shell (electron-updater inlined)
 *   bundle/resources/backend/       the whole NestJS API in one file
 *     └─ vendor/better-sqlite3      the only native module, copied as-is
 *   bundle/resources/renderer/      the built UI
 *
 * Run after `pnpm run build`. electron-builder.yml then packs bundle/.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const desktop = path.join(root, "apps", "desktop");
const backend = path.join(root, "apps", "backend");
const renderer = path.join(root, "apps", "renderer");
const out = path.join(desktop, "bundle");

const { build } = createRequire(path.join(desktop, "package.json"))("esbuild");

for (const required of [
  path.join(desktop, "dist", "main.js"),
  path.join(backend, "dist", "main.js"),
  path.join(renderer, "dist", "index.html"),
]) {
  if (!fs.existsSync(required)) {
    console.error(`✗ missing ${required} — run "pnpm run build" first`);
    process.exit(1);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "resources"), { recursive: true });

// 1. Electron shell.
await build({
  entryPoints: [path.join(desktop, "dist", "main.js")],
  outfile: path.join(out, "main.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  logLevel: "warning",
});
fs.copyFileSync(path.join(desktop, "dist", "preload.js"), path.join(out, "preload.js"));

// 2. Backend, one file. NestJS probes for optional integrations with
//    require() inside try/catch — they are not installed, so they stay
//    external and keep failing softly exactly like in a normal install.
await build({
  entryPoints: [path.join(backend, "dist", "main.js")],
  outfile: path.join(out, "resources", "backend", "main.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  keepNames: true,
  // electron-builder strips every folder named node_modules from extra
  // resources, so the native module ships in vendor/ and is required by path.
  plugins: [
    {
      name: "vendor-better-sqlite3",
      setup(b) {
        b.onResolve({ filter: /^better-sqlite3$/ }, () => ({
          path: "./vendor/better-sqlite3/lib/index.js",
          external: true,
        }));
      },
    },
  ],
  external: [
    "@nestjs/microservices",
    "@nestjs/microservices/*",
    "@nestjs/websockets",
    "@nestjs/websockets/*",
    "@nestjs/platform-fastify",
    "@fastify/*",
    "class-transformer/storage",
  ],
  logLevel: "warning",
});

// 3. The native SQLite module: JS loader + the Windows x64 binary only.
const sqliteSrc = path.dirname(
  createRequire(path.join(backend, "package.json")).resolve("better-sqlite3/package.json"),
);
const sqliteOut = path.join(out, "resources", "backend", "vendor", "better-sqlite3");
fs.mkdirSync(path.join(sqliteOut, "prebuilds"), { recursive: true });
fs.cpSync(path.join(sqliteSrc, "lib"), path.join(sqliteOut, "lib"), { recursive: true });
fs.copyFileSync(path.join(sqliteSrc, "package.json"), path.join(sqliteOut, "package.json"));
fs.copyFileSync(
  path.join(sqliteSrc, "prebuilds", "win32-x64.node"),
  path.join(sqliteOut, "prebuilds", "win32-x64.node"),
);

// 4. The UI.
fs.cpSync(path.join(renderer, "dist"), path.join(out, "resources", "renderer"), { recursive: true });

const size = (p) => `${(fs.statSync(p).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`✓ bundle ready in ${path.relative(root, out)}`);
console.log(`  shell   ${size(path.join(out, "main.js"))}`);
console.log(`  backend ${size(path.join(out, "resources", "backend", "main.js"))}`);
