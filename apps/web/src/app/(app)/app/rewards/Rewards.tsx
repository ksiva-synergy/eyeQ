"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  RewardItem,
  RewardPurchaseResponse,
  RewardsResponse,
  UnlockableDrill,
} from "@eyeq/api-contract";
import { formatNumber, formatRupees, t, type MessageKey } from "@eyeq/i18n";
import { Button, Card, Chip, Icon, Sheet, Toast, cx } from "@eyeq/ui/web";
import { BuyButton } from "@/components/purchase/BuyButton";
import { v1 } from "@/lib/athlete-api";
import { clientId } from "@/lib/client-id";

type Pending = { item: RewardItem; drill?: UnlockableDrill };

const ERRORS: Record<string, MessageKey> = {
  insufficient_coins: "rewards.error.coins",
  freeze_cap_reached: "rewards.error.cap",
  already_unlocked: "rewards.error.unlocked",
};

/**
 * Board 12 (plan phase 6, 6.5): the coin balance and the P0 spends, a streak freeze and a
 * drill unlock. Frames, vouchers and real-world rewards are shown and marked as coming
 * (phase 10). Coins are never sold (D4). Every balance shown after a spend is the
 * server's answer, never a sum made here (rule 1); a retry reuses its idempotency key.
 */
export function Rewards({
  data,
  ppv = {},
}: {
  data: RewardsResponse;
  /** Drills also sold on their own: pay once with Razorpay instead of coins (phase 7). */
  ppv?: Record<string, { productId: string; pricePaise: number }>;
}) {
  const router = useRouter();
  const [coins, setCoins] = useState(data.coins);
  const [held, setHeld] = useState(data.freezesHeld);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const attempt = useRef<{ key: string; for: string } | null>(null);

  async function buy(p: Pending) {
    const target = `${p.item.id}:${p.drill?.id ?? ""}`;
    if (attempt.current?.for !== target) attempt.current = { key: clientId(), for: target };
    setBusy(true);
    const r = await v1<RewardPurchaseResponse>(
      "POST",
      "/rewards/purchase",
      { itemId: p.item.id, ...(p.drill ? { drillId: p.drill.id } : {}) },
      { idempotencyKey: attempt.current.key },
    );
    setBusy(false);
    setPending(null);
    if (r.ok) {
      attempt.current = null;
      setCoins(r.data.coinsBalance);
      setHeld(r.data.freezesHeld);
      setToast({
        ok: true,
        message:
          r.data.kind === "freeze"
            ? t("rewards.bought.freeze", { held: r.data.freezesHeld })
            : t("rewards.bought.drill", { title: p.drill?.title ?? "" }),
      });
      router.refresh();
      return;
    }
    const reason = typeof r.details?.["reason"] === "string" ? r.details["reason"] : "";
    // A refused spend is final; only a lost answer is worth the same key again.
    if (r.status > 0 && r.status < 500) attempt.current = null;
    setToast({ ok: false, message: t(ERRORS[reason] ?? "rewards.error") });
  }

  const freeze = data.items.find((i) => i.kind === "freeze");
  const unlock = data.items.find((i) => i.kind === "drill_unlock");
  const later = data.items.filter((i) => !i.available);

  return (
    <div className="flex flex-col gap-4 md:max-w-[48rem] md:gap-5">
      <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
        {t("rewards.title")}
      </h1>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <Icon name="coin" size={28} className="self-center text-xp-text" />
          <span
            className="font-display text-[2.75rem] leading-none font-bold text-xp-text tabular-nums"
            data-testid="coin-balance"
          >
            {formatNumber(coins)}
          </span>
          <span className="type-body-strong text-text-secondary">{t("rewards.coins")}</span>
        </span>
        {data.coinsThisWeek > 0 && (
          <Chip kind="xp" compact>
            {t("rewards.thisWeek", { n: data.coinsThisWeek })}
          </Chip>
        )}
      </Card>
      <p className="type-body-s text-text-secondary">{t("rewards.note")}</p>

      <section aria-label={t("rewards.spend")} className="flex flex-col gap-2.5">
        <h2 className="type-label text-text-muted">{t("rewards.spend")}</h2>
        <ul className="grid gap-2.5 md:grid-cols-2">
          {freeze && (
            <Item
              item={freeze}
              sub={t("rewards.freezeSub", { held, max: data.freezeMax })}
              coins={coins}
              blocked={held >= data.freezeMax ? t("rewards.atCap") : null}
              action={t("rewards.buy")}
              onAction={() => setPending({ item: freeze })}
            />
          )}
          {unlock && (
            <Item
              item={unlock}
              sub={unlock.description ?? ""}
              coins={coins}
              blocked={null}
              action={t("rewards.choose")}
              onAction={() => setPicking(true)}
            />
          )}
          {later.map((i) => (
            <Item key={i.id} item={i} sub={i.description ?? ""} coins={coins} blocked={null} />
          ))}
        </ul>
        <p className="type-caption text-text-muted">{t("rewards.footnote")}</p>
      </section>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t("rewards.drills.title")}
        actions={
          <Button variant="ghost" size="m" onClick={() => setPicking(false)}>
            {t("common.close")}
          </Button>
        }
      >
        {data.unlockableDrills.length === 0 ? (
          <p className="type-body-s text-text-secondary">{t("rewards.drills.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.unlockableDrills.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-m border border-border bg-surface-1 p-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="type-body-strong break-words">{d.title}</span>
                  <span className="type-caption text-text-secondary">
                    {t("rewards.drills.line", {
                      program: d.programTitle,
                      min: d.durationMinutes ?? 0,
                    })}
                  </span>
                </span>
                <Button
                  variant="primary"
                  size="m"
                  {...(d.coinPrice > coins
                    ? { disabledReason: t("rewards.short", { n: d.coinPrice - coins }) }
                    : {})}
                  onClick={() => {
                    setPicking(false);
                    if (unlock)
                      setPending({ item: { ...unlock, coinPrice: d.coinPrice }, drill: d });
                  }}
                >
                  {t("rewards.drills.unlock", { n: d.coinPrice })}
                </Button>
                {ppv[d.id] && (
                  <BuyButton
                    productId={ppv[d.id]!.productId}
                    drillId={d.id}
                    surface="drill"
                    variant="ghost"
                    size="m"
                    label={t("pay.locked.buyDrill", { price: formatRupees(ppv[d.id]!.pricePaise) })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet
        open={pending !== null}
        onClose={() => !busy && setPending(null)}
        title={
          pending?.drill
            ? t("rewards.drills.confirm", { title: pending.drill.title })
            : t("rewards.confirm.freeze")
        }
        actions={
          pending && (
            <>
              <Button variant="ghost" size="m" onClick={() => !busy && setPending(null)}>
                {t("rewards.cancel")}
              </Button>
              <Button variant="cta" size="m" loading={busy} onClick={() => void buy(pending)}>
                {t("rewards.confirm.buy", { price: pending.item.coinPrice })}
              </Button>
            </>
          )
        }
      >
        {pending && (
          <p className="type-body">
            {t("rewards.confirm.body", {
              price: pending.item.coinPrice,
              after: Math.max(0, coins - pending.item.coinPrice),
            })}
          </p>
        )}
      </Sheet>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-gutter bottom-24 z-(--eyeq-z-toast) md:inset-x-auto md:right-8 md:bottom-8 md:w-96"
        >
          <Toast
            message={toast.message}
            icon={toast.ok ? "check" : "alert"}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
}

function Item({
  item,
  sub,
  coins,
  blocked,
  action,
  onAction,
}: {
  item: RewardItem;
  sub: string;
  coins: number;
  /** Why it cannot be bought now, besides the price (a freeze at the cap). */
  blocked: string | null;
  action?: string;
  onAction?: () => void;
}) {
  const short = item.kind !== "drill_unlock" && item.coinPrice > coins;
  const reason = !item.available
    ? t("rewards.soon")
    : blocked
      ? blocked
      : short
        ? t("rewards.short", { n: item.coinPrice - coins })
        : null;
  return (
    <li
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-l border p-card-padding",
        item.available
          ? "border-border bg-surface-1"
          : "border-dashed border-border bg-transparent",
      )}
    >
      <span className="flex min-w-[min(100%,10rem)] flex-1 flex-col gap-0.5">
        <span className="type-body-strong break-words">{item.title}</span>
        <span className="type-caption break-words text-text-secondary">{sub}</span>
      </span>
      <span
        className={cx(
          "flex items-center gap-1 type-body-strong tabular-nums",
          item.available && !short ? "text-xp-text" : "text-text-muted",
        )}
      >
        <Icon name="coin" size={16} />
        {t("rewards.price", { n: item.coinPrice })}
      </span>
      {action && onAction && (
        <Button
          variant="primary"
          size="m"
          onClick={onAction}
          {...(reason ? { disabledReason: reason } : {})}
        >
          {action}
        </Button>
      )}
      {!item.available && <Chip compact>{t("rewards.soon")}</Chip>}
    </li>
  );
}
