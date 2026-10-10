import { adminProductCreateSchema } from "@eyeq/api-contract";
import { adminRoute } from "@/server/api/admin";
import { adminDeps } from "@/server/api/deps";
import { createProduct, listProducts } from "@/server/services/admin/products";

export const GET = adminRoute(
  { name: "GET /admin/products", handler: ({ tx }) => listProducts(tx) },
  adminDeps,
);

export const POST = adminRoute(
  {
    name: "POST /admin/products",
    body: adminProductCreateSchema,
    mutation: true,
    status: 201,
    handler: ({ tx, body, audit }) => createProduct(tx, body, audit),
  },
  adminDeps,
);
