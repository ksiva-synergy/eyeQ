import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
}));
const next = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);
vi.mock("next/server", () => next);

import { report } from "./sentry";

describe("report() sends the error to Sentry before Vercel freezes the function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["SENTRY_DSN"] = "https://key@example.ingest.sentry.io/1";
  });
  afterEach(() => {
    delete process.env["SENTRY_DSN"];
  });

  it("captures, then schedules a flush with after() so the response is not delayed", async () => {
    const e = new Error("boom");
    report(e, { route: "/x" });
    expect(sentry.captureException).toHaveBeenCalledWith(e, { extra: { route: "/x" } });
    expect(next.after).toHaveBeenCalledTimes(1);
    expect(sentry.flush).not.toHaveBeenCalled();
    await next.after.mock.calls[0]![0]();
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it("outside a request scope (after() throws) it flushes directly", () => {
    next.after.mockImplementationOnce(() => {
      throw new Error("after was called outside a request scope");
    });
    report(new Error("boom"), {});
    expect(sentry.flush).toHaveBeenCalledWith(2000);
  });

  it("without SENTRY_DSN it does nothing", () => {
    delete process.env["SENTRY_DSN"];
    report(new Error("boom"), {});
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(next.after).not.toHaveBeenCalled();
  });
});
