"use client";

import { useState, type FormEvent } from "react";
import { t } from "@eyeq/i18n";
import { Button, Chip, Icon, OTPInput, PhoneInput, TextInput } from "@eyeq/ui/web";
import { useCheckout } from "@/components/purchase/checkout";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Step = { kind: "ready" } | { kind: "phone" } | { kind: "code"; phone: string };

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
 * Board 15's price card checkout (D16): a visitor who is not signed in confirms their
 * phone with a one-time code inline (the same Supabase Auth flow as /sign-in, which sets
 * the session cookie), and only then is the order created, so the purchase belongs to an
 * account. Signed in, it goes straight to Checkout.
 */
export function LandingCheckout({
  productId,
  label,
  signedIn,
}: {
  productId: string;
  label: string;
  signedIn: boolean;
}) {
  const [step, setStep] = useState<Step>({ kind: "ready" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(signedIn);
  const { state, start, busy: paying } = useCheckout();

  function pay() {
    const e = email.trim();
    if (e && !EMAIL.test(e)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    void start({ kind: "order", productId, surface: "landing", ...(e ? { email: e } : {}) });
  }

  function onBuy() {
    if (verified) pay();
    else setStep({ kind: "phone" });
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);
    const r = await post("/api/auth/otp", { phone });
    setBusy(false);
    if (r.ok) setStep({ kind: "code", phone });
    else setAuthError(t("landing.verify.sendFailed"));
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    setBusy(true);
    setAuthError(null);
    const r = await post("/api/auth/verify", { phone: step.phone, token: code });
    setBusy(false);
    if (!r.ok) {
      setAuthError(t("landing.verify.failed"));
      return;
    }
    setVerified(true);
    setStep({ kind: "ready" });
    pay();
  }

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label={t("pay.email")}
        hint={t("pay.emailHint")}
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        {...(emailError ? { error: t("pay.emailInvalid") } : {})}
      />

      {step.kind === "phone" && (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <p className="type-body-s text-text-secondary">{t("landing.verify.body")}</p>
          <PhoneInput
            label={t("landing.verify.title")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            {...(authError ? { error: authError } : {})}
          />
          <Button type="submit" variant="cta" loading={busy} fullWidth>
            {t("landing.verify.send")}
          </Button>
        </form>
      )}

      {step.kind === "code" && (
        <form onSubmit={confirm} className="flex flex-col gap-3">
          <OTPInput
            label={t("landing.verify.code")}
            value={code}
            onChange={setCode}
            {...(authError ? { error: authError } : {})}
          />
          <Button type="submit" variant="cta" loading={busy || paying} fullWidth>
            {t("landing.verify.confirm")}
          </Button>
          <Button variant="text" size="m" onClick={() => setStep({ kind: "phone" })}>
            {t("landing.verify.change")}
          </Button>
        </form>
      )}

      {step.kind === "ready" && (
        <Button variant="cta" fullWidth loading={paying} onClick={onBuy}>
          {label}
        </Button>
      )}

      {state.phase === "error" && (
        <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
          <Icon name="alert" size={16} />
          {state.message}
        </p>
      )}
      {(state.phase === "verifying" || state.phase === "pending") && (
        <p role="status" className="type-body-s text-text-secondary">
          {state.phase === "verifying" ? t("pay.verifying") : t("pay.pending")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2.5 text-[0.6875rem] font-bold text-text-muted">
        <span>{t("pay.methods")}</span>
        <Chip compact icon={null}>
          {t("pay.method.upi")}
        </Chip>
        <Chip compact icon={null}>
          {t("pay.method.card")}
        </Chip>
        <Chip compact icon={null}>
          {t("pay.method.netbanking")}
        </Chip>
      </div>
    </div>
  );
}
