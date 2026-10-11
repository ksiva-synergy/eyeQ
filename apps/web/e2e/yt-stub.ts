import { readFileSync } from "node:fs";
import path from "node:path";

/** The YouTube IFrame API stub the player loads in e2e runs (a 4 s clip at 1×). */
export const YT_STUB = readFileSync(
  path.join(__dirname, "fixtures", "youtube-iframe-api.js"),
  "utf8",
);
