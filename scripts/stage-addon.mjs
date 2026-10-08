// Copies the sources the add-on image needs into homeassistant/familywall/app,
// because Home Assistant builds local add-ons with the add-on folder as Docker context.
import { cpSync, rmSync } from "node:fs";
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

console.log(`Add-on sources staged in ${path.relative(root, target)}`);
