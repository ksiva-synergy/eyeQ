import { connection } from "next/server";
import { robotsTxt } from "../../server/robots";

/** robots.txt: disallow everything outside production; production has none, as before. */
export async function GET(): Promise<Response> {
  await connection(); // read APP_ENV per request, not at build
  const body = robotsTxt(process.env["APP_ENV"]);
  if (body === null) return new Response("Not found", { status: 404 });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
