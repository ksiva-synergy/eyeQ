"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminWeeklyResponseSchema,
  type AdminChallenge,
  type AdminWeeklyResponse,
} from "@eyeq/api-contract";
import { formatCalendarDate, t } from "@eyeq/i18n";
import { Button, Chip, ErrorCard, SkeletonRow, Toast } from "@eyeq/ui/web";
import { clientId } from "@/lib/client-id";
import { ChallengeForm, type ChallengeFormValues } from "../challenges/ChallengeForm";

type Editing = "live" | "current" | "next" | null;

/**
 * Board 17, Game settings: the weekly challenge. The live one can be edited; when none is
 * live one can start this week; next week's can be scheduled, edited or removed, and with
 * none scheduled the live one repeats from Monday (week_rollover, plan 6.7).
 */
export function WeeklyEditor() {
  const [data, setData] = useState<AdminWeeklyResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/challenges", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFailed(true);
    setFailed(false);
    setData(adminWeeklyResponseSchema.parse(await res.json()));
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/challenges", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setFailed(true);
        setData(adminWeeklyResponseSchema.parse(await res.json()));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", "idempotency-key": clientId() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { details?: { reason?: string } } | null;
      setError(
        j?.details?.reason === "week_taken"
          ? t("admin.challenges.weekTaken")
          : t("admin.challenges.saveError"),
      );
      return false;
    }
    setEditing(null);
    await load();
    return true;
  }

  function save(target: Exclude<Editing, null>, existing: AdminChallenge | null) {
    return (v: ChallengeFormValues) => {
      const fields = {
        title: v.title,
        description: v.description,
        rewardXp: v.rewardXp,
        rewardCoins: v.rewardCoins,
        badgeId: v.badgeId,
      };
      const target_ = v.goal.metric === "sessions_total" ? v.goal.gte : 1;
      void (
        existing
          ? send("PATCH", `/api/admin/challenges/${existing.id}`, { ...fields, goal: v.goal })
          : send("POST", "/api/admin/challenges", {
              week: target === "next" ? "next" : "current",
              ...fields,
              target: target_,
            })
      ).then((ok) => ok && setToast(t("admin.challenges.saved")));
    };
  }

  if (failed) return <ErrorCard message={t("admin.challenges.loadError")} />;
  if (!data)
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );

  const badges = data.badges;
  return (
    <section aria-label={t("admin.challenges.weekly")} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-label text-text-muted">{t("admin.challenges.weekly")}</h2>
        {data.live && (
          <Chip kind="status" status="done" compact>
            {t("admin.challenges.live")}
          </Chip>
        )}
      </div>

      {data.live ? (
        editing === "live" ? (
          <ChallengeForm
            kind="weekly"
            initial={data.live}
            badges={badges}
            busy={busy}
            error={error}
            label={t("admin.challenges.weekly")}
            onSubmit={save("live", data.live)}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Summary
            c={data.live}
            onEdit={() => setEditing("live")}
            note={t("admin.challenges.editLive")}
          />
        )
      ) : editing === "current" ? (
        <ChallengeForm
          kind="weekly"
          badges={badges}
          busy={busy}
          error={error}
          label={t("admin.challenges.startThisWeek")}
          onSubmit={save("current", null)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-l border border-dashed border-border p-4">
          <span className="type-body-s text-text-secondary">{t("admin.challenges.noneLive")}</span>
          <Button variant="primary" size="m" icon="plus" onClick={() => setEditing("current")}>
            {t("admin.challenges.startThisWeek")}
          </Button>
        </div>
      )}

      <h3 className="type-label text-text-muted">
        {t("admin.challenges.next")} ·{" "}
        {t("admin.challenges.weekOf", { date: formatCalendarDate(data.nextWeekStart) })}
      </h3>
      {editing === "next" ? (
        <ChallengeForm
          kind="weekly"
          {...(data.next ? { initial: data.next } : {})}
          badges={badges}
          busy={busy}
          error={error}
          label={t("admin.challenges.next")}
          onSubmit={save("next", data.next)}
          onCancel={() => setEditing(null)}
        />
      ) : data.next ? (
        <Summary
          c={data.next}
          onEdit={() => setEditing("next")}
          note={t("admin.challenges.removeHint")}
          onRemove={() =>
            void send("DELETE", `/api/admin/challenges/${data.next!.id}`).then(
              (ok) => ok && setToast(t("admin.challenges.removed")),
            )
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-l border border-dashed border-border p-4">
          <span className="type-body-s text-text-secondary">{t("admin.challenges.nextNone")}</span>
          <Button variant="ghost" size="m" icon="plus" onClick={() => setEditing("next")}>
            {t("admin.challenges.schedule")}
          </Button>
        </div>
      )}
      {error && editing === null && <ErrorCard message={error} />}

      {data.recent.length > 0 && (
        <>
          <h3 className="type-label text-text-muted">{t("admin.challenges.recent")}</h3>
          <ul className="flex flex-col gap-1.5">
            {data.recent.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap justify-between gap-2 rounded-m border border-border bg-surface-1 px-3 py-2"
              >
                <span className="type-body-strong">{c.title}</span>
                <span className="type-caption text-text-secondary">
                  {t("admin.challenges.recentLine", {
                    target: c.goal.metric === "sessions_total" ? c.goal.gte : 0,
                    joined: c.joined,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {toast && (
        <Toast
          message={toast}
          onDismiss={() => setToast(null)}
          className="fixed right-5 bottom-5 z-(--eyeq-z-toast)"
        />
      )}
    </section>
  );
}

function Summary({
  c,
  onEdit,
  onRemove,
  note,
}: {
  c: AdminChallenge;
  onEdit: () => void;
  onRemove?: () => void;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-l border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="type-body-strong">{c.title}</span>
        <span className="type-caption text-text-secondary">
          {c.goal.metric === "sessions_total" &&
            `${t("admin.challenges.targetSessions")}: ${c.goal.gte} · `}
          {t("xp.gain", { n: c.rewardXp })} · {t("coins.count", { n: c.rewardCoins })} ·{" "}
          {t("admin.challenges.joined", { n: c.joined })}
        </span>
      </div>
      <span className="type-caption text-text-muted">{note}</span>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="s" onClick={onEdit}>
          {t("admin.challenges.edit")}
        </Button>
        {onRemove && (
          <Button variant="text" size="s" onClick={onRemove}>
            {t("admin.challenges.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
