"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatNumber, t, type MessageKey } from "@eyeq/i18n";
import { Avatar, Button, Icon, TextInput } from "@eyeq/ui/web";
import type { QaAthlete } from "@/server/auth/qa-routes";

async function call(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

/** /qa: the master login form, then a searchable list of athletes to switch into. */
export function QaConsole({
  signedIn,
  current,
  initial,
}: {
  signedIn: boolean;
  current: string | null;
  initial: QaAthlete[];
}) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [athletes, setAthletes] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy("login");
    setError(null);
    const r = await call("/api/qa/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    setBusy(null);
    if (r.ok) router.refresh();
    else
      setError(
        r.status === 401
          ? "qa.error.credentials"
          : r.status === 429
            ? "qa.error.rate_limited"
            : "qa.error.generic",
      );
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    setBusy("search");
    const r = await call(`/api/qa/athletes?search=${encodeURIComponent(search)}`);
    setBusy(null);
    if (r.ok) setAthletes((r.data["athletes"] as QaAthlete[]) ?? []);
    else if (r.status === 401) router.refresh();
    else setError("qa.error.generic");
  }

  async function switchTo(userId: string) {
    setBusy(userId);
    setError(null);
    const r = await call("/api/qa/switch", { method: "POST", body: JSON.stringify({ userId }) });
    if (r.ok) {
      router.push("/app");
      return;
    }
    setBusy(null);
    setError("qa.error.generic");
  }

  async function end() {
    await call("/api/qa/end", { method: "POST" });
    router.refresh();
  }

  const alert = error && (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-m border border-cta-text px-3 py-2 type-body-s"
    >
      <Icon name="alert" size={16} className="shrink-0 text-cta-text" />
      {t(error)}
    </p>
  );

  if (!signedIn)
    return (
      <form onSubmit={signIn} className="flex flex-col gap-4">
        {alert}
        <TextInput
          label={t("qa.login")}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <TextInput
          label={t("qa.password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button variant="cta" fullWidth type="submit" loading={busy === "login"}>
          {t("qa.signIn")}
        </Button>
      </form>
    );

  return (
    <div className="flex flex-col gap-4">
      {alert}
      <form onSubmit={find} className="flex items-end gap-2">
        <div className="flex-1">
          <TextInput
            label={t("qa.search")}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" type="submit" loading={busy === "search"}>
          {t("qa.searchAction")}
        </Button>
      </form>
      {athletes.length === 0 ? (
        <p className="type-body text-text-secondary">{t("qa.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {athletes.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-m border border-border bg-surface-1 px-3 py-2"
            >
              <Avatar initials={a.initials} />
              <div className="min-w-0 flex-1">
                <p className="truncate type-body font-bold">{a.displayName}</p>
                <p className="truncate type-caption text-text-secondary">
                  {t("qa.row", { level: a.level, xp: formatNumber(a.totalXp), plan: a.plan })}
                  {a.phoneMasked ? ` · ${a.phoneMasked}` : ""}
                </p>
              </div>
              {a.id === current ? (
                <span className="type-label text-primary-text">{t("qa.current")}</span>
              ) : (
                <Button
                  variant="primary"
                  size="s"
                  loading={busy === a.id}
                  onClick={() => void switchTo(a.id)}
                >
                  {t("qa.switch")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="text" onClick={() => void end()}>
        {t("qa.end")}
      </Button>
    </div>
  );
}
