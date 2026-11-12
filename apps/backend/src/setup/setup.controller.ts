import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { SetupService } from "./setup.service";
import { SetupAdminDto } from "./dto/setup.dto";
import { Public } from "../common/decorators/public.decorator";

@Controller("setup")
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @Get("status")
  async status() {
    return { needs_setup: await this.setupService.needsSetup() };
  }

  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async complete(@Body() dto: SetupAdminDto, @Req() req: Request) {
    return this.setupService.complete(dto, {
      ip: req.socket?.remoteAddress ?? null,
      userAgent: (req.headers["user-agent"] as string) ?? null,
    });
  }
}
