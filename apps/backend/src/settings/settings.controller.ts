import { Body, Controller, Get, Patch, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { unlinkSync } from "node:fs";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto, RestoreDbDto } from "./dto/settings.dto";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** Public: the login screen displays the business name before any session exists. */
  @Public()
  @Get()
  get() {
    return this.settingsService.get();
  }

  @Roles("super_admin")
  @Patch()
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: { id: string; full_name: string; role: "super_admin" | "staff" }) {
    return this.settingsService.update(dto, actor);
  }

  @Roles("super_admin")
  @Get("backup")
  async downloadBackup(@Res({ passthrough: false }) res: Response) {
    const filePath = await this.settingsService.createBackupFile();
    const dateStr = new Date().toISOString().split("T")[0];
    res.download(filePath, `fuego-backup-${dateStr}.db`, () => {
      try {
        unlinkSync(filePath);
      } catch {}
    });
  }

  @Roles("super_admin")
  @Post("restore")
  async restore(
    @Body() dto: RestoreDbDto,
    @CurrentUser() actor: { id: string; full_name: string; role: "super_admin" | "staff" },
  ) {
    return this.settingsService.restoreDb(dto.fileBase64, actor);
  }
}
