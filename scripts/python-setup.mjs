// Development only: creates apps/api/.venv with the Python packages the API runs:
// Radicale (built-in CalDAV server) and pyicloud (iCloud Reminders), same versions as the add-on image.
// The API uses this venv when RADICALE_COMMAND / ICLOUD_PYTHON are not set.
// Usage: npm run python:setup [-- --python <python command>]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGES = ["radicale==3.8.1", "pyicloud==2.6.5"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const venv = path.join(root, "apps", "api", ".venv");
const venvPython = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
const args = process.argv.slice(2);
const chosen = args.includes("--python") ? args[args.indexOf("--python") + 1] : undefined;

const works = (command) => {
  const [executable, ...rest] = command.split(/\s+/);
  const result = spawnSync(executable, [...rest, "-c", "import sys; assert sys.version_info >= (3, 10); print(sys.version.split()[0])"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

const python = [chosen, "python3", "python", "py -3"].filter(Boolean).find((command) => works(command));
if (!python) {
  console.error("Python 3.10 or newer not found. Install it (python.org) or pass --python <command>.");
  process.exit(1);
}

const run = (command, commandArgs) => {
  const [executable, ...rest] = command.split(/\s+/);
  console.log(`> ${[executable, ...rest, ...commandArgs].join(" ")}`);
  const result = spawnSync(executable, [...rest, ...commandArgs], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (!existsSync(venvPython)) {
  console.log(`Creating ${path.relative(root, venv)} with Python ${works(python)}`);
  run(python, ["-m", "venv", venv]);
}
run(venvPython, ["-m", "pip", "install", "--disable-pip-version-check", "--quiet", "--upgrade", ...PACKAGES]);
run(venvPython, ["-c", "import radicale, pyicloud; print('radicale and pyicloud ready')"]);
console.log("Restart the API (npm run dev:api): it uses this Python for Radicale and iCloud Reminders.");
