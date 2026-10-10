import { connection } from "next/server";
import { db } from "@/server/db";

/** Readiness: the app reaches Postgres. /api/health stays database-free for liveness. */
export async function GET(): Promise<Response> {
  await connection();
  try {
    await db().$queryRaw`select 1`;
    return Response.json({ ok: true, db: true });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
