"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, Icon, OTPInput, TextInput } from "@eyeq/ui/web";
import { FlowHeading, FlowScreen } from "@/components/flow/FlowScreen";
import { safeNext } from "@/lib/safe-next";

/** Where the code went: the body of /api/auth/otp and, with the code, /api/auth/verify. */
type Target = { phone: string } | { email: string };

type Step =
  | { kind: "id" }
  | { kind: "code"; target: Target; sentAt: number }
  | { kind: "password"; login: string };

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
    case "unauthenticated":
      return "auth.error.credentials";
    case "not_found":
      return "auth.error.notPhoneOrEmail";
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

/**
 * One field for every sign-in: an email has an @, a phone is digits (with + spaces and
 * dashes), and anything else is a login name, which only the QA master login answers
 * (server/auth/qa.ts; remove that branch with it before public launch).
 */
function classify(raw: string): Target | { login: string } | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.includes("@")) return { email: v };
  if (/^[+\d\s()-]+$/.test(v)) return { phone: v };
  return { login: v };
}

/** "9840000005" → "+91 98400 00005"; an email or anything else as typed. */
function shown(target: Target): string {
  if ("email" in target) return target.email.trim();
  const d = target.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10
    ? `${t("input.phonePrefix")} ${d.slice(0, 5)} ${d.slice(5)}`
    : target.phone;
}

/** Board 1b: phone or email, then the 6-digit code. Signing in is step 1 of onboarding. */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: "id" });
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<MessageKey | null>(
    params.get("error") ? errorKey(params.get("error") ?? undefined) : null,
  );

  useEffect(() => {
    if (step.kind !== "code") return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [step.kind]);

  async function sendCode(target: Target) {
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/otp", target);
    setBusy(false);
    if (r.ok) {
      setCode("");
      setStep({ kind: "code", target, sentAt: Date.now() });
      setNow(Date.now());
    } else setError(errorKey(r.code));
  }

  function next(e: FormEvent) {
    e.preventDefault();
    const c = classify(id);
    if (!c) return;
    setError(null);
    if ("login" in c) {
      setPassword("");
      setStep({ kind: "password", login: c.login });
    } else void sendCode(c);
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const r = await post("/api/auth/verify", { ...step.target, token: code });
    if (r.ok) {
      router.replace(safeNext(params.get("next")));
      return;
    }
    setBusy(false);
    setError(errorKey(r.code));
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== "password") return;
    setBusy(true);
    setError(null);
    const r = await post("/api/qa/login", { login: step.login, password });
    if (r.ok) {
      router.replace("/qa");
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

  const change = (
    <button
      type="button"
      onClick={() => {
        setError(null);
        setStep({ kind: "id" });
      }}
      className="inline-flex min-h-11 items-center font-extrabold text-primary-text"
    >
      {t("auth.code.change")}
    </button>
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
          <p className="type-body break-words text-text-secondary">
            {t("auth.code.sent", { phone: shown(step.target) })} {change}
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
              onClick={() => void sendCode(step.target)}
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

  if (step.kind === "password") {
    return (
      <FlowScreen
        step={t("auth.step")}
        actions={
          <Button variant="cta" fullWidth type="submit" form="password-form" loading={busy}>
            {t("auth.password.submit")}
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
            {t("auth.title")}
          </h1>
          <p className="type-body break-words text-text-secondary">
            {step.login} {change}
          </p>
        </div>
        {alert}
        <form id="password-form" onSubmit={signInWithPassword}>
          <TextInput
            name="password"
            type="password"
            label={t("auth.password.label")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </form>
      </FlowScreen>
    );
  }

  return (
    <FlowScreen
      back="/"
      step={t("auth.step")}
      actions={
        <Button variant="cta" fullWidth type="submit" form="id-form" loading={busy}>
          {t("auth.phone.send")}
        </Button>
      }
    >
      <FlowHeading title={t("auth.title")} body={t("auth.subtitle")} />
      {alert}
      <form id="id-form" onSubmit={next}>
        <TextInput
          name="username"
          label={t("auth.phone.label")}
          hint={t("auth.phone.hint")}
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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
