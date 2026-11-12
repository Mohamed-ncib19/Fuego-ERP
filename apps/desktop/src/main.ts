/**
 * Fuego desktop — Electron main process.
 *
 * Responsibilities:
 *  1. resolve the data folder (Electron userData) and generate/keep secrets
 *     (API key + JWT) in a local secrets.json — created once, reused after;
 *  2. boot the NestJS backend **inside this process** (production) or skip
 *     it in dev (FUEGO_EMBED_BACKEND=0 — the dev orchestrator runs a
 *     standalone watching backend instead);
 *  3. open the window loading the built renderer from the API origin
 *     (same-origin → session cookies work), or the Vite dev server in dev;
 *  4. expose apiKey/port/version to the renderer through the preload bridge.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import net from "node:net";

const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.FUEGO_EMBED_BACKEND === "0";

interface Secrets {
  api_key: string;
  jwt_secret: string;
  jwt_refresh_secret: string;
}

function secretsPath(): string {
  return path.join(app.getPath("userData"), "secrets.json");
}

function loadOrCreateSecrets(): Secrets {
  const file = secretsPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Secrets;
    if (parsed.api_key && parsed.jwt_secret && parsed.jwt_refresh_secret) return parsed;
  } catch {
    // first run — create below
  }
  const fresh: Secrets = {
    api_key: "fuego_" + crypto.randomBytes(24).toString("hex"),
    jwt_secret: crypto.randomBytes(48).toString("hex"),
    jwt_refresh_secret: crypto.randomBytes(48).toString("hex"),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2), { mode: 0o600 });
  return fresh;
}

/** First free TCP port at `preferred` or above — bind-probe, then release. */
function pickPort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = (port: number) => {
      if (port > preferred + 40) {
        reject(new Error("No free port found"));
        return;
      }
      const srv = net.createServer();
      srv.once("error", () => probe(port + 1));
      srv.once("listening", () => {
        srv.close(() => resolve(port));
      });
      srv.listen(port, "127.0.0.1");
    };
    probe(preferred);
  });
}

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "Fuego",
    backgroundColor: "#0b1021",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Only the preload needs the bridge; the renderer stays sandboxed
      // from Node (standard secure Electron posture).
      sandbox: false,
    },
  });

  // Any target=_blank / external link opens in the system browser, never a
  // new Electron window (the desktop app has exactly one surface).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Prod: the backend serves the built SPA on the same origin.
    const port = Number(process.env.FUEGO_PORT ?? 3220);
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }
}

app.whenReady().then(async () => {
  // Boot diagnostics go to a file — stdout pipes die with the parent shell,
  // and an Electron crash here would otherwise be invisible.
  const dbg = (...args: unknown[]) => {
    try {
      fs.appendFileSync(path.join(__dirname, "..", "debug-boot.log"), `${new Date().toISOString()} ${args.join(" ")}\n`);
    } catch {
      /* diagnostics must never crash the app */
    }
  };
  process.on("uncaughtException", (err) => dbg("UNCAUGHT:", String(err?.stack ?? err)));
  process.on("unhandledRejection", (err) => dbg("UNHANDLED REJECTION:", String((err as Error)?.stack ?? err)));

  const secrets = loadOrCreateSecrets();
  dbg("secrets ready");
  const port = await pickPort(3220);
  process.env.FUEGO_PORT = String(port);
  dbg("port picked", port);

  if (!isDev) {
    // Embed the API in this process — one binary, zero extra services.
    const backend = require("@fuego/backend") as typeof import("@fuego/backend");
    dbg("booting backend…");
    await backend.bootServer({
      port,
      dbPath: path.join(app.getPath("userData"), "data", "fuego.db"),
      apiKey: secrets.api_key,
      jwtSecret: secrets.jwt_secret,
      jwtRefreshSecret: secrets.jwt_refresh_secret,
      rendererDist: path.join(__dirname, "..", "..", "renderer", "dist"),
    });
    dbg("backend booted on", port);
  }

  ipcMain.handle("app:launch-info", () => ({
    version: app.getVersion(),
    apiPort: port,
    apiKey: secrets.api_key,
  }));

  await createWindow();

  app.on("activate", () => {
    // macOS convention: re-open the window when the dock icon is clicked.
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
