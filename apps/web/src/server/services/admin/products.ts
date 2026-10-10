import type { Prisma, Tx } from "@eyeq/db";
import {
  adminProductCreateSchema,
  type AdminProduct,
  type AdminProductCreate,
  type AdminProductUpdate,
  type ProductGrants,
} from "@eyeq/api-contract";
import { ApiError } from "../../api/errors";
import type { AuditEntry } from "../../api/admin";

type Row = Prisma.productsGetPayload<object>;

/** grants jsonb is stored snake_case, as the SQL engine reads it. */
function grantsToDb(g: ProductGrants): Prisma.InputJsonObject {
  return {
    scope: g.scope,
    ...(g.scopeId ? { scope_id: g.scopeId } : {}),
    ...(g.durationDays ? { duration_days: g.durationDays } : {}),
    ...(g.credits ? { credits: g.credits } : {}),
  };
}

function grantsFromDb(v: Prisma.JsonValue): ProductGrants {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    scope: o["scope"] as ProductGrants["scope"],
    scopeId: (o["scope_id"] as string | undefined) ?? null,
    durationDays: (o["duration_days"] as number | undefined) ?? null,
    credits: (o["credits"] as number | undefined) ?? null,
  };
}

export function toAdminProduct(p: Row): AdminProduct {
  return {
    id: p.id,
    kind: p.kind as AdminProduct["kind"],
    title: p.title,
    pricePaise: p.price_paise,
    currency: p.currency,
    grants: grantsFromDb(p.grants),
    playProductId: p.play_product_id,
    appstoreProductId: p.appstore_product_id,
    razorpayPlanId: p.razorpay_plan_id,
    razorpayItemId: p.razorpay_item_id,
    active: p.active,
    updatedAt: p.updated_at.toISOString(),
  };
}

export async function listProducts(tx: Tx): Promise<{ products: AdminProduct[] }> {
  const rows = await tx.products.findMany({ orderBy: [{ kind: "asc" }, { price_paise: "asc" }] });
  return { products: rows.map(toAdminProduct) };
}

export async function createProduct(
  tx: Tx,
  body: AdminProductCreate,
  audit: (e: AuditEntry) => Promise<void>,
): Promise<AdminProduct> {
  const row = await tx.products.create({
    data: {
      kind: body.kind,
      title: body.title,
      price_paise: body.pricePaise,
      grants: grantsToDb(body.grants),
      play_product_id: body.playProductId,
      appstore_product_id: body.appstoreProductId,
      razorpay_plan_id: body.razorpayPlanId,
      razorpay_item_id: body.razorpayItemId,
      active: body.active,
    },
  });
  const after = toAdminProduct(row);
  await audit({ action: "product.create", targetType: "product", targetId: row.id, after });
  return after;
}

export async function updateProduct(
  tx: Tx,
  id: string,
  body: AdminProductUpdate,
  audit: (e: AuditEntry) => Promise<void>,
): Promise<AdminProduct> {
  const current = await tx.products.findUnique({ where: { id } });
  if (!current) throw new ApiError(404, "not_found", "Product not found.");
  const before = toAdminProduct(current);
  // Re-check the grant against the product's fixed kind with the create rules.
  const editable = {
    kind: before.kind,
    title: before.title,
    pricePaise: before.pricePaise,
    grants: before.grants,
    playProductId: before.playProductId,
    appstoreProductId: before.appstoreProductId,
    razorpayPlanId: before.razorpayPlanId,
    razorpayItemId: before.razorpayItemId,
    active: before.active,
  };
  const merged = adminProductCreateSchema.safeParse({ ...editable, ...body });
  if (!merged.success) {
    throw new ApiError(400, "validation_failed", "The request is not valid.", {
      issues: merged.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const row = await tx.products.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.pricePaise !== undefined ? { price_paise: body.pricePaise } : {}),
      ...(body.grants !== undefined ? { grants: grantsToDb(body.grants) } : {}),
      ...(body.playProductId !== undefined ? { play_product_id: body.playProductId } : {}),
      ...(body.appstoreProductId !== undefined
        ? { appstore_product_id: body.appstoreProductId }
        : {}),
      ...(body.razorpayPlanId !== undefined ? { razorpay_plan_id: body.razorpayPlanId } : {}),
      ...(body.razorpayItemId !== undefined ? { razorpay_item_id: body.razorpayItemId } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updated_at: new Date(),
    },
  });
  const after = toAdminProduct(row);
  await audit({ action: "product.update", targetType: "product", targetId: id, before, after });
  return after;
}
