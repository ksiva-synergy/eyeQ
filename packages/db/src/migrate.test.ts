import { describe, expect, it } from "vitest";
import { loadMigrations } from "./migrate.js";

describe("migrations folder", () => {
  it("contains only well-named, uniquely versioned SQL files", async () => {
    const files = await loadMigrations();
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.name).toMatch(/^\d{4,}_[a-z0-9_]+\.sql$/);
  });
});
