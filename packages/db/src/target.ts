/**
 * Which database an admin script (migrate, reset, test, seed) may touch.
 *
 * The admin URL is DIRECT_URL when set (Prisma's convention for the CLI connection),
 * otherwise DATABASE_URL. Destructive or test-only actions are refused on anything
 * that is not a local database, so a .env pointed at hosted Supabase cannot wipe it:
 *   reset, test   local only, always
 *   seed          local, or remote with ALLOW_REMOTE_SEED=1 for that one run
 *   migrate       anywhere except a transaction pooler (port 6543), which cannot hold
 *                 the session advisory lock the runner takes
 */
export type AdminAction = "migrate" | "status" | "reset" | "test" | "seed";

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
  "host.docker.internal",
]);

export function adminUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env["DIRECT_URL"] || env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL (or DIRECT_URL) is not set");
  return url;
}

export function isLocal(url: string): boolean {
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

export function assertTarget(
  action: AdminAction,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const u = new URL(url);
  if (u.port === "6543") {
    throw new Error(
      `${action} refuses the transaction pooler (port 6543). Use the session pooler or direct URL (port 5432), e.g. DIRECT_URL.`,
    );
  }
  if (isLocal(url)) return;
  if (action === "reset" || action === "test") {
    throw new Error(
      `${action} refuses a non-local database (${u.hostname}). It runs on local databases only.`,
    );
  }
  if (action === "seed" && env["ALLOW_REMOTE_SEED"] !== "1") {
    throw new Error(
      `seed refuses a non-local database (${u.hostname}). Set ALLOW_REMOTE_SEED=1 for this run if you mean it.`,
    );
  }
}

/** The admin URL for `action`, after the checks above. */
export function targetFor(action: AdminAction, env: NodeJS.ProcessEnv = process.env): string {
  const url = adminUrl(env);
  assertTarget(action, url, env);
  return url;
}
