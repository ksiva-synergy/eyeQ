import "server-only";
import { after } from "next/server";
import {
  otpRequestSchema,
  otpVerifySchema,
  tokenRefreshRequestSchema,
  type TokenSession,
} from "@eyeq/api-contract";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError, toApiError } from "../api/errors";
import { serviceDb } from "../db";
import { log } from "../observability/log";
import { capture } from "../observability/posthog";
import { report } from "../observability/sentry";
import { nextJar } from "./next-cookies";
import { clientIp, ensureProfile, requestOtp, verifyOtp } from "./otp";
import { AuthNotConfigured, supabaseFor, supabaseStateless } from "./supabase";

/** Shared shape for the small /api/auth routes: JSON in, JSON out, the one error shape. */
async function run<S extends z.ZodType>(
  name: string,
  req: Request,
  schema: S,
  fn: (body: z.output<S>) => Promise<unknown>,
): Promise<Response> {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  let status = 500;
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(400, "validation_failed", "The request is not valid.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const out = await fn(parsed.data);
    status = 200;
    return Response.json(out ?? { ok: true }, {
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
  } catch (e) {
    const err =
      e instanceof AuthNotConfigured
        ? new ApiError(503, "internal", "Sign-in is not configured.")
        : toApiError(e);
    status = err.status;
    if (err.status >= 500) report(e, { requestId, route: name });
    return Response.json(err.body(), {
      status,
      headers: { ...err.headers, "cache-control": "no-store", "x-request-id": requestId },
    });
  } finally {
    log("info", "request", {
      requestId,
      route: name,
      method: req.method,
      status,
      ms: Math.round(performance.now() - started),
    });
  }
}

export async function postOtp(req: Request): Promise<Response> {
  return run("POST /api/auth/otp", req, otpRequestSchema, async (target) => {
    const supabase = supabaseFor(await nextJar());
    await requestOtp(target, clientIp(req), { supabase, db: serviceDb() });
    return { ok: true };
  });
}

export async function postVerify(req: Request): Promise<Response> {
  return run("POST /api/auth/verify", req, otpVerifySchema, async ({ token, ...target }) => {
    const supabase = supabaseFor(await nextJar());
    const { userId } = await verifyOtp(target, token, { supabase, db: serviceDb() });
    const method = "phone" in target ? "phone" : "email";
    after(() => capture(userId, "signed_in", { method }));
    return { ok: true, userId };
  });
}

export { ensureProfile };

/*
 * The mobile app's sign-in (DECISIONS.md, phase 8): the same code request (/api/auth/otp)
 * and the same verify, limits and phone rules as web, with the session answered as JSON for
 * the app to keep in secure storage and send as a bearer token.
 */

function tokenSession(userId: string, s: SupabaseSession): TokenSession {
  return {
    userId,
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
  };
}

export async function postToken(req: Request): Promise<Response> {
  return run("POST /api/auth/token", req, otpVerifySchema, async ({ token, ...target }) => {
    const { userId, session } = await verifyOtp(target, token, {
      supabase: supabaseStateless(),
      db: serviceDb(),
    });
    if (!session)
      throw new ApiError(400, "otp_invalid", "That code is not right, or it has expired.");
    const method = "phone" in target ? "phone" : "email";
    after(() => capture(userId, "signed_in", { method, client: "mobile" }));
    return tokenSession(userId, session);
  });
}

export async function postTokenRefresh(req: Request): Promise<Response> {
  return run("POST /api/auth/token/refresh", req, tokenRefreshRequestSchema, async (body) => {
    const { data, error } = await supabaseStateless().auth.refreshSession({
      refresh_token: body.refreshToken,
    });
    if (error || !data.session || !data.user) {
      if (error?.status === 429) {
        throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
      }
      throw new ApiError(401, "unauthenticated", "Sign in to continue.");
    }
    return tokenSession(data.user.id, data.session);
  });
}

/** Revokes the bearer token's session (its refresh token). The app forgets it either way. */
export async function postTokenSignOut(req: Request): Promise<Response> {
  return run("POST /api/auth/token/sign-out", req, z.strictObject({}), async () => {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
    const { error } = await supabaseStateless().auth.admin.signOut(bearer, "local");
    if (error) log("warn", "token sign-out refused by supabase", { status: error.status });
    return { ok: true };
  });
}
