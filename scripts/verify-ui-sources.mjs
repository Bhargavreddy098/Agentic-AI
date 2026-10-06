import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
const root = resolve(process.argv[2] ?? ".");
const violations = [];
const inventoryPath = resolve(root, "docs/ui-component-inventory.json");
if (!existsSync(inventoryPath)) {
  violations.push({ code: "UNQUALIFIED_SOURCE", detail: "source inventory missing" });
} else {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (!Array.isArray(inventory.chatOwners) || inventory.chatOwners.length !== 1 || inventory.chatOwners[0] !== "ai-elements") {
    violations.push({ code: "MULTIPLE_CHAT_OWNERS", detail: "one approved primary presentation owner required" });
  }
  for (const source of inventory.sources ?? []) {
    if (source.status !== "selected") continue;
    const bad = detail => violations.push({ code: "UNQUALIFIED_SOURCE", source: source.id, detail });
    if (!source.license || !source.revision || !source.url || !source.licensePath || !Array.isArray(source.files) || !source.files.length) {
      bad("selected source requires license, revision, URL, license copy and qualified files");
      continue;
    }
    if (!existsSync(resolve(root, source.licensePath))) bad("license copy missing");
    for (const file of source.files) {
      if (typeof file.path !== "string" || typeof file.sha256 !== "string") { bad("file path/hash required"); continue; }
      const path = resolve(root, file.path);
      const inside = relative(root, path);
      if (inside.startsWith("..") || isAbsolute(inside) || !existsSync(path)) { bad(`invalid or missing source: ${file.path}`); continue; }
      if (createHash("sha256").update(readFileSync(path)).digest("hex") !== file.sha256) bad(`digest mismatch: ${file.path}`);
    }
  }
}
console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
process.exitCode = violations.length ? 1 : 0;
