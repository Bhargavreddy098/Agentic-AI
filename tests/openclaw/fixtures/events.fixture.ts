// Safe synthetic fixtures for OpenClaw transport tests.
//
// These events are shaped to pass the shared `UiEventSchema` contract so the
// transport tests exercise real validation rather than inventing an OpenClaw
// protocol envelope. They are test data only and never represent a live
// provider transcript.

import type { UiEvent } from "@asi/contracts";

export interface RawSseFixture {
  frames: string[];
}

export function createAsiEvent(input: {
  conversationId: string;
  eventId: string;
  sequence: number;
  eventType: UiEvent["eventType"];
  payload: Record<string, unknown>;
  occurredAt?: string;
}): UiEvent {
  return {
    schemaVersion: 1,
    eventId: input.eventId,
    conversationId: input.conversationId,
    sequence: input.sequence,
    occurredAt: input.occurredAt ?? "2026-10-21T09:00:00.000Z",
    eventType: input.eventType,
    payload: input.payload,
  } as unknown as UiEvent;
}