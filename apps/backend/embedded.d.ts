/**
 * Public surface of @fuego/backend for the Electron shell. The backend build
 * emits CJS via SWC (no declarations), so the desktop's import types come
 * from this hand-maintained file — the boot API is intentionally tiny.
 */
export interface BootOptions {
  port?: number;
  dbPath?: string;
  apiKey?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  /** Absolute path to the built renderer — when set, the API serves the SPA same-origin. */
  rendererDist?: string;
}

export interface BootedServer {
  app: unknown;
  port: number;
}

export declare function bootServer(options?: BootOptions): Promise<BootedServer>;
