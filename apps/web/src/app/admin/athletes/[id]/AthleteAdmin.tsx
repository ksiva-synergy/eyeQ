"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  adminAthleteDetailSchema,
  adminEntitlementSchema,
  entitlementScopes,
  type AdminAthleteDetail,
  type AdminEntitlement,
  type AdminTimelineItem,
} from "@eyeq/api-contract";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeDay,
  t,
  type MessageKey,
} from "@eyeq/i18n";
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorCard,
  Icon,
  SegmentedControl,
  Sheet,
  SkeletonRow,
  TextInput,
  Toast,
} from "@eyeq/ui/web";
import { planChip, planKey } from "../plan";
import { clientId } from "@/lib/client-id";
import { useAdminTimeZone } from "../../time-zone";

type Scope = (typeof entitlementScopes)[number];

const scopeLabel = (s: string) => t(`admin.athletes.scope.${s}` as MessageKey);
const sourceLabel = (s: string) => t(`admin.athletes.source.${s}` as MessageKey);
const words = (code: string) => code.replace(/_/g, " ");

function timelineLine(i: AdminTimelineItem): string {
  switch (i.kind) {
    case "session":
      return t("admin.athletes.timeline.session", { title: i.title });
    case "xp":
      return t("admin.athletes.timeline.xp", { amount: i.amount, reason: words(i.reason) });
    case "badge":
      return t("admin.athletes.timeline.badge", { title: i.title });
    case "entitlement":
      return t("admin.athletes.timeline.entitlement", {
        scope: scopeLabel(i.scope),
        change: i.change,
        source: sourceLabel(i.source),
      });
    case "coins":
      return t("admin.athletes.timeline.coins", { amount: -i.amount, reason: words(i.reason) });
  }
}

const TIMELINE_ICON = {
  session: "check",
  xp: "xp",
  badge: "compete",
  entitlement: "lock",
  coins: "coin",
} as const;

/** Errors from the API: zod issues when there are any, else a generic line. */
async function errorMessage(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as {
    message?: string;
    details?: { issues?: { message: string }[] };
  } | null;
  return (
    j?.details?.issues?.map((i) => i.message).join("; ") ||
    j?.message ||
    t("admin.athletes.actionError")
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className="font-display text-2xl leading-none font-bold tabular-nums">{value}</span>
    </div>
  );
}

function EntitlementRow({
  e,
  onRevoke,
}: {
  e: AdminEntitlement;
  onRevoke: (e: AdminEntitlement) => void;
}) {
  const tz = useAdminTimeZone();
  const statusKey = e.active ? e.status : e.status === "ended" ? "ended" : "expired";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-extrabold">
          {e.scopeTitle ? `${scopeLabel(e.scope)} · ${e.scopeTitle}` : scopeLabel(e.scope)}
        </span>
        <span className="type-caption text-text-secondary">
          {[
            sourceLabel(e.source),
            t("admin.athletes.since", { date: formatDate(e.startsAt, tz) }),
            e.endsAt
              ? t("admin.athletes.until", { date: formatDate(e.endsAt, tz) })
              : t("admin.athletes.lifetime"),
          ].join(" · ")}
        </span>
        {e.events.at(-1)?.reason && (
          <span className="type-caption text-text-muted">{e.events.at(-1)?.reason}</span>
        )}
      </div>
      <Chip kind="status" status={e.active ? "done" : "ended"} compact>
        {t(`admin.athletes.status.${statusKey}` as MessageKey)}
      </Chip>
      {e.status !== "ended" && (
        <Button variant="ghost" size="s" onClick={() => onRevoke(e)}>
          {t("admin.athletes.revoke")}
        </Button>
      )}
    </li>
  );
}

export function AthleteAdmin({ id }: { id: string }) {
  const tz = useAdminTimeZone();
  const [athlete, setAthlete] = useState<AdminAthleteDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [granting, setGranting] = useState(false);
  const [scope, setScope] = useState<Scope>("program");
  const [revoking, setRevoking] = useState<AdminEntitlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/athletes/${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setFailed(true);
        setFailed(false);
        setAthlete(adminAthleteDetailSchema.parse(await res.json()));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  async function post(url: string, body: unknown, done: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": clientId() },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await errorMessage(res));
      return false;
    }
    adminEntitlementSchema.parse(await res.json());
    setToast(done);
    setAttempt((n) => n + 1);
    return true;
  }

  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ends = String(f.get("endsOn") ?? "");
    const ok = await post(
      `/api/admin/athletes/${id}/entitlements`,
      {
        scope,
        scopeId: scope === "subscription" ? null : String(f.get("scopeId") ?? "").trim(),
        // The end of that day in India, where every coach works.
        endsAt: ends ? `${ends}T23:59:59+05:30` : null,
        reason: String(f.get("reason") ?? ""),
      },
      t("admin.athletes.granted"),
    );
    if (ok) setGranting(false);
  }

  async function revoke(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!revoking) return;
    const f = new FormData(e.currentTarget);
    const ok = await post(
      `/api/admin/athletes/${id}/entitlements/${revoking.id}/revoke`,
      { reason: String(f.get("reason") ?? "") },
      t("admin.athletes.revoked"),
    );
    if (ok) setRevoking(null);
  }

  const back = (
    <Link
      href="/admin/athletes"
      className="inline-flex min-h-11 items-center gap-1 self-start font-bold text-primary-text"
    >
      <Icon name="chevron" size={16} className="rotate-180" />
      {t("admin.athletes.back")}
    </Link>
  );

  if (failed)
    return (
      <div className="flex flex-col gap-4">
        {back}
        <ErrorCard
          message={t("admin.athletes.loadError")}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  if (!athlete)
    return (
      <div className="flex flex-col gap-2">
        {back}
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );

  const a = athlete;
  return (
    <div className="flex flex-col gap-5">
      {back}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar initials={a.initials} size="l" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold [overflow-wrap:anywhere] uppercase">
            {a.displayName}
          </h1>
          <span className="text-text-secondary tabular-nums">
            {[
              a.phoneMasked ?? t("admin.athletes.noPhone"),
              [a.sport, a.playingLevel].filter(Boolean).join(" · "),
              t("admin.athletes.joined", { date: formatDate(a.joinedAt, tz) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Chip kind={planChip(a.plan)} icon={null} compact>
              {t(planKey(a.plan))}
            </Chip>
            {a.isMinor && <Chip compact>{t("admin.athletes.minor")}</Chip>}
            {a.visibility === "private" && <Chip compact>{t("admin.athletes.private")}</Chip>}
          </span>
        </div>
        <Button variant="primary" size="m" icon="plus" onClick={() => setGranting(true)}>
          {t("admin.athletes.grant")}
        </Button>
      </div>

      <Card className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-4 p-5">
        <Stat
          label={t("admin.athletes.stats.streak")}
          value={t("admin.athletes.streakDays", { n: a.currentStreak })}
        />
        <Stat label={t("admin.athletes.stats.best")} value={formatNumber(a.bestStreak)} />
        <Stat label={t("admin.athletes.stats.level")} value={formatNumber(a.level)} />
        <Stat label={t("admin.athletes.stats.xp")} value={formatNumber(a.totalXp)} />
        <Stat label={t("admin.athletes.stats.coins")} value={formatNumber(a.coins ?? 0)} />
        <Stat label={t("admin.athletes.stats.freezes")} value={formatNumber(a.freezesHeld ?? 0)} />
        <Stat
          label={t("admin.athletes.columns.lastActive")}
          value={a.lastActiveAt ? formatRelativeDay(a.lastActiveAt, tz) : t("admin.athletes.never")}
        />
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-2 p-5">
            <h2 className="type-title">{t("admin.athletes.entitlements")}</h2>
            {a.entitlements.length === 0 ? (
              <p className="text-text-secondary">{t("admin.athletes.entitlementsEmpty")}</p>
            ) : (
              <ul className="flex flex-col">
                {a.entitlements.map((e) => (
                  <EntitlementRow
                    key={e.id}
                    e={e}
                    onRevoke={(x) => {
                      setError(null);
                      setRevoking(x);
                    }}
                  />
                ))}
              </ul>
            )}
          </Card>
          <Card className="flex flex-col gap-2 p-5">
            <h2 className="type-title">{t("admin.athletes.programs")}</h2>
            {a.enrollments.length === 0 ? (
              <p className="text-text-secondary">{t("admin.athletes.programsEmpty")}</p>
            ) : (
              <ul className="flex flex-col">
                {a.enrollments.map((en) => (
                  <li
                    key={en.programId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-3 last:border-b-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-extrabold">{en.title}</span>
                      <span className="type-caption text-text-secondary">
                        {t("admin.athletes.enrolmentLine", {
                          date: formatDate(en.startedAt, tz),
                          day: en.currentDay,
                          days: en.durationDays,
                        })}
                      </span>
                    </span>
                    <Chip
                      kind="status"
                      status={en.completedAt ? "done" : en.isActive ? "new" : "ended"}
                      icon={null}
                      compact
                    >
                      {en.completedAt
                        ? t("admin.athletes.enrolment.done")
                        : en.isActive
                          ? t("admin.athletes.enrolment.active")
                          : t("admin.athletes.enrolment.paused")}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-2 p-5">
          <h2 className="type-title">{t("admin.athletes.timeline")}</h2>
          {a.timeline.length === 0 ? (
            <EmptyState icon="progress" title={t("admin.athletes.timelineEmpty")} />
          ) : (
            <ol className="flex flex-col">
              {a.timeline.map((i, n) => (
                <li
                  key={`${i.at}-${n}`}
                  className="flex items-start gap-3 border-b border-border py-2.5 last:border-b-0"
                >
                  <span className="mt-0.5 text-text-muted">
                    <Icon name={TIMELINE_ICON[i.kind]} size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm">{timelineLine(i)}</span>
                    <span className="type-caption text-text-muted tabular-nums">
                      {formatDateTime(i.at, tz)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Sheet
        open={granting}
        onClose={() => setGranting(false)}
        title={t("admin.athletes.grantTitle")}
      >
        <form onSubmit={grant} className="flex flex-col gap-4">
          <p className="text-text-secondary">{t("admin.athletes.grantBody")}</p>
          <div className="flex flex-col gap-1.5">
            <span className="type-label text-text-muted">{t("admin.athletes.grantScope")}</span>
            <SegmentedControl
              label={t("admin.athletes.grantScope")}
              value={scope}
              onChange={(v) => setScope(v as Scope)}
              options={entitlementScopes.map((s) => ({ value: s, label: scopeLabel(s) }))}
              className="flex-wrap"
            />
          </div>
          {scope !== "subscription" && (
            <TextInput dense name="scopeId" label={t("admin.athletes.grantScopeId")} required />
          )}
          <TextInput
            dense
            name="endsOn"
            type="date"
            label={t("admin.athletes.grantEnds")}
            hint={t("admin.athletes.grantEndsHint")}
          />
          <TextInput
            dense
            name="reason"
            label={t("admin.athletes.reason")}
            required
            minLength={3}
          />
          {error && <ErrorCard message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="m" onClick={() => setGranting(false)}>
              {t("admin.athletes.cancel")}
            </Button>
            <Button type="submit" variant="primary" size="m" loading={busy}>
              {t("admin.athletes.grantSubmit")}
            </Button>
          </div>
        </form>
      </Sheet>

      <Sheet
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={t("admin.athletes.revokeTitle")}
      >
        <form onSubmit={revoke} className="flex flex-col gap-4">
          {revoking && (
            <p className="font-bold">
              {revoking.scopeTitle
                ? `${scopeLabel(revoking.scope)} · ${revoking.scopeTitle}`
                : scopeLabel(revoking.scope)}
            </p>
          )}
          <TextInput
            dense
            name="reason"
            label={t("admin.athletes.reason")}
            required
            minLength={3}
          />
          {error && <ErrorCard message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="m" onClick={() => setRevoking(null)}>
              {t("admin.athletes.cancel")}
            </Button>
            <Button type="submit" variant="primary" size="m" loading={busy}>
              {t("admin.athletes.revokeConfirm")}
            </Button>
          </div>
        </form>
      </Sheet>

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
