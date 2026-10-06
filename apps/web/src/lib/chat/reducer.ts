import { ConversationSnapshotSchema, UiEventSchema, type ConversationSnapshot, type UiEvent } from "@asi/contracts";

export type ConversationState = { snapshot: ConversationSnapshot; seenEventIds: string[]; deltaIndices: Record<string, number>; needsResync: boolean; notice: string | null };
export function hydrateConversation(value: unknown): ConversationState {
  return { snapshot: structuredClone(ConversationSnapshotSchema.parse(value)), seenEventIds: [], deltaIndices: {}, needsResync: false, notice: null };
}
export function reduceConversation(state: ConversationState, value: unknown): ConversationState {
  const event: UiEvent = UiEventSchema.parse(value);
  if (event.conversationId !== state.snapshot.conversationId || event.sequence <= state.snapshot.lastEventSequence || state.seenEventIds.includes(event.eventId)) return state;
  if (event.sequence !== state.snapshot.lastEventSequence + 1) return { ...state, needsResync: true };
  const next = structuredClone(state);
  const snapshot = next.snapshot;
  snapshot.lastEventSequence = event.sequence; snapshot.revision += 1;
  next.seenEventIds = [...next.seenEventIds.slice(-2047), event.eventId];
  const upsert = <T extends { version: number }>(items: T[], incoming: T, matches: (item: T) => boolean) => {
    const index = items.findIndex(matches);
    if (index < 0) items.push(incoming);
    else if (incoming.version > items[index]!.version) items[index] = incoming;
  };
  switch (event.eventType) {
    case "message.created":
      if (!snapshot.messages.some(item => item.messageId === event.payload.messageId)) snapshot.messages.push(event.payload);
      break;
    case "message.delta": {
      const key = JSON.stringify([event.payload.messageId, event.payload.partId]);
      const part = snapshot.messages.find(item => item.messageId === event.payload.messageId)?.parts.find(item => item.partId === event.payload.partId);
      const previous = next.deltaIndices[key];
      if (!part || part.type !== "text" || (previous !== undefined && event.payload.deltaIndex > previous + 1)) return { ...state, needsResync: true };
      if (previous === undefined || event.payload.deltaIndex > previous) {
        if (part.text.length + event.payload.text.length > 1048576) return { ...state, needsResync: true };
        part.text += event.payload.text; next.deltaIndices[key] = event.payload.deltaIndex;
      }
      break;
    }
    case "run.status": snapshot.runStatus = event.payload.status; break;
    case "approval.requested": case "approval.resolved": case "clarification.requested": case "clarification.resolved":
      upsert(snapshot.interactions, event.payload, item => item.interactionId === event.payload.interactionId); break;
    case "task.updated": upsert(snapshot.tasks, event.payload, item => item.taskId === event.payload.taskId); break;
    case "tool.updated": upsert(snapshot.tools, event.payload, item => item.toolId === event.payload.toolId); break;
    case "artifact.ready": upsert(snapshot.artifacts, event.payload, item => item.artifactId === event.payload.artifactId); break;
    case "model.effective": snapshot.effectiveModel = event.payload.modelId; break;
    case "usage.updated": snapshot.usage = event.payload; break;
    case "notice": next.notice = event.payload.summary; break;
    case "error": next.notice = event.payload.safeMessage; break;
    case "conversation.updated": case "message.completed": break;
  }
  next.snapshot = ConversationSnapshotSchema.parse(snapshot);
  return next;
}
