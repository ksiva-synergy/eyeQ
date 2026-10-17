import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ground rule 4, checked by reading the source: no code path asks a payment provider
 * whether someone may open content. Access is only ever has_access() over entitlements,
 * in SQL; the web layer talks to Razorpay only to create, fetch and verify payments, and
 * hands what it fetched to the SQL functions that write entitlements.
 */
const SRC = path.join(import.meta.dirname, "../..");
const files: string[] = [];
(function walk(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) files.push(p);
  }
})(SRC);
const rel = (p: string) => path.relative(SRC, p);
const read = (p: string) => readFileSync(p, "utf8");

/** The only places that may hold a Razorpay client or call its API. */
const PROVIDER_CODE = new Set([
  "server/payments/razorpay.ts",
  "server/payments/process.ts",
  "server/payments/webhook.ts",
  "server/payments/deps.ts",
  "server/payments/plans.ts",
  "server/services/purchases.ts",
]);

describe("rule 4: access means entitlements", () => {
  it("only the payment layer calls Razorpay", () => {
    const offenders = files
      .filter((f) =>
        /fetchPayment|fetchSubscription|razorpayClient|api\.razorpay\.com/.test(read(f)),
      )
      .map(rel)
      .filter((f) => !PROVIDER_CODE.has(f));
    expect(offenders).toEqual([]);
  });

  it("the payment layer never answers an access question from provider state", () => {
    for (const f of PROVIDER_CODE) {
      const src = read(path.join(SRC, f));
      // No `has_access`/`hasAccess` decision is made next to a provider call: access is SQL's.
      expect(src, f).not.toMatch(/hasAccess\s*[=:]/);
      expect(src, f).not.toMatch(
        /\.status\s*===?\s*["']captured["'][^;]*\b(open|unlock|access)\b/i,
      );
    }
  });

  it("the provider's subscription cache is read only for Account and cancelling", () => {
    const readers = files
      .filter((f) => /provider_subscriptions/.test(read(f)))
      .map(rel)
      .sort();
    expect(readers).toEqual(["server/services/purchases.ts"]);
    const src = read(path.join(SRC, "server/services/purchases.ts"));
    const uses = [...src.matchAll(/export async function (\w+)[\s\S]*?\n}\n/g)]
      .filter((m) => m[0].includes("provider_subscriptions"))
      .map((m) => m[1]);
    expect(uses.sort()).toEqual(["cancelSubscription", "listPurchases"]);
  });

  it("every content gate in the app reads has_access through the SQL payloads", () => {
    // Pages and routes learn access from hasAccess/locked fields the SQL functions compute;
    // no web file computes it from entitlements, products or payments itself.
    // The one reader is the admin grant, which looks up the row it is about to extend for
    // its audit entry; it decides nothing about access.
    const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const computing = files
      .filter((f) => /from\s+entitlements|tx\.entitlements\.find/.test(code(f)))
      .map(rel);
    expect(computing).toEqual(["server/services/admin/athletes.ts"]);
  });
});
