// Runs the standalone build the way the Docker image does (docker/Dockerfile.web):
// copy static assets and public next to server.js, then start it.
// Used by Playwright in CI so e2e runs against the production server.
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next/standalone/apps/web");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build. Run `pnpm --filter web build` first.");
  process.exit(1);
}
cpSync(path.join(root, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0" },
});
child.on("exit", (code) => process.exit(code ?? 0));
