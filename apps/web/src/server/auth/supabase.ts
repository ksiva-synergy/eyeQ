import "server-only";
import { createServerClient, parseCookieHeader, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env";
import { qaGrantFrom, qaSession, qaTokenFrom } from "./qa";
import { e164, type Session, type SessionVerifier } from "./session";

/**
 * Supabase Auth (D28), used only on the server: the browser never holds a Supabase key.
 * The session lives in Supabase's cookies, written by @supabase/ssr; src/proxy.ts
 * refreshes them on navigation.
 */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

export class AuthNotConfigured extends Error {
  constructor() {
    super("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are not set");
  }
}

export function supabaseFor(jar: CookieJar): SupabaseClient {
  const cfg = env.supabase();
  if (!cfg) throw new AuthNotConfigured();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => jar.setAll(cookies),
    },
  });
}

/**
 * A client that keeps no session and writes no cookies: the mobile token routes, where the
 * session goes back to the app as JSON (DECISIONS.md, phase 8: mobile sign-in).
 */
export function supabaseStateless(): SupabaseClient {
  const cfg = env.supabase();
  if (!cfg) throw new AuthNotConfigured();
  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** A read-only jar over a request's Cookie header. */
export function requestJar(req: Request): CookieJar {
  return {
    getAll: () =>
      parseCookieHeader(req.headers.get("cookie") ?? "").map((c) => ({
        name: c.name,
        value: c.value ?? "",
      })),
    setAll: () => {},
  };
}

/**
 * Verifies the caller with Supabase: a bearer token (the Expo client, phase 8) or the
 * cookie session (web). getClaims() checks the JWT signature against the project's
 * keys (or asks Supabase Auth, for a symmetric key) and its expiry.
 */
export function supabaseVerifier(): SessionVerifier {
  return {
    async verify(req) {
      const qa = qaSession(qaGrantFrom(qaTokenFrom(req)));
      if (qa) return qa;
      if (!env.supabase()) return null;
      const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
      const supabase = supabaseFor(requestJar(req));
      const { data, error } = await supabase.auth.getClaims(bearer);
      if (error || !data?.claims) return null;
      return claimsToSession(data.claims as Record<string, unknown>);
    },
  };
}

/** Maps verified Supabase JWT claims to a Session; null for anything but a real athlete. */
export function claimsToSession(c: Record<string, unknown>): Session | null {
  if (c["role"] !== "authenticated" || typeof c["sub"] !== "string" || c["is_anonymous"] === true)
    return null;
  const meta = (c["user_metadata"] ?? {}) as Record<string, unknown>;
  const name = meta["full_name"] ?? meta["name"];
  return {
    userId: c["sub"],
    phone: e164(c["phone"]),
    email: typeof c["email"] === "string" && c["email"] !== "" ? c["email"] : null,
    name: typeof name === "string" ? name : null,
  };
}
