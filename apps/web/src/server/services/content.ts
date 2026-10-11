import type { Tx } from "@eyeq/db";
import {
  programDetailSchema,
  programsResponseSchema,
  sessionDetailSchema,
  type ProgramDetail,
  type ProgramsResponse,
  type SessionDetail,
} from "@eyeq/api-contract";
import type { z } from "zod";
import { ApiError } from "../api/errors";

/** snake_case jsonb from the SQL payload functions → the contract's camelCase. */
export function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        camelize(v),
      ]),
    );
  }
  return value;
}

/**
 * The payload is parsed against the contract on the way out: the schemas are strict, so
 * a field the API must never send (rule 5: a video reference) fails the request with a
 * 500 instead of reaching a client.
 */
function shaped<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(camelize(raw));
  if (!parsed.success)
    throw new Error(`content payload does not match the contract: ${parsed.error.message}`);
  return parsed.data;
}

const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);

/** GET /programs. The SQL reads the athlete from app.user_id (set by asAthlete). */
export async function listPrograms(tx: Tx): Promise<ProgramsResponse> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`select catalog_programs() as v`;
  return shaped(programsResponseSchema, { programs: row?.v ?? [] });
}

/** GET /programs/:slug. A draft reads exactly like a missing program. */
export async function getProgram(tx: Tx, slug: string): Promise<ProgramDetail> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`select program_detail(${slug}) as v`;
  if (!row?.v) throw notFound("Program");
  const [count] = await tx.$queryRaw<{ n: number }[]>`
    select count(distinct sd.drill_id)::int as n
      from session_drills sd
      join sessions s on s.id = sd.session_id
      join programs p on p.id = s.program_id
     where p.slug = ${slug}`;
  return shaped(programDetailSchema, { ...(row.v as object), distinctDrills: count?.n ?? 0 });
}

/**
 * GET /sessions/:id. Drills carry their lock state and whether they are done today, never
 * their video reference. session_play (0018) is session_detail plus doneToday.
 */
export async function getSession(tx: Tx, id: string): Promise<SessionDetail> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`select session_play(${id}::uuid) as v`;
  if (!row?.v) throw notFound("Session");
  return shaped(sessionDetailSchema, row.v);
}
