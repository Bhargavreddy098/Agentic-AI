"use client";
import type { MemoryView } from "@asi/contracts";
import { memoryLabels } from "./memory";

export function MemoryDetail({ memory, contradictions = [] }: { memory: MemoryView; contradictions?: readonly string[] }) {
  const contradicted = contradictions.includes(memory.memoryId);
  return (
    <div className="memory-detail" data-testid={`memory-detail-${memory.memoryId}`} data-scope={memory.scope} data-revision={memory.revision}>
      <p className="memory-current-value" data-testid="memory-current-value">{memory.value}</p>
      <p className="memory-detail-scope">Scope: {memory.scope}</p>
      <ul className="memory-labels">
        {memoryLabels(memory, contradicted).map(label => <li key={label} className="memory-label">{label}</li>)}
      </ul>
      {contradicted ? <span className="memory-contradiction" data-testid="memory-contradiction">Contradiction flagged</span> : null}
    </div>
  );
}

export default MemoryDetail;
