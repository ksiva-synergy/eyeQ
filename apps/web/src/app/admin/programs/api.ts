import { t } from "@eyeq/i18n";
import { clientId } from "@/lib/client-id";

/** The admin API from the browser: JSON in and out, a fresh Idempotency-Key per mutation. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; details: Record<string, unknown> | null };

export async function api<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "idempotency-key": clientId() } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: json as T };
    const err = (json ?? {}) as {
      message?: string;
      details?: { issues?: { message: string; path?: string }[] } & Record<string, unknown>;
    };
    const issues = err.details?.issues
      ?.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join("; ");
    return {
      ok: false,
      status: res.status,
      message: issues || err.message || t("admin.builder.error"),
      details: err.details ?? null,
    };
  } catch {
    return { ok: false, status: 0, message: t("admin.builder.error"), details: null };
  }
}
