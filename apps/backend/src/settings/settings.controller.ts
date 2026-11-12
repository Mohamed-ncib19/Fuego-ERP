import { Body, Controller, Get, Patch } from "@nestjs/common";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./dto/settings.dto";
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
}
