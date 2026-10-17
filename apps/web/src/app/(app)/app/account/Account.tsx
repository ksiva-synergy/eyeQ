"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  playingLevels,
  sessionMinutes,
  type EntitlementsResponse,
  type LevelProgress,
  type MeResponse,
  type PatchMeRequest,
  type ProgramCard,
  type PurchasesResponse,
} from "@eyeq/api-contract";
import { formatDate, formatNumber, t, type MessageKey } from "@eyeq/i18n";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Icon,
  Pill,
  SegmentedControl,
  Sheet,
  TextInput,
  Toggle,
  cx,
} from "@eyeq/ui/web";
import Link from "next/link";
import { PushOptIn } from "@/components/notify/PushOptIn";
import { Payments } from "@/components/purchase/Payments";
import { NextLink } from "@/components/shell/NextLink";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { GOALS, SPORTS, sportKey } from "@/app/onboarding/options";
import { v1 } from "@/lib/athlete-api";
import { clientId } from "@/lib/client-id";

type Props = {
  me: MeResponse;
  entitlements: EntitlementsResponse["entitlements"];
  programs: ProgramCard[];
  sessions: number;
  level: LevelProgress;
  badges: number;
  whatsapp: string | null;
  /** Payments and the subscription (phase 7); absent in previews without them. */
  purchases?: PurchasesResponse;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

/**
 * Board 14. Every change is a PATCH /me with its own idempotency key (rule 6), shown
 * optimistically and put back if the server refuses. Date of birth is not shown or edited
 * here: it never leaves the server (rule 11).
 */
export function Account({
  me: initial,
  entitlements,
  programs,
  sessions,
  level,
  badges,
  whatsapp,
  purchases,
}: Props) {
  const router = useRouter();
  const [me, setMe] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [editing, setEditing] = useState(false);

  async function patch(change: PatchMeRequest, optimistic: Partial<MeResponse>) {
    const before = me;
    setMe((m) => ({ ...m, ...optimistic }));
    const r = await v1<MeResponse>("PATCH", "/me", change);
    if (r.ok) {
      setMe(r.data);
      setStatus("saved");
    } else {
      setMe(before);
      setStatus("error");
    }
  }

  const placeLine = [
    me.sport ? t(sportKey(me.sport)) : null,
    me.playingLevel ? t(`playingLevel.${me.playingLevel}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4 md:max-w-[48rem] md:gap-5">
      <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
        {t("account.title")}
      </h1>

      <Card className="flex items-center gap-3.5">
        <Avatar initials={initials(me.displayName)} size="l" me />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-display text-[1.625rem] leading-none font-bold break-words uppercase">
            {me.displayName}
          </span>
          {placeLine && <span className="type-caption text-text-secondary">{placeLine}</span>}
          <span className="flex flex-wrap gap-1.5">
            <Chip kind="selected" icon={null}>
              {t("account.levelChip", { level: level.level, title: level.title })}
            </Chip>
          </span>
        </div>
        <Button variant="ghost" size="s" onClick={() => setEditing(true)}>
          {t("account.edit")}
        </Button>
      </Card>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,4.75rem),1fr))] gap-2.5">
        <Stat
          value={formatNumber(me.stats.totalXp)}
          label={t("account.statXp")}
          tone="text-xp-text"
        />
        <Stat
          value={formatNumber(me.stats.currentStreak)}
          label={t("account.statStreak")}
          tone="text-streak-text"
        />
        <Stat value={formatNumber(sessions)} label={t("account.statSessions")} />
        <Stat
          value={formatNumber(badges)}
          label={t("account.statBadges")}
          href="/app/trophies"
          linkLabel={t("account.badgesLink", { n: badges })}
        />
      </dl>

      <Group title={t("account.purchases")}>
        <Purchases entitlements={entitlements} programs={programs} timeZone={me.timezone} />
        {purchases && <Payments data={purchases} timeZone={me.timezone} />}
      </Group>

      <Group title={t("account.notifications")}>
        <Card padding="s" className="flex flex-col divide-y divide-border px-4">
          <PushOptIn />
          <ToggleRow
            label={t("account.dailyReminder")}
            sub={t("account.dailyReminderAt", { time: me.reminderTime })}
            checked={me.notifications.daily}
            onChange={(v) =>
              void patch(
                { notifications: { daily: v } },
                { notifications: { ...me.notifications, daily: v } },
              )
            }
          />
          <div className="py-3">
            <TextInput
              label={t("account.reminderTime")}
              type="time"
              value={me.reminderTime}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{2}:\d{2}$/.test(v)) void patch({ reminderTime: v }, { reminderTime: v });
              }}
            />
          </div>
          <ToggleRow
            label={t("account.streakNudge")}
            sub={t("account.streakNudgeSub")}
            checked={me.notifications.streak}
            onChange={(v) =>
              void patch(
                { notifications: { streak: v } },
                { notifications: { ...me.notifications, streak: v } },
              )
            }
          />
          <ToggleRow
            label={t("account.challengeEnding")}
            sub={t("account.challengeEndingSub")}
            checked={me.notifications.challenge}
            onChange={(v) =>
              void patch(
                { notifications: { challenge: v } },
                { notifications: { ...me.notifications, challenge: v } },
              )
            }
          />
          <ToggleRow
            label={t("account.rankChanges")}
            sub={t("account.rankChangesSub")}
            checked={me.notifications.overtaken}
            onChange={(v) =>
              void patch(
                { notifications: { overtaken: v } },
                { notifications: { ...me.notifications, overtaken: v } },
              )
            }
          />
          <ToggleRow
            label={t("account.weeklyRecap")}
            sub={t("account.weeklyRecapSub")}
            checked={me.notifications.recap}
            onChange={(v) =>
              void patch(
                { notifications: { recap: v } },
                { notifications: { ...me.notifications, recap: v } },
              )
            }
          />
        </Card>
        <p className="type-caption text-text-muted">{t("account.notificationsNote")}</p>
        <NextLink
          href="/app/notifications"
          className="inline-flex min-h-11 items-center gap-1 self-start type-body-strong text-primary-text"
        >
          {t("feed.link")}
          <Icon name="chevron" size={14} />
        </NextLink>
      </Group>

      <Group title={t("account.privacy")}>
        <Card padding="s" className="flex flex-col divide-y divide-border px-4">
          <ToggleRow
            label={t("account.showOnBoards")}
            sub={t("account.showOnBoardsSub")}
            checked={me.visibility === "public"}
            onChange={(v) =>
              void patch(
                { visibility: v ? "public" : "private" },
                { visibility: v ? "public" : "private" },
              )
            }
          />
          {me.isMinor && (
            <p className="py-3 type-caption text-text-secondary">{t("account.minorNote")}</p>
          )}
          <div className="flex min-h-11 items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="type-body-strong">{t("account.displayName")}</span>
              <span className="type-caption text-text-secondary">
                {t("account.displayNameSub", { name: me.displayName })}
              </span>
            </div>
            <Button variant="text" size="m" onClick={() => setEditing(true)}>
              {t("account.edit")}
            </Button>
          </div>
        </Card>
      </Group>

      {whatsapp && (
        <a
          href={whatsapp}
          className="flex min-h-11 items-center gap-3 rounded-l border border-border bg-surface-1 p-4 text-text-primary no-underline"
        >
          <Icon name="whatsapp" size={24} className="shrink-0 text-success-text" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-body-strong">{t("account.help")}</span>
            <span className="type-caption text-text-secondary">{t("account.helpSub")}</span>
          </span>
          <Icon name="chevron" size={20} className="shrink-0 text-text-muted" />
        </a>
      )}

      <div className="flex flex-col items-start gap-3">
        <SignOutButton />
        <p className="type-caption text-text-muted">{t("account.footer")}</p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status === "saved" ? t("account.saved") : status === "error" ? t("account.saveError") : ""}
      </p>
      {status === "error" && (
        <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
          <Icon name="alert" size={16} />
          {t("account.saveError")}
        </p>
      )}

      <EditSheet
        open={editing}
        me={me}
        onClose={() => setEditing(false)}
        onSaved={(next) => {
          setMe(next);
          setEditing(false);
          setStatus("saved");
          router.refresh();
        }}
      />
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
  href,
  linkLabel,
}: {
  value: string;
  label: string;
  tone?: string;
  /** Board 14's "badges ›": the whole stat opens the trophy case. */
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="relative flex flex-col items-center gap-0.5 rounded-m border border-border bg-surface-1 px-2 py-3 text-center">
      <dd className={cx("font-display text-[1.625rem] leading-none font-bold tabular-nums", tone)}>
        {value}
      </dd>
      <dt className="inline-flex items-center gap-0.5 type-label text-text-muted">
        {label}
        {href && (
          <>
            <Icon name="chevron" size={12} />
            <Link href={href} aria-label={linkLabel} className="absolute inset-0 rounded-m" />
          </>
        )}
      </dt>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={title}>
      <h2 className="type-label text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <Toggle label={label} checked={checked} onChange={onChange} />
      <span className="pb-1 type-caption text-text-secondary">{sub}</span>
    </div>
  );
}

const SOURCE: Record<string, MessageKey> = {
  admin: "account.source.admin",
  coins: "account.source.coins",
  razorpay: "account.source.razorpay",
  play: "account.source.play",
  appstore: "account.source.appstore",
  credits: "account.source.credits",
};

function Purchases({
  entitlements,
  programs,
  timeZone,
}: {
  entitlements: EntitlementsResponse["entitlements"];
  programs: ProgramCard[];
  timeZone: string;
}) {
  const pro = entitlements.find((e) => e.scope === "subscription");
  const owned = new Set(entitlements.filter((e) => e.scope === "program").map((e) => e.scopeId));
  const rows: {
    key: string;
    title: string;
    sub: string;
    href?: string;
    icon: "check" | "lock" | "eye";
  }[] = [];
  if (pro) {
    rows.push({
      key: pro.id,
      title: t("account.pro"),
      sub:
        pro.status === "grace"
          ? t("account.inGrace")
          : pro.endsAt
            ? t("account.proUntil", { date: formatDate(pro.endsAt, timeZone) })
            : t("account.proLifetime"),
      icon: "check",
    });
  }
  for (const e of entitlements.filter((x) => x.scope === "program" || x.scope === "drill")) {
    rows.push({
      key: e.id,
      title: e.title ?? "",
      sub: t(e.scope === "drill" ? "account.drillOwned" : "account.programOwned", {
        source: t(SOURCE[e.source] ?? "account.source.admin"),
      }),
      icon: "check",
    });
  }
  for (const p of programs.filter((x) => x.enrollment && !owned.has(x.id))) {
    const day = Math.min(p.enrollment!.currentDay, p.durationDays);
    rows.push({
      key: `enrolled-${p.id}`,
      title: p.title,
      href: `/app/programs/${p.slug}`,
      sub: p.isFree
        ? p.enrollment!.completedAt
          ? t("account.programFreeDone")
          : t("account.programFree", { n: day, total: p.durationDays })
        : t("account.programIncluded", { n: day, total: p.durationDays }),
      icon: "eye",
    });
  }
  if (rows.length === 0) {
    return (
      <Card>
        <p className="type-body-s text-text-secondary">{t("account.noPurchases")}</p>
      </Card>
    );
  }
  return (
    <Card padding="s" className="flex flex-col divide-y divide-border px-4">
      {rows.map((r) => {
        const body = (
          <>
            <Icon name={r.icon} size={20} className="shrink-0 text-primary-text" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="type-body-strong">{r.title}</span>
              <span className="type-caption text-text-secondary">{r.sub}</span>
            </span>
            {r.href && <Icon name="chevron" size={18} className="shrink-0 text-text-muted" />}
          </>
        );
        return r.href ? (
          <NextLink
            key={r.key}
            href={r.href}
            className="flex min-h-11 items-center gap-3 py-3 text-text-primary no-underline"
          >
            {body}
          </NextLink>
        ) : (
          <div key={r.key} className="flex min-h-11 items-center gap-3 py-3">
            {body}
          </div>
        );
      })}
    </Card>
  );
}

function EditSheet({
  open,
  me,
  onClose,
  onSaved,
}: {
  open: boolean;
  me: MeResponse;
  onClose: () => void;
  onSaved: (me: MeResponse) => void;
}) {
  const [name, setName] = useState(me.displayName);
  const [sport, setSport] = useState(me.sport);
  const [level, setLevel] = useState<string | null>(me.playingLevel);
  const [goal, setGoal] = useState(me.goal);
  const [minutes, setMinutes] = useState(String(me.sessionMinutes));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = useRef({ body: "", id: "" });

  async function save() {
    if (!name.trim()) return;
    const body: PatchMeRequest = {
      displayName: name.trim(),
      sport,
      playingLevel: level as MeResponse["playingLevel"],
      goal,
      sessionMinutes: Number(minutes) as 10 | 15 | 20,
    };
    const json = JSON.stringify(body);
    if (key.current.body !== json) key.current = { body: json, id: clientId() };
    setBusy(true);
    setFailed(false);
    const r = await v1<MeResponse>("PATCH", "/me", body, { idempotencyKey: key.current.id });
    setBusy(false);
    if (r.ok) onSaved(r.data);
    else setFailed(true);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("account.editTitle")}
      actions={
        <Button variant="cta" fullWidth loading={busy} onClick={() => void save()}>
          {t("account.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {failed && (
          <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
            <Icon name="alert" size={16} />
            {t("account.saveError")}
          </p>
        )}
        <TextInput
          label={t("onb.profile.name")}
          hint={t("onb.profile.nameHint")}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <PillRow label={t("onb.profile.sport")}>
          {SPORTS.map((s) => (
            <Pill key={s} pressed={sport === s} onClick={() => setSport(s)}>
              {t(`sport.${s}`)}
            </Pill>
          ))}
        </PillRow>
        <PillRow label={t("onb.profile.level")}>
          {playingLevels.map((l) => (
            <Pill key={l} pressed={level === l} onClick={() => setLevel(l)}>
              {t(`playingLevel.${l}`)}
            </Pill>
          ))}
        </PillRow>
        <PillRow label={t("onb.profile.goal")}>
          {GOALS.map((g) => (
            <Pill key={g} pressed={goal === g} onClick={() => setGoal(g)}>
              {t(`goal.${g}`)}
            </Pill>
          ))}
        </PillRow>
        <div className="flex flex-col gap-2.5">
          <span className="type-label text-text-muted">{t("onb.profile.length")}</span>
          <SegmentedControl
            label={t("onb.profile.length")}
            value={minutes}
            onChange={setMinutes}
            options={sessionMinutes.map((m) => ({
              value: String(m),
              label: t("sessionLength.n", { n: m }),
            }))}
          />
        </div>
      </div>
    </Sheet>
  );
}

function PillRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="type-label text-text-muted" aria-hidden="true">
        {label}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}
