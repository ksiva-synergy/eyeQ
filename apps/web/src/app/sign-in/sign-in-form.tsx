"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t, type MessageKey } from "@eyeq/i18n";

type Step = { kind: "phone" } | { kind: "code"; phone: string };

function errorKey(code: string | undefined): MessageKey {
  switch (code) {
    case "rate_limited":
      return "auth.error.rate_limited";
    case "otp_invalid":
      return "auth.error.otp_invalid";
    case "validation_failed":
      return "auth.error.validation_failed";
    case "google":
      return "auth.error.google";
    case "unavailable":
      return "auth.error.unavailable";
    default:
      return "auth.error.generic";
  }
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; code?: string }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const err = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: false, code: err.code };
}

const field =
  "min-h-11 w-full rounded-lg border border-neutral-400 bg-transparent px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-violet-500";
const primary =
  "min-h-11 w-full rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-offset-2";
const secondary =
  "flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-400 px-4 font-semibold focus-visible:ring-2";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(
    params.get("error") ? errorKey(params.get("error") ?? undefined) : null,
  );

  async function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get("phone") ?? "");
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/otp", { phone });
    setBusy(false);
    if (r.ok) setStep({ kind: "code", phone });
    else setError(errorKey(r.code));
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== "code") return;
    const token = String(new FormData(e.currentTarget).get("token") ?? "");
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/verify", { phone: step.phone, token });
    setBusy(false);
    if (r.ok) router.replace("/app");
    else setError(errorKey(r.code));
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="rounded-lg border border-red-700 px-3 py-2 text-sm">
          <span aria-hidden="true">⚠ </span>
          {t(error)}
        </p>
      )}

      {step.kind === "phone" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="phone" className="font-semibold">
            {t("auth.phone.label")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            aria-describedby="phone-hint"
            className={field}
          />
          <p id="phone-hint" className="text-sm text-neutral-500">
            {t("auth.phone.hint")}
          </p>
          <button type="submit" disabled={busy} className={primary}>
            {t("auth.phone.send")}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm">
            {t("auth.code.sentTo")} <strong>{step.phone}</strong>
          </p>
          <label htmlFor="token" className="font-semibold">
            {t("auth.code.label")}
          </label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className={field}
          />
          <button type="submit" disabled={busy} className={primary}>
            {t("auth.code.verify")}
          </button>
          <button type="button" onClick={() => setStep({ kind: "phone" })} className={secondary}>
            {t("auth.code.change")}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-neutral-500">{t("auth.or")}</p>
      <a href="/auth/google" className={secondary}>
        {t("auth.google")}
      </a>
    </div>
  );
}
