import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, toApiError } from "../api/errors";
import { serviceDb } from "../db";
import { env } from "../env";
import { log } from "../observability/log";
import { camelize } from "../services/content";
import { clientIp } from "./otp";
import {
  QA_COOKIE,
  QA_TTL_S,
  qaCredentialsMatch,
  qaGrantFrom,
  qaTokenFrom,
  signQa,
  type QaConfig,
  type QaGrant,
} from "./qa";

/**
 * /api/qa: the QA master login (server/auth/qa.ts). Every route answers 404 while the
 * login is off, so production does not advertise it. Web keeps the grant in a cookie;
 * mobile sends the returned token as `Authorization: Bearer qa1.…`.
 */
const loginSchema = z.strictObject({ login: z.string().max(200), password: z.string().max(200) });
const switchSchema = z.strictObject({ userId: z.uuid() });

export interface QaAthlete {
  id: string;
  displayName: string;
  initials: string;
  phoneMasked: string | null;
  level: number;
  totalXp: number;
  plan: string;
}

async function handle(
  name: string,
  req: Request,
  fn: (cfg: QaConfig) => Promise<unknown>,
): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    const cfg = env.qaMaster();
    if (!cfg) throw new ApiError(404, "not_found", "Not found.");
    return Response.json((await fn(cfg)) ?? { ok: true }, { headers });
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) log("error", "qa route failed", { route: name, error: String(e) });
    return Response.json(err.body(), {
      status: err.status,
      headers: { ...headers, ...err.headers },
    });
  }
}

async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, "validation_failed", "The request is not valid.");
  return parsed.data;
}

function requireGrant(req: Request): QaGrant {
  const grant = qaGrantFrom(qaTokenFrom(req));
  if (!grant) throw new ApiError(401, "unauthenticated", "Sign in to QA first.");
  return grant;
}

async function setCookie(token: string | null) {
  const jar = await cookies();
  if (token === null) jar.delete(QA_COOKIE);
  else
    jar.set(QA_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: QA_TTL_S,
    });
}

/** POST /api/qa/login {login, password} → {token}; counted against the per-IP OTP limit. */
export const postQaLogin = (req: Request) =>
  handle("POST /api/qa/login", req, async (cfg) => {
    const { login, password } = await body(req, loginSchema);
    const rows = await serviceDb().$queryRaw<{ r: { allowed: boolean; retry_after: number } }[]>`
      select rate_limit_hit('otp_ip', ${`qa:${clientIp(req) ?? "unknown"}`}) as r`;
    if (rows[0]?.r && !rows[0].r.allowed)
      throw new ApiError(429, "rate_limited", "Too many attempts. Try again later.");
    if (!qaCredentialsMatch(cfg, login, password)) {
      log("warn", "qa login refused", {});
      throw new ApiError(401, "unauthenticated", "That login is not right.");
    }
    const token = signQa(cfg, null);
    await setCookie(token);
    log("info", "qa login", {});
    return { ok: true, token };
  });

/** GET /api/qa/athletes?search= → up to 100 athletes, most recently active first. */
export const getQaAthletes = (req: Request) =>
  handle("GET /api/qa/athletes", req, async () => {
    const grant = requireGrant(req);
    return {
      as: grant.as,
      athletes: await listQaAthletes(new URL(req.url).searchParams.get("search")),
    };
  });

/** POST /api/qa/switch {userId} → {token} for that athlete. */
export const postQaSwitch = (req: Request) =>
  handle("POST /api/qa/switch", req, async (cfg) => {
    requireGrant(req);
    const { userId } = await body(req, switchSchema);
    const found = await serviceDb().profiles.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!found) throw new ApiError(404, "not_found", "No athlete with that id.");
    const token = signQa(cfg, userId);
    await setCookie(token);
    log("info", "qa switch", { userId });
    return { ok: true, token };
  });

/** POST /api/qa/end: leaves QA on this browser. */
export const postQaEnd = (req: Request) =>
  handle("POST /api/qa/end", req, async () => {
    await setCookie(null);
    return { ok: true };
  });

/** Rows from admin_athletes_for (phones masked, rule 11), trimmed to what /qa shows. */
export async function listQaAthletes(search: string | null): Promise<QaAthlete[]> {
  const [row] = await serviceDb().$queryRaw<{ v: unknown }[]>`
    select admin_athletes_for(${search?.trim() || null}, null, 100, 0) as v`;
  const { athletes = [] } = camelize(row?.v ?? {}) as { athletes?: QaAthlete[] };
  return athletes.map(({ id, displayName, initials, phoneMasked, level, totalXp, plan }) => ({
    id,
    displayName,
    initials,
    phoneMasked,
    level,
    totalXp,
    plan,
  }));
}

export async function qaAthleteName(userId: string): Promise<string | null> {
  const p = await serviceDb().profiles.findUnique({
    where: { id: userId },
    select: { display_name: true },
  });
  return p?.display_name ?? null;
}
