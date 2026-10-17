"use client";

import { useMemo, useState } from "react";
import { measurementGroups, type ProgramCard } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { Bar, Button, Card, Chip, Icon, Pill } from "@eyeq/ui/web";
import { NextLink } from "@/components/shell/NextLink";
import { AccessChip } from "@/components/programs/access";
import { ProgramArt } from "@/components/programs/ProgramArt";
import { SPORTS, sportKey } from "@/app/onboarding/options";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

/**
 * Board 10a: what the athlete is on, then the catalogue, filtered by sport, measurement
 * group and level (plan phase 5). Filters are this page's state; every program comes from
 * GET /programs with its lock state.
 */
export function Catalogue({
  programs,
  athleteLevel,
  sport: mySport,
  whatsapp,
  hasPro = false,
}: {
  programs: ProgramCard[];
  athleteLevel: number;
  sport: string | null;
  whatsapp: string | null;
  /** Without Pro, board 10a's "Go Pro" opens the paywall (phase 7). */
  hasPro?: boolean;
}) {
  const [sport, setSport] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);

  const active = programs.filter((p) => p.enrollment?.isActive && !p.enrollment.completedAt);
  const shown = useMemo(
    () =>
      programs.filter(
        (p) =>
          !(p.enrollment?.isActive && !p.enrollment.completedAt) &&
          (!sport || p.sportTags.length === 0 || p.sportTags.includes(sport)) &&
          (!group || p.measurementGroups.includes(group as (typeof measurementGroups)[number])) &&
          (!level || p.level === level),
      ),
    [programs, sport, group, level],
  );
  const sports = SPORTS.filter((s) => s !== "other");
  // The athlete's own sport first, as the board leads with it.
  const ordered =
    mySport && (sports as readonly string[]).includes(mySport)
      ? [mySport, ...sports.filter((s) => s !== mySport)]
      : [...sports];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
          {t("programs.title")}
        </h1>
        {!hasPro && (
          <Button variant="primary" size="m" href="/app/upgrade?from=upgrade">
            {t("pay.goPro")}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <Filter label={t("programs.sport")}>
          <Pill pressed={sport === null} onClick={() => setSport(null)}>
            {t("programs.allSports")}
          </Pill>
          {ordered.map((s) => (
            <Pill key={s} pressed={sport === s} onClick={() => setSport(s)}>
              {t(sportKey(s))}
            </Pill>
          ))}
        </Filter>
        <Filter label={t("programs.area")}>
          <Pill pressed={group === null} onClick={() => setGroup(null)}>
            {t("programs.allAreas")}
          </Pill>
          {measurementGroups.map((g) => (
            <Pill key={g} pressed={group === g} onClick={() => setGroup(g)}>
              {t(`programs.group.${g}` as MessageKey)}
            </Pill>
          ))}
        </Filter>
        <Filter label={t("programs.level")}>
          <Pill pressed={level === null} onClick={() => setLevel(null)}>
            {t("programs.allLevels")}
          </Pill>
          {LEVELS.map((l) => (
            <Pill key={l} pressed={level === l} onClick={() => setLevel(l)}>
              {t(`programs.level.${l}` as MessageKey)}
            </Pill>
          ))}
        </Filter>
      </div>

      {active.length > 0 && (
        <section className="flex flex-col gap-2.5" aria-labelledby="in-progress">
          <h2 id="in-progress" className="type-label text-text-muted">
            {t("programs.inProgress")}
          </h2>
          {active.map((p) => (
            <ProgramRow key={p.id} program={p} athleteLevel={athleteLevel} progress />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="catalog">
        <h2 id="catalog" className="type-label text-text-muted" aria-live="polite">
          {shown.length === 1
            ? t("programs.catalogOne")
            : t("programs.catalogMany", { n: shown.length })}
        </h2>
        {shown.length === 0 ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="type-body-s text-text-secondary">{t("programs.none")}</p>
            <Button
              variant="ghost"
              size="m"
              onClick={() => {
                setSport(null);
                setGroup(null);
                setLevel(null);
              }}
            >
              {t("programs.clear")}
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4">
            {shown.map((p) => (
              <ProgramRow key={p.id} program={p} athleteLevel={athleteLevel} />
            ))}
          </div>
        )}
      </section>

      {whatsapp && (
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 type-body-s text-text-secondary">
          {t("programs.team")}
          <a
            href={whatsapp}
            className="inline-flex min-h-11 items-center font-extrabold text-primary-text"
          >
            {t("programs.teamLink")}
          </a>
        </p>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </div>
  );
}

function ProgramRow({
  program,
  athleteLevel,
  progress,
}: {
  program: ProgramCard;
  athleteLevel: number;
  progress?: boolean;
}) {
  const day = Math.min(program.enrollment?.currentDay ?? 1, program.durationDays);
  const areas = program.measurementGroups
    .map((g) => t(`programs.group.${g}` as MessageKey))
    .join(" + ");
  const meta = [
    t("programs.days", { n: program.durationDays }),
    areas,
    program.coachLine?.split(" · ")[0],
  ].filter(Boolean);
  return (
    <NextLink
      href={`/app/programs/${program.slug}`}
      className="flex min-h-11 items-center gap-3 rounded-l border border-border bg-surface-1 p-3 text-text-primary no-underline"
    >
      <span className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-control">
        <ProgramArt coverUrl={program.coverUrl} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {!progress && (
          <span className="flex flex-wrap gap-1.5">
            <AccessChip program={program} athleteLevel={athleteLevel} />
            {program.sportTags.length === 0 && <Chip>{t("programs.allSportsTag")}</Chip>}
          </span>
        )}
        <span className="font-display text-xl leading-tight font-bold break-words uppercase">
          {program.title}
        </span>
        <span className="type-caption text-text-secondary">{meta.join(" · ")}</span>
        {progress && (
          <span className="flex items-center gap-2">
            <Bar value={day} max={program.durationDays} label={program.title} />
            <span className="type-caption text-text-secondary tabular-nums">
              {t("programs.dayOf", { n: day, total: program.durationDays })}
            </span>
          </span>
        )}
      </span>
      <Icon name="chevron" size={20} className="shrink-0 text-text-muted" />
    </NextLink>
  );
}
