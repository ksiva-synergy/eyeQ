import type { Tx } from "@eyeq/db";
import type { PaymentFlag, PaymentFlagsResponse } from "@eyeq/api-contract";
import { ApiError } from "../../api/errors";
import type { AuditEntry } from "../../api/admin";

/**
 * Payments to review (plan phase 7): what the processor flagged instead of changing
 * access (a partial refund, a dispute opened, won or closed) or could not match (a
 * payment for no checkout, or the wrong amount). Open first, then the last 30 days.
 */
type Row = {
  id: string;
  kind: PaymentFlag["kind"];
  external_id: string;
  user_id: string | null;
  athlete: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
  resolved_at: Date | null;
};

const shape = (r: Row): PaymentFlag => ({
  id: r.id,
  kind: r.kind,
  externalId: r.external_id,
  userId: r.user_id,
  athlete: r.athlete,
  detail: r.detail,
  createdAt: r.created_at.toISOString(),
  resolvedAt: r.resolved_at?.toISOString() ?? null,
});

export async function listPaymentFlags(tx: Tx): Promise<PaymentFlagsResponse> {
  const rows = await tx.$queryRaw<Row[]>`
    select f.id, f.kind, f.external_id, f.user_id, p.display_name as athlete, f.detail, f.created_at, f.resolved_at
    from payment_flags f left join profiles p on p.id = f.user_id
    where f.resolved_at is null or f.created_at > now() - interval '30 days'
    order by (f.resolved_at is null) desc, f.created_at desc
    limit 100`;
  return { flags: rows.map(shape) };
}

export async function resolvePaymentFlag(
  tx: Tx,
  id: string,
  adminId: string,
  audit: (e: AuditEntry) => Promise<void>,
): Promise<PaymentFlag> {
  const rows = await tx.$queryRaw<Row[]>`
    update payment_flags set resolved_at = now(), resolved_by = ${adminId}::uuid
    where id = ${id}::uuid and resolved_at is null
    returning id, kind, external_id, user_id, null::text as athlete, detail, created_at, resolved_at`;
  const r = rows[0];
  if (!r) throw new ApiError(404, "not_found", "No open flag with this id.");
  await audit({
    action: "payment_flag.resolve",
    targetType: "payment_flag",
    targetId: id,
    after: { kind: r.kind },
  });
  return shape(r);
}
