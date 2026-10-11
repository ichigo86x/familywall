// Prepares a local add-on folder in build/addon/familywall, to copy into /addons/familywall of Home
// Assistant: Home Assistant builds local add-ons with the add-on folder as Docker context, so the folder
// holds the add-on files (config, docs, icons) and the sources next to the Dockerfile.
// The published add-on does not need this: Home Assistant downloads the images built on GitHub.
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "build", "addon", "familywall");
const sources = ["package.json", "package-lock.json", "tsconfig.base.json", "Dockerfile", ".dockerignore", "scripts/prune-stale.mjs", "apps/api", "apps/web", "packages/shared"];
const skipped = new Set(["node_modules", "dist", "data", ".next", ".venv"]);

rmSync(target, { recursive: true, force: true });
for (const entry of sources) {
  cpSync(path.join(root, entry), path.join(target, entry), {
    recursive: true,
    filter: (source) => !skipped.has(path.basename(source)) && !source.endsWith(".tsbuildinfo")
  });
}
// Add-on files (config, documentation, icons) at the top of the folder.
cpSync(path.join(root, "familywall"), target, { recursive: true });

// Without "image" Home Assistant builds the add-on on the device instead of downloading it.
const configPath = path.join(target, "config.yaml");
const config = readFileSync(configPath, "utf8")
  .split("\n")
  .filter((line) => !/^image:/.test(line) && !/^# Images published by the GitHub workflow/.test(line))
  .join("\n");
writeFileSync(configPath, config);

// List of the staged files: the image deletes any other file it finds. When the add-on folder is
// copied over an older one, files removed since then would otherwise stay and break the build.
const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.relative(target, path.join(dir, entry.name)).split(path.sep).join("/")]
  );
const files = [...listFiles(target), "staged-files.txt"].sort();
writeFileSync(path.join(target, "staged-files.txt"), `${files.join("\n")}\n`);

console.log(`Local add-on staged in ${path.relative(root, target)} (${files.length} files): copy it to /addons/familywall.`);
