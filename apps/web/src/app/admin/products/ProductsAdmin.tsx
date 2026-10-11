"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminProductSchema,
  adminProductsResponseSchema,
  productKinds,
  type AdminProduct,
} from "@eyeq/api-contract";
import { LOCALE, t, type MessageKey } from "@eyeq/i18n";
import {
  Button,
  Chip,
  EmptyState,
  ErrorCard,
  SkeletonRow,
  TextInput,
  Toast,
  Toggle,
} from "@eyeq/ui/web";

type Kind = (typeof productKinds)[number];

const rupees = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function grantsLine(p: AdminProduct): string {
  const g = p.grants;
  switch (g.scope) {
    case "subscription":
      return t("admin.products.grants.subscription", { days: g.durationDays ?? 0 });
    case "program":
      return t("admin.products.grants.program", { id: (g.scopeId ?? "").slice(0, 8) });
    case "challenge":
      return t("admin.products.grants.challenge", { id: (g.scopeId ?? "").slice(0, 8) });
    case "credits":
      return t("admin.products.grants.credits", { n: g.credits ?? 0 });
    default:
      return t("admin.products.grants.drill");
  }
}

const kindKey = (k: Kind) => `admin.products.kind.${k}` as MessageKey;

/** The form's grants fields follow the kind (the API refuses a mismatch either way). */
function grantsFor(kind: Kind, f: FormData) {
  const n = (name: string) => {
    const v = Number(f.get(name));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  const id = (name: string) => String(f.get(name) ?? "").trim() || null;
  switch (kind) {
    case "subscription":
      return { scope: "subscription", durationDays: n("durationDays") };
    case "program":
      return { scope: "program", scopeId: id("scopeId") };
    case "challenge_entry":
      return { scope: "challenge", scopeId: id("scopeId") };
    case "credit_pack":
      return { scope: "credits", credits: n("credits") };
    default:
      return { scope: "drill" };
  }
}

export function ProductsAdmin() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [kind, setKind] = useState<Kind>("subscription");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/products", { cache: "no-store" });
    if (!res.ok) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setProducts(adminProductsResponseSchema.parse(await res.json()).products);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/products", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setLoadFailed(true);
        setProducts(adminProductsResponseSchema.parse(await res.json()).products);
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  function open(p: AdminProduct | "new") {
    setEditing(p);
    setKind(p === "new" ? "subscription" : p.kind);
    setActive(p === "new" ? true : p.active);
    setError(null);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const store = (name: string) => String(f.get(name) ?? "").trim() || null;
    const body = {
      title: String(f.get("title") ?? "").trim(),
      pricePaise: Math.round(Number(f.get("price")) * 100),
      grants: grantsFor(kind, f),
      playProductId: store("playProductId"),
      appstoreProductId: store("appstoreProductId"),
      razorpayPlanId: store("razorpayPlanId"),
      razorpayItemId: store("razorpayItemId"),
      active,
    };
    setBusy(true);
    setError(null);
    const res = await fetch(
      editing === "new" ? "/api/admin/products" : `/api/admin/products/${editing.id}`,
      {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(editing === "new" ? { kind, ...body } : body),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as {
        details?: { issues?: { message: string }[] };
      } | null;
      setError(
        j?.details?.issues?.map((i) => i.message).join("; ") || t("admin.products.saveError"),
      );
      return;
    }
    adminProductSchema.parse(await res.json());
    setEditing(null);
    setSaved(true);
    await load();
  }

  const current = editing && editing !== "new" ? editing : null;
  const g = current?.grants;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-label text-text-muted">{t("admin.products.eyebrow")}</span>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
            {t("admin.products.title")}
          </h1>
        </div>
        {!editing && (
          <Button variant="primary" size="m" icon="plus" onClick={() => open("new")}>
            {t("admin.products.new")}
          </Button>
        )}
      </div>

      {editing && (
        <form
          onSubmit={save}
          className="flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-5"
          aria-label={editing === "new" ? t("admin.products.new") : t("admin.products.edit")}
        >
          {editing === "new" ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-label text-text-muted">{t("admin.products.kind")}</span>
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="eyeq-hit-field bg-surface-2 px-3 text-sm font-bold"
              >
                {productKinds.map((k) => (
                  <option key={k} value={k}>
                    {t(kindKey(k))}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Chip>{t(kindKey(kind))}</Chip>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
            <TextInput
              dense
              name="title"
              label={t("admin.products.name")}
              defaultValue={current?.title ?? ""}
              required
            />
            <TextInput
              dense
              name="price"
              type="number"
              min="0"
              step="0.01"
              label={t("admin.products.price")}
              hint={t("admin.products.priceHint")}
              defaultValue={current ? String(current.pricePaise / 100) : ""}
              required
            />
            {kind === "subscription" && (
              <TextInput
                dense
                name="durationDays"
                type="number"
                min="1"
                label={t("admin.products.durationDays")}
                defaultValue={String(g?.durationDays ?? 30)}
              />
            )}
            {(kind === "program" || kind === "challenge_entry") && (
              <TextInput
                dense
                name="scopeId"
                label={
                  kind === "program"
                    ? t("admin.products.grantsProgram")
                    : t("admin.products.grantsChallenge")
                }
                defaultValue={g?.scopeId ?? ""}
              />
            )}
            {kind === "credit_pack" && (
              <TextInput
                dense
                name="credits"
                type="number"
                min="1"
                label={t("admin.products.credits")}
                defaultValue={String(g?.credits ?? 10)}
              />
            )}
            <TextInput
              dense
              name="playProductId"
              label={t("admin.products.play")}
              defaultValue={current?.playProductId ?? ""}
            />
            <TextInput
              dense
              name="appstoreProductId"
              label={t("admin.products.appstore")}
              defaultValue={current?.appstoreProductId ?? ""}
            />
            <TextInput
              dense
              name="razorpayPlanId"
              label={t("admin.products.razorpayPlan")}
              defaultValue={current?.razorpayPlanId ?? ""}
            />
            <TextInput
              dense
              name="razorpayItemId"
              label={t("admin.products.razorpayItem")}
              defaultValue={current?.razorpayItemId ?? ""}
            />
          </div>
          <Toggle
            label={t("admin.products.active")}
            checked={active}
            onChange={setActive}
            className="max-w-sm"
          />
          {error && <ErrorCard message={error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="m" loading={busy}>
              {editing === "new" ? t("admin.products.create") : t("admin.products.save")}
            </Button>
            <Button variant="ghost" size="m" onClick={() => setEditing(null)}>
              {t("admin.products.cancel")}
            </Button>
          </div>
        </form>
      )}

      {loadFailed ? (
        <ErrorCard message={t("admin.products.loadError")} onRetry={() => void load()} />
      ) : products === null ? (
        <div className="flex flex-col gap-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="coin"
          title={t("admin.products.empty")}
          body={t("admin.products.emptyBody")}
        />
      ) : (
        <div className="overflow-x-auto rounded-l border border-border bg-surface-1">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border type-label text-text-muted">
                <th className="px-4 py-3">{t("admin.products.columns.product")}</th>
                <th className="px-4 py-3">{t("admin.products.columns.price")}</th>
                <th className="px-4 py-3">{t("admin.products.columns.grants")}</th>
                <th className="px-4 py-3">{t("admin.products.columns.stores")}</th>
                <th className="px-4 py-3">{t("admin.products.columns.status")}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{t("admin.products.edit")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-bold">{p.title}</div>
                    <div className="type-caption text-text-secondary">{t(kindKey(p.kind))}</div>
                  </td>
                  <td className="px-4 py-3 font-bold tabular-nums">
                    {rupees.format(p.pricePaise / 100)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{grantsLine(p)}</td>
                  <td className="px-4 py-3 type-caption text-text-secondary">
                    {[p.playProductId, p.appstoreProductId, p.razorpayPlanId ?? p.razorpayItemId]
                      .filter(Boolean)
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-3">
                    <Chip kind="status" status={p.active ? "done" : "ended"} compact>
                      {p.active ? t("admin.products.active") : t("admin.products.inactive")}
                    </Chip>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="s" onClick={() => open(p)}>
                      {t("admin.products.edit")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {saved && (
        <Toast
          message={t("admin.products.saved")}
          onDismiss={() => setSaved(false)}
          className="fixed right-5 bottom-5 z-(--eyeq-z-toast)"
        />
      )}
    </div>
  );
}
