"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionView } from "@asi/contracts";
import { useWorkspace } from "../shell/WorkspaceProvider";
import { ConnectionsProvider, useConnections, connectConnection, disconnectConnection } from "./catalog";
import { ConnectionCatalog } from "./ConnectionCatalog";
import { ConnectionForm } from "./ConnectionForm";

function ConnectionsView() {
  const { client } = useWorkspace();
  const router = useRouter();
  const { connections } = useConnections();
  const [notice, setNotice] = useState<string | null>(null);

  const openInteraction = (href: string) => { setNotice("An approval was requested in Chat."); router.push(href); };
  const report = (name: string, action: string) => (outcome: { kind: string; message?: string }) => {
    if (outcome.kind === "applied") setNotice(`${name}: ${action} recorded.`);
    else if (outcome.kind === "error") setNotice(outcome.message ?? "Request rejected.");
  };
  const run = async (action: "connect" | "disconnect", connection: ConnectionView) => {
    const outcome = action === "connect" ? await connectConnection(client, connection, openInteraction) : await disconnectConnection(client, connection, openInteraction);
    report(connection.displayName, action)(outcome);
  };

  const pending = useMemo(() => connections?.availability === "ready" ? connections.items.find(connection => connection.status === "disconnected") ?? null : null, [connections]);

  return (
    <main className="section-page">
      <div className="section-kicker">WORKSPACE</div>
      <h1>Tools &amp; Connections</h1>
      <p className="section-lede">Connect tools, MCP servers, remote A2A agents and messaging accounts. The backend authorizes every connection.</p>
      {notice ? <p role="status" className="section-notice">{notice}</p> : null}
      <section className="connections-panel" aria-label="Connections">
        <ConnectionCatalog catalog={connections} onCommand={(action, connection) => { void run(action, connection); }} />
        {pending ? <ConnectionForm connectionId={pending.connectionId} expectedRevision={pending.revision} submit={command => client.submitCommand(command)} onNavigate={openInteraction} /> : null}
      </section>
    </main>
  );
}

export default function ConnectionsPage() {
  const { client } = useWorkspace();
  return <ConnectionsProvider client={client}><ConnectionsView /></ConnectionsProvider>;
}
