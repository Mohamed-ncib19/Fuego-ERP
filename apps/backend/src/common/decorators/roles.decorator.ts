import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@fuego/shared";

export const ROLES_KEY = "roles";
/** Restricts an endpoint to the given roles (RolesGuard). No metadata = any authenticated user. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
