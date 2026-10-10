import { adminIdParamsSchema, adminProductUpdateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { updateProduct } from "@/server/services/admin/products";

export const PATCH = adminRoute(
  {
    name: "PATCH /admin/products/:id",
    params: adminIdParamsSchema,
    body: adminProductUpdateSchema,
    mutation: true,
    handler: ({ tx, params, body, audit }) => updateProduct(tx, params.id, body, audit),
  },
  adminDeps,
);
