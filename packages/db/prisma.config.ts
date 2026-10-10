/**
 * Prisma CLI config. Prisma is the typed client only: db/migrations (plain SQL, applied
 * by src/migrate.ts) stays the source of truth for the schema (ground rule 7).
 * `prisma db pull` introspects the migrated database into prisma/schema.prisma and
 * `prisma generate` writes the client. Never run `prisma migrate` or `prisma db push`.
 *
 * The CLI needs a direct or session-pooler URL (port 5432), never the transaction
 * pooler. `generate` needs no database, so a missing DATABASE_URL is fine here.
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"] || "",
  },
});
