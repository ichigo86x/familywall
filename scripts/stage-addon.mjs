// Copies the sources the add-on image needs into homeassistant/familywall/app,
// because Home Assistant builds local add-ons with the add-on folder as Docker context.
import { cpSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "homeassistant", "familywall", "app");
const entries = ["package.json", "package-lock.json", "tsconfig.base.json", "apps/api", "apps/web", "packages/shared"];
const skipped = new Set(["node_modules", "dist", "data", ".next", ".venv"]);

rmSync(target, { recursive: true, force: true });
for (const entry of entries) {
  cpSync(path.join(root, entry), path.join(target, entry), {
    recursive: true,
    filter: (source) => !skipped.has(path.basename(source)) && !source.endsWith(".tsbuildinfo")
  });
}

// List of the staged files: the image deletes any other file found in app/. When the add-on folder is
// copied over an older one, files removed since then would otherwise stay and break the build.
const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.relative(target, path.join(dir, entry.name)).split(path.sep).join("/")]
  );
const files = [...listFiles(target), "staged-files.txt"].sort();
writeFileSync(path.join(target, "staged-files.txt"), `${files.join("\n")}\n`);

console.log(`Add-on sources staged in ${path.relative(root, target)} (${files.length} files)`);
