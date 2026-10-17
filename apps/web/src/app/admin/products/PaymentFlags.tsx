"use client";

import { useEffect, useState } from "react";
import type { PaymentFlag, PaymentFlagsResponse } from "@eyeq/api-contract";
import { formatDateTime, formatRupees, t, type MessageKey } from "@eyeq/i18n";
import { Button, Chip } from "@eyeq/ui/web";
import { useAdminTimeZone } from "../time-zone";
import { api } from "../programs/api";

const KIND: Record<PaymentFlag["kind"], MessageKey> = {
  partial_refund: "admin.flags.partial_refund",
  dispute_opened: "admin.flags.dispute_opened",
  dispute_won: "admin.flags.dispute_won",
  dispute_lost: "admin.flags.dispute_lost",
  dispute_closed: "admin.flags.dispute_closed",
  unmatched_payment: "admin.flags.unmatched_payment",
  amount_mismatch: "admin.flags.amount_mismatch",
};

/**
 * Payments to review (phase 7): what the processor flagged rather than acted on. A
 * partial refund changes no access; a lost dispute has already ended it. Resolving only
 * records that someone looked.
 */
export function PaymentFlags() {
  const tz = useAdminTimeZone();
  const [flags, setFlags] = useState<PaymentFlag[] | null>(null);
  useEffect(() => {
    void api<PaymentFlagsResponse>("GET", "/api/admin/payment-flags").then((r) => {
      if (r.ok) setFlags(r.data.flags);
    });
  }, []);
  async function resolve(id: string) {
    const r = await api<PaymentFlag>("POST", `/api/admin/payment-flags/${id}/resolve`, {});
    if (r.ok)
      setFlags(
        (f) => f?.map((x) => (x.id === id ? { ...x, resolvedAt: r.data.resolvedAt } : x)) ?? null,
      );
  }
  if (!flags) return null;
  return (
    <section aria-labelledby="flags-title" className="flex flex-col gap-3">
      <h2 id="flags-title" className="type-label text-text-muted">
        {t("admin.flags.title")}
      </h2>
      {flags.length === 0 ? (
        <p className="type-body-s text-text-secondary">{t("admin.flags.none")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-l border border-border bg-surface-1 px-4">
          {flags.map((f) => {
            const amount = f.detail["refund_amount"] ?? f.detail["amount"];
            return (
              <li key={f.id} className="flex min-h-11 flex-wrap items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-strong">{t(KIND[f.kind])}</span>
                  <span className="type-caption break-all text-text-secondary">
                    {[
                      f.athlete,
                      typeof amount === "number" ? formatRupees(amount) : null,
                      String(f.detail["payment_id"] ?? f.externalId),
                      formatDateTime(f.createdAt, tz),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {f.resolvedAt ? (
                  <Chip kind="status" status="done" compact icon={null}>
                    {t("admin.flags.resolved")}
                  </Chip>
                ) : (
                  <Button variant="ghost" size="m" onClick={() => void resolve(f.id)}>
                    {t("admin.flags.resolve")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
