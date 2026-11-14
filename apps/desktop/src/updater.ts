/**
 * Auto-update for the installed app.
 *
 * Every push to the `production` branch builds a new installer and publishes
 * it as a GitHub release (.github/workflows/release.yml). The installed app
 * checks that feed at startup and every few hours, downloads a newer version
 * in the background, then offers to restart. Declining is fine: the update is
 * applied the next time the app quits.
 */
import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export function startAutoUpdate(
  getWindow: () => BrowserWindow | null,
  log: (...args: unknown[]) => void,
): void {
  // Only an installed build has an update feed (app-update.yml).
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => log("[update] checking"));
  autoUpdater.on("update-available", (info) => log("[update] available:", info.version));
  autoUpdater.on("update-not-available", () => log("[update] up to date:", app.getVersion()));
  // No network, feed unreachable… never bother the user, just log it. Only
  // the first line: the full message dumps the HTTP response headers.
  const brief = (err: unknown) => String((err as Error)?.message ?? err).split("\n")[0];
  autoUpdater.on("error", (err) => log("[update] error:", brief(err)));

  let prompted = false;
  autoUpdater.on("update-downloaded", async (info) => {
    log("[update] downloaded:", info.version);
    if (prompted) return;
    prompted = true;
    const options = {
      type: "info" as const,
      title: "Mise à jour disponible",
      message: `Fuego ${info.version} est prêt à être installé.`,
      detail:
        "Redémarrez maintenant pour appliquer la mise à jour, ou continuez à travailler : elle sera installée à la fermeture de l'application.",
      buttons: ["Redémarrer maintenant", "Plus tard"],
      defaultId: 0,
      cancelId: 1,
    };
    const win = getWindow();
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((err) => log("[update] check failed:", brief(err)));
  };
  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}
