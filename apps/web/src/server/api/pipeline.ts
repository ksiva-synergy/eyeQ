import { asAthlete, type PrismaClient, type Tx } from "@eyeq/db";
import { IDEMPOTENT_REPLAY_HEADER } from "@eyeq/api-contract";
import type { z } from "zod";
import type { Session, SessionVerifier } from "../auth/session";
import { log } from "../observability/log";
import { ApiError, toApiError } from "./errors";
import { claim, complete, idempotencyKey, requestHash } from "./idempotency";

/**
 * The /api/v1 request pipeline (plan phase 2, section 7):
 *   verified session -> user id -> rate limits (own short transaction, so a refused
 *   or failed request still counts) -> zod-validated body -> ONE transaction that
 *   begins with set_config('app.user_id', id, true) through asAthlete(), ensures the
 *   profile exists, claims the idempotency key, runs the handler, stores the result
 *   -> one error shape -> one structured log line.
 * The database client must be eyeq_api, so RLS backs up every handler.
 */
export type RateRule = "api_user" | "completions";

export interface Deps {
  db: PrismaClient;
  verifier: SessionVerifier;
  /** Error reporting (Sentry in the app); a no-op in tests. */
  report?: (e: unknown, ctx: Record<string, unknown>) => void;
}

export interface RouteContext<B> {
  tx: Tx;
  session: Session;
  body: B;
  req: Request;
  requestId: string;
}

export interface RouteSpec<S extends z.ZodType | undefined, R> {
  /** "PATCH /me": names the route in logs and scopes idempotency keys. */
  name: string;
  body?: S;
  /** Mutations: require an Idempotency-Key and replay the first result (rule 6). */
  idempotent?: boolean;
  /** Defaults to the per-athlete API limit. */
  rateLimits?: RateRule[];
  status?: number;
  handler: (ctx: RouteContext<S extends z.ZodType ? z.output<S> : undefined>) => Promise<R>;
}

export type Handler = (req: Request) => Promise<Response>;

const NO_STORE = { "cache-control": "no-store" };

async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "validation_failed", "The request is not valid.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

async function enforce(db: PrismaClient, rule: RateRule, subject: string): Promise<void> {
  const rows = await db.$queryRaw<{ r: { allowed: boolean; retry_after: number } }[]>`
    select rate_limit_hit(${rule}, ${subject}) as r`;
  const r = rows[0]?.r;
  if (r && !r.allowed) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", undefined, {
      "retry-after": String(r.retry_after),
    });
  }
}

export function apiRoute<S extends z.ZodType | undefined, R>(
  spec: RouteSpec<S, R>,
  deps: () => Deps,
): Handler {
  return async (req) => {
    const started = performance.now();
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    let userId: string | undefined;
    let status = 500;
    let replayed = false;
    try {
      const d = deps();
      const session = await d.verifier.verify(req);
      if (!session) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
      userId = session.userId;
      for (const rule of spec.rateLimits ?? ["api_user"]) await enforce(d.db, rule, session.userId);
      const body = (spec.body ? await readBody(req, spec.body) : undefined) as S extends z.ZodType
        ? z.output<S>
        : undefined;
      const key = spec.idempotent ? idempotencyKey(req) : null;

      const result = await asAthlete(d.db, session.userId, async (tx) => {
        await tx.$queryRaw`select ensure_my_profile(${session.name})`;
        if (key) {
          const stored = await claim(
            tx,
            session.userId,
            key,
            spec.name,
            requestHash(spec.name, body),
          );
          if (stored) return { ...stored, replayed: true };
        }
        const data = await spec.handler({ tx, session, body, req, requestId });
        const out = { status: spec.status ?? 200, body: data as unknown };
        if (key) await complete(tx, session.userId, key, out);
        return { ...out, replayed: false };
      });

      status = result.status;
      replayed = result.replayed;
      return Response.json(result.body, {
        status: result.status,
        headers: {
          ...NO_STORE,
          "x-request-id": requestId,
          ...(replayed ? { [IDEMPOTENT_REPLAY_HEADER]: "true" } : {}),
        },
      });
    } catch (e) {
      const err = toApiError(e);
      status = err.status;
      if (err.status >= 500) {
        log("error", "request failed", { requestId, route: spec.name, error: String(e) });
        try {
          deps().report?.(e, { requestId, route: spec.name });
        } catch {
          // reporting must never change the response
        }
      }
      return Response.json(err.body(), {
        status: err.status,
        headers: { ...NO_STORE, ...err.headers, "x-request-id": requestId },
      });
    } finally {
      log("info", "request", {
        requestId,
        route: spec.name,
        method: req.method,
        status,
        ms: Math.round(performance.now() - started),
        userId,
        ...(replayed ? { replayed } : {}),
      });
    }
  };
}
