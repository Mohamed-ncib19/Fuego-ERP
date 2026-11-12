/**
 * JWT settings — read lazily (per call) so a test or the embedded desktop
 * boot can set the environment just before the server starts, exactly like
 * the reference's auth/constants.
 */
export function JWT_SECRET(): string {
  return process.env.JWT_SECRET ?? "fuego-dev-jwt-secret";
}

export function JWT_REFRESH_SECRET(): string {
  return process.env.JWT_REFRESH_SECRET ?? "fuego-dev-jwt-refresh-secret";
}

/** Short-lived access token; the refresh cookie is the real session.
 * Seconds — jsonwebtoken's typed expiresIn accepts numbers or template
 * strings only, so numbers keep the types honest. */
export const ACCESS_TTL_SECONDS = 15 * 60;
/** The long-lived half — a rotating refresh token in an httpOnly cookie. */
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE = "fuego_session";
export const REFRESH_COOKIE = "fuego_refresh";
export const REFRESH_COOKIE_PATH = "/api/auth";
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
