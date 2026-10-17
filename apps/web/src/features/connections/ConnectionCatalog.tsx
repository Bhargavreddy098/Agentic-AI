"use client";
import { useState } from "react";
import type { Catalog, ConnectionView } from "@asi/contracts";
import { CONNECTION_KIND_LABELS, CONNECTION_STATUS_LABELS, connectionStatusReason, filterConnections } from "./catalog";

export function ConnectionCatalog({ catalog, onCommand }: {
  catalog: Catalog<ConnectionView> | null;
  onCommand?: (action: "connect" | "disconnect", connection: ConnectionView) => void;
}) {
  const [query, setQuery] = useState("");
  if (!catalog) return <p role="status" data-testid="connection-catalog-status">Connections loading…</p>;
  if (catalog.availability !== "ready") return <p role="status" data-testid="connection-catalog-status">{catalog.availability === "permission_denied" ? "Permission denied for connection access in this workspace." : "Connections are unavailable."}{catalog.reason ? ` (${catalog.reason})` : ""}</p>;
  const items = filterConnections(catalog.items, query);
  return (
    <div className="connection-catalog" data-testid="connection-catalog">
      <label htmlFor="connection-search">Search connections</label>
      <input id="connection-search" className="connection-search" value={query} onChange={event => setQuery(event.target.value)} />
      {items.length === 0 ? <p className="connection-empty" data-testid="connection-catalog-status">No connections are available to this workspace.</p> : (
        <ul className="connection-list">
          {items.map(connection => {
            const reason = connectionStatusReason(connection);
            const can = (action: string) => connection.allowedActions.includes(action);
            return (
              <li key={connection.connectionId} className="connection-row" data-testid={`connection-${connection.connectionId}`} data-kind={connection.kind} data-status={connection.status} data-revision={connection.revision}>
                <span className="connection-name">{connection.displayName}</span>
                <span className="connection-kind" data-testid={`connection-kind-${connection.connectionId}`}>{CONNECTION_KIND_LABELS[connection.kind]}</span>
                <span className="connection-status-label" data-testid={`connection-status-${connection.connectionId}`}>{CONNECTION_STATUS_LABELS[connection.status]}</span>
                <span className="connection-permissions" data-testid={`connection-permissions-${connection.connectionId}`}>{connection.permissions.length > 0 ? connection.permissions.join(", ") : "No declared permissions"}</span>
                {reason ? <span className="connection-reason" data-testid={`connection-reason-${connection.connectionId}`}>{reason}</span> : null}
                {can("connection.connect") ? <button type="button" onClick={() => onCommand?.("connect", connection)}>Connect</button> : null}
                {can("connection.disconnect") ? <button type="button" onClick={() => onCommand?.("disconnect", connection)}>Disconnect</button> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default ConnectionCatalog;
