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

export interface RouteContext<B, P = Record<string, never>> {
  tx: Tx;
  session: Session;
  body: B;
  /** Dynamic route segments, validated by the spec's params schema. */
  params: P;
  req: Request;
  requestId: string;
}

export interface RouteSpec<
  S extends z.ZodType | undefined,
  R,
  P extends z.ZodType | undefined = undefined,
> {
  /** "PATCH /me": names the route in logs and scopes idempotency keys. */
  name: string;
  body?: S;
  /** Dynamic segments ("/programs/[slug]"); a mismatch is a 400 validation_failed. */
  params?: P;
  /** Mutations: require an Idempotency-Key and replay the first result (rule 6). */
  idempotent?: boolean;
  /** Defaults to the per-athlete API limit. */
  rateLimits?: RateRule[];
  status?: number;
  /**
   * Runs once the transaction has committed, and never for a replayed idempotent result:
   * the place for side effects such as analytics events, which must not report work that
   * rolled back. Errors here are logged and never change the response.
   */
  afterCommit?: (data: R, session: Session) => void | Promise<void>;
  handler: (
    ctx: RouteContext<
      S extends z.ZodType ? z.output<S> : undefined,
      P extends z.ZodType ? z.output<P> : Record<string, never>
    >,
  ) => Promise<R>;
}

/** Next.js passes dynamic segments as a promise (route handler `context.params`). */
export type RouteHandlerContext = { params?: Promise<Record<string, string | string[]>> };
export type Handler = (req: Request, ctx?: RouteHandlerContext) => Promise<Response>;

const NO_STORE = { "cache-control": "no-store" };

export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}

function invalid(issues: z.core.$ZodIssue[]): ApiError {
  return new ApiError(400, "validation_failed", "The request is not valid.", {
    issues: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

export async function readParams<P extends z.ZodType>(
  ctx: RouteHandlerContext | undefined,
  schema: P,
): Promise<z.output<P>> {
  const parsed = schema.safeParse((await ctx?.params) ?? {});
  if (!parsed.success) throw invalid(parsed.error.issues);
  return parsed.data;
}

export async function enforce(db: PrismaClient, rule: RateRule, subject: string): Promise<void> {
  const rows = await db.$queryRaw<{ r: { allowed: boolean; retry_after: number } }[]>`
    select rate_limit_hit(${rule}, ${subject}) as r`;
  const r = rows[0]?.r;
  if (r && !r.allowed) {
    throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.", undefined, {
      "retry-after": String(r.retry_after),
    });
  }
}

export function apiRoute<
  S extends z.ZodType | undefined,
  R,
  P extends z.ZodType | undefined = undefined,
>(spec: RouteSpec<S, R, P>, deps: () => Deps): Handler {
  return async (req, ctx) => {
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
      const params = (spec.params ? await readParams(ctx, spec.params) : {}) as P extends z.ZodType
        ? z.output<P>
        : Record<string, never>;
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
        const data = await spec.handler({ tx, session, body, params, req, requestId });
        const out = { status: spec.status ?? 200, body: data as unknown };
        if (key) await complete(tx, session.userId, key, out);
        return { ...out, replayed: false };
      });

      status = result.status;
      replayed = result.replayed;
      if (spec.afterCommit && !result.replayed) {
        try {
          await spec.afterCommit(result.body as R, session);
        } catch (e) {
          log("warn", "afterCommit failed", { requestId, route: spec.name, error: String(e) });
        }
      }
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
