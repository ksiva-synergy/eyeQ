"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  BoardMe,
  BoardRow,
  ChallengeRow,
  ChallengesResponse,
  LeaderboardResponse,
} from "@eyeq/api-contract";
import { formatNumber, t } from "@eyeq/i18n";
import {
  Avatar,
  ChallengeCard,
  Chip,
  EmptyState,
  Icon,
  Pill,
  RankRow,
  RankSwap,
  SegmentedControl,
  cx,
  type RankDelta,
  type RankRowProps,
} from "@eyeq/ui/web";
import { NextLink } from "@/components/shell/NextLink";
import { resetsLabel } from "@/components/compete/resets";
import { sportKey } from "@/app/onboarding/options";

export type BoardKey = "week-global" | "week-sport" | "all-global" | "all-sport";
type Tab = "board" | "challenges";

/**
 * Boards 6 and 7 (plan phase 6): the leaderboard (this week or all time, global or the
 * athlete's sport, top 10 with a podium and the athlete's own row pinned) and the
 * challenges. Every board arrives with the page, so the filters are this page's state.
 * `now` is the server's render time, so the reset countdown hydrates as rendered.
 */
export function Compete({
  boards,
  challenges,
  now,
  timeZone,
  initialTab = "board",
}: {
  boards: Record<BoardKey, LeaderboardResponse>;
  challenges: ChallengesResponse;
  now: string;
  timeZone: string;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const resets = resetsLabel(boards["week-global"].resetsAt, now, timeZone);

  return (
    <div className="flex flex-col gap-4 md:max-w-[48rem] md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
          {t("compete.title")}
        </h1>
        <Chip compact>{t("compete.resets", { when: resets })}</Chip>
      </div>
      <SegmentedControl
        label={t("compete.view")}
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "board", label: t("compete.tab.board") },
          { value: "challenges", label: t("compete.tab.challenges") },
        ]}
      />
      {tab === "board" ? (
        <Board boards={boards} />
      ) : (
        <Challenges challenges={challenges} resets={resets} />
      )}
    </div>
  );
}

function delta(n: number | null): RankDelta | undefined {
  if (!n) return undefined;
  return n > 0 ? { dir: "up", n } : { dir: "down", n: -n };
}

function rowProps(r: BoardRow): RankRowProps {
  return {
    rank: r.rank,
    name: r.displayName,
    initials: r.initials,
    level: r.level,
    xp: r.xp,
    delta: delta(r.delta),
    isMe: r.isMe,
  };
}

function meProps(me: BoardMe, sport: string | undefined): RankRowProps {
  return {
    rank: me.rank,
    name: me.displayName,
    initials: me.initials,
    level: me.level,
    sport,
    xp: me.xp,
    delta: delta(me.delta),
    isMe: true,
    ...(me.gapAbove ? { gapAbove: { xp: me.gapAbove.xp, name: me.gapAbove.displayName } } : {}),
  };
}

function Board({ boards }: { boards: Record<BoardKey, LeaderboardResponse> }) {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [scope, setScope] = useState<"global" | "sport">("global");
  const b = boards[`${period}-${scope}`];
  const sportValue = boards["week-sport"].scopeValue;
  const sportName = sportValue ? t(sportKey(sportValue)) : null;
  const top = b.rows.slice(0, 3);
  const rest = b.rows.slice(3);
  const me = b.me;

  return (
    // On a phone the own row is a bar over the page, above the tab bar; the padding lets
    // the last rows scroll clear of it. From 768 px it sits after the list.
    <section
      className={cx("flex flex-col gap-3.5", me && "pb-24 md:pb-0")}
      aria-label={t("compete.tab.board")}
    >
      <SegmentedControl
        label={t("compete.period")}
        value={period}
        onChange={(v) => setPeriod(v as "week" | "all")}
        options={[
          { value: "week", label: t("compete.week") },
          { value: "all", label: t("compete.all") },
        ]}
      />
      <div
        role="group"
        aria-label={t("compete.scope")}
        className="flex flex-wrap items-center gap-2"
      >
        <Pill pressed={scope === "global"} onClick={() => setScope("global")}>
          {t("compete.global")}
        </Pill>
        <Pill pressed={scope === "sport"} onClick={() => setScope("sport")}>
          {sportName ? t("compete.mySport", { sport: sportName }) : t("sport.other")}
        </Pill>
        <span className="ml-auto type-caption text-text-muted">
          {t("compete.count", { n: b.count })}
        </span>
      </div>

      {period === "week" && me && <RankMoment board={b} me={me} sport={sportName ?? undefined} />}

      {scope === "sport" && !sportValue ? (
        <EmptyState
          title={t("compete.noSport.title")}
          body={t("compete.noSport.body")}
          action={
            <NextLink href="/app/account" className="type-body-strong text-primary-text">
              {t("account.edit")}
            </NextLink>
          }
        />
      ) : b.rows.length === 0 ? (
        <EmptyState title={t("compete.empty.title")} body={t("compete.empty.body")} />
      ) : (
        <>
          <ol aria-label={t("compete.podium")} className="grid grid-cols-3 items-end gap-2">
            {top.map((r) => (
              <Podium key={r.rank} row={r} />
            ))}
          </ol>
          {rest.length > 0 && (
            <ol
              aria-label={t("compete.rows", { from: rest[0]!.rank, to: rest.at(-1)!.rank })}
              className="flex flex-col gap-2"
            >
              {rest.map((r) => (
                <li key={r.rank}>
                  <RankRow {...rowProps(r)} />
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {me && (
        <p className="type-caption text-text-muted">
          {me.isPublic ? (
            <>
              {t("compete.footer", {
                top: Math.min(b.rows.length, 10),
                rank: me.rank,
                count: b.count,
              })}
              <NextLink
                href="/app/account"
                className="inline-flex min-h-11 items-center font-bold text-primary-text"
              >
                {t("compete.hideMe")}
              </NextLink>
            </>
          ) : (
            <>
              {t("compete.hidden")}
              <NextLink
                href="/app/account"
                className="inline-flex min-h-11 items-center font-bold text-primary-text"
              >
                {t("compete.showMe")}
              </NextLink>
            </>
          )}
        </p>
      )}

      {me && (
        <section
          aria-label={t("compete.yourPlace")}
          data-testid="pinned-me"
          className="fixed inset-x-gutter bottom-24 z-10 rounded-l bg-ground md:static md:bg-transparent"
        >
          <RankRow {...meProps(me, sportName ?? undefined)} />
        </section>
      )}
    </section>
  );
}

/** Board 6's podium: first in the middle, raised; second left, third right. */
function Podium({ row }: { row: BoardRow }) {
  const place = row.rank;
  return (
    <li
      className={cx(
        "flex min-w-0 flex-col items-center gap-1.5 rounded-l border px-2 pt-3 pb-2 text-center",
        place === 1 ? "order-2 border-xp-border bg-surface-2 pb-4" : "border-border bg-surface-1",
        place === 2 && "order-1",
        place === 3 && "order-3",
        row.isMe && "border-primary",
      )}
    >
      <span className="sr-only">
        {t("compete.podiumPlace", { rank: place, name: row.displayName, xp: formatNumber(row.xp) })}
      </span>
      {place === 1 && <Icon name="compete" size={20} className="text-xp-text" />}
      <Avatar initials={row.initials} size="m" me={row.isMe} />
      <span aria-hidden="true" className="w-full type-body-s font-bold break-words">
        {row.displayName}
      </span>
      <span aria-hidden="true" className="type-caption text-xp-text tabular-nums">
        {formatNumber(row.xp)} {t("xp.unit")}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          "font-display leading-none font-bold tabular-nums",
          place === 1 ? "text-[2rem] text-xp-text" : "text-[1.5rem] text-text-muted",
        )}
      >
        {place}
      </span>
    </li>
  );
}

/**
 * The rank-change moment (board 02): when the athlete has moved up since the start of
 * the day, their row swaps past the athlete they passed. Shown once per new rank per
 * viewer; the rank last shown is a per-viewer convenience kept in localStorage. It is read
 * once per page load (so the moment stays while it plays) and never on the server, so the
 * server's HTML and the first client render agree.
 */
const SERVER = "server";
const firstRead = new Map<string, string | null>();
const noSubscribe = () => () => {};

function storedRank(key: string): string | null {
  if (!firstRead.has(key)) {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(key);
    } catch {
      /* storage blocked: treat as never shown */
    }
    firstRead.set(key, v);
  }
  return firstRead.get(key) ?? null;
}

function RankMoment({
  board,
  me,
  sport,
}: {
  board: LeaderboardResponse;
  me: BoardMe;
  sport?: string;
}) {
  const key = `eyeq.rankMoment.${board.scope}.${board.weekStart ?? ""}`;
  const seen = useSyncExternalStore(
    noSubscribe,
    () => storedRank(key),
    () => SERVER,
  );
  const show =
    seen !== SERVER && seen !== String(me.rank) && !!me.delta && me.delta > 0 && !!me.gapBelow;
  useEffect(() => {
    if (!show) return;
    try {
      window.localStorage.setItem(key, String(me.rank));
    } catch {
      /* nothing to remember it in */
    }
  }, [show, key, me.rank]);
  if (!show || !me.gapBelow || !me.delta) return null;
  const below = me.gapBelow;
  const listed = board.rows.find((r) => r.rank === below.rank && !r.isMe);
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-l border border-success-border bg-success-subtle p-3"
    >
      <span className="flex items-center gap-2 type-body-strong text-success-text">
        <Icon name="progress" size={16} />
        {t("compete.moment.up", { n: me.delta })}
        <span className="type-body-s font-normal text-text-secondary">
          {t("compete.moment.passed", { name: below.displayName })}
        </span>
      </span>
      <RankSwap
        me={{ ...meProps(me, sport), gapAbove: undefined }}
        above={{
          rank: below.rank,
          name: below.displayName,
          initials: listed?.initials ?? initialsOf(below.displayName),
          ...(listed ? { level: listed.level } : {}),
          xp: me.xp - below.xp,
          delta: { dir: "down", n: 1 },
        }}
      />
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function card(c: ChallengeRow, resets: string | undefined) {
  return (
    <ChallengeCard
      key={c.id}
      kind={c.type === "paid" ? "premium" : c.type}
      title={c.title}
      progress={Math.min(c.progress, c.target)}
      target={c.target}
      reward={{
        xp: c.reward.xp,
        coins: c.reward.coins,
        ...(c.reward.badge ? { badge: c.reward.badge } : {}),
      }}
      {...(c.state === "active" && resets ? { resetsLabel: resets } : {})}
      joined={c.joined}
      state={c.state}
    />
  );
}

function Challenges({ challenges, resets }: { challenges: ChallengesResponse; resets: string }) {
  const weekly = challenges.active.filter((c) => c.type === "weekly");
  const program = challenges.active.filter((c) => c.type === "program");
  const live = new Set(challenges.active.map((c) => c.id));
  // A challenge finished this week stays under Active, marked complete, until it closes.
  const completed = challenges.completed.filter((c) => !live.has(c.id));
  const nothing = challenges.active.length + completed.length + challenges.missed.length === 0;

  if (nothing)
    return (
      <EmptyState
        icon="compete"
        title={t("compete.challengesEmpty.title")}
        body={t("compete.challengesEmpty.body")}
      />
    );
  return (
    <div className="flex flex-col gap-5">
      {weekly.length > 0 && (
        <Section title={t("compete.weeklyActive")}>{weekly.map((c) => card(c, resets))}</Section>
      )}
      {program.length > 0 && (
        <Section title={t("compete.programChallenges")}>
          {program.map((c) => card(c, undefined))}
        </Section>
      )}
      {completed.length > 0 && (
        <Section title={t("compete.completed")}>{completed.map((c) => card(c, undefined))}</Section>
      )}
      {challenges.missed.length > 0 && (
        <Section title={t("compete.missed")}>
          {challenges.missed.map((c) => card(c, undefined))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="type-label text-text-muted">{title}</h2>
      <div className="grid gap-2.5 md:grid-cols-2">{children}</div>
    </section>
  );
}
