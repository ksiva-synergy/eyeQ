import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generate, SOURCE, THEME_CSS, TOKENS_TS } from "../scripts/gen-tokens.ts";
import { tokens } from "./tokens.ts";

describe("generated tokens", () => {
  it("tokens.ts and theme.css match docs/design/tokens.json (run `pnpm --filter @eyeq/ui tokens`)", async () => {
    const { ts, css } = await generate();
    expect(readFileSync(TOKENS_TS, "utf8")).toBe(ts);
    expect(readFileSync(THEME_CSS, "utf8")).toBe(css);
  });

  it("carries every colour of both themes, and the same names in each", () => {
    const json = JSON.parse(readFileSync(SOURCE, "utf8"));
    for (const theme of ["dark", "light"] as const) {
      for (const [name, leaf] of Object.entries(json.color[theme])) {
        if (name.startsWith("$")) continue;
        expect(tokens.color[theme][name as keyof typeof tokens.color.dark]).toBe(
          (leaf as { $value: string }).$value,
        );
      }
    }
    expect(Object.keys(tokens.color.dark).sort()).toEqual(Object.keys(tokens.color.light).sort());
  });

  it("matches the values the board and plan section 8 name", () => {
    expect(tokens.color.dark.ground).toBe("#0B0B10");
    expect(tokens.color.dark.cta).toBe("#DA2141");
    expect(tokens.color.dark.primary).toBe("#7C3AED");
    expect(tokens.radius).toMatchObject({ s: 8, m: 14, l: 20, full: 9999 });
    expect(tokens.space).toMatchObject({ gutter: 20, "card-padding": 16 });
    expect(tokens.size["touch-min"]).toBe(44);
    expect(tokens.duration.max).toBe(1200);
  });

  it("leaves rule values out (ground rule 8)", () => {
    expect("game" in tokens).toBe(false);
    expect(readFileSync(TOKENS_TS, "utf8")).not.toMatch(/xp-daily-cap|xp-per-drill/);
  });

  it("sets type in rem so 200 % text reflows", () => {
    const css = readFileSync(THEME_CSS, "utf8");
    expect(css).toMatch(/@utility type-body \{[^}]*font-size: 0\.9375rem/);
    expect(css).not.toMatch(/font-size: \d+px/);
  });
});
