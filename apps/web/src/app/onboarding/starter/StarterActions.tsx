"use client";

import { useRef, useState } from "react";
import { t } from "@eyeq/i18n";
import { Button, Icon } from "@eyeq/ui/web";
import { v1 } from "@/lib/athlete-api";

/**
 * Board 1e's two actions. Both enrol in the starter (the athlete has accepted it) and
 * mark onboarding done; one opens today's session, the other Home. Each request keeps
 * its idempotency key across retries (rule 6).
 */
export function StarterActions({
  programId,
  startLabel,
}: {
  programId: string | null;
  startLabel: string;
}) {
  const [busy, setBusy] = useState<"start" | "home" | null>(null);
  const [failed, setFailed] = useState(false);
  const keys = useRef({ enroll: crypto.randomUUID(), onboarded: crypto.randomUUID() });

  async function finish(to: "start" | "home") {
    setBusy(to);
    setFailed(false);
    if (programId) {
      const e = await v1("POST", `/programs/${programId}/enroll`, undefined, {
        idempotencyKey: keys.current.enroll,
      });
      if (!e.ok) {
        setBusy(null);
        setFailed(true);
        return;
      }
    }
    const o = await v1(
      "PATCH",
      "/me",
      { onboarded: true },
      { idempotencyKey: keys.current.onboarded },
    );
    if (!o.ok) {
      setBusy(null);
      setFailed(true);
      return;
    }
    // A full navigation, not router.push: the router still holds the redirect to onboarding
    // that /app answered right after sign-in. The first session starts from here (plan
    // phase 5); "Go to Home instead" goes to Today.
    window.location.assign(to === "start" && programId ? "/app/session/today" : "/app");
  }

  return (
    <>
      {failed && (
        <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
          <Icon name="alert" size={16} className="shrink-0" />
          {t("onb.error")}
        </p>
      )}
      {programId && (
        <Button
          variant="cta"
          fullWidth
          icon="play"
          loading={busy === "start"}
          onClick={() => void finish("start")}
        >
          {startLabel}
        </Button>
      )}
      <button
        type="button"
        onClick={() => void finish("home")}
        disabled={busy !== null}
        className="flex min-h-11 items-center justify-center type-body-s font-bold text-primary-text"
      >
        {t("onb.starter.home")}
      </button>
    </>
  );
}
