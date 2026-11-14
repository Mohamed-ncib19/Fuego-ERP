/**
 * Fuego dev orchestrator — the `pnpm dev` entry point.
 *
 * Starts, in order:
 *   1. the renderer Vite dev server (http://localhost:5173, proxies /api)
 *   2. the standalone backend in watch mode (http://127.0.0.1:3220)
 *   3. Electron once both are up (loads the Vite URL, does NOT embed the
 *      backend in dev — the standalone process hot-reloads instead)
 *
 * All output is tee'd to logs/*.log, like the reference's dev.mjs.
 */
import { spawn } from "node:child_process";
import { mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const logsDir = path.join(root, "logs");
mkdirSync(logsDir, { recursive: true });

const isWin = process.platform === "win32";
const baseEnv = { ...process.env, FORCE_COLOR: "1" };

const children = [];

function run(name, color, label, args, cwd, env = {}) {
  const logPath = path.join(logsDir, `${name}.log`);
  const pnpm = isWin ? "pnpm.cmd" : "pnpm";
  const child = spawn(pnpm, args, {
    cwd: path.join(root, cwd),
    env: { ...baseEnv, ...env },
    shell: isWin,
  });
  children.push(child);

  const write = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`\x1b[${color}m[${label}]\x1b[0m ${text}`);
    appendFileSync(logPath, text);
  };
  child.stdout?.on("data", write);
  child.stderr?.on("data", write);
  child.on("exit", (code) => {
    process.stdout.write(`\x1b[${color}m[${label}]\x1b[0m exited with code ${code}\n`);
  });
  return child;
}

function waitOnTcp(port, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: "127.0.0.1", timeout: 800 });
      const retry = () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(attempt, 700);
        }
      };
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", retry);
      socket.on("timeout", retry);
    };
    attempt();
  });
}

process.stdout.write(`
\x1b[38;5;208m
  ┌─────────────────────────────────────────────┐
  │  FUEGO — dev stack                          │
  │  renderer : http://localhost:5173           │
  │  backend  : http://127.0.0.1:3220/api       │
  │  logs     : logs/*.log                      │
  └─────────────────────────────────────────────┘\x1b[0m
\n`);

run("renderer", "35", "vite", ["run", "dev"], "apps/renderer");
run("backend", "33", "api", ["run", "dev"], "apps/backend");

// Electron last: needs both servers.
waitOnTcp(5173)
  .then(() => waitOnTcp(3220))
  .then(() => {
    process.stdout.write("\x1b[35m[electron]\x1b[0m servers up — launching desktop shell\n");
    run("electron", "35", "electron", ["run", "dev"], "apps/desktop", {
      FUEGO_EMBED_BACKEND: "0",
      VITE_DEV_SERVER_URL: "http://127.0.0.1:5173",
      FUEGO_PORT: "3220",
      FUEGO_API_KEY: "fuego-dev-api-key",
    });
  })
  .catch((err) => {
    process.stdout.write(`\x1b[31m[dev]\x1b[0m ${err.message}\n`);
  });

function cleanup() {
  for (const c of children) {
    if (c.pid) {
      try {
        if (isWin) {
          spawn("taskkill", ["/pid", String(c.pid), "/f", "/t"]);
        } else {
          c.kill();
        }
      } catch {}
    }
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
