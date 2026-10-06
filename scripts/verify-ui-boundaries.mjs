import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import ts from "typescript";

const root = resolve(process.argv[2] ?? ".");
const violations = [];
const vendors = new Set(["radix-ui", "class-variance-authority", "clsx", "tailwind-merge", "lucide-react", "use-stick-to-bottom", "streamdown", "@assistant-ui/react"]);
function scan(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", ".next", ".git"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const file = relative(root, path).replaceAll("\\", "/");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier = node.arguments[0].text;
      if (specifier && !file.startsWith("packages/ui/src/vendor/") && !file.startsWith("packages/ui/src/adapters/") &&
          (specifier.includes("/vendor/") || specifier.includes("/ai-elements/") || vendors.has(specifier))) {
        violations.push({ code: "VENDOR_IMPORT_BYPASS", file, specifier });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
scan(join(root, "apps/web/src"));
scan(join(root, "packages/ui/src"));
console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
process.exitCode = violations.length ? 1 : 0;
