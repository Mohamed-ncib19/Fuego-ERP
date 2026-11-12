import { sql, SQL } from "drizzle-orm";

/**
 * SQLite count helper — SQLite has no PostgreSQL `::int` cast, and every
 * paginated list needs the same shape. Keep SQL dialect specifics in ONE
 * place (this file), not scattered through services.
 */
export function countExpr(): SQL<number> {
  return sql<number>`count(*)`;
}
