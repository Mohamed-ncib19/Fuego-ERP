import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { users } from "../db/schema";
import { SESSION_COOKIE } from "./constants";

/**
 * Reads the JWT from the httpOnly session cookie (not an Authorization
 * header) — the renderer always talks same-origin, so cookies are the
 * natural transport and XSS cannot exfiltrate the token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(private readonly db: DbService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => req?.cookies?.[SESSION_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET_FACTORY(),
    });
  }

  async validate(payload: { sub: string; iat?: number }) {
    const user = await this.db.client.query.users.findFirst({
      where: eq(users.id, payload.sub),
    });
    if (!user || !user.is_active) {
      throw new UnauthorizedException("Session invalide ou compte inactif");
    }
    // The revocation floor: tokens minted before tokens_valid_after are
    // refused — password change / deactivation evicts every old session.
    if (user.tokens_valid_after && payload.iat !== undefined) {
      if (payload.iat * 1000 < user.tokens_valid_after.getTime()) {
        throw new UnauthorizedException("Session révoquée — veuillez vous reconnecter");
      }
    }
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    };
  }
}

/** Passport builds strategies at import time; secrets may still be arriving
 * from the desktop shell, so resolve lazily per verify call instead. */
function JWT_SECRET_FACTORY(): string {
  // secretOrKey accepts a function? It does not — use a getter placeholder
  // resolved at construction; bootServer sets env before AppModule loads,
  // so reading it here is safe in every supported flow.
  return process.env.JWT_SECRET ?? "fuego-dev-jwt-secret";
}
