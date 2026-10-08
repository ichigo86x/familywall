// Development API: builds the shared package once, then watches both the shared package and the API,
// so a change in packages/shared also restarts the API (otherwise the old API keeps running unnoticed).
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args, cwd) => spawn(npm, args, { cwd, stdio: "inherit", shell: process.platform === "win32", env: process.env });

const first = spawnSync(npm, ["run", "build"], { cwd: path.join(root, "packages", "shared"), stdio: "inherit", shell: process.platform === "win32" });
if (first.status !== 0) {
  process.exit(first.status ?? 1);
}

const children = [
  run(["exec", "--", "tsc", "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], path.join(root, "packages", "shared")),
  run(["run", "start:dev:watch"], path.join(root, "apps", "api"))
];

const stop = () => {
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    if (code) {
      stop();
    }
  });
}
