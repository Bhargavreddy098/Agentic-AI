import { expect, it } from "vitest";
import { sections, navigateToInteraction } from "../../apps/web/src/lib/navigation.js";
it("keeps exactly seven primary destinations and decision links inside Chat", () => {
  expect(sections.map(section => section.label)).toEqual(["Chat", "Models & Providers", "Skills", "Tools & Connections", "Memory", "Activity & Tasks", "Settings"]);
  expect(sections.map(section => section.route)).not.toContain("/approvals");
  expect(navigateToInteraction("c/1", "i/1")).toBe("/chat/c%2F1?interaction=i%2F1");
});
