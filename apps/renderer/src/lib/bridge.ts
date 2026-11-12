/**
 * Shape exposed by the Electron preload (apps/desktop/src/preload.ts).
 * The renderer degrades gracefully when running in a plain browser tab
 * (dev): the API key stays null and same-origin calls still work because
 * the Vite proxy forwards them.
 */
export interface FuegoBridge {
  getLaunchInfo(): Promise<{
    version: string;
    apiPort: number;
    apiKey: string | null;
  }>;
}

declare global {
  interface Window {
    fuego?: FuegoBridge;
  }
}
