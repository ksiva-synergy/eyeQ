import type { z } from "zod";
import type { ErrorCode } from "./errors.ts";

/**
 * A typed fetch client for /api/v1 and the mobile sign-in routes (/api/auth/*), for callers
 * that hold a bearer token: the Expo app (phase 8). The web app's browser code uses
 * apps/web's v1(), which sends the cookie instead; both answer the same ApiResult.
 *
 * Responses are checked against the contract's schema, so an app build that has drifted
 * from the server sees `bad_response` instead of rendering a wrong shape.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: ErrorCode | "network" | "bad_response";
      details: Record<string, unknown> | null;
    };

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiClientOptions {
  /** Origin of the app server, e.g. https://eyeq-nu.vercel.app (no trailing slash needed). */
  baseUrl: string;
  /** The current access token, refreshed by the caller when near expiry; null when signed out. */
  accessToken?: () => Promise<string | null>;
  /**
   * Called once when a request with a token is answered 401: refresh, and answer whether
   * the request should be sent again with the new token.
   */
  onUnauthorized?: () => Promise<boolean>;
  /** A new Idempotency-Key for a mutation that was given none (rule 6). */
  newKey: () => string;
  fetch?: typeof fetch;
  /** Extra headers on every request (an app version, a request id). */
  headers?: () => Record<string, string>;
}

export interface RequestOptions {
  /** Pass the same key when retrying the same action, so the server replays it. */
  idempotencyKey?: string;
  /** Send without the bearer token (the sign-in routes). */
  anonymous?: boolean;
}

export interface ApiClient {
  request<S extends z.ZodType>(
    method: Method,
    path: string,
    schema: S,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<ApiResult<z.output<S>>>;
  get<S extends z.ZodType>(path: string, schema: S): Promise<ApiResult<z.output<S>>>;
  post<S extends z.ZodType>(
    path: string,
    schema: S,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<ApiResult<z.output<S>>>;
  patch<S extends z.ZodType>(
    path: string,
    schema: S,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<ApiResult<z.output<S>>>;
}

/** Whether trying the same request again could succeed (offline, a timeout, a 5xx, 429). */
export function retryable(r: ApiResult<unknown>): boolean {
  return !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500);
}

export function createApiClient(o: ApiClientOptions): ApiClient {
  const base = o.baseUrl.replace(/\/$/, "");
  const doFetch = o.fetch ?? fetch;

  async function send(
    method: Method,
    path: string,
    body: unknown,
    key: string | undefined,
    token: string | null,
  ): Promise<Response> {
    return doFetch(`${base}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(o.headers?.() ?? {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(key ? { "idempotency-key": key } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function request<S extends z.ZodType>(
    method: Method,
    path: string,
    schema: S,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<ApiResult<z.output<S>>> {
    // /api/v1 mutations carry an Idempotency-Key; the sign-in routes take none.
    const key =
      method !== "GET" && path.startsWith("/api/v1/")
        ? (opts.idempotencyKey ?? o.newKey())
        : undefined;
    try {
      let token = opts.anonymous ? null : ((await o.accessToken?.()) ?? null);
      let res = await send(method, path, body, key, token);
      if (res.status === 401 && token && o.onUnauthorized && (await o.onUnauthorized())) {
        token = (await o.accessToken?.()) ?? null;
        res = await send(method, path, body, key, token);
      }
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const err = (json ?? {}) as { code?: ErrorCode; details?: Record<string, unknown> };
        return {
          ok: false,
          status: res.status,
          code: err.code ?? "internal",
          details: err.details ?? null,
        };
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        return {
          ok: false,
          status: res.status,
          code: "bad_response",
          details: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
        };
      }
      return { ok: true, data: parsed.data };
    } catch {
      return { ok: false, status: 0, code: "network", details: null };
    }
  }

  return {
    request,
    get: (path, schema) => request("GET", path, schema),
    post: (path, schema, body, opts) => request("POST", path, schema, body ?? {}, opts),
    patch: (path, schema, body, opts) => request("PATCH", path, schema, body ?? {}, opts),
  };
}
