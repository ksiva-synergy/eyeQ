import "server-only";
import { otpRequestSchema, otpVerifySchema } from "@eyeq/api-contract";
import type { z } from "zod";
import { ApiError, toApiError } from "../api/errors";
import { serviceDb } from "../db";
import { log } from "../observability/log";
import { report } from "../observability/sentry";
import { nextJar } from "./next-cookies";
import { clientIp, ensureProfile, requestOtp, verifyOtp } from "./otp";
import { AuthNotConfigured, supabaseFor } from "./supabase";

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
  return run("POST /api/auth/otp", req, otpRequestSchema, async ({ phone }) => {
    const supabase = supabaseFor(await nextJar());
    await requestOtp(phone, clientIp(req), { supabase, db: serviceDb() });
    return { ok: true };
  });
}

export async function postVerify(req: Request): Promise<Response> {
  return run("POST /api/auth/verify", req, otpVerifySchema, async ({ phone, token }) => {
    const supabase = supabaseFor(await nextJar());
    const { userId } = await verifyOtp(phone, token, { supabase, db: serviceDb() });
    return { ok: true, userId };
  });
}

export { ensureProfile };
