"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, Icon, OTPInput, PhoneInput } from "@eyeq/ui/web";
import { FlowHeading, FlowScreen } from "@/components/flow/FlowScreen";
import { safeNext } from "@/lib/safe-next";

type Step = { kind: "phone" } | { kind: "code"; phone: string; sentAt: number };

/** Seconds before "Resend code" works; Supabase Auth also keeps a minimum gap per phone. */
const RESEND_AFTER_S = 30;

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
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json().catch(() => ({}))) as { code?: string };
    return { ok: false, code: err.code };
  } catch {
    return { ok: false };
  }
}

/** "9840000005" → "+91 98400 00005"; anything else as typed. */
function shown(phone: string): string {
  const d = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10 ? `${t("input.phonePrefix")} ${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

/** Board 1b: phone, then the 6-digit code. Signing in is step 1 of onboarding. */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<MessageKey | null>(
    params.get("error") ? errorKey(params.get("error") ?? undefined) : null,
  );

  useEffect(() => {
    if (step.kind !== "code") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step.kind]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/otp", { phone });
    setBusy(false);
    if (r.ok) {
      setCode("");
      setStep({ kind: "code", phone, sentAt: Date.now() });
      setNow(Date.now());
    } else setError(errorKey(r.code));
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/verify", { phone: step.phone, token: code });
    if (r.ok) {
      router.replace(safeNext(params.get("next")));
      return;
    }
    setBusy(false);
    setError(errorKey(r.code));
  }

  const alert = error && (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-m border border-cta-text px-3 py-2 type-body-s"
    >
      <Icon name="alert" size={16} className="shrink-0 text-cta-text" />
      {t(error)}
    </p>
  );

  if (step.kind === "code") {
    const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - step.sentAt) / 1000));
    return (
      <FlowScreen
        step={t("auth.step")}
        actions={
          <Button variant="cta" fullWidth type="submit" form="code-form" loading={busy}>
            {t("auth.code.verify")}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
            {t("auth.code.title")}
          </h1>
          <p className="type-body text-text-secondary">
            {t("auth.code.sent", { phone: shown(step.phone) })}{" "}
            <button
              type="button"
              onClick={() => setStep({ kind: "phone" })}
              className="inline-flex min-h-11 items-center font-extrabold text-primary-text"
            >
              {t("auth.code.change")}
            </button>
          </p>
        </div>
        {alert}
        <form id="code-form" onSubmit={verify}>
          <OTPInput label={t("auth.code.label")} value={code} onChange={setCode} />
        </form>
        <p className="flex items-center justify-center gap-1 type-body-s text-text-muted">
          {t("auth.code.didntGet")}
          {wait > 0 ? (
            <span className="tabular-nums">
              {t("auth.code.resendIn", { s: `0:${String(wait).padStart(2, "0")}` })}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy}
              className="inline-flex min-h-11 items-center font-extrabold text-primary-text"
            >
              {t("auth.code.resend")}
            </button>
          )}
        </p>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      back="/"
      step={t("auth.step")}
      actions={
        <Button variant="cta" fullWidth type="submit" form="phone-form" loading={busy}>
          {t("auth.phone.send")}
        </Button>
      }
    >
      <FlowHeading title={t("auth.title")} body={t("auth.subtitle")} />
      {alert}
      <form id="phone-form" onSubmit={sendCode}>
        <PhoneInput
          name="phone"
          label={t("auth.phone.label")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel-national"
          required
        />
      </form>
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="type-label text-text-muted">{t("auth.or")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="ghost" href="/auth/google" fullWidth>
        {t("auth.google")}
      </Button>
      <p className="flex gap-2.5 rounded-m border border-border bg-surface-1 px-3.5 py-3 type-caption text-text-secondary">
        <Icon name="alert" size={18} className="shrink-0 text-text-muted" />
        {t("auth.minor")}
      </p>
    </FlowScreen>
  );
}
