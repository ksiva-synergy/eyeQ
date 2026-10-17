"use client";

import { useRef, useState } from "react";
import type { PurchasesResponse, SubscriptionCancelResponse } from "@eyeq/api-contract";
import { formatDate, formatRupees, t, type MessageKey } from "@eyeq/i18n";
import { Button, Card, Chip, Icon, Sheet } from "@eyeq/ui/web";
import { v1 } from "@/lib/athlete-api";
import { clientId } from "@/lib/client-id";

const STATUS: Record<"active" | "grace" | "ended", MessageKey> = {
  active: "account.pay.status.active",
  grace: "account.pay.status.grace",
  ended: "account.pay.status.ended",
};

/**
 * Account · Purchases (board 14, plan phase 7): the Pro subscription as Razorpay last
 * reported it, with Cancel (at the end of the paid period), and every payment with what
 * it bought and that entitlement's state. Status is a word as well as a chip colour.
 */
export function Payments({ data, timeZone }: { data: PurchasesResponse; timeZone: string }) {
  const [sub, setSub] = useState(data.subscription);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const date = (iso: string | null) => (iso ? formatDate(iso, timeZone) : "");

  async function cancel() {
    setBusy(true);
    key.current ??= clientId();
    const r = await v1<SubscriptionCancelResponse>(
      "POST",
      "/purchases/razorpay/subscription/cancel",
      undefined,
      { idempotencyKey: key.current },
    );
    setBusy(false);
    setAsking(false);
    if (!r.ok) {
      setMessage(t("account.pay.cancelFailed"));
      return;
    }
    key.current = null;
    setSub(
      sub && {
        ...sub,
        renews: false,
        cancelRequestedAt: new Date().toISOString(),
        currentEnd: r.data.endsAt ?? sub.currentEnd,
      },
    );
    setMessage(t("account.pay.cancelDone", { date: date(r.data.endsAt) }));
  }

  const live = sub && ["active", "authenticated", "pending"].includes(sub.providerStatus);

  return (
    <div className="flex flex-col gap-3">
      {sub && live && (
        <Card className="flex flex-col gap-2.5">
          <span className="flex items-center gap-2 type-body-strong">
            <Icon name="check" size={20} className="text-primary-text" />
            {t("account.pro")}
          </span>
          <span className="type-caption text-text-secondary">
            {sub.renews
              ? t("account.pay.renewsOn", { date: date(sub.currentEnd) })
              : t("account.pay.cancelled", { date: date(sub.currentEnd) })}
          </span>
          {sub.renews && (
            <Button variant="ghost" size="m" onClick={() => setAsking(true)}>
              {t("account.pay.cancel")}
            </Button>
          )}
        </Card>
      )}
      {message && (
        <p role="status" className="type-body-s text-text-secondary">
          {message}
        </p>
      )}

      <h3 className="type-label text-text-muted">{t("account.pay.history")}</h3>
      {data.purchases.length === 0 ? (
        <p className="type-body-s text-text-secondary">{t("account.pay.none")}</p>
      ) : (
        <Card padding="s" className="flex flex-col divide-y divide-border px-4">
          {data.purchases.map((p) => (
            <div key={p.paymentId} className="flex min-h-11 flex-wrap items-center gap-3 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-strong break-words">{p.title}</span>
                <span className="type-caption text-text-secondary">
                  {t("account.pay.row", {
                    price: formatRupees(p.amountPaise),
                    date: date(p.paidAt),
                  })}
                  {p.endsAt && p.entitlementStatus !== "ended"
                    ? ` · ${t("account.pay.endsOn", { date: date(p.endsAt) })}`
                    : ""}
                </span>
              </span>
              <Chip
                kind="status"
                status={
                  p.entitlementStatus === "ended"
                    ? "ended"
                    : p.entitlementStatus === "grace"
                      ? "atRisk"
                      : "done"
                }
                compact
                icon={null}
              >
                {t(STATUS[p.entitlementStatus])}
              </Chip>
            </div>
          ))}
        </Card>
      )}
      {data.billingEmail && (
        <p className="type-caption text-text-secondary">
          {t("account.pay.receiptEmail", { email: data.billingEmail })}
        </p>
      )}
      <p className="type-caption text-text-muted">{t("account.pay.invoice")}</p>

      <Sheet
        open={asking}
        onClose={() => setAsking(false)}
        title={t("account.pay.cancelTitle")}
        actions={
          <>
            <Button variant="ghost" size="m" onClick={() => setAsking(false)}>
              {t("account.pay.cancelKeep")}
            </Button>
            <Button variant="cta" size="m" loading={busy} onClick={() => void cancel()}>
              {t("account.pay.cancelConfirm")}
            </Button>
          </>
        }
      >
        <p className="type-body-s text-text-secondary">
          {t("account.pay.cancelBody", { date: date(sub?.currentEnd ?? null) })}
        </p>
      </Sheet>
    </div>
  );
}
