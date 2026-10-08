// Deletes the files of the build context that `npm run addon:stage` did not stage (listed in
// staged-files.txt). Copying a new add-on folder over an older one keeps files removed since then,
// and TypeScript would still compile them.
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = path.join(root, "staged-files.txt");
if (!existsSync(manifest)) {
  console.log("staged-files.txt missing: nothing pruned.");
  process.exit(0);
}
const staged = new Set(readFileSync(manifest, "utf8").split(/\r?\n/).filter(Boolean));
const removed = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      walk(full);
    } else if (!staged.has(relative)) {
      rmSync(full);
      removed.push(relative);
    }
  }
};
walk(root);
console.log(removed.length ? `Removed ${removed.length} stale files: ${removed.join(", ")}` : "No stale files.");
