"use client";

import { useId, useState, type FormEvent } from "react";
import type { AdminChallenge, ChallengeGoal } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, ErrorCard, TextInput } from "@eyeq/ui/web";

export type Option = { id: string; name: string };
export type ChallengeFormValues = {
  title: string;
  description: string | null;
  goal: ChallengeGoal;
  rewardXp: number;
  rewardCoins: number;
  badgeId: string | null;
  startDate?: string;
  endDate?: string;
};

const GOALS = ["sessions_total", "module_sessions", "score_gte"] as const;

/** The IST calendar day of an instant ("2030-03-04"). */
export function istDay(iso: string, plusMs = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.parse(iso) + plusMs),
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-label text-text-muted">
        {label}
      </label>
      <select
        id={id}
        name={name}
        {...(onChange
          ? { value, onChange: (e) => onChange(e.target.value) }
          : { defaultValue: value })}
        className="eyeq-hit-field bg-surface-2 px-3 text-sm font-bold"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * One form for a weekly challenge (sessions only; its window is its week) and a program
 * challenge (any of the three goals, between two IST dates). Numbers and choices only; the
 * API validates again and audits the change.
 */
export function ChallengeForm({
  kind,
  initial,
  badges,
  modules = [],
  drills = [],
  busy,
  error,
  label,
  onSubmit,
  onCancel,
}: {
  kind: "weekly" | "program";
  initial?: AdminChallenge;
  badges: Option[];
  modules?: Option[];
  drills?: Option[];
  busy: boolean;
  error: string | null;
  label: string;
  onSubmit: (v: ChallengeFormValues) => void;
  onCancel?: () => void;
}) {
  const [metric, setMetric] = useState<ChallengeGoal["metric"]>(
    initial?.goal.metric ?? (kind === "weekly" ? "sessions_total" : "module_sessions"),
  );
  const g = initial?.goal;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (n: string) => Number(f.get(n) ?? 0);
    const str = (n: string) => String(f.get(n) ?? "").trim();
    const goal: ChallengeGoal =
      metric === "module_sessions"
        ? { metric, moduleId: str("moduleId") }
        : metric === "score_gte"
          ? { metric, drillId: str("drillId"), gte: num("gte") }
          : { metric: "sessions_total", gte: Math.round(num("gte")) };
    onSubmit({
      title: str("title"),
      description: str("description") || null,
      goal,
      rewardXp: Math.round(num("rewardXp")),
      rewardCoins: Math.round(num("rewardCoins")),
      badgeId: str("badgeId") || null,
      ...(kind === "program" ? { startDate: str("startDate"), endDate: str("endDate") } : {}),
    });
  }

  return (
    <form
      onSubmit={submit}
      aria-label={label}
      className="flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-5"
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
        <TextInput
          dense
          name="title"
          required
          maxLength={80}
          label={t("admin.challenges.title")}
          defaultValue={initial?.title ?? ""}
        />
        {kind === "program" && (
          <Select
            label={t("admin.challenges.goal")}
            name="metric"
            value={metric}
            onChange={(v) => setMetric(v as ChallengeGoal["metric"])}
            options={GOALS.map((m) => ({
              value: m,
              label: t(`admin.challenges.goal.${m}` as MessageKey),
            }))}
          />
        )}
        {metric === "sessions_total" && (
          <TextInput
            dense
            name="gte"
            type="number"
            min={1}
            max={100}
            required
            label={t("admin.challenges.targetSessions")}
            defaultValue={g?.metric === "sessions_total" ? g.gte : 5}
          />
        )}
        {metric === "module_sessions" && (
          <Select
            label={t("admin.challenges.module")}
            name="moduleId"
            value={g?.metric === "module_sessions" ? g.moduleId : (modules[0]?.id ?? "")}
            options={modules.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}
        {metric === "score_gte" && (
          <>
            <Select
              label={t("admin.challenges.drill")}
              name="drillId"
              value={g?.metric === "score_gte" ? g.drillId : (drills[0]?.id ?? "")}
              options={drills.map((d) => ({ value: d.id, label: d.name }))}
            />
            <TextInput
              dense
              name="gte"
              type="number"
              min={0}
              required
              label={t("admin.challenges.score")}
              defaultValue={g?.metric === "score_gte" ? g.gte : 25}
            />
          </>
        )}
        <TextInput
          dense
          name="rewardXp"
          type="number"
          min={0}
          max={1000}
          required
          label={t("admin.challenges.rewardXp")}
          defaultValue={initial?.rewardXp ?? 150}
        />
        <TextInput
          dense
          name="rewardCoins"
          type="number"
          min={0}
          max={1000}
          required
          label={t("admin.challenges.rewardCoins")}
          defaultValue={initial?.rewardCoins ?? 40}
        />
        <Select
          label={t("admin.challenges.badge")}
          name="badgeId"
          value={initial?.badgeId ?? ""}
          options={[
            { value: "", label: t("admin.challenges.noBadge") },
            ...badges.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        {kind === "program" && (
          <>
            <TextInput
              dense
              name="startDate"
              type="date"
              required
              disabled={!!initial}
              label={t("admin.challenges.start")}
              defaultValue={initial ? istDay(initial.windowStart) : ""}
            />
            <TextInput
              dense
              name="endDate"
              type="date"
              required
              label={t("admin.challenges.end")}
              defaultValue={initial ? istDay(initial.windowEnd, -1) : ""}
            />
          </>
        )}
      </div>
      <TextInput
        dense
        name="description"
        maxLength={240}
        label={t("admin.challenges.description")}
        defaultValue={initial?.description ?? ""}
      />
      {error && <ErrorCard message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="m" type="submit" loading={busy}>
          {t("admin.challenges.save")}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="m" onClick={onCancel}>
            {t("admin.challenges.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
