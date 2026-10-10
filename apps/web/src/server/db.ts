import "server-only";
import { createDb, type PrismaClient } from "@eyeq/db";
import { env } from "./env";

/**
 * Database clients for the app's two runtime roles (plan 5.3). Athlete requests use
 * eyeq_api, so RLS applies; webhooks, admin and auth plumbing use eyeq_service. The app
 * never connects as postgres, anon or authenticated.
 *
 * Hosted: DATABASE_URL_API / DATABASE_URL_SERVICE are Supabase's transaction pooler as
 * the login roles. Local: with only the admin DATABASE_URL on a local host, the client
 * connects with `-c role=...`, so local development runs under the same RLS as prod.
 */
type RuntimeRole = "eyeq_api" | "eyeq_service";

const LOCAL = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
  "host.docker.internal",
]);

export function runtimeUrl(
  role: RuntimeRole,
  e: Record<string, string | undefined> = process.env,
): string {
  const explicit = e[role === "eyeq_api" ? "DATABASE_URL_API" : "DATABASE_URL_SERVICE"];
  if (explicit) return explicit;
  const admin = e["DATABASE_URL"];
  if (admin && LOCAL.has(new URL(admin).hostname)) {
    const u = new URL(admin);
    u.searchParams.set("options", `-c role=${role}`);
    return u.toString();
  }
  throw new Error(
    `${role === "eyeq_api" ? "DATABASE_URL_API" : "DATABASE_URL_SERVICE"} is not set`,
  );
}

const cache = globalThis as unknown as { eyeqDb?: Partial<Record<RuntimeRole, PrismaClient>> };

function client(role: RuntimeRole): PrismaClient {
  cache.eyeqDb ??= {};
  const existing = cache.eyeqDb[role];
  if (existing) return existing;
  const made = createDb({
    connectionString: runtimeUrl(role),
    max: Number(env.str("DB_POOL_MAX") ?? 3),
  });
  cache.eyeqDb[role] = made;
  return made;
}

/** eyeq_api: athlete requests, always through asAthlete(). */
export const apiDb = () => client("eyeq_api");
/** eyeq_service: webhooks, admin, auth plumbing. */
export const serviceDb = () => client("eyeq_service");
/** @deprecated name kept for /api/health/db; same as apiDb(). */
export const db = apiDb;
