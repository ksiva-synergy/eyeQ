import { describe, expect, it } from "vitest";
import { sqlState, toApiError } from "./errors";

/** The shape Prisma 7 throws when a raw query fails under the pg driver adapter. */
const prismaRawError = (code: string, message: string) =>
  Object.assign(new Error("Raw query failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: { kind: "postgres", code, originalCode: code, message, originalMessage: message },
      },
    },
  });

describe("API error mapping", () => {
  it("finds the SQLSTATE beneath Prisma's P2010", () => {
    expect(sqlState(prismaRawError("P0003", "drill_locked"))).toBe("P0003");
  });

  it("maps the game engine's exceptions to not_found, locked and conflict with the reason", () => {
    expect(toApiError(prismaRawError("P0002", "drill_not_found")).body()).toEqual({
      code: "not_found",
      message: "Not found.",
      details: { reason: "drill_not_found" },
    });
    const locked = toApiError(prismaRawError("P0003", "program_locked"));
    expect([locked.status, locked.code, locked.details]).toEqual([
      403,
      "locked",
      { reason: "program_locked" },
    ]);
    const conflict = toApiError(prismaRawError("P0004", "freeze_cap_reached"));
    expect([conflict.status, conflict.code]).toEqual([409, "conflict"]);
  });

  it("keeps unknown errors a bare 500", () => {
    const e = toApiError(prismaRawError("XX000", "boom"));
    expect([e.status, e.body()]).toEqual([
      500,
      { code: "internal", message: "Something went wrong." },
    ]);
  });
});
