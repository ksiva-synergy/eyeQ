"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminProgramChallengesResponseSchema,
  type AdminChallenge,
  type AdminProgramChallengesResponse,
  type BuilderProgram,
} from "@eyeq/api-contract";
import { formatCalendarDate, t, type MessageKey } from "@eyeq/i18n";
import { Button, Chip, ErrorCard, SkeletonRow, Toast } from "@eyeq/ui/web";
import { clientId } from "@/lib/client-id";
import { ChallengeForm, istDay, type ChallengeFormValues } from "../../challenges/ChallengeForm";

const STATE: Record<
  AdminChallenge["state"],
  { key: MessageKey; status: "done" | "pending" | "ended" }
> = {
  live: { key: "admin.challenges.live", status: "done" },
  scheduled: { key: "admin.challenges.scheduled", status: "pending" },
  ended: { key: "admin.challenges.ended", status: "ended" },
};

/**
 * Program challenges on the program's page (plan phase 6, 6.7): a goal (sessions, finish a
 * module, a score on a drill) between two IST dates, for athletes enrolled in the program.
 * Modules and drills come from the program itself.
 */
export function ProgramChallenges({ program }: { program: BuilderProgram }) {
  const [data, setData] = useState<AdminProgramChallengesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<AdminChallenge | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const path = `/api/admin/programs/${program.id}/challenges`;

  const load = useCallback(async () => {
    const res = await fetch(path, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFailed(true);
    setFailed(false);
    setData(adminProgramChallengesResponseSchema.parse(await res.json()));
  }, [path]);

  useEffect(() => {
    let live = true;
    fetch(path, { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setFailed(true);
        setData(adminProgramChallengesResponseSchema.parse(await res.json()));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [path]);

  const modules = program.modules.map((m) => ({ id: m.id, name: m.title }));
  const seen = new Set<string>();
  const drills = program.modules
    .flatMap((m) => m.sessions.flatMap((s) => s.drills))
    .filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
    .map((d) => ({ id: d.id, name: d.title }));

  async function send(method: string, url: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "idempotency-key": clientId() },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(t("admin.challenges.saveError"));
      return false;
    }
    setEditing(null);
    await load();
    return true;
  }

  function submit(v: ChallengeFormValues) {
    const fields = {
      title: v.title,
      description: v.description,
      goal: v.goal,
      rewardXp: v.rewardXp,
      rewardCoins: v.rewardCoins,
      badgeId: v.badgeId,
    };
    void (
      editing === "new"
        ? send("POST", path, { ...fields, startDate: v.startDate, endDate: v.endDate })
        : send("PATCH", `/api/admin/challenges/${(editing as AdminChallenge).id}`, {
            ...fields,
            endDate: v.endDate,
          })
    ).then((ok) => ok && setToast(t("admin.challenges.saved")));
  }

  return (
    <section aria-label={t("admin.challenges.program")} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-label text-text-muted">{t("admin.challenges.program")}</h2>
        {!editing && data && (
          <Button variant="ghost" size="s" icon="plus" onClick={() => setEditing("new")}>
            {t("admin.challenges.add")}
          </Button>
        )}
      </div>
      {failed && <ErrorCard message={t("admin.challenges.loadError")} />}
      {!data && !failed && <SkeletonRow />}
      {data && editing && (
        <ChallengeForm
          key={editing === "new" ? "new" : editing.id}
          kind="program"
          {...(editing !== "new" ? { initial: editing } : {})}
          badges={data.badges}
          modules={modules}
          drills={drills}
          busy={busy}
          error={error}
          label={t("admin.challenges.add")}
          onSubmit={submit}
          onCancel={() => setEditing(null)}
        />
      )}
      {data && data.challenges.length === 0 && !editing && (
        <p className="type-body-s text-text-secondary">{t("admin.challenges.programNone")}</p>
      )}
      {data && data.challenges.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.challenges.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-m border border-border bg-surface-1 px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-strong break-words">{c.title}</span>
                <span className="type-caption text-text-secondary">
                  {t("admin.challenges.window", {
                    from: formatCalendarDate(istDay(c.windowStart)),
                    to: formatCalendarDate(istDay(c.windowEnd, -1)),
                  })}{" "}
                  · {t("xp.gain", { n: c.rewardXp })} ·{" "}
                  {t("admin.challenges.joined", { n: c.joined })}
                </span>
              </span>
              <Chip kind="status" status={STATE[c.state].status} compact>
                {t(STATE[c.state].key)}
              </Chip>
              {c.state !== "ended" && (
                <Button variant="ghost" size="s" onClick={() => setEditing(c)}>
                  {t("admin.challenges.edit")}
                </Button>
              )}
              {c.state === "scheduled" && (
                <Button
                  variant="text"
                  size="s"
                  onClick={() =>
                    void send("DELETE", `/api/admin/challenges/${c.id}`).then(
                      (ok) => ok && setToast(t("admin.challenges.removed")),
                    )
                  }
                >
                  {t("admin.challenges.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
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
