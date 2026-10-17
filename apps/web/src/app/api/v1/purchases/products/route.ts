import { appDeps } from "@/server/api/deps";
import { apiRoute } from "@/server/api/pipeline";
import { listPurchaseProducts } from "@/server/services/purchases";

/** GET /purchases/products: what can be bought, at the server's prices (INR, tax included). */
export const GET = apiRoute(
  { name: "GET /purchases/products", handler: ({ tx }) => listPurchaseProducts(tx) },
  appDeps,
);
