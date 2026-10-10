import "server-only";
import { supabaseVerifier } from "../auth/supabase";
import { apiDb } from "../db";
import { report } from "../observability/sentry";
import type { Deps } from "./pipeline";

/** Production wiring for apiRoute(): eyeq_api, Supabase sessions, Sentry. */
export function appDeps(): Deps {
  return { db: apiDb(), verifier: supabaseVerifier(), report };
}
