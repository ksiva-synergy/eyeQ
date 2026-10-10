import "server-only";
import { createDb, type PrismaClient } from "@eyeq/db";

/**
 * One Prisma client per server instance, reused across requests and across dev reloads.
 * On Vercel, DATABASE_URL_API is Supabase's transaction pooler (port 6543) as eyeq_api;
 * every athlete query goes through asAthlete() so app.user_id stays transaction-local.
 */
const globalForDb = globalThis as unknown as { eyeqDb?: PrismaClient };

export function db(): PrismaClient {
  if (globalForDb.eyeqDb) return globalForDb.eyeqDb;
  const connectionString = process.env["DATABASE_URL_API"] ?? process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL_API is not set");
  const client = createDb({ connectionString, max: Number(process.env["DB_POOL_MAX"] ?? 3) });
  globalForDb.eyeqDb = client;
  return client;
}
