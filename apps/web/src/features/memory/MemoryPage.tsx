"use client";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { MemoryPanel } from "./MemoryPanel";

export default function MemoryPage() {
  const { client, session } = useWorkspace();
  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Memory</h1>
      <p className="section-lede">Search authorized memory records, review provenance and request corrections. Filters never expand backend authorization.</p>
      <MemoryPanel workspaceId={session?.workspaceId ?? "unknown"} client={client} />
    </main>
  );
}
