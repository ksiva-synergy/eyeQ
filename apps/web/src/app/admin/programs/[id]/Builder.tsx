"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  builderProgramSchema,
  publishCheckSchema,
  type BuilderProgram,
  type PublishCheck,
} from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Button, Chip, ErrorCard, Icon, SkeletonRow, Toast } from "@eyeq/ui/web";
import { api } from "../api";
import { DrillEditor, ModuleEditor, ProgramSettings, SessionEditor, type Run } from "./Editors";
import { issueText } from "./issues";
import { ProgramChallenges } from "./ProgramChallenges";
import { moveDrill, moveSession, orderOf, type Order } from "./order";
import { Tree, type Selection } from "./Tree";

function PublishPanel({ check, refused }: { check: PublishCheck; refused: PublishCheck | null }) {
  const shown = refused ?? check;
  return (
    <section
      aria-label={t("admin.builder.check.title")}
      className="flex flex-col gap-2 rounded-l border border-border bg-surface-1 p-4"
    >
      <span className="type-label text-text-muted">{t("admin.builder.check.title")}</span>
      {shown.ok ? (
        <span className="flex items-center gap-1.5 text-sm font-bold text-success-text">
          <Icon name="check" size={16} />
          {t("admin.builder.check.ok")}
        </span>
      ) : (
        <ul
          className="flex flex-col gap-1"
          data-testid="publish-problems"
          role={refused ? "alert" : undefined}
        >
          {shown.problems.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-sm font-bold text-cta-text">
              <Icon name="alert" size={16} className="mt-0.5" />
              <span>{issueText(p)}</span>
            </li>
          ))}
        </ul>
      )}
      {shown.warnings.length > 0 && (
        <div className="flex flex-col gap-1 rounded-m border border-warning-border bg-warning-subtle p-3">
          <span className="type-label text-warning-text">{t("admin.builder.check.warnings")}</span>
          <ul className="flex flex-col gap-1">
            {shown.warnings.map((w, i) => (
              <li key={i} className="text-sm font-bold text-warning-text">
                {issueText(w)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function Builder({ id }: { id: string }) {
  const [program, setProgram] = useState<BuilderProgram | null>(null);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<Selection>({ kind: "program" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refused, setRefused] = useState<PublishCheck | null>(null);

  const load = useCallback(async () => {
    const r = await api<unknown>("GET", `/api/admin/programs/${id}`);
    if (!r.ok) return setFailed(true);
    setFailed(false);
    setProgram(builderProgramSchema.parse(r.data));
  }, [id]);

  useEffect(() => {
    let live = true;
    void api<unknown>("GET", `/api/admin/programs/${id}`).then((r) => {
      if (!live) return;
      if (!r.ok) return setFailed(true);
      setProgram(builderProgramSchema.parse(r.data));
    });
    return () => {
      live = false;
    };
  }, [id]);

  const run: Run = useCallback(
    async (method, url, body, done) => {
      setBusy(true);
      setError(null);
      setRefused(null);
      const r = await api<unknown>(method, url, body);
      setBusy(false);
      if (!r.ok) {
        const parsed = publishCheckSchema.safeParse({
          ok: false,
          problems: r.details?.["problems"],
          warnings: r.details?.["warnings"] ?? [],
        });
        if (parsed.success) setRefused(parsed.data);
        else setError(r.message);
        return false;
      }
      const tree = builderProgramSchema.safeParse(r.data);
      if (tree.success) setProgram(tree.data);
      else await load();
      if (done) setToast(done);
      return true;
    },
    [load],
  );

  const reorder = (order: Order) =>
    void run("POST", `/api/admin/programs/${id}/reorder`, { modules: order });

  const back = (
    <Link
      href="/admin/programs"
      className="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary-text"
    >
      <Icon name="chevron" size={16} className="rotate-180" />
      {t("admin.builder.back")}
    </Link>
  );

  if (failed)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorCard message={t("admin.builder.loadError")} onRetry={() => void load()} />
      </div>
    );
  if (!program)
    return (
      <div className="flex flex-col gap-2">
        {back}
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );

  const p = program;
  const sessions = p.modules.flatMap((m) => m.sessions);
  const drillCount = sessions.reduce((n, s) => n + s.drills.length, 0);
  const problems = p.check.problems.length;
  // The selection falls back to the settings when what it pointed at is gone.
  const exists =
    selection.kind === "program" ||
    (selection.kind === "module" && p.modules.some((m) => m.id === selection.id)) ||
    (selection.kind === "session" && sessions.some((s) => s.id === selection.id)) ||
    (selection.kind === "drill" &&
      sessions.some(
        (s) => s.id === selection.sessionId && s.drills.some((d) => d.id === selection.id),
      ));
  const sel: Selection = exists ? selection : { kind: "program" };
  const selectedDrill =
    sel.kind === "drill"
      ? sessions.find((s) => s.id === sel.sessionId)?.drills.find((d) => d.id === sel.id)
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="type-label text-text-muted">{t("admin.programs.eyebrow")}</span>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
            {p.title}
          </h1>
          <span className="flex flex-wrap items-center gap-2 text-sm text-text-secondary tabular-nums">
            {t("admin.builder.meta", {
              days: p.durationDays,
              modules: p.modules.length,
              sessions: sessions.length,
              drills: drillCount,
            })}
            <Chip kind="status" status={p.status === "published" ? "done" : "pending"} compact>
              {t(`admin.programs.status.${p.status}`)}
            </Chip>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "published" ? (
            <Button
              variant="ghost"
              size="m"
              loading={busy}
              onClick={() =>
                void run(
                  "POST",
                  `/api/admin/programs/${p.id}/unpublish`,
                  undefined,
                  t("admin.builder.unpublished"),
                )
              }
            >
              {t("admin.builder.unpublish")}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="m"
              loading={busy}
              onClick={() =>
                void run(
                  "POST",
                  `/api/admin/programs/${p.id}/publish`,
                  undefined,
                  t("admin.builder.published"),
                )
              }
              {...(problems > 0
                ? {
                    disabledReason:
                      problems === 1
                        ? t("admin.builder.fixFirstOne")
                        : t("admin.builder.fixFirst", { n: problems }),
                  }
                : {})}
            >
              {t("admin.builder.publish")}
            </Button>
          )}
        </div>
      </div>

      <PublishPanel check={p.check} refused={refused} />
      {error && <ErrorCard message={error} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22.5rem),1fr))] items-start gap-5">
        <Tree
          program={p}
          selection={sel}
          onSelect={setSelection}
          onReorder={reorder}
          busy={busy}
          onAddModule={() =>
            void run(
              "POST",
              `/api/admin/programs/${p.id}/modules`,
              { title: t("admin.builder.newModule") },
              t("admin.builder.saved"),
            )
          }
          onAddDrill={(sessionId) => setSelection({ kind: "session", id: sessionId })}
        />
        <div className="flex min-w-0 flex-col gap-5">
          {sel.kind === "program" && (
            <ProgramSettings key={p.updatedAt} program={p} run={run} busy={busy} />
          )}
          {sel.kind === "module" && (
            <ModuleEditor
              key={`${sel.id}-${p.updatedAt}`}
              program={p}
              moduleId={sel.id}
              run={run}
              busy={busy}
            />
          )}
          {sel.kind === "session" && (
            <SessionEditor
              key={`${sel.id}-${p.updatedAt}`}
              program={p}
              sessionId={sel.id}
              run={run}
              busy={busy}
              onMove={(toModuleId) => {
                const order = orderOf(p);
                const target = order.find((m) => m.id === toModuleId);
                if (target) reorder(moveSession(order, sel.id, toModuleId, target.sessions.length));
              }}
            />
          )}
          {sel.kind === "drill" && selectedDrill && (
            <DrillEditor
              key={JSON.stringify(selectedDrill)}
              program={p}
              sessionId={sel.sessionId}
              drill={selectedDrill}
              run={run}
              busy={busy}
              onMove={(toSessionId) => {
                const order = orderOf(p);
                const target = order.flatMap((m) => m.sessions).find((s) => s.id === toSessionId);
                if (!target) return;
                reorder(
                  moveDrill(order, sel.sessionId, sel.id, toSessionId, target.drillIds.length),
                );
                setSelection({ kind: "drill", sessionId: toSessionId, id: sel.id });
              }}
            />
          )}
        </div>
      </div>

      <ProgramChallenges program={p} />

      {toast && (
        <Toast
          message={toast}
          onDismiss={() => setToast(null)}
          className="fixed right-5 bottom-5 z-(--eyeq-z-toast)"
        />
      )}
    </div>
  );
}
