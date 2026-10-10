import { z } from "zod";

/**
 * /api/admin/products (plan phase 4, "Products, minimal"): internal id, kind, price, what
 * it grants, and the Play, App Store and Razorpay ids. Money is integer paise (INR, tax
 * inclusive). A product is never deleted, only deactivated: payments reference it.
 */
export const productKinds = [
  "subscription",
  "program",
  "drill",
  "credit_pack",
  "challenge_entry",
] as const;

export const productGrantsSchema = z.strictObject({
  scope: z.enum(["subscription", "program", "drill", "challenge", "credits"]),
  scopeId: z.uuid().nullable().optional(),
  durationDays: z.number().int().positive().nullable().optional(),
  credits: z.number().int().positive().nullable().optional(),
});
export type ProductGrants = z.infer<typeof productGrantsSchema>;

const storeId = z.string().trim().min(1).max(100).nullable();

export const adminProductSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(productKinds),
  title: z.string(),
  pricePaise: z.number().int().nonnegative(),
  currency: z.string(),
  grants: productGrantsSchema,
  playProductId: z.string().nullable(),
  appstoreProductId: z.string().nullable(),
  razorpayPlanId: z.string().nullable(),
  razorpayItemId: z.string().nullable(),
  active: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminProductsResponseSchema = z.strictObject({
  products: z.array(adminProductSchema),
});

/** The grant has to match the kind: a program product grants a program, and so on. */
const KIND_SCOPE: Record<(typeof productKinds)[number], ProductGrants["scope"]> = {
  subscription: "subscription",
  program: "program",
  drill: "drill",
  credit_pack: "credits",
  challenge_entry: "challenge",
};

const productFields = {
  kind: z.enum(productKinds),
  title: z.string().trim().min(1).max(120),
  pricePaise: z.number().int().nonnegative().max(10_000_000),
  grants: productGrantsSchema,
  playProductId: storeId,
  appstoreProductId: storeId,
  razorpayPlanId: storeId,
  razorpayItemId: storeId,
  active: z.boolean(),
};

function grantsMatchKind(v: { kind?: (typeof productKinds)[number]; grants?: ProductGrants }) {
  if (!v.kind || !v.grants) return true;
  const g = v.grants;
  if (g.scope !== KIND_SCOPE[v.kind]) return false;
  if (g.scope === "subscription") return (g.durationDays ?? 0) > 0;
  if (g.scope === "credits") return (g.credits ?? 0) > 0;
  if (g.scope === "program" || g.scope === "challenge") return !!g.scopeId;
  return true; // a pay-per-view drill product names its drill on the drill (ppv_product_id)
}

export const adminProductCreateSchema = z
  .strictObject({
    ...productFields,
    playProductId: storeId.default(null),
    appstoreProductId: storeId.default(null),
    razorpayPlanId: storeId.default(null),
    razorpayItemId: storeId.default(null),
    active: z.boolean().default(true),
  })
  .refine(grantsMatchKind, { message: "grants must match the kind", path: ["grants"] });
export type AdminProductCreate = z.infer<typeof adminProductCreateSchema>;

/** PATCH: any subset; kind is fixed once created. */
export const adminProductUpdateSchema = z
  .strictObject(productFields)
  .omit({ kind: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "at least one field");
export type AdminProductUpdate = z.infer<typeof adminProductUpdateSchema>;

export const adminIdParamsSchema = z.strictObject({ id: z.uuid() });
