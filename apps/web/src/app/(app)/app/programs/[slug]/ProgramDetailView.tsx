"use client";

import { useRef, useState } from "react";
import type { ProgramDetail } from "@eyeq/api-contract";
import { formatNumber, formatRupees, t, type MessageKey } from "@eyeq/i18n";
import { Button, Card, Chip, Icon, cx } from "@eyeq/ui/web";
import { NextLink } from "@/components/shell/NextLink";
import { ProgramArt } from "@/components/programs/ProgramArt";
import { sportKey } from "@/app/onboarding/options";
import { v1 } from "@/lib/athlete-api";

/**
 * Board 10b. The action follows the athlete's state from the payload: start (open, not
 * enrolled), continue (enrolled here), switch (enrolled elsewhere), finished, or locked.
 * Locked shows what opens it (Pro, a one-time price, a level); buying is phase 7.
 */
export function ProgramDetailView({
  program,
  athleteLevel,
  currentProgram,
}: {
  program: ProgramDetail;
  athleteLevel: number;
  currentProgram: string | null;
}) {
  const sessions = program.modules.flatMap((m) => m.sessions);
  const minutes = sessions[0]?.estMinutes ?? 0;
  const xpTotal = sessions.reduce((a, s) => a + s.xp, 0);
  const enrolled = program.enrollment;
  const levelLocked = !program.hasAccess && program.minLevel > athleteLevel;

  return (
    <div className="-mx-gutter -mt-6 flex flex-col md:mx-0 md:mt-0">
      <div className="relative h-[13rem] overflow-hidden md:h-[15rem] md:rounded-l md:border md:border-border">
        <ProgramArt coverUrl={program.coverUrl} />
        <NextLink
          href="/app/programs"
          aria-label={t("program.back")}
          className="absolute top-4 left-4 inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface-1 text-text-primary"
        >
          <Icon name="back" size={24} />
        </NextLink>
      </div>

      <div className="flex flex-col gap-5 px-gutter pt-5 pb-48 md:px-0 md:pb-10">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {program.measurementGroups.map((g) => (
              <Chip key={g} kind="area">
                {t(`programs.group.${g}` as MessageKey)}
              </Chip>
            ))}
            <Chip>
              {program.sportTags.length > 0
                ? program.sportTags.map((s) => t(sportKey(s))).join(" · ")
                : t("programs.allSportsTag")}
            </Chip>
          </div>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold break-words uppercase">
            {program.title}
          </h1>
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.75rem),1fr))] gap-2.5">
          <Stat value={formatNumber(program.durationDays)} label={t("program.statDays")} />
          <Stat value={formatNumber(minutes)} label={t("program.statMinutes")} />
          <Stat value={formatNumber(program.modules.length)} label={t("program.statModules")} />
          <Stat value={formatNumber(xpTotal)} label={t("program.statXp")} tone="text-xp-text" />
        </dl>

        {program.description && (
          <p className="type-body text-text-secondary">{program.description}</p>
        )}

        {program.coachLine && (
          <Card className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary font-extrabold text-on-primary">
              {program.coachLine.slice(0, 1)}
            </span>
            <span className="type-body-strong">{program.coachLine}</span>
          </Card>
        )}

        <section className="flex flex-col gap-2.5" aria-labelledby="modules">
          <h2 id="modules" className="type-label text-text-muted">
            {t("program.modules")}
          </h2>
          <Card padding="s" className="flex flex-col">
            <ol>
              {program.modules.map((m) => (
                <ModuleRow key={m.id} module={m} />
              ))}
            </ol>
          </Card>
        </section>

        <section className="flex flex-col gap-2.5" aria-labelledby="get">
          <h2 id="get" className="type-label text-text-muted">
            {t("program.whatYouGet")}
          </h2>
          <Card className="flex flex-col gap-2">
            {[
              t("program.getDrills", { n: sessions[0]?.drillCount ?? 0 }),
              t("program.getDays", { n: program.durationDays }),
              t("program.getScores"),
            ].map((line) => (
              <span key={line} className="flex items-start gap-2.5 type-body-s">
                <Icon name="check" size={18} className="mt-0.5 shrink-0 text-success-text" />
                {line}
              </span>
            ))}
          </Card>
        </section>

        <p className="type-caption text-text-muted">{t("program.disclaimer")}</p>

        <div className="hidden md:block">
          <Actions
            program={program}
            levelLocked={levelLocked}
            currentProgram={currentProgram}
            enrolledDay={enrolled?.currentDay ?? null}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[5.25rem] z-(--eyeq-z-dock) border-t border-border bg-ground px-gutter pt-3 pb-3 md:hidden">
        <Actions
          program={program}
          levelLocked={levelLocked}
          currentProgram={currentProgram}
          enrolledDay={enrolled?.currentDay ?? null}
        />
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-m border border-border bg-surface-1 px-2 py-3 text-center">
      <dd className={cx("font-display text-[1.625rem] leading-none font-bold tabular-nums", tone)}>
        {value}
      </dd>
      <dt className="type-label text-text-muted">{label}</dt>
    </div>
  );
}

function ModuleRow({ module: m }: { module: ProgramDetail["modules"][number] }) {
  const days = m.sessions.map((s) => s.dayNumber);
  const from = Math.min(...days);
  const to = Math.max(...days);
  const xp = m.sessions.reduce((a, s) => a + s.xp, 0);
  const done = m.sessions.length > 0 && m.sessions.every((s) => s.completed);
  const locked = m.unlocked === false;
  const why =
    m.unlockRule === "on_day" && m.unlockDay
      ? t("program.module.lockedDay", { n: m.unlockDay })
      : t("program.module.lockedAfter");
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border px-1 py-2.5 last:border-b-0">
      <span
        className={cx(
          "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-extrabold",
          done
            ? "border-success bg-success text-on-primary"
            : "border-border bg-surface-2 text-text-secondary",
        )}
      >
        {done ? <Icon name="check" size={14} label={t("program.module.done")} /> : m.order}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-strong">{m.title}</span>
        <span className="type-caption text-text-secondary">
          {[
            days.length === 0
              ? null
              : from === to
                ? t("program.module.day", { n: from })
                : t("program.module.days", { from, to }),
            m.sessions.length === 1
              ? t("program.module.sessionOne")
              : t("program.module.sessions", { n: m.sessions.length }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {locked && (
          <span className="flex items-center gap-1 type-caption text-text-muted">
            <Icon name="lock" size={14} />
            {why}
          </span>
        )}
      </span>
      <span className="shrink-0 type-body-strong text-xp-text tabular-nums">
        {t("xp.plus", { n: xp })}
      </span>
    </li>
  );
}

function Actions({
  program,
  levelLocked,
  currentProgram,
  enrolledDay,
}: {
  program: ProgramDetail;
  levelLocked: boolean;
  currentProgram: string | null;
  enrolledDay: number | null;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = useRef(crypto.randomUUID());
  const e = program.enrollment;

  async function enroll() {
    setBusy(true);
    setFailed(false);
    const r = await v1("POST", `/programs/${program.id}/enroll`, undefined, {
      idempotencyKey: key.current,
    });
    if (!r.ok) {
      setBusy(false);
      setFailed(true);
      return;
    }
    // A full load: Today and the catalogue read the new enrolment from the server.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/app");
  }

  if (!program.hasAccess) {
    const price = program.product ? formatRupees(program.product.pricePaise) : null;
    return (
      <div className="flex flex-col gap-2">
        {levelLocked ? (
          <p className="flex items-center gap-2 type-body-s text-text-secondary">
            <Icon name="lock" size={16} />
            {t("program.levelLocked", { n: program.minLevel })}
          </p>
        ) : (
          <>
            {price && (
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-s text-text-secondary">{t("program.buyOnce")}</span>
                <span className="font-display text-[1.625rem] leading-none font-bold tabular-nums">
                  {price}
                </span>
              </div>
            )}
            <div className="flex gap-2.5">
              {program.inSubscription && (
                <span className="flex min-h-[3.25rem] flex-1 items-center justify-center rounded-m border border-border bg-surface-2 px-3 text-center type-body-strong">
                  {t("program.includedInPro")}
                </span>
              )}
              <Button
                variant="cta"
                fullWidth
                className="flex-[1.4]"
                disabledReason={t("program.paymentsSoon")}
              >
                {t("program.unlock")}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {failed && (
        <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
          <Icon name="alert" size={16} />
          {t("program.enrollError")}
        </p>
      )}
      {e?.completedAt ? (
        <p className="flex items-center gap-2 type-body-strong">
          <Icon name="check" size={18} className="text-success-text" />
          {t("program.finished")}
        </p>
      ) : e?.isActive ? (
        <Button variant="cta" icon="play" fullWidth href="/app/session/today">
          {t("program.continue", { n: Math.min(enrolledDay ?? 1, program.durationDays) })}
        </Button>
      ) : (
        <>
          {currentProgram && (
            <p className="type-caption text-text-secondary">
              {t("program.switchNote", { program: currentProgram })}
            </p>
          )}
          <Button variant="cta" icon="play" fullWidth loading={busy} onClick={() => void enroll()}>
            {currentProgram ? t("program.switch") : t("program.start")}
          </Button>
        </>
      )}
    </div>
  );
}
