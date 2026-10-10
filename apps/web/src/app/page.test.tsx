import { describe, expect, it } from "vitest";
import { t } from "@eyeq/i18n";

describe("web unit test wiring", () => {
  it("reads strings through @eyeq/i18n", () => {
    expect(t("app.name")).toBe("EyeQ");
  });
});
