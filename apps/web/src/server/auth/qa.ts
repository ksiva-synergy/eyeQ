import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parseCookieHeader } from "@supabase/ssr";
import { env } from "../env";
import type { Session } from "./session";
import type { CookieJar } from "./supabase";

/**
 * The QA master login (DECISIONS.md, 2026-10-11): QA_MASTER_LOGIN and QA_MASTER_PASSWORD
 * open /qa, which switches into any athlete on web (a cookie) or mobile (a bearer token).
 * The grant is an HMAC-signed token keyed by those two values, so changing either revokes
 * every grant. Off in production (env.qaMaster). Remove before public launch.
 */
export const QA_COOKIE = "eyeq_qa";
export const QA_TTL_S = 12 * 60 * 60;
const PREFIX = "qa1";

export interface QaConfig {
  login: string;
  password: string;
}

/** `as` is the athlete being viewed; null means signed in to /qa but not switched yet. */
export interface QaGrant {
  as: string | null;
  exp: number;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const keyFor = (cfg: QaConfig) =>
  createHash("sha256").update(`eyeq-qa\0${cfg.login}\0${cfg.password}`).digest();
const mac = (cfg: QaConfig, body: string) =>
  createHmac("sha256", keyFor(cfg)).update(body).digest();
const digest = (s: string) => createHash("sha256").update(s).digest();

export function qaCredentialsMatch(cfg: QaConfig, login: string, password: string): boolean {
  // Both compared every time, as fixed-length digests, so timing says nothing.
  const a = timingSafeEqual(digest(login), digest(cfg.login));
  const b = timingSafeEqual(digest(password), digest(cfg.password));
  return a && b;
}

export function signQa(cfg: QaConfig, as: string | null, now = Date.now()): string {
  const grant: QaGrant = { as, exp: Math.floor(now / 1000) + QA_TTL_S };
  const body = `${PREFIX}.${b64(JSON.stringify(grant))}`;
  return `${body}.${b64(mac(cfg, body))}`;
}

export function readQa(cfg: QaConfig, token: string, now = Date.now()): QaGrant | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const given = Buffer.from(parts[2]!, "base64url");
  const want = mac(cfg, body);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const g = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as QaGrant;
    if (typeof g.exp !== "number" || g.exp * 1000 <= now) return null;
    return { as: typeof g.as === "string" ? g.as : null, exp: g.exp };
  } catch {
    return null;
  }
}

/** A bearer token starting qa1. (mobile), else the cookie (web). */
export function qaTokenFrom(req: Request): string | null {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(qa1\..+)$/i)?.[1];
  if (bearer) return bearer;
  const c = parseCookieHeader(req.headers.get("cookie") ?? "").find((c) => c.name === QA_COOKIE);
  return c?.value ?? null;
}

export function qaGrantFrom(token: string | null | undefined): QaGrant | null {
  const cfg = env.qaMaster();
  return cfg && token ? readQa(cfg, token) : null;
}

export function qaGrantFromJar(jar: CookieJar): QaGrant | null {
  return qaGrantFrom(jar.getAll().find((c) => c.name === QA_COOKIE)?.value);
}

/** The athlete a grant switched into, as a Session; contact details are not carried. */
export function qaSession(grant: QaGrant | null): Session | null {
  return grant?.as ? { userId: grant.as, phone: null, email: null, name: null } : null;
}
