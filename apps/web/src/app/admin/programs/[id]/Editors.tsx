"use client";
import type React from "react";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  adminProductsResponseSchema,
  drillAccesses,
  drillLibraryResponseSchema,
  linkCheckResultSchema,
  type AdminProduct,
  type BuilderDrill,
  type BuilderProgram,
  type LinkCheckResult,
  uploadResultSchema,
} from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";
import { Button, Chip, SegmentedControl, TextInput, Toggle, cx } from "@eyeq/ui/web";
import { parseVideoLink } from "@/lib/video-link";
import { api } from "../api";
import { clock, reasonText } from "./issues";
import { LinkGlyph, sessionLabel } from "./Tree";

/** Runs a mutation; resolves true when it succeeded (the builder refreshes and toasts). */
export type Run = (
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
  done?: string,
) => Promise<boolean>;

// ---------------------------------------------------------------- small pieces

function Select({
  label,
  name,
  value,
  defaultValue,
  onChange,
  children,
  hint,
}: {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="type-label text-text-muted">
        {label}
      </label>
      <select
        id={id}
        name={name}
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={(e) => onChange?.(e.target.value)}
        className="eyeq-hit-field w-full min-w-0 bg-surface-2 px-3 text-sm font-bold"
      >
        {children}
      </select>
      {hint && <span className="type-caption text-text-secondary">{hint}</span>}
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-label text-text-muted">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full resize-y rounded-control border border-border bg-surface-2 px-3 py-2.5 text-sm leading-normal font-bold"
      />
    </div>
  );
}

const grid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3";
const panel = "flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-5";
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const optInt = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Math.round(Number(v));
};

function useProducts() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  useEffect(() => {
    let live = true;
    void api<unknown>("GET", "/api/admin/products").then((r) => {
      if (live && r.ok) setProducts(adminProductsResponseSchema.parse(r.data).products);
    });
    return () => {
      live = false;
    };
  }, []);
  return products;
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">{children}</div>
  );
}

function ConfirmDelete({
  label,
  onConfirm,
  busy,
}: {
  label: string;
  onConfirm: () => void;
  busy: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <Button variant="ghost" size="m" className="text-cta-text" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-sm font-bold">{t("admin.builder.confirmDelete")}</span>
      <Button variant="ghost" size="m" onClick={() => setAsking(false)}>
        {t("admin.programs.cancel")}
      </Button>
      <Button variant="cta" size="m" loading={busy} onClick={onConfirm}>
        {t("admin.builder.confirm")}
      </Button>
    </span>
  );
}

/** Uploads one image (the server writes the variants) and hands back its URL. */
function ImageField({
  label,
  alt,
  kind,
  value,
  onChange,
}: {
  label: string;
  alt: string;
  kind: "cover" | "thumbnail";
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    try {
      const res = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: form,
      });
      const json = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const issues = (json as { details?: { issues?: { message: string }[] } } | null)?.details
          ?.issues;
        setError(issues?.map((i) => i.message).join("; ") || t("admin.builder.uploadError"));
      } else onChange(uploadResultSchema.parse(json).url);
    } catch {
      setError(t("admin.builder.uploadError"));
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-label text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Storage URL, already resized
          <img
            src={value}
            alt={alt}
            className="h-20 w-36 rounded-m border border-border object-cover"
          />
        ) : (
          <span className="flex h-20 w-36 items-center justify-center rounded-m border border-dashed border-border type-caption text-text-muted">
            {t("admin.builder.noImage")}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={id}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-m border border-border bg-surface-2 px-5 type-button focus-within:outline-2 focus-within:outline-focus-ring"
          >
            {busy
              ? t("admin.builder.uploading")
              : value
                ? t("admin.builder.replace")
                : t("admin.builder.upload")}
            <input
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
          {value && (
            <Button variant="ghost" size="m" onClick={() => onChange(null)}>
              {t("admin.builder.removeImage")}
            </Button>
          )}
        </div>
      </div>
      <span
        role={error ? "alert" : undefined}
        className={cx("type-caption", error ? "font-bold text-cta-text" : "text-text-secondary")}
      >
        {error ?? t("admin.builder.uploadHint")}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- program settings

export function ProgramSettings({
  program,
  run,
  busy,
}: {
  program: BuilderProgram;
  run: Run;
  busy: boolean;
}) {
  const products = useProducts().filter((p) => p.kind === "program");
  const [isFree, setFree] = useState(program.isFree);
  const [inPro, setInPro] = useState(program.inSubscription);
  const [cover, setCover] = useState(program.coverUrl);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      "PATCH",
      `/api/admin/programs/${program.id}`,
      {
        title: str(f, "title"),
        slug: str(f, "slug"),
        durationDays: Number(f.get("days")),
        description: optStr(f, "description"),
        coachLine: optStr(f, "coachLine"),
        level: optStr(f, "level"),
        sportTags: str(f, "sports")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        isFree,
        inSubscription: inPro,
        coverUrl: cover,
        productId: optStr(f, "productId"),
        completionXp: optInt(f, "completionXp"),
        minLevel: Number(f.get("minLevel")) || 1,
      },
      t("admin.builder.saved"),
    );
  }

  return (
    <form onSubmit={save} className={panel} aria-label={t("admin.builder.settings")}>
      <span className="type-label text-text-muted">{t("admin.builder.settings")}</span>
      <TextInput
        dense
        name="title"
        label={t("admin.builder.field.title")}
        defaultValue={program.title}
        required
      />
      <div className={grid}>
        <TextInput
          dense
          name="slug"
          label={t("admin.builder.field.slug")}
          hint={t("admin.builder.field.slugHint")}
          defaultValue={program.slug}
          required
        />
        <TextInput
          dense
          name="days"
          type="number"
          min="1"
          max="365"
          label={t("admin.builder.field.days")}
          defaultValue={String(program.durationDays)}
          required
        />
        <TextInput
          dense
          name="level"
          label={t("admin.builder.field.level")}
          defaultValue={program.level ?? ""}
        />
        <TextInput
          dense
          name="sports"
          label={t("admin.builder.field.sports")}
          defaultValue={program.sportTags.join(", ")}
        />
      </div>
      <ImageField
        label={t("admin.builder.cover")}
        alt={t("admin.builder.coverAlt")}
        kind="cover"
        value={cover}
        onChange={setCover}
      />
      <TextArea
        name="description"
        label={t("admin.builder.field.description")}
        defaultValue={program.description ?? ""}
      />
      <TextInput
        dense
        name="coachLine"
        label={t("admin.builder.field.coachLine")}
        defaultValue={program.coachLine ?? ""}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-x-6">
        <Toggle label={t("admin.builder.field.free")} checked={isFree} onChange={setFree} />
        <Toggle label={t("admin.builder.field.inPro")} checked={inPro} onChange={setInPro} />
      </div>
      <div className={grid}>
        <Select
          name="productId"
          label={t("admin.builder.field.product")}
          defaultValue={program.productId ?? ""}
          hint={t("admin.builder.field.productHint")}
        >
          <option value="">{t("admin.builder.field.noProduct")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <TextInput
          dense
          name="completionXp"
          type="number"
          min="0"
          label={t("admin.builder.field.completionXp")}
          defaultValue={program.completionXp === null ? "" : String(program.completionXp)}
        />
        <TextInput
          dense
          name="minLevel"
          type="number"
          min="1"
          label={t("admin.builder.field.minLevel")}
          defaultValue={String(program.minLevel)}
        />
      </div>
      <Footer>
        <Button type="submit" variant="primary" size="m" loading={busy}>
          {t("admin.builder.saveSettings")}
        </Button>
      </Footer>
    </form>
  );
}

// ---------------------------------------------------------------- module

export function ModuleEditor({
  program,
  moduleId,
  run,
  busy,
}: {
  program: BuilderProgram;
  moduleId: string;
  run: Run;
  busy: boolean;
}) {
  const m = program.modules.find((x) => x.id === moduleId)!;
  const [rule, setRule] = useState(m.unlockRule);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      "PATCH",
      `/api/admin/modules/${m.id}`,
      {
        title: str(f, "title"),
        description: optStr(f, "description"),
        unlockRule: rule,
        unlockDay: rule === "on_day" ? optInt(f, "unlockDay") : null,
      },
      t("admin.builder.saved"),
    );
  }

  return (
    <form onSubmit={save} className={panel} aria-label={t("admin.builder.module")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-label text-text-muted">{t("admin.builder.module")}</span>
        <Button
          variant="ghost"
          size="s"
          icon="plus"
          onClick={() =>
            void run("POST", `/api/admin/modules/${m.id}/sessions`, {}, t("admin.builder.saved"))
          }
        >
          {t("admin.builder.addSession")}
        </Button>
      </div>
      <TextInput
        dense
        name="title"
        label={t("admin.builder.field.title")}
        defaultValue={m.title}
        required
      />
      <TextArea
        name="description"
        label={t("admin.builder.field.description")}
        defaultValue={m.description ?? ""}
        rows={2}
      />
      <div className={grid}>
        <Select
          label={t("admin.builder.unlock")}
          value={rule}
          onChange={(v) => setRule(v as typeof rule)}
        >
          {(["immediate", "after_previous", "on_day"] as const).map((r) => (
            <option key={r} value={r}>
              {t(`admin.builder.unlock.${r}`)}
            </option>
          ))}
        </Select>
        {rule === "on_day" && (
          <TextInput
            dense
            name="unlockDay"
            type="number"
            min="1"
            label={t("admin.builder.unlockDay")}
            defaultValue={m.unlockDay === null ? "" : String(m.unlockDay)}
            required
          />
        )}
      </div>
      <Footer>
        <ConfirmDelete
          label={t("admin.builder.deleteModule")}
          busy={busy}
          onConfirm={() =>
            void run("DELETE", `/api/admin/modules/${m.id}`, undefined, t("admin.builder.saved"))
          }
        />
        <Button type="submit" variant="primary" size="m" loading={busy}>
          {t("admin.builder.saveModule")}
        </Button>
      </Footer>
    </form>
  );
}

// ---------------------------------------------------------------- session

type Parsed = {
  line: number;
  text: string;
  status: "ok" | "duplicate" | "invalid";
  provider?: string;
};

/** One link per line, parsed as the coach types (COMPONENTS 4.1); the server checks each. */
export function parseLines(text: string): Parsed[] {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((l) => l.raw !== "")
    .map(({ raw, line }) => {
      const link = parseVideoLink(raw);
      if (!link) return { line, text: raw, status: "invalid" as const };
      const k = `${link.provider}:${link.ref}`;
      if (seen.has(k))
        return { line, text: raw, status: "duplicate" as const, provider: link.provider };
      seen.add(k);
      return { line, text: raw, status: "ok" as const, provider: link.provider };
    });
}

function BulkPaste({
  program,
  sessionId,
  run,
  busy,
}: {
  program: BuilderProgram;
  sessionId: string;
  run: Run;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [into, setInto] = useState(sessionId);
  const lines = useMemo(() => parseLines(text), [text]);
  const ok = lines.filter((l) => l.status === "ok");
  const count = (s: Parsed["status"]) => lines.filter((l) => l.status === s).length;
  const id = useId();

  async function add() {
    const links = ok.map((l) => l.text).join("\n");
    if (
      await run(
        "POST",
        `/api/admin/sessions/${into}/drills/bulk`,
        { links },
        t("admin.builder.bulkAdded", { n: ok.length }),
      )
    )
      setText("");
  }

  return (
    <div className="flex flex-col gap-3 rounded-m border border-dashed border-border p-4">
      <span className="type-label text-text-muted">{t("admin.builder.bulk")}</span>
      <label htmlFor={id} className="type-caption font-bold text-text-secondary">
        {t("admin.builder.bulkLabel")}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        className="w-full resize-y rounded-control border border-border bg-surface-2 px-3 py-2.5 font-mono text-sm"
      />
      {lines.length > 0 && (
        <>
          <span className="flex flex-wrap gap-1.5">
            <Chip kind="status" status="done" compact>
              {t("admin.builder.bulkReady", { n: ok.length })}
            </Chip>
            {count("duplicate") > 0 && (
              <Chip kind="status" status="pending" compact>
                {t("admin.builder.bulkDuplicate", { n: count("duplicate") })}
              </Chip>
            )}
            {count("invalid") > 0 && (
              <Chip kind="status" status="atRisk" icon="cross" compact>
                {t("admin.builder.bulkInvalid", { n: count("invalid") })}
              </Chip>
            )}
          </span>
          <ul
            className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm"
            aria-label={t("admin.builder.bulk")}
          >
            {lines.map((l) => (
              <li key={l.line} className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-right type-caption text-text-muted tabular-nums">
                  {l.line}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{l.text}</span>
                <span
                  className={cx(
                    "shrink-0 type-caption font-bold",
                    l.status === "ok"
                      ? "text-success-text"
                      : l.status === "invalid"
                        ? "text-cta-text"
                        : "text-text-secondary",
                  )}
                >
                  {l.status === "ok"
                    ? t("admin.builder.bulkLineOk", {
                        provider: t(`admin.builder.provider.${l.provider}` as MessageKey),
                      })
                    : l.status === "duplicate"
                      ? t("admin.builder.bulkLineDuplicate")
                      : t("admin.builder.bulkLineInvalid")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[min(100%,12rem)] flex-1">
          <Select label={t("admin.builder.bulkInto")} value={into} onChange={setInto}>
            {program.modules.flatMap((m) =>
              m.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionLabel(s)}
                </option>
              )),
            )}
          </Select>
        </div>
        <Button
          variant="primary"
          size="m"
          loading={busy}
          onClick={() => void add()}
          {...(ok.length === 0 ? { disabledReason: t("admin.builder.bulkReady", { n: 0 }) } : {})}
        >
          {t("admin.builder.bulkAdd", { n: ok.length })}
        </Button>
      </div>
    </div>
  );
}

function AddDrill({ sessionId, run, busy }: { sessionId: string; run: Run; busy: boolean }) {
  const [search, setSearch] = useState("");
  const [library, setLibrary] = useState<
    { id: string; title: string; useCount: number; linkStatus: BuilderDrill["linkStatus"] }[]
  >([]);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void api<unknown>(
        "GET",
        `/api/admin/drills${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
      ).then((r) => {
        if (live && r.ok) setLibrary(drillLibraryResponseSchema.parse(r.data).drills);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search]);

  async function addNew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const title = str(f, "title");
    if (
      await run(
        "POST",
        `/api/admin/sessions/${sessionId}/drills`,
        { drill: { videoUrl: str(f, "videoUrl"), ...(title ? { title } : {}) } },
        t("admin.builder.saved"),
      )
    )
      form.reset();
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
      <form
        onSubmit={addNew}
        className="flex flex-col gap-3"
        aria-label={t("admin.builder.newDrill")}
      >
        <span className="type-label text-text-muted">{t("admin.builder.newDrill")}</span>
        <TextInput dense name="videoUrl" label={t("admin.builder.video")} required />
        <TextInput dense name="title" label={t("admin.builder.drillName")} />
        <Button type="submit" variant="ghost" size="m" icon="plus" loading={busy}>
          {t("admin.builder.addDrill")}
        </Button>
      </form>
      <div className="flex min-w-0 flex-col gap-3">
        <span className="type-label text-text-muted">{t("admin.builder.reuseDrill")}</span>
        <TextInput
          dense
          type="search"
          label={t("admin.builder.searchDrills")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ul className="flex max-h-56 flex-col overflow-y-auto">
          {library.length === 0 && (
            <li className="text-sm text-text-secondary">{t("admin.builder.noDrills")}</li>
          )}
          {library.map((d) => (
            <li
              key={d.id}
              className="flex min-h-11 items-center gap-2 border-b border-border last:border-b-0"
            >
              <LinkGlyph status={d.linkStatus} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold">{d.title}</span>
                <span className="type-caption text-text-muted">
                  {t("admin.builder.usedTimes", { n: d.useCount })}
                </span>
              </span>
              <Button
                variant="ghost"
                size="s"
                onClick={() =>
                  void run(
                    "POST",
                    `/api/admin/sessions/${sessionId}/drills`,
                    { drillId: d.id },
                    t("admin.builder.saved"),
                  )
                }
              >
                {t("admin.builder.useDrill")}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SessionEditor({
  program,
  sessionId,
  run,
  busy,
  onMove,
}: {
  program: BuilderProgram;
  sessionId: string;
  run: Run;
  busy: boolean;
  onMove: (toModuleId: string) => void;
}) {
  const m = program.modules.find((x) => x.sessions.some((s) => s.id === sessionId))!;
  const s = m.sessions.find((x) => x.id === sessionId)!;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      "PATCH",
      `/api/admin/sessions/${s.id}`,
      { title: optStr(f, "title"), estMinutes: Number(f.get("estMinutes")) || 15 },
      t("admin.builder.saved"),
    );
  }

  return (
    <div className={panel}>
      <form
        onSubmit={save}
        className="flex flex-col gap-4"
        aria-label={t("admin.builder.session", { day: s.dayNumber })}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="type-label text-text-muted">
            {t("admin.builder.session", { day: s.dayNumber })}
          </span>
          <Button
            variant="ghost"
            size="s"
            onClick={() =>
              void run(
                "POST",
                `/api/admin/sessions/${s.id}/duplicate`,
                undefined,
                t("admin.builder.saved"),
              )
            }
          >
            {t("admin.builder.duplicate")}
          </Button>
        </div>
        <div className={grid}>
          <TextInput
            dense
            name="title"
            label={t("admin.builder.sessionTitle")}
            defaultValue={s.title ?? ""}
          />
          <TextInput
            dense
            name="estMinutes"
            type="number"
            min="1"
            label={t("admin.builder.estMinutes")}
            defaultValue={String(s.estMinutes)}
          />
          <Select label={t("admin.builder.moveTo")} value={m.id} onChange={onMove}>
            {program.modules.map((x) => (
              <option key={x.id} value={x.id}>
                {t("admin.builder.moduleRow", { n: x.order, title: x.title })}
              </option>
            ))}
          </Select>
        </div>
        <Footer>
          <ConfirmDelete
            label={t("admin.builder.deleteSession")}
            busy={busy}
            onConfirm={() =>
              void run("DELETE", `/api/admin/sessions/${s.id}`, undefined, t("admin.builder.saved"))
            }
          />
          <Button type="submit" variant="primary" size="m" loading={busy}>
            {t("admin.builder.saveSession")}
          </Button>
        </Footer>
      </form>
      <AddDrill sessionId={s.id} run={run} busy={busy} />
      <BulkPaste program={program} sessionId={s.id} run={run} busy={busy} />
    </div>
  );
}

// ---------------------------------------------------------------- drill

function LinkStatusLine({
  check,
}: {
  check: Pick<LinkCheckResult, "status" | "reason" | "durationSeconds" | "privacy">;
}) {
  const text =
    check.status === "ok"
      ? check.durationSeconds !== null
        ? t("admin.builder.found", {
            duration: clock(check.durationSeconds),
            privacy: check.privacy ?? "",
          })
        : t("admin.builder.foundNoDuration", { privacy: check.privacy ?? "" })
      : check.status === "broken"
        ? reasonText(check.reason)
        : check.reason
          ? reasonText(check.reason)
          : t("admin.builder.notChecked");
  return (
    <span
      role="status"
      className={cx(
        "flex items-center gap-1.5 type-caption font-bold",
        check.status === "ok"
          ? "text-success-text"
          : check.status === "broken"
            ? "text-cta-text"
            : "text-text-secondary",
      )}
    >
      <LinkGlyph status={check.status} />
      {text}
    </span>
  );
}

export function DrillEditor({
  program,
  sessionId,
  drill,
  run,
  busy,
  onMove,
}: {
  program: BuilderProgram;
  sessionId: string;
  drill: BuilderDrill;
  run: Run;
  busy: boolean;
  onMove: (toSessionId: string) => void;
}) {
  const products = useProducts().filter((p) => p.kind === "drill");
  const [tags, setTags] = useState<{ slug: string; name: string }[]>([]);
  const [targetType, setTargetType] = useState(drill.targetType);
  const [scoreType, setScoreType] = useState(drill.scoreType);
  const [direction, setDirection] = useState(drill.scoreDirection);
  const [access, setAccess] = useState(drill.access);
  const [url, setUrl] = useState(drill.videoUrl);
  const [check, setCheck] = useState<LinkCheckResult | null>(null);
  const [thumbnail, setThumbnail] = useState(drill.thumbnailUrl);
  const [checking, setChecking] = useState(false);
  const day =
    program.modules.flatMap((m) => m.sessions).find((s) => s.id === sessionId)?.dayNumber ?? 0;
  const paid = access === "ppv" || (access === "included" && !program.isFree);
  const provider =
    check?.provider ??
    (url === drill.videoUrl ? drill.videoProvider : parseVideoLink(url)?.provider);

  useEffect(() => {
    let live = true;
    void api<{ tags: { slug: string; name: string }[] }>("GET", "/api/admin/measurement-tags").then(
      (r) => {
        if (live && r.ok) setTags(r.data.tags);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  async function runCheck() {
    setChecking(true);
    const r = await api<unknown>("POST", "/api/admin/link-check", { url });
    setChecking(false);
    if (r.ok) setCheck(linkCheckResultSchema.parse(r.data));
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      "PATCH",
      `/api/admin/drills/${drill.id}`,
      {
        title: str(f, "title"),
        videoUrl: url.trim(),
        thumbnailUrl: thumbnail,
        measurementTag: optStr(f, "measurementTag"),
        xp: optInt(f, "xp"),
        targetType,
        targetValue: targetType === "none" ? null : optInt(f, "targetValue"),
        targetLabel: optStr(f, "targetLabel"),
        durationMinutes: Number(f.get("durationMinutes")) || 1,
        restSeconds: optInt(f, "restSeconds"),
        scoreType,
        scoreDirection: direction,
        scoreUnit: scoreType === "number" ? optStr(f, "scoreUnit") : null,
        access,
        coinPrice: access === "ppv" ? optInt(f, "coinPrice") : null,
        ppvProductId: access === "ppv" ? optStr(f, "ppvProductId") : null,
        minLevel: Number(f.get("minLevel")) || 1,
        instructions: str(f, "instructions")
          .split(/\r?\n/)
          .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
          .filter(Boolean),
      },
      t("admin.builder.saved"),
    );
  }

  const sessions = program.modules.flatMap((m) => m.sessions);
  const uses = drill.usedIn.length;

  return (
    <form onSubmit={save} className={panel} aria-label={t("admin.builder.drill", { day })}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-label text-text-muted">{t("admin.builder.drill", { day })}</span>
        <Chip compact icon={null}>
          {uses === 1 ? t("admin.builder.usedInOne") : t("admin.builder.usedIn", { n: uses })}
        </Chip>
      </div>
      {uses > 1 && (
        <div className="flex flex-col gap-1 rounded-m bg-surface-2 p-3 type-caption text-text-secondary">
          <span className="font-bold text-text-primary">{t("admin.builder.reuseNote")}</span>
          <ul className="flex flex-col">
            {drill.usedIn.map((u) => (
              <li key={u.sessionId}>
                {t("admin.builder.usedInList", { program: u.programTitle, day: u.dayNumber })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <TextInput
        dense
        name="title"
        label={t("admin.builder.drillName")}
        defaultValue={drill.title}
        required
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <TextInput
            dense
            className="flex-1"
            name="videoUrl"
            label={t("admin.builder.video")}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setCheck(null);
            }}
            required
          />
          <Button variant="ghost" size="m" loading={checking} onClick={() => void runCheck()}>
            {checking ? t("admin.builder.checking") : t("admin.builder.check")}
          </Button>
        </div>
        <LinkStatusLine
          check={
            check ?? {
              status: drill.linkStatus,
              reason: drill.linkReason as LinkCheckResult["reason"],
              durationSeconds: drill.videoDurationSeconds,
              privacy: drill.videoPrivacy,
            }
          }
        />
        {provider === "drive" && paid && (
          <span className="flex items-center gap-1.5 rounded-control border border-warning-border bg-warning-subtle px-2.5 py-1.5 type-caption font-bold text-warning-text">
            {t("admin.builder.drivePaid")}
          </span>
        )}
      </div>
      {provider === "drive" && (
        <ImageField
          label={t("admin.builder.thumbnail")}
          alt={t("admin.builder.thumbnailAlt")}
          kind="thumbnail"
          value={thumbnail}
          onChange={setThumbnail}
        />
      )}
      <div className={grid}>
        <Select
          name="measurementTag"
          label={t("admin.builder.area")}
          defaultValue={drill.measurementTag ?? ""}
        >
          <option value="">{t("admin.builder.noArea")}</option>
          {tags.map((tag) => (
            <option key={tag.slug} value={tag.slug}>
              {tag.name}
            </option>
          ))}
        </Select>
        <TextInput
          dense
          name="xp"
          type="number"
          min="0"
          label={t("admin.builder.xp", { xp: program.defaults.drillXp })}
          defaultValue={drill.xp === null ? "" : String(drill.xp)}
        />
        <TextInput
          dense
          name="durationMinutes"
          type="number"
          min="1"
          label={t("admin.builder.duration")}
          defaultValue={String(drill.durationMinutes)}
        />
        <TextInput
          dense
          name="restSeconds"
          type="number"
          min="0"
          label={t("admin.builder.rest")}
          defaultValue={drill.restSeconds === null ? "" : String(drill.restSeconds)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-text-muted">{t("admin.builder.targetType")}</span>
        <SegmentedControl
          label={t("admin.builder.targetType")}
          value={targetType}
          onChange={(v) => setTargetType(v as typeof targetType)}
          options={(["reps", "seconds", "none"] as const).map((v) => ({
            value: v,
            label: t(`admin.builder.target.${v}`),
          }))}
        />
      </div>
      {targetType !== "none" && (
        <div className={grid}>
          <TextInput
            dense
            name="targetValue"
            type="number"
            min="0"
            label={t("admin.builder.targetValue")}
            defaultValue={drill.targetValue === null ? "" : String(drill.targetValue)}
          />
          <TextInput
            dense
            name="targetLabel"
            label={t("admin.builder.targetLabel")}
            defaultValue={drill.targetLabel ?? ""}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-text-muted">{t("admin.builder.scoreType")}</span>
        <SegmentedControl
          label={t("admin.builder.scoreType")}
          value={scoreType}
          onChange={(v) => setScoreType(v as typeof scoreType)}
          options={(["number", "rating", "none"] as const).map((v) => ({
            value: v,
            label: t(`admin.builder.score.${v}`),
          }))}
        />
      </div>
      {scoreType === "number" && (
        <div className={grid}>
          <Select
            label={t("admin.builder.scoreDirection")}
            value={direction}
            onChange={(v) => setDirection(v as typeof direction)}
          >
            <option value="higher">{t("admin.builder.direction.higher")}</option>
            <option value="lower">{t("admin.builder.direction.lower")}</option>
          </Select>
          <TextInput
            dense
            name="scoreUnit"
            label={t("admin.builder.scoreUnit")}
            defaultValue={drill.scoreUnit ?? ""}
          />
        </div>
      )}
      <Select
        label={t("admin.builder.access")}
        value={access}
        onChange={(v) => setAccess(v as typeof access)}
      >
        {drillAccesses.map((a) => (
          <option key={a} value={a}>
            {t(`admin.builder.access.${a}`)}
          </option>
        ))}
      </Select>
      {access === "ppv" && (
        <div className={grid}>
          <TextInput
            dense
            name="coinPrice"
            type="number"
            min="0"
            label={t("admin.builder.coinPrice", { coins: program.defaults.coinDrillPrice })}
            defaultValue={drill.coinPrice === null ? "" : String(drill.coinPrice)}
          />
          <Select
            name="ppvProductId"
            label={t("admin.builder.ppvProduct")}
            defaultValue={drill.ppvProductId ?? ""}
          >
            <option value="">{t("admin.builder.field.noProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className={grid}>
        <TextInput
          dense
          name="minLevel"
          type="number"
          min="1"
          label={t("admin.builder.minLevel")}
          defaultValue={String(drill.minLevel)}
        />
        <Select label={t("admin.builder.moveTo")} value={sessionId} onChange={onMove}>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {sessionLabel(s)}
            </option>
          ))}
        </Select>
      </div>
      <TextArea
        name="instructions"
        label={t("admin.builder.instructions")}
        defaultValue={drill.instructions.map((l, i) => `${i + 1}. ${l}`).join("\n")}
        rows={4}
      />
      <Footer>
        <Button
          variant="ghost"
          size="m"
          className="text-cta-text"
          onClick={() =>
            void run(
              "DELETE",
              `/api/admin/sessions/${sessionId}/drills/${drill.id}`,
              undefined,
              t("admin.builder.saved"),
            )
          }
        >
          {t("admin.builder.removeDrill")}
        </Button>
        <Button type="submit" variant="primary" size="m" loading={busy}>
          {t("admin.builder.saveDrill")}
        </Button>
      </Footer>
    </form>
  );
}
