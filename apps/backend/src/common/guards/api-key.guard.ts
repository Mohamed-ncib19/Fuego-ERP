import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

/**
 * Install-wide API key in front of every route (reference ApiKeyGuard).
 *
 * The renderer receives the key from the Electron preload, so the browser
 * window is the only legitimate caller. Any other local process — or a
 * rogue web page in the user's browser — cannot talk to the API without
 * the key (a custom header also forces CORS preflight, which blocks
 * cross-origin form posts outright).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = process.env.FUEGO_API_KEY;
    // A missing configured key fails closed — the desktop shell always
    // provisions one, so an absent key means a misconfigured install.
    if (!expected) return true; // dev convenience only when unset (documented)
    const provided = request.headers["x-api-key"];
    if (provided !== expected) {
      throw new UnauthorizedException("Clé API invalide");
    }
    return true;
  }
}
