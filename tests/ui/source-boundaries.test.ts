import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("rejects feature vendor bypass and conflicting or unqualified source ownership", () => {
  const root = mkdtempSync(join(tmpdir(), "asi-ui-"));
  try {
    mkdirSync(join(root, "apps/web/src/features"), { recursive: true });
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "apps/web/src/features/chat.tsx"), 'import { Message } from "../../../../packages/ui/src/vendor/ai-elements/message.js";');
    writeFileSync(join(root, "docs/ui-component-inventory.json"), JSON.stringify({
      chatOwners: ["ai-elements", "assistant-ui"],
      sources: [{ id: "unknown", status: "selected", files: [{ path: "missing.tsx" }] }],
    }));
    const run = (name: string) => {
      let output: string;
      try { output = execFileSync(process.execPath, [resolve(`scripts/${name}.mjs`), root], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
      catch (error) { output = (error as { stdout: string }).stdout; }
      return (JSON.parse(output) as { violations: { code: string }[] }).violations.map(v => v.code);
    };
    expect(run("verify-ui-boundaries")).toContain("VENDOR_IMPORT_BYPASS");
    const codes = run("verify-ui-sources");
    expect(codes).toContain("MULTIPLE_CHAT_OWNERS");
    expect(codes).toContain("UNQUALIFIED_SOURCE");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
