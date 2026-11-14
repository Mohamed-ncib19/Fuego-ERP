/**
 * Fuego desktop — Electron main process.
 *
 * Responsibilities:
 *  1. resolve the data folder (Electron userData) and generate/keep secrets
 *     (API key + JWT) in a local secrets.json — created once, reused after;
 *  2. in production, spawn the NestJS backend as a background Node service
 *     (pure Node environment with native SQLite, zero ABI/IPC conflicts);
 *     in dev, use the standalone dev backend;
 *  3. open the native desktop window loading the built renderer from the API
 *     origin or Vite in dev;
 *  4. expose apiKey/port/version to the renderer through the preload bridge.
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import { fork, type ChildProcess } from "node:child_process";

const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.FUEGO_EMBED_BACKEND === "0";

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

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

/** Polls a local TCP port until it answers or times out. */
async function waitOnTcp(port: number, timeoutMs = 30_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const isUp = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (isUp) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

// Boot diagnostics log
function dbg(...args: unknown[]) {
  try {
    fs.appendFileSync(
      path.join(__dirname, "..", "debug-boot.log"),
      `${new Date().toISOString()} ${args.join(" ")}\n`,
    );
  } catch {
    /* diagnostics must never crash the app */
  }
}
process.on("uncaughtException", (err) => dbg("UNCAUGHT:", String(err?.stack ?? err)));
process.on("unhandledRejection", (err) => dbg("UNHANDLED REJECTION:", String((err as Error)?.stack ?? err)));

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: "Fuego",
    show: true,
    backgroundColor: "#0b1021",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-finish-load", () => {
    dbg("Window loaded successfully");
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    dbg("Window failed to load:", errorCode, errorDescription, validatedURL);
  });

  const url = process.env.VITE_DEV_SERVER_URL || `http://127.0.0.1:${process.env.FUEGO_PORT ?? 3220}/`;
  dbg("Loading URL:", url);

  try {
    await mainWindow.loadURL(url);
  } catch (err: any) {
    dbg("Initial load failed, retrying in 1s:", err?.message || err);
    setTimeout(() => {
      mainWindow?.loadURL(url).catch((e) => dbg("Retry failed:", e?.message));
    }, 1200);
  }

  mainWindow.show();
  mainWindow.focus();
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
dbg("got single instance lock:", gotLock);
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.whenReady().then(async () => {
  const secrets = loadOrCreateSecrets();
  dbg("secrets ready");

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  let port = 3220;
  if (isDev) {
    port = Number(process.env.FUEGO_PORT || 3220);
    process.env.FUEGO_PORT = String(port);
  } else {
    port = await pickPort(3220);
    process.env.FUEGO_PORT = String(port);
  }
  dbg("port resolved:", port);

  if (!isDev) {
    // Standalone production: launch background backend process cleanly via fork
    const backendScript = path.resolve(__dirname, "..", "..", "backend", "dist", "main.js");
    dbg("Spawning backend child process:", backendScript);

    const env = {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(app.getPath("userData"), "data", "fuego.db"),
      FUEGO_API_KEY: secrets.api_key,
      JWT_SECRET: secrets.jwt_secret,
      JWT_REFRESH_SECRET: secrets.jwt_refresh_secret,
      RENDERER_DIST: path.resolve(__dirname, "..", "..", "renderer", "dist"),
    };

    backendProcess = fork(backendScript, [], {
      env,
      stdio: "pipe",
    });

    backendProcess.stdout?.on("data", (d) => dbg("[api]", d.toString().trim()));
    backendProcess.stderr?.on("data", (d) => dbg("[api err]", d.toString().trim()));
    backendProcess.on("exit", (code) => dbg("[api exit]", code));

    await waitOnTcp(port, 30_000);
    dbg("backend ready on port", port);
  }

  const apiKey = isDev && process.env.FUEGO_API_KEY ? process.env.FUEGO_API_KEY : secrets.api_key;

  ipcMain.handle("app:launch-info", () => ({
    version: app.getVersion(),
    apiPort: port,
    apiKey: apiKey,
  }));

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

function cleanupBackend() {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
    backendProcess = null;
  }
}

app.on("will-quit", cleanupBackend);

app.on("window-all-closed", () => {
  cleanupBackend();
  app.quit();
});
