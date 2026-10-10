import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { DB } from "./generated/schema.js";

export type { DB } from "./generated/schema.js";

export interface DbOptions {
  connectionString: string;
  /** Keep this small: the smallest Flexible Server tiers allow few connections (plan 2.4). */
  max?: number;
}

export function createDb({ connectionString, max = 10 }: DbOptions): Kysely<DB> {
  const pool = new pg.Pool({ connectionString, max });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
