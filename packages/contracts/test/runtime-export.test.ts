import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("loads the built package through its public export in Node", () => {
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", "import('@asi/contracts').then(m => console.log(m.SchemaVersionSchema.parse(1)))"], {
    cwd: "packages/contracts", encoding: "utf8",
  });
  expect(output.trim()).toBe("1");
});


it("the built public policy decision export preserves the canonical decision variants", () => {
  const program = [
    "const m = await import('@asi/contracts');",
    "const base = {schemaVersion:1,decisionId:'d',policyVersion:'p'};",
    "const allow = {...base,decision:'allow',boundCapability:'message.send',boundExpiresAt:'2099-06-15T12:00:00.000Z'};",
    "console.log(JSON.stringify([",
    "m.PolicyDecisionSchema.safeParse(allow).success,",
    "m.PolicyDecisionSchema.safeParse({...base,decision:'deny',reason:'No capability'}).success,",
    "m.PolicyDecisionSchema.safeParse({...base,decision:'approval_required',reason:'Approval needed'}).success,",
    "m.PolicyDecisionSchema.safeParse({...allow,reason:null}).success,",
    "m.PolicyDecisionSchema.safeParse({...allow,boundExpiresAt:'2001-01-01T00:00:00.000Z'}).success,",
    "m.PolicyDecisionSchema.safeParse({...base,decision:'deny',reason:'Denied',boundCapability:'message.send'}).success",
    "]));",
  ].join("\n");
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", program], { cwd: "packages/contracts", encoding: "utf8" });
  expect(JSON.parse(output)).toEqual([true, true, true, false, false, false]);
});
