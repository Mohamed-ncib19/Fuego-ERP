import { apiGet, apiPatch, apiPost, http } from "./client";
import type { AppSettings } from "@fuego/shared";

export const settingsApi = {
  get(): Promise<AppSettings> {
    return apiGet<AppSettings>("/settings").then((r) => r.data);
  },

  update(dto: Partial<Pick<AppSettings, "business_name" | "ticket_footer">>): Promise<AppSettings> {
    return apiPatch<AppSettings>("/settings", dto);
  },

  async downloadBackup(): Promise<void> {
    const res = await http.get("/settings/backup", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.href = url;
    link.setAttribute("download", `fuego-backup-${dateStr}.db`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  restore(fileBase64: string): Promise<{ ok: boolean; message: string }> {
    return apiPost<{ ok: boolean; message: string }>("/settings/restore", { fileBase64 });
  },
};
