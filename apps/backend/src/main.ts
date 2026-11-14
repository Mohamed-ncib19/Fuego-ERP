import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { AppModule } from "./app.module";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

export interface BootOptions {
  port?: number;
  dbPath?: string;
  apiKey?: string;
  jwtSecret?: string;
  jwtRefreshSecret?: string;
  /** Absolute path to the built renderer (apps/renderer/dist) — when set, the
   * backend serves the SPA same-origin, exactly like the reference portal. */
  rendererDist?: string;
}

export interface BootedServer {
  app: NestExpressApplication;
  port: number;
}

/**
 * Boots the Fuego API. Used two ways:
 *  - embedded: the Electron main process calls it with explicit options
 *    (port, db path, secrets, renderer dist) — production mode;
 *  - standalone: `pnpm -C apps/backend start` (or dev watch) with .env — dev.
 */
export async function bootServer(options: BootOptions = {}): Promise<BootedServer> {
  if (options.dbPath) process.env.DB_PATH = options.dbPath;
  if (options.apiKey) process.env.FUEGO_API_KEY = options.apiKey;
  if (options.jwtSecret) process.env.JWT_SECRET = options.jwtSecret;
  if (options.jwtRefreshSecret) process.env.JWT_REFRESH_SECRET = options.jwtRefreshSecret;
  if (options.rendererDist) process.env.RENDERER_DIST = options.rendererDist;

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api");

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  // CSP stays off: the SPA is same-origin and its asset policy is controlled
  // by the build; enabling it is a Phase 3 hardening item (reference kept
  // the same stance where dynamic serving was involved).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Strip unknown fields, coerce DTOs — the client cannot smuggle fields.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Production: serve the built renderer from the same origin → sessions are
  // plain same-origin cookies (the reference's portal-proxies-/api shape).
  const rendererDist = process.env.RENDERER_DIST;
  if (rendererDist && existsSync(path.join(rendererDist, "index.html"))) {
    app.useStaticAssets(rendererDist);
    app.use((req: any, res: any, next: () => void) => {
      if (req.method === "GET" && !req.path.startsWith("/api") && !path.extname(req.path)) {
        res.sendFile(path.join(rendererDist, "index.html"));
      } else {
        next();
      }
    });
  }

  const port = options.port ?? Number(process.env.PORT ?? 3220);
  await app.listen(port, "127.0.0.1");
  return { app, port };
}

/** Standalone entry — only when executed directly (`node dist/main.js`). */
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  bootServer()
    .then(({ port }) => {
      // eslint-disable-next-line no-console
      console.log(`✓ Fuego API ready — http://127.0.0.1:${port}/api`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Failed to boot Fuego API:", err);
      process.exit(1);
    });
}
