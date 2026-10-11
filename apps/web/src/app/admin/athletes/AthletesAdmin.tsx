"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  adminAthletesResponseSchema,
  athletePlans,
  type AdminAthletesResponse,
} from "@eyeq/api-contract";
import { formatRelativeDay, t } from "@eyeq/i18n";
import { useAdminTimeZone } from "../time-zone";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  ErrorCard,
  SkeletonRow,
  StreakFlame,
} from "@eyeq/ui/web";
import { planChip, planKey } from "./plan";

type Plan = (typeof athletePlans)[number];

function query(search: string, plan: Plan | "", page?: number) {
  const q = new URLSearchParams();
  if (search.trim()) q.set("search", search.trim());
  if (plan) q.set("plan", plan);
  if (page && page > 1) q.set("page", String(page));
  return q.toString();
}

export function AthletesAdmin() {
  const tz = useAdminTimeZone();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAthletesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Typing settles for 250 ms before the list reloads.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      fetch(`/api/admin/athletes?${query(search, plan, page)}`, { cache: "no-store" })
        .then(async (res) => {
          if (!live) return;
          if (!res.ok) return setFailed(true);
          setFailed(false);
          setData(adminAthletesResponseSchema.parse(await res.json()));
        })
        .catch(() => live && setFailed(true));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, plan, page, attempt]);

  const from = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + data.athletes.length - (data.athletes.length ? 1 : 0) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("admin.athletes.eyebrow")}</span>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
            {data
              ? t("admin.athletes.heading", { total: data.total, active: data.activeThisWeek })
              : t("shell.admin.athletesTitle")}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("admin.athletes.search")}
            aria-label={t("admin.athletes.search")}
            className="min-h-11 w-[min(100%,14rem)] rounded-control border border-border bg-surface-1 px-3 text-sm"
          />
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value as Plan | "");
              setPage(1);
            }}
            aria-label={t("admin.athletes.planFilter")}
            className="min-h-11 rounded-control border border-border bg-surface-1 px-3 text-sm font-bold"
          >
            <option value="">{t("admin.athletes.allPlans")}</option>
            {athletePlans.map((p) => (
              <option key={p} value={p}>
                {t(planKey(p))}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="m"
            href={`/api/admin/athletes/export?${query(search, plan)}`}
            download
          >
            {t("admin.athletes.export")}
          </Button>
        </div>
      </div>

      {failed ? (
        <ErrorCard
          message={t("admin.athletes.loadError")}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : data === null ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : data.athletes.length === 0 ? (
        <EmptyState
          icon="profile"
          title={t("admin.athletes.empty")}
          body={t("admin.athletes.emptyBody")}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-l border border-border bg-surface-1">
            <table className="w-full min-w-[47.5rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-surface-1">
                <tr className="border-b border-border type-label text-text-muted">
                  <th className="px-4 py-3">{t("admin.athletes.columns.athlete")}</th>
                  <th className="px-4 py-3">{t("admin.athletes.columns.sport")}</th>
                  <th className="px-4 py-3">{t("admin.athletes.columns.streak")}</th>
                  <th className="px-4 py-3">{t("admin.athletes.columns.lastActive")}</th>
                  <th className="px-4 py-3">{t("admin.athletes.columns.plan")}</th>
                  <th className="px-4 py-3">{t("admin.athletes.columns.program")}</th>
                </tr>
              </thead>
              <tbody>
                {data.athletes.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/athletes/${a.id}`}
                        className="flex min-h-11 items-center gap-2.5 rounded-control"
                      >
                        <Avatar initials={a.initials} size={32} />
                        <span className="flex flex-col">
                          <span className="font-extrabold text-primary-text underline-offset-2 hover:underline">
                            {a.displayName}
                          </span>
                          <span className="type-caption text-text-muted tabular-nums">
                            {a.phoneMasked ?? t("admin.athletes.noPhone")}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {[a.sport, a.playingLevel].filter(Boolean).join(" · ")}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 font-extrabold tabular-nums">
                        {a.currentStreak > 0 && <StreakFlame state="done" size={16} />}
                        {t("admin.athletes.streakDays", { n: a.currentStreak })}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {a.lastActiveAt
                        ? formatRelativeDay(a.lastActiveAt, tz)
                        : t("admin.athletes.never")}
                    </td>
                    <td className="px-4 py-2">
                      <Chip kind={planChip(a.plan)} icon={null} compact>
                        {t(planKey(a.plan))}
                      </Chip>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {a.program
                        ? t("admin.athletes.programDay", {
                            title: a.program.title,
                            day: a.program.currentDay,
                            days: a.program.durationDays,
                          })
                        : t("admin.athletes.noProgram")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 type-caption text-text-muted">
            <span>{t("admin.athletes.showing", { from, to, total: data.total })}</span>
            <span className="flex gap-2">
              {page > 1 && (
                <Button variant="ghost" size="s" onClick={() => setPage((p) => p - 1)}>
                  {t("admin.athletes.previous")}
                </Button>
              )}
              {to < data.total && (
                <Button variant="ghost" size="s" onClick={() => setPage((p) => p + 1)}>
                  {t("admin.athletes.next")}
                </Button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
