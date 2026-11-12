import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import {
  ACCESS_TTL_MS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TTL_MS,
  SESSION_COOKIE,
} from "./constants";
import type { SafeUser } from "@fuego/shared";

interface Actor {
  id: string;
  email: string;
  full_name: string;
  role: SafeUser["role"];
}

/** 10 failed attempts per minute per socket address — an in-memory map is
 * enough for a single-machine app; the socket address cannot be forged by
 * headers (lesson from the reference's throttle). */
const FAILED_WINDOW_MS = 60_000;
const FAILED_MAX = 10;
const failedLogins = new Map<string, number[]>();

function pruneFailed(key: string): number {
  const now = Date.now();
  const list = (failedLogins.get(key) ?? []).filter((t) => now - t < FAILED_WINDOW_MS);
  failedLogins.set(key, list);
  return list.length;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private ctx(req: Request) {
    return {
      ip: req.socket?.remoteAddress ?? null,
      userAgent: (req.headers["user-agent"] as string) ?? null,
    };
  }

  private setCookies(res: Response, tokens: { access_token: string; refresh_token: string }) {
    res.cookie(SESSION_COOKIE, tokens.access_token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: ACCESS_TTL_MS,
      path: "/",
    });
    res.cookie(REFRESH_COOKIE, tokens.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: REFRESH_TTL_MS,
      // Scoped to the auth endpoints — the refresh token should not ride
      // along on every business request.
      path: REFRESH_COOKIE_PATH,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = req.socket?.remoteAddress ?? "unknown";
    if (pruneFailed(key) >= FAILED_MAX) {
      throw new UnauthorizedException("Trop de tentatives — réessayez dans une minute");
    }
    try {
      const user = await this.authService.validateUser(dto.email, dto.password, this.ctx(req));
      failedLogins.delete(key);
      const tokens = await this.authService.login(user);
      this.setCookies(res, tokens);
      return tokens;
    } catch (err) {
      failedLogins.set(key, [...(failedLogins.get(key) ?? []), Date.now()]);
      throw err;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = (req.cookies as any)?.[REFRESH_COOKIE];
    const tokens = await this.authService.refresh(refreshToken);
    this.setCookies(res, tokens);
    return tokens;
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  async logout(
    @CurrentUser() actor: Actor,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.log(actor.id, "auth.logout", this.ctx(req));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { ok: true };
  }

  @Get("me")
  async me(@CurrentUser() actor: Actor) {
    return this.authService.me(actor.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post("change-password")
  async changePassword(
    @CurrentUser() actor: Actor,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(actor.id, dto.current_password, dto.new_password);
  }
}
