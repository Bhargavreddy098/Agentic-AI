import { expect, it } from "vitest";
import { sections, navigateToInteraction } from "@asi/web/lib/navigation.js";

const labels = ["Chat", "Models & Providers", "Skills", "Tools & Connections", "Memory", "Activity & Tasks", "Settings"];
const routes = ["/chat", "/models", "/skills", "/connections", "/memory", "/activity", "/settings"];
const banned = ["/approvals", "/approval", "/agents", "/agent", "/goals", "/projects", "/dashboard"];

it("keeps exactly seven ordered primary sections and no approval, agent, goal or project page", () => {
  expect(sections).toHaveLength(7);
  expect(sections.map(section => section.label)).toEqual(labels);
  expect(sections.map(section => section.route)).toEqual(routes);
  for (const route of banned) expect(routes).not.toContain(route);
});

it("routes every management and Activity decision to its owning Chat conversation", () => {
  expect(navigateToInteraction("c/1", "i/1")).toBe("/chat/c%2F1?interaction=i%2F1");
  expect(navigateToInteraction("conversation-9", "interaction-2")).toBe("/chat/conversation-9?interaction=interaction-2");
  for (const conversationId of ["conversation-9", "a/b", "segment with space"]) {
    expect(navigateToInteraction(conversationId, "interaction-1").startsWith("/chat/")).toBe(true);
    expect(navigateToInteraction(conversationId, "interaction-1")).not.toContain("?interaction=undefined");
  }
});
