import { SetMetadata } from "@nestjs/common";

/** Marks an endpoint as reachable without a session (login, setup, health…). */
export const IS_PUBLIC_KEY = "is_public";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
