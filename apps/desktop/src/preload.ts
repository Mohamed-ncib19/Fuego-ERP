import { contextBridge, ipcRenderer } from "electron";

/**
 * The only bridge between the sandboxed renderer and this process: a getter
 * for the launch info (API key + port + version). Nothing else is exposed.
 */
contextBridge.exposeInMainWorld("fuego", {
  getLaunchInfo: (): Promise<{
    version: string;
    apiPort: number;
    apiKey: string | null;
  }> => ipcRenderer.invoke("app:launch-info"),
});
