"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { playingLevels, sessionMinutes, type MeResponse } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, Icon, Pill, SegmentedControl, TextInput } from "@eyeq/ui/web";
import { FlowHeading, FlowScreen } from "@/components/flow/FlowScreen";
import { v1 } from "@/lib/athlete-api";
import { GOALS, SPORTS, parseDob } from "../options";
import { clientId } from "@/lib/client-id";

type Initial = {
  displayName: string;
  sport: string | null;
  playingLevel: MeResponse["playingLevel"];
  goal: string | null;
  sessionMinutes: number;
  hasDob: boolean;
};

/**
 * Board 1c, plus the name field the board leaves out (plan phase 5: the PRD collects a
 * name and boards need a display name; avatars are initials, D22).
 */
export function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.displayName);
  const [sport, setSport] = useState<string | null>(initial.sport);
  const [level, setLevel] = useState<string | null>(initial.playingLevel);
  const [dob, setDob] = useState("");
  const [goal, setGoal] = useState<string | null>(initial.goal);
  const [minutes, setMinutes] = useState(String(initial.sessionMinutes));
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  // One idempotency key per distinct submission, reused if the same one is retried.
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const dobIso = dob ? parseDob(dob) : null;
  const dobError = dob !== "" && !dobIso;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sport || !level || (!initial.hasDob && !dobIso)) {
      setError(dobError ? "onb.profile.dobInvalid" : "onb.profile.missing");
      return;
    }
    const body = {
      displayName: name.trim(),
      sport,
      playingLevel: level,
      ...(dobIso ? { dob: dobIso } : {}),
      goal,
      sessionMinutes: Number(minutes),
    };
    const json = JSON.stringify(body);
    if (attempt.current?.body !== json) attempt.current = { key: clientId(), body: json };
    setBusy(true);
    setError(null);
    const r = await v1("PATCH", "/me", body, { idempotencyKey: attempt.current.key });
    if (r.ok) {
      router.push("/onboarding/baseline");
      return;
    }
    setBusy(false);
    setError(r.status === 400 ? "onb.profile.missing" : "onb.error");
  }

  return (
    <FlowScreen
      back="/sign-in"
      step={t("onb.step", { n: 2 })}
      actions={
        <Button variant="cta" fullWidth type="submit" form="profile-form" loading={busy}>
          {t("common.continue")}
        </Button>
      }
    >
      <FlowHeading title={t("onb.profile.title")} body={t("onb.profile.body")} />
      <form id="profile-form" onSubmit={submit} className="flex flex-col gap-6" noValidate>
        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-m border border-cta-text px-3 py-2 type-body-s"
          >
            <Icon name="alert" size={16} className="shrink-0 text-cta-text" />
            {t(error)}
          </p>
        )}
        <TextInput
          label={t("onb.profile.name")}
          hint={t("onb.profile.nameHint")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="name"
          required
        />
        <PillGroup label={t("onb.profile.sport")}>
          {SPORTS.map((s) => (
            <Pill key={s} pressed={sport === s} onClick={() => setSport(s)}>
              {t(`sport.${s}`)}
            </Pill>
          ))}
        </PillGroup>
        <PillGroup label={t("onb.profile.level")}>
          {playingLevels.map((l) => (
            <Pill key={l} pressed={level === l} onClick={() => setLevel(l)}>
              {t(`playingLevel.${l}`)}
            </Pill>
          ))}
        </PillGroup>
        {!initial.hasDob && (
          <TextInput
            label={t("onb.profile.dob")}
            placeholder={t("onb.profile.dobPlaceholder")}
            inputMode="numeric"
            autoComplete="bday"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            {...(dobError
              ? { error: t("onb.profile.dobInvalid") }
              : { hint: t("onb.profile.dobHint") })}
            required
          />
        )}
        <PillGroup label={t("onb.profile.goal")}>
          {GOALS.map((g) => (
            <Pill key={g} pressed={goal === g} onClick={() => setGoal(g)}>
              {t(`goal.${g}`)}
            </Pill>
          ))}
        </PillGroup>
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-text-muted" id="length-label">
            {t("onb.profile.length")}
          </span>
          <SegmentedControl
            label={t("onb.profile.length")}
            value={minutes}
            onChange={setMinutes}
            options={sessionMinutes.map((m) => ({
              value: String(m),
              label: t("sessionLength.n", { n: m }),
            }))}
          />
          <span className="type-caption text-text-muted">{t("onb.profile.lengthHint")}</span>
        </div>
      </form>
    </FlowScreen>
  );
}

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="type-label text-text-muted" aria-hidden="true">
        {label}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}
