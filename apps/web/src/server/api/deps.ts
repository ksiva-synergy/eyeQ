import "server-only";
import { supabaseVerifier } from "../auth/supabase";
import { apiDb, serviceDb } from "../db";
import { report } from "../observability/sentry";
import type { Deps } from "./pipeline";

/** Production wiring for apiRoute(): eyeq_api, Supabase sessions, Sentry. */
export function appDeps(): Deps {
  return { db: apiDb(), verifier: supabaseVerifier(), report };
}

/** Production wiring for adminRoute(): eyeq_service, Supabase sessions, Sentry. */
export function adminDeps(): Deps {
  return { db: serviceDb(), verifier: supabaseVerifier(), report };
}
