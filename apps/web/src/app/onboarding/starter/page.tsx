import { Suspense } from "react";
import { inSequence } from "@eyeq/db";
import type { ProgramCard, ProgramDetail } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Card, Chip, Icon } from "@eyeq/ui/web";
import { FlowHeading, FlowScreen } from "@/components/flow/FlowScreen";
import { ProgramArt } from "@/components/programs/ProgramArt";
import { asSignedInAthlete, configNumbers } from "@/server/athlete";
import { getProgram, listPrograms } from "@/server/services/content";
import { getMe } from "@/server/services/me";
import { sportKey } from "../options";
import { pickStarter } from "./pick";
import { StarterActions } from "./StarterActions";

/** Board 1e (step 4 of 4): the starter program, and the first session starts from here. */
export default function OnboardingStarter() {
  return (
    <Suspense>
      <Load />
    </Suspense>
  );
}

async function Load() {
  const data = await asSignedInAthlete("/onboarding/starter", async (tx, session) => {
    const [me, { programs }, cfg] = await inSequence([
      () => getMe(tx, session),
      () => listPrograms(tx),
      () =>
        configNumbers(tx, ["xp.session_bonus", "streak.multiplier_days", "streak.multiplier_step"]),
    ]);
    const pick = pickStarter(programs, me.sport, me.goal);
    const detail = pick.starter ? await getProgram(tx, pick.starter.slug) : null;
    return { me, pick, detail, cfg };
  });
  const { me, pick, detail, cfg } = data;
  const first = detail?.modules[0]?.sessions[0];
  const minutes = first?.estMinutes ?? 0;

  return (
    <FlowScreen
      back="/onboarding/baseline"
      step={t("onb.step", { n: 4 })}
      actions={
        <StarterActions
          programId={pick.starter?.id ?? null}
          startLabel={t("onb.starter.start", { n: minutes })}
        />
      }
    >
      <FlowHeading
        eyebrow={
          me.sport
            ? t("onb.starter.eyebrow", { sport: t(sportKey(me.sport)).toLowerCase() })
            : t("onb.starter.eyebrowGeneric")
        }
        title={t("onb.starter.title")}
      />
      {pick.starter && detail && first ? (
        <StarterCard
          program={pick.starter}
          detail={detail}
          drills={first.drillCount}
          xpPerDay={first.xp + cfg["xp.session_bonus"]}
          minutes={minutes}
        />
      ) : (
        <Card>
          <p className="type-body text-text-secondary">{t("onb.starter.none")}</p>
        </Card>
      )}
      {pick.other && pick.otherKind && (
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-text-muted">
            {t(pick.otherKind === "lighter" ? "onb.starter.lighter" : "onb.starter.whenReady")}
          </span>
          <OtherRow program={pick.other} />
        </div>
      )}
      <p className="flex items-start gap-2.5 rounded-m border border-border bg-surface-1 px-3.5 py-3 type-body-s text-text-secondary">
        <Icon name="streak" size={28} filled className="shrink-0 text-streak" />
        <span>
          {t("onb.starter.streakNote", {
            days: cfg["streak.multiplier_days"],
            pct: Math.round(cfg["streak.multiplier_step"] * 100),
          })}
        </span>
      </p>
    </FlowScreen>
  );
}

function access(p: ProgramCard): string {
  return p.isFree ? t("onb.starter.free") : t("onb.starter.included");
}

function StarterCard({
  program,
  detail,
  drills,
  xpPerDay,
  minutes,
}: {
  program: ProgramCard;
  detail: ProgramDetail;
  drills: number;
  xpPerDay: number;
  minutes: number;
}) {
  const meta = [
    t("onb.starter.days", { n: program.durationDays }),
    t("onb.starter.minutes", { n: minutes }),
    program.coachLine,
  ].filter(Boolean);
  return (
    <section
      className="overflow-hidden rounded-l border border-primary-subtle-border bg-surface-1"
      aria-labelledby="starter-title"
    >
      <div className="relative h-[9.375rem]">
        <ProgramArt coverUrl={program.coverUrl} />
        <span className="absolute top-3.5 left-3.5">
          {program.isFree ? (
            <Chip kind="status" status="done">
              {access(program)}
            </Chip>
          ) : (
            <Chip kind="selected" icon={null}>
              {access(program)}
            </Chip>
          )}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2
            id="starter-title"
            className="font-display text-[1.875rem] leading-none font-bold uppercase"
          >
            {program.title}
          </h2>
          <p className="type-body-s text-text-secondary">{meta.join(" · ")}</p>
        </div>
        {program.description && (
          <p className="type-body-s text-text-secondary">{program.description}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Chip>{t("onb.starter.drillsPerDay", { n: drills })}</Chip>
          <Chip kind="xp">{t("onb.starter.xpPerDay", { n: xpPerDay })}</Chip>
          <Chip>
            {detail.modules.length === 1
              ? t("onb.starter.module")
              : t("onb.starter.modules", { n: detail.modules.length })}
          </Chip>
        </div>
      </div>
    </section>
  );
}

function OtherRow({ program }: { program: ProgramCard }) {
  return (
    <a
      href={`/app/programs/${program.slug}`}
      className="flex min-h-11 items-center gap-3 rounded-l border border-border bg-surface-1 p-3.5 text-text-primary no-underline"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-control bg-success-subtle text-success-text">
        <Icon name="eye" size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-extrabold">{program.title}</span>
        <span className="type-caption text-text-secondary">
          {[access(program), t("onb.starter.days", { n: program.durationDays })].join(" · ")}
        </span>
      </span>
      <Icon name="chevron" size={20} className="shrink-0 text-text-muted" />
    </a>
  );
}
