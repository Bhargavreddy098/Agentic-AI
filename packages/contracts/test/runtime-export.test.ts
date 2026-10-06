import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("loads the built package through its public export in Node", () => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", "import('@asi/contracts').then(m => console.log(m.SchemaVersionSchema.parse(1)))"], {
    cwd: "packages/contracts", encoding: "utf8",
  });
  expect(output.trim()).toBe("1");
});
