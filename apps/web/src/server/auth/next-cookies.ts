import "server-only";
import { cookies } from "next/headers";
import type { CookieJar } from "./supabase";

/** A cookie jar over next/headers, writable in route handlers and server actions. */
export async function nextJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        // Server Components cannot set cookies; src/proxy.ts refreshes them instead.
      }
    },
  };
}
