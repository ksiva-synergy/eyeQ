"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ratingAreas } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, Card, Icon, RatingInput } from "@eyeq/ui/web";
import { FlowHeading, FlowScreen } from "@/components/flow/FlowScreen";
import { v1 } from "@/lib/athlete-api";

type Area = (typeof ratingAreas)[number];

/** Board 1d: the three areas rated 1 to 5, saved together as the baseline. */
export function BaselineForm({ rerateDay }: { rerateDay: number }) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<Area, number | null>>({
    focus: null,
    reaction: null,
    tracking: null,
  });
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ key: string; body: string } | null>(null);

  async function save() {
    if (ratingAreas.some((a) => ratings[a] === null)) {
      setError("onb.baseline.missing");
      return;
    }
    const body = { kind: "baseline", ratings };
    const json = JSON.stringify(body);
    if (attempt.current?.body !== json) attempt.current = { key: crypto.randomUUID(), body: json };
    setBusy(true);
    setError(null);
    const r = await v1("POST", "/me/self-ratings", body, { idempotencyKey: attempt.current.key });
    if (r.ok) {
      router.push("/onboarding/starter");
      return;
    }
    setBusy(false);
    setError("onb.error");
  }

  return (
    <FlowScreen
      back="/onboarding/profile"
      step={t("onb.step", { n: 3 })}
      actions={
        <Button variant="cta" fullWidth onClick={() => void save()} loading={busy}>
          {t("onb.baseline.save")}
        </Button>
      }
    >
      <FlowHeading
        eyebrow={t("app.method")}
        title={t("onb.baseline.title")}
        body={t("onb.baseline.body", { days: rerateDay })}
      />
      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-m border border-cta-text px-3 py-2 type-body-s"
        >
          <Icon name="alert" size={16} className="shrink-0 text-cta-text" />
          {t(error)}
        </p>
      )}
      {ratingAreas.map((a) => (
        <Card key={a} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-extrabold">{t(`area.${a}`)}</span>
              <span className="type-caption text-text-secondary">{t(`area.${a}Hint`)}</span>
            </div>
            <span className="font-display text-[1.875rem] leading-none font-bold text-primary-text tabular-nums">
              {ratings[a] ?? "–"}
              <span className="text-sm text-text-muted">{t("onb.baseline.outOf")}</span>
            </span>
          </div>
          <RatingInput
            label={t("onb.baseline.rating", { area: t(`area.${a}`) })}
            value={ratings[a]}
            onChange={(v) => setRatings((r) => ({ ...r, [a]: v }))}
          />
        </Card>
      ))}
      <p className="flex gap-2.5 rounded-m border border-border bg-surface-1 px-3.5 py-3 type-caption text-text-secondary">
        <Icon name="alert" size={18} className="shrink-0 text-text-muted" />
        {t("onb.baseline.disclaimer")}
      </p>
    </FlowScreen>
  );
}
