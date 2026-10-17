import { UiEventSchema, type UiEvent } from "@asi/contracts";

export function encodeEvent(event: UiEvent): string {
  return `data: ${JSON.stringify(UiEventSchema.parse(event))}\n\n`;
}

export function replayEvents(events: UiEvent[], after: number): UiEvent[] {
  const seen = new Set<number>();
  return [...events]
    .filter(event => event.sequence > after)
    .sort((left, right) => left.sequence - right.sequence)
    .filter(event => {
      if (seen.has(event.sequence)) return false;
      seen.add(event.sequence);
      return true;
    });
}
