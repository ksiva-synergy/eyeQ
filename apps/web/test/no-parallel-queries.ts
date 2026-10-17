/**
 * Integration setup: fail the file if pg warns that a query was sent while another was
 * running on the same client ("Calling client.query() when the client is already
 * executing a query"). On a transaction that is a Promise.all over `tx`; use inSequence()
 * from @eyeq/db (pg@9 turns the warning into an error).
 */
import { afterAll, expect } from "vitest";

const seen: string[] = [];
process.on("warning", (w) => {
  if (/already executing a query/.test(w.message)) seen.push(w.stack ?? w.message);
});

afterAll(() => {
  expect(seen, "parallel queries on one pg client (use inSequence on a tx)").toEqual([]);
});
