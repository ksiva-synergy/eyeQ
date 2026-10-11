"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminProgramsResponseSchema,
  builderProgramSchema,
  type AdminProgramListItem,
} from "@eyeq/api-contract";
import { formatRelativeDay, t } from "@eyeq/i18n";
import { Button, Chip, EmptyState, ErrorCard, SkeletonRow, TextInput } from "@eyeq/ui/web";
import { api } from "./api";

export function ProgramsAdmin() {
  const router = useRouter();
  const [programs, setPrograms] = useState<AdminProgramListItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void api<unknown>("GET", "/api/admin/programs").then((r) => {
      if (!live) return;
      if (!r.ok) return setFailed(true);
      setFailed(false);
      setPrograms(adminProgramsResponseSchema.parse(r.data).programs);
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api<unknown>("POST", "/api/admin/programs", {
      title: String(f.get("title") ?? "").trim(),
      durationDays: Number(f.get("days")) || 14,
    });
    setBusy(false);
    if (!r.ok) return setError(r.message || t("admin.programs.createError"));
    router.push(`/admin/programs/${builderProgramSchema.parse(r.data).id}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("admin.programs.eyebrow")}</span>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
            {t("admin.programs.title")}
          </h1>
        </div>
        {!creating && (
          <Button variant="primary" size="m" icon="plus" onClick={() => setCreating(true)}>
            {t("admin.programs.new")}
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={create}
          aria-label={t("admin.programs.new")}
          className="flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-5"
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
            <TextInput
              dense
              name="title"
              label={t("admin.programs.name")}
              required
              maxLength={120}
            />
            <TextInput
              dense
              name="days"
              type="number"
              min="1"
              max="365"
              defaultValue="14"
              label={t("admin.programs.days")}
              required
            />
          </div>
          {error && <ErrorCard message={error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="m" loading={busy}>
              {t("admin.programs.create")}
            </Button>
            <Button variant="ghost" size="m" onClick={() => setCreating(false)}>
              {t("admin.programs.cancel")}
            </Button>
          </div>
        </form>
      )}

      {failed ? (
        <ErrorCard
          message={t("admin.programs.loadError")}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : programs === null ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : programs.length === 0 ? (
        <EmptyState
          icon="builder"
          title={t("admin.programs.empty")}
          body={t("admin.programs.emptyBody")}
        />
      ) : (
        <div className="overflow-x-auto rounded-l border border-border bg-surface-1">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border type-label text-text-muted">
                <th className="px-4 py-3">{t("admin.programs.columns.program")}</th>
                <th className="px-4 py-3">{t("admin.programs.columns.status")}</th>
                <th className="px-4 py-3">{t("admin.programs.columns.structure")}</th>
                <th className="px-4 py-3">{t("admin.programs.columns.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/programs/${p.id}`}
                      className="flex min-h-11 flex-col justify-center font-extrabold text-primary-text underline-offset-2 hover:underline"
                    >
                      {p.title}
                      <span className="type-caption font-bold text-text-muted">{p.slug}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Chip
                      kind="status"
                      status={p.status === "published" ? "done" : "pending"}
                      compact
                    >
                      {t(`admin.programs.status.${p.status}`)}
                    </Chip>
                  </td>
                  <td className="px-4 py-2 text-text-secondary tabular-nums">
                    {t("admin.programs.structure", {
                      days: p.durationDays,
                      modules: p.moduleCount,
                      sessions: p.sessionCount,
                      drills: p.drillCount,
                    })}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">
                    {formatRelativeDay(p.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
