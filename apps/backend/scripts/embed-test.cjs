/* Embedded-mode smoke test: boot the API with the renderer dist like the
 * Electron shell does, then check the SPA + API on the same origin. */
const { bootServer } = require("../dist/main.js");
const { execSync } = require("node:child_process");

bootServer({
  port: 3221,
  dbPath: "./data/embed-test.db",
  apiKey: "embed-test-key",
  jwtSecret: "test-jwt-secret",
  jwtRefreshSecret: "test-jwt-refresh-secret",
  rendererDist: "D:/fuego/apps/renderer/dist",
})
  .then(async ({ port }) => {
    console.log("embedded API on", port);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { "x-api-key": "embed-test-key" },
    });
    console.log("health:", health.status, (await health.json()).data?.status);
    const root = await fetch(`http://127.0.0.1:${port}/`);
    const html = await root.text();
    console.log("root page:", root.status, html.includes("<div id=\"root\">") ? "serves SPA ✓" : "NO SPA ✗");
    const spa = await fetch(`http://127.0.0.1:${port}/settings/users`);
    console.log("SPA fallback route:", spa.status, (await spa.text()).includes("root") ? "ok ✓" : "✗");
    process.exit(0);
  })
  .catch((err) => {
    console.error("embedded boot failed:", err);
    process.exit(1);
  });
