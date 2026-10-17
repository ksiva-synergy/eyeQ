import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "./generated/prisma/client.ts";

export { Prisma, PrismaClient } from "./generated/prisma/client.ts";
export type * from "./generated/prisma/models.ts";

/** The client handed to a callback inside a transaction. */
export type Tx = Prisma.TransactionClient;

export interface DbOptions {
  /**
   * At runtime on Vercel, Supabase's transaction pooler (port 6543). Scripts and the
   * Prisma CLI use a direct or session-pooler URL (port 5432) instead.
   */
  connectionString: string;
  /** Per-instance pool. Keep small: each serverless instance holds its own. */
  max?: number;
}

export function createDb({ connectionString, max = 10 }: DbOptions): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

/**
 * Runs `fn` in one transaction with app.user_id set for its duration, so RLS policies
 * and the public game functions see this athlete (CLAUDE.md, engine shape). The setting
 * is transaction-local, which is what keeps it safe behind a transaction pooler.
 */
export function asAthlete<T>(db: PrismaClient, userId: string, fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`select set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}

/**
 * Promise.all for queries on one transaction, run one after another. A transaction holds
 * one connection, and pg queues a query sent while another is running: it warns now
 * ("Calling client.query() when the client is already executing a query") and pg@9 makes
 * it an error. Use this, never Promise.all, for work on a `tx`.
 */
export async function inSequence<const T extends readonly (() => unknown)[]>(
  steps: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const step of steps) out.push(await step());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
