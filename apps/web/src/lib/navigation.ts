export const sections = [
  { label: "Chat", route: "/chat", mark: "C" },
  { label: "Models & Providers", route: "/models", mark: "M" },
  { label: "Skills", route: "/skills", mark: "S" },
  { label: "Tools & Connections", route: "/connections", mark: "T" },
  { label: "Memory", route: "/memory", mark: "◈" },
  { label: "Activity & Tasks", route: "/activity", mark: "A" },
  { label: "Settings", route: "/settings", mark: "⚙" },
] as const;
export function navigateToInteraction(conversationId: string, interactionId: string) {
  return `/chat/${encodeURIComponent(conversationId)}?interaction=${encodeURIComponent(interactionId)}`;
}
