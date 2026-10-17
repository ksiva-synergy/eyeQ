"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { LandingCoach } from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import { Button, SkeletonRow, TextInput, Toast } from "@eyeq/ui/web";
import { api } from "../programs/api";

/**
 * The coach on public program pages (board 15). Content the coach stands behind (D15):
 * nothing shows until it is written here. Numbers are "value | label", one per line.
 */
export function CoachEditor() {
  const [coach, setCoach] = useState<LandingCoach | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void api<LandingCoach>("GET", "/api/admin/landing-coach").then((r) => {
      if (r.ok) setCoach(r.data);
    });
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    const r = await api<LandingCoach>("PATCH", "/api/admin/landing-coach", {
      name: s("name"),
      title: s("title"),
      bio: s("bio"),
      stats: s("stats")
        .split("\n")
        .map((l) => l.split("|").map((p) => p.trim()))
        .filter((p) => p[0] && p[1])
        .map(([value, label]) => ({ value: value!, label: label! })),
    });
    setBusy(false);
    if (r.ok) {
      setCoach(r.data);
      setToast(t("admin.coach.saved"));
    } else setToast(r.message);
  }

  if (!coach) return <SkeletonRow />;
  return (
    <form
      onSubmit={save}
      aria-label={t("admin.coach.title")}
      className="flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-5"
    >
      <span className="type-label text-text-muted">{t("admin.coach.title")}</span>
      <p className="type-caption text-text-secondary">{t("admin.coach.hint")}</p>
      <TextInput dense name="name" label={t("admin.coach.name")} defaultValue={coach.name} />
      <TextInput dense name="title" label={t("admin.coach.role")} defaultValue={coach.title} />
      <Area name="bio" label={t("admin.coach.bio")} value={coach.bio} rows={4} />
      <Area
        name="stats"
        label={t("admin.coach.stats")}
        value={coach.stats.map((x) => `${x.value} | ${x.label}`).join("\n")}
      />
      <Button type="submit" variant="primary" size="m" loading={busy}>
        {t("admin.coach.save")}
      </Button>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </form>
  );
}

function Area({
  name,
  label,
  value,
  rows = 3,
}: {
  name: string;
  label: string;
  value: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-label text-text-muted">{label}</span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={value}
        className="w-full rounded-m border border-border bg-surface-2 px-3.5 py-2.5 text-sm font-bold text-text-primary focus:border-primary focus:outline-none"
      />
    </label>
  );
}
