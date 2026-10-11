"use client";

import { useState } from "react";
import type { Badge, BadgesResponse } from "@eyeq/api-contract";
import { formatDate, t, type MessageKey } from "@eyeq/i18n";
import { Bar, Button, Chip, Icon, Sheet, StreakFlame, cx } from "@eyeq/ui/web";

/**
 * Board 9 (plan phase 6): rank titles by level, then every badge, earned or locked. A
 * locked badge says how to earn it and, where it can be measured, how far away it is
 * (plan 6.7). Dates are in the athlete's profile zone.
 */
export function Trophies({ data, timeZone }: { data: BadgesResponse; timeZone: string }) {
  const [open, setOpen] = useState<Badge | null>(null);
  return (
    <div className="flex flex-col gap-5 md:max-w-[48rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
          {t("trophies.title")}
        </h1>
        <span
          className="font-display text-[1.625rem] leading-none font-bold text-xp-text tabular-nums"
          aria-label={t("trophies.countLabel", { earned: data.earned, total: data.total })}
        >
          {t("trophies.count", { earned: data.earned, total: data.total })}
        </span>
      </div>

      <section aria-label={t("trophies.titles")} className="flex flex-col gap-2.5">
        <h2 className="flex items-baseline gap-2 type-label text-text-muted">
          {t("trophies.titles")}
          <span className="normal-case">{t("trophies.byLevel")}</span>
        </h2>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.5rem),1fr))] gap-2">
          {data.titles.map((band) => {
            const mine =
              data.level >= band.fromLevel && (band.toLevel === null || data.level <= band.toLevel);
            const range =
              band.toLevel === null
                ? t("trophies.bandTop", { from: band.fromLevel })
                : t("trophies.band", { from: band.fromLevel, to: band.toLevel });
            return (
              <li
                key={band.title}
                aria-current={mine ? "true" : undefined}
                className={cx(
                  "flex flex-col items-center gap-1 rounded-m border px-1.5 py-2.5 text-center",
                  mine ? "border-primary bg-primary-subtle" : "border-border bg-surface-1",
                )}
              >
                {mine && (
                  <span className="font-display text-[1.375rem] leading-none font-bold text-primary-text tabular-nums">
                    {data.level}
                  </span>
                )}
                <span className="font-display text-[0.9375rem] leading-none font-bold break-words uppercase">
                  {band.title}
                </span>
                <span
                  className={cx(
                    "type-caption",
                    mine ? "text-primary-on-subtle" : "text-text-muted",
                  )}
                >
                  {range}
                  {mine && ` · ${t("trophies.you")}`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label={t("trophies.badges")} className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="type-label text-text-muted">{t("trophies.badges")}</h2>
          <span className="type-caption text-text-muted">{t("trophies.tapHint")}</span>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,6.5rem),1fr))] gap-2.5">
          {data.badges.map((b) => (
            <li key={b.id}>
              <BadgeButton badge={b} onOpen={() => setOpen(b)} />
            </li>
          ))}
        </ul>
      </section>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        actions={
          <Button variant="ghost" size="m" onClick={() => setOpen(null)}>
            {t("common.close")}
          </Button>
        }
      >
        {open && <BadgeDetail badge={open} timeZone={timeZone} />}
      </Sheet>
    </div>
  );
}

function BadgeButton({ badge, onOpen }: { badge: Badge; onOpen: () => void }) {
  const state = badge.earned ? t("challenge.complete") : t("trophies.locked");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("trophies.open", { name: badge.name, state })}
      className={cx(
        "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-l border p-2 text-center",
        badge.earned
          ? "border-border-strong bg-surface-2"
          : "border-dashed border-border bg-transparent text-text-muted",
      )}
    >
      <span aria-hidden="true" className={badge.earned ? "text-streak" : "text-text-muted"}>
        {badge.earned ? <StreakFlame state="pending" size={28} /> : <Icon name="lock" size={22} />}
      </span>
      <span
        aria-hidden="true"
        className="font-display text-[0.9375rem] leading-none font-bold break-words uppercase"
      >
        {badge.name}
      </span>
      {!badge.earned && badge.progress && (
        <span aria-hidden="true" className="type-caption tabular-nums">
          {t("trophies.progress", {
            value: Math.min(badge.progress.value, badge.progress.target),
            target: badge.progress.target,
          })}
        </span>
      )}
    </button>
  );
}

function BadgeDetail({ badge, timeZone }: { badge: Badge; timeZone: string }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-wrap gap-1.5">
        <Chip compact>{t(`trophies.family.${badge.family}` as MessageKey)}</Chip>
        {badge.earned ? (
          <Chip kind="status" status="done" compact>
            {badge.awardedAt
              ? t("trophies.earnedOn", { date: formatDate(badge.awardedAt, timeZone) })
              : t("challenge.complete")}
          </Chip>
        ) : (
          <Chip kind="status" status="ended" compact icon="lock">
            {t("trophies.locked")}
          </Chip>
        )}
      </span>
      {!badge.earned && <h3 className="type-label text-text-muted">{t("trophies.howTo")}</h3>}
      {badge.description && <p className="type-body">{badge.description}</p>}
      {!badge.earned && badge.progress && (
        <div className="flex items-center gap-2.5">
          <Bar
            value={Math.min(badge.progress.value, badge.progress.target)}
            max={badge.progress.target}
            label={t("trophies.progress", {
              value: Math.min(badge.progress.value, badge.progress.target),
              target: badge.progress.target,
            })}
          />
          <span className="type-body-strong tabular-nums" aria-hidden="true">
            {t("trophies.progress", {
              value: Math.min(badge.progress.value, badge.progress.target),
              target: badge.progress.target,
            })}
          </span>
        </div>
      )}
      {badge.coins > 0 && (
        <p className="type-caption text-xp-text">{t("trophies.coins", { n: badge.coins })}</p>
      )}
    </div>
  );
}
