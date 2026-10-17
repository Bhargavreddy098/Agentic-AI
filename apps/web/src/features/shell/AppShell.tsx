"use client";
import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@asi/ui";
import { sections } from "../../lib/navigation";
import { useWorkspace } from "./WorkspaceProvider";

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();
  const pending = workspace.conversations.reduce((total, item) => total + item.pendingDecisionCount, 0);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [creating, setCreating] = useState(false);
  const command = useRef<string | null>(null);
  const busy = useRef(false);
  const menu = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  const close = () => {
    setOpen(false);
    menu.current?.focus();
  };

  const createConversation = async () => {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    command.current ??= crypto.randomUUID();
    try {
      const conversation = await workspace.client.createConversation(command.current);
      command.current = null;
      setOpen(false);
      router.push(`/chat/${encodeURIComponent(conversation.conversationId)}`);
      await workspace.refresh();
    } catch {
      // Retries will reuse the command ID
    } finally {
      busy.current = false;
      setCreating(false);
    }
  };

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !mobile) return;
    sidebar.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menu.current?.focus();
      }
      if (event.key === "Tab") {
        const nodes = sidebar.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        const first = nodes?.[0];
        const last = nodes?.[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [open, mobile]);

  return (
    <div className="workspace-shell">
      <a href="#main-content" className="sr-only">Skip to content</a>
      <aside
        ref={sidebar}
        role="complementary"
        aria-label="Workspace sidebar"
        inert={mobile && !open}
        className={`workspace-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      >
        <div className="sidebar-header">
          <Link href="/chat" className="sidebar-brand" onClick={close} aria-label="ASI Home">
            <span className="brand-symbol" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/>
              </svg>
            </span>
            <span className="brand-title">ASI</span>
          </Link>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className="sidebar-icon-btn"
              aria-label="Notifications"
              title={pending > 0 ? `${pending} pending decisions` : "Notifications"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              {pending > 0 && <span className="notification-dot" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="sidebar-icon-btn"
              aria-label="Search"
              title="Search"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
            </button>
            <Button
              className="desktop-menu sidebar-icon-btn"
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              onClick={() => setCollapsed(v => !v)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <path d="M9 3v18"/>
              </svg>
            </Button>
          </div>
        </div>

        <div className="sidebar-action-row">
          <Button
            className="sidebar-new-btn"
            variant="outline"
            aria-label="New conversation"
            onClick={() => void createConversation()}
            disabled={creating || !workspace.session?.allowedActions.includes("chat")}
          >
            <svg className="plus-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="btn-label">{creating ? "Creating…" : "New conversation"}</span>
          </Button>
        </div>

        <div className="sidebar-scrollable">
          <nav aria-label="Primary navigation" className="workspace-navigation">
            {sections.map(section => {
              const isChat = section.route === "/chat";
              const isActive = isChat
                ? path === "/chat" || path.startsWith("/chat/")
                : path.startsWith(section.route);
              return (
                <div key={section.route} className="nav-item-row">
                  <Link
                    href={section.route}
                    aria-label={section.label}
                    aria-current={isActive ? "page" : undefined}
                    className={`nav-link ${isActive ? "active" : ""}`}
                    onClick={close}
                  >
                    <span className="nav-mark" aria-hidden="true">
                      {section.route === "/chat" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      )}
                      {section.route === "/models" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2"/></svg>
                      )}
                      {section.route === "/skills" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>
                      )}
                      {section.route === "/connections" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8M4.93 10.93l5.66-5.66M2 18h8M20 6l-6 6M17.66 17.66l-5.66-5.66M22 18h-8M12 22v-8"/></svg>
                      )}
                      {section.route === "/memory" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
                      )}
                      {section.route === "/activity" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      )}
                      {section.route === "/settings" && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      )}
                    </span>
                    <span className="nav-label">{section.label}</span>
                  </Link>
                  {section.route === "/chat" && pending > 0 && !collapsed && (
                    <span aria-label={`${pending} pending decisions`} className="pending-counter">
                      {pending}
                    </span>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="sidebar-section-divider" />

          <div className="sidebar-recents" aria-label="Conversation history">
            <div className="recents-header">
              <span>Recents</span>
            </div>
            <div className="recents-list">
              {workspace.conversations.map(item => (
                <Link
                  key={item.conversationId}
                  href={`/chat/${encodeURIComponent(item.conversationId)}`}
                  aria-current={path === `/chat/${item.conversationId}` ? "page" : undefined}
                  className={`conversation-link ${path === `/chat/${item.conversationId}` ? "active" : ""}`}
                  onClick={close}
                >
                  <span className="conversation-title">{item.title}</span>
                  {item.pendingDecisionCount > 0 && (
                    <small className="pending-pill">{item.pendingDecisionCount} pending</small>
                  )}
                </Link>
              ))}
              {workspace.conversations.length === 0 && (
                <p className="rail-empty">
                  {workspace.connection === "connected"
                    ? "Your conversations will appear here."
                    : "Conversation history is unavailable until the Gateway connects."}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button type="button" className="upgrade-pill-btn">
            <span className="upgrade-arrow" aria-hidden="true">⇡</span>
            <span className="upgrade-label">Upgrade plan</span>
          </button>
          <div className="user-profile-row">
            <span className="user-avatar" aria-hidden="true">
              {(workspace.session?.displayName?.[0] ?? "U").toUpperCase()}
            </span>
            <div className="user-meta">
              <strong className="user-name">{workspace.session?.displayName ?? "Guest Workspace"}</strong>
              <small className="user-plan">{workspace.session?.demoMode ? "Free plan" : workspace.connection}</small>
            </div>
          </div>
        </div>
      </aside>

      {open && <button className="drawer-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={close} />}

      <div className="workspace-content">
        <p className="sr-only" role="status" aria-live="polite" data-testid="pending-announcement">
          {pending > 0 ? `${pending} pending decision${pending === 1 ? "" : "s"} require your attention in Chat.` : ""}
        </p>
        <header className="workspace-header">
          <div className="topbar-left">
            <Button
              ref={menu}
              className="mobile-menu"
              variant="ghost"
              size="icon"
              aria-label="Toggle navigation"
              aria-expanded={open}
              onClick={() => setOpen(v => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" x2="20" y1="12" y2="12"/>
                <line x1="4" x2="20" y1="6" y2="6"/>
                <line x1="4" x2="20" y1="18" y2="18"/>
              </svg>
            </Button>
            <div className="topbar-plan-pill">
              {workspace.session?.demoMode && <span className="demo-badge">DEMO</span>}
              <span className="plan-label">{workspace.session?.demoMode ? "Free plan" : "Workspace"} · Upgrade</span>
            </div>
          </div>
          <div className="topbar-right">
            <button type="button" className="topbar-icon-btn" aria-label="Device view" title="Device preview">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="18" height="12" x="3" y="4" rx="2"/>
                <line x1="2" x2="22" y1="20" y2="20"/>
              </svg>
            </button>
          </div>
        </header>
        <div id="main-content" className="workspace-main-area">
          {children}
        </div>
      </div>
    </div>
  );
}
