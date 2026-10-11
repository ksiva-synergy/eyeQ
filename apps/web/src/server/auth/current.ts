import "server-only";
import { connection } from "next/server";
import { nextJar } from "./next-cookies";
import { qaGrantFromJar, qaSession } from "./qa";
import { claimsToSession, supabaseFor } from "./supabase";
import { env } from "../env";
import { log } from "../observability/log";
import type { Session } from "./session";

/**
 * The signed-in athlete for a server component, verified with getClaims().
 * connection() first: verifying may call Supabase Auth, which must happen only for a
 * real request, never in a build prerender or a runtime prefetch (Cache Components and
 * partialPrefetching are on). Otherwise a prefetch whose fetch is cut off would look
 * signed out and prefetch a redirect to /sign-in.
 */
export async function currentSession(): Promise<Session | null> {
  await connection();
  const jar = await nextJar();
  const qa = qaSession(qaGrantFromJar(jar));
  if (qa) return qa;
  if (!env.supabase()) return null;
  const { data, error } = await supabaseFor(jar).auth.getClaims();
  if (error) {
    // A network failure is not "signed out": surface it instead of redirecting.
    if (error.name === "AuthRetryableFetchError") throw error;
    log("warn", "session check failed", { name: error.name });
  }
  if (error || !data?.claims) return null;
  return claimsToSession(data.claims as Record<string, unknown>);
}
