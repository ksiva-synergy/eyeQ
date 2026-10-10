import type { Tx } from "@eyeq/db";
import { IDEMPOTENT_REPLAY_HEADER } from "@eyeq/api-contract";
import type { z } from "zod";
import type { Session } from "../auth/session";
import { log } from "../observability/log";
import { ApiError, toApiError } from "./errors";
import { claim, complete, idempotencyKey, requestHash } from "./idempotency";
import {
  enforce,
  readBody,
  readParams,
  type Deps,
  type Handler,
  type RouteHandlerContext,
} from "./pipeline";

/**
 * The /api/admin pipeline (plan section 7, phase 4): verified session -> an `admins` row
 * (coach or owner), else 403 -> zod body and params -> ONE transaction as eyeq_service
 * with app.user_id set to the admin -> handler. Every mutation records what changed
 * through `audit()`, which writes audit_log in that same transaction, so a change and
 * its audit row commit or roll back together. Mutations are idempotent (rule 6).
 * Deps.db must be eyeq_service.
 */
export type AdminRole = "coach" | "owner";

export interface AuditEntry {
  /** "product.create", "program.publish", "entitlement.grant" … */
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
}

export interface AdminContext<B, P> {
  tx: Tx;
  admin: { userId: string; role: AdminRole };
  session: Session;
  body: B;
  params: P;
  req: Request;
  requestId: string;
  audit: (entry: AuditEntry) => Promise<void>;
}

export interface AdminRouteSpec<
  S extends z.ZodType | undefined,
  R,
  P extends z.ZodType | undefined = undefined,
> {
  name: string;
  body?: S;
  params?: P;
  /** Mutations: Idempotency-Key required, first result replayed, audit expected. */
  mutation?: boolean;
  /** Owner-only actions (game settings, granting admins). Defaults to coach or owner. */
  ownerOnly?: boolean;
  status?: number;
  /** The handler returns CSV text, sent as a download with this file name (exports). */
  csv?: { filename: string };
  handler: (
    ctx: AdminContext<
      S extends z.ZodType ? z.output<S> : undefined,
      P extends z.ZodType ? z.output<P> : Record<string, never>
    >,
  ) => Promise<R>;
}

const NO_STORE = { "cache-control": "no-store" };

export function adminRoute<
  S extends z.ZodType | undefined,
  R,
  P extends z.ZodType | undefined = undefined,
>(spec: AdminRouteSpec<S, R, P>, deps: () => Deps): Handler {
  return async (req: Request, ctx?: RouteHandlerContext) => {
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
      await enforce(d.db, "api_user", session.userId);
      const body = (spec.body ? await readBody(req, spec.body) : undefined) as S extends z.ZodType
        ? z.output<S>
        : undefined;
      const params = (spec.params ? await readParams(ctx, spec.params) : {}) as P extends z.ZodType
        ? z.output<P>
        : Record<string, never>;
      const key = spec.mutation ? idempotencyKey(req) : null;

      const result = await d.db.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.user_id', ${session.userId}, true)`;
        const [row] = await tx.$queryRaw<{ role: AdminRole }[]>`
          select role from admins where user_id = ${session.userId}::uuid`;
        if (!row || (spec.ownerOnly && row.role !== "owner")) {
          throw new ApiError(403, "forbidden", "This needs a coach or owner account.");
        }
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
        const audit = async (e: AuditEntry) => {
          await tx.$executeRaw`
            insert into audit_log (actor_id, actor_role, action, target_type, target_id, before, after)
            values (${session.userId}::uuid, ${row.role}, ${e.action}, ${e.targetType}, ${e.targetId},
                    ${e.before === undefined ? null : JSON.stringify(e.before)}::jsonb,
                    ${e.after === undefined ? null : JSON.stringify(e.after)}::jsonb)`;
        };
        const data = await spec.handler({
          tx,
          admin: { userId: session.userId, role: row.role },
          session,
          body,
          params,
          req,
          requestId,
          audit,
        });
        const out = { status: spec.status ?? 200, body: data as unknown };
        if (key) await complete(tx, session.userId, key, out);
        return { ...out, replayed: false };
      });

      status = result.status;
      replayed = result.replayed;
      if (spec.csv) {
        return new Response(String(result.body), {
          status: result.status,
          headers: {
            ...NO_STORE,
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="${spec.csv.filename}"`,
            "x-request-id": requestId,
          },
        });
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
        log("error", "admin request failed", { requestId, route: spec.name, error: String(e) });
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
        admin: true,
        ...(replayed ? { replayed } : {}),
      });
    }
  };
}
