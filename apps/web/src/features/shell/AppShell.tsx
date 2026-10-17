"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Cpu,
  Database,
  Menu,
  MessageSquare,
  PanelLeft,
  Plug,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { PRIMARY_SECTIONS, activeSection, rememberSectionPath, sectionHref, type SectionId } from "../../lib/navigation";
import { useWorkspace } from "./WorkspaceProvider";

const SECTION_ICONS: Record<SectionId, typeof MessageSquare> = {
  chat: MessageSquare,
  models: Cpu,
  skills: Sparkles,
  connections: Plug,
  memory: Database,
  activity: Activity,
  settings: Settings,
};

export function AsiMark({ className = "asi-mark-svg" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2.5v23" />
      <path d="M5.5 7.5l17 13" />
      <path d="M22.5 7.5l-17 13" />
      <path d="M14 5.5l6.5 4.5v8L14 22.5 7.5 18v-8L14 5.5z" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/chat";
  const router = useRouter();
  const active = activeSection(pathname);
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sectionMemory, setSectionMemory] = useState<Partial<Record<SectionId, string>>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const commandRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    setSectionMemory(prev => rememberSectionPath(prev, pathname));
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
        mobileToggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const createConversation = async () => {
    if (busyRef.current) return;
    if (workspace.session && !workspace.session.allowedActions.includes("chat")) return;
    busyRef.current = true;
    setCreateError(null);
    commandRef.current ??= crypto.randomUUID();
    try {
      const conversation = await workspace.client.createConversation(commandRef.current);
      commandRef.current = null;
      router.push(`/chat/${encodeURIComponent(conversation.conversationId)}`);
      await workspace.refresh();
    } catch {
      setCreateError("Conversation request unavailable. Retry uses the same command identity.");
    } finally {
      busyRef.current = false;
    }
  };

  const pending = workspace.conversations.reduce((sum, item) => sum + item.pendingDecisionCount, 0);
  const canCreateChat = workspace.session ? workspace.session.allowedActions.includes("chat") : true;

  return (
    <div className="workspace-shell">
      <aside className={`workspace-sidebar ${collapsed ? "is-collapsed" : ""} ${drawerOpen ? "is-open" : ""}`}>
        <div className="sidebar-top-row">
          <Link href="/chat" className="workspace-brand">
            <span className="brand-symbol">
              <AsiMark className="size-5" />
            </span>
            <span className="brand-wordmark">ASI Workspace</span>
          </Link>
          <div className="sidebar-top-actions">
            <Link href="/memory" className="sidebar-icon-btn" aria-label="Search memory" title="Search memory">
              <Search className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="desktop-menu sidebar-icon-btn"
              aria-label="Toggle navigation"
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(value => !value)}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="button"
          className="sidebar-new-button"
          onClick={() => void createConversation()}
          disabled={!canCreateChat}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span>New conversation</span>
        </button>

        {createError ? (
          <p role="alert" className="sidebar-error">
            {createError}
          </p>
        ) : null}

        <nav className="workspace-navigation" aria-label="Primary navigation">
          {PRIMARY_SECTIONS.map(item => {
            const href = sectionHref(item.id, sectionMemory);
            const current = item.id === active.id;
            const Icon = SECTION_ICONS[item.id];
            return (
              <Link key={item.id} href={href} aria-current={current ? "page" : undefined}>
                <Icon className="nav-icon" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-conversations" aria-label="Recent conversations">
          <div className="sidebar-section-label">Recent</div>
          {workspace.conversations.length > 0 ? (
            <div className="sidebar-conversation-list">
              {workspace.conversations.map(item => {
                const href = `/chat/${encodeURIComponent(item.conversationId)}`;
                const isCurrent = pathname === href;
                return (
                  <Link
                    className="conversation-link"
                    key={item.conversationId}
                    href={href}
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    <span className="conversation-link-title">{item.title}</span>
                    {item.pendingDecisionCount > 0 ? (
                      <small className="pending-pill">{item.pendingDecisionCount} pending</small>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="rail-empty">
              {workspace.connection === "connected"
                ? "Your conversations will appear here."
                : "Conversation history is unavailable until the Gateway connects."}
            </p>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-plan-row">
            <span className="sidebar-plan-pill">
              <span className="status-dot" aria-hidden="true" />
              <span>{workspace.session?.demoMode ? "Demo preview" : "Governed mode"}</span>
            </span>
          </div>
          <div className="profile-row">
            <span className="avatar" aria-hidden="true">
              {(workspace.session?.displayName ?? "A")[0]}
            </span>
            <div className="profile-meta">
              <strong>{workspace.session?.displayName ?? "No active session"}</strong>
              <small>
                {workspace.session
                  ? `${workspace.session.demoMode ? "Free preview" : "Live"} · ${workspace.session.workspaceId}`
                  : "Sign in through the Gateway"}
              </small>
            </div>
          </div>
        </div>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          className="drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => {
            setDrawerOpen(false);
            mobileToggleRef.current?.focus();
          }}
        />
      ) : null}

      <div className="workspace-content">
        <header className="workspace-header">
          <div className="header-title">
            <button
              ref={mobileToggleRef}
              type="button"
              className="mobile-menu sidebar-icon-btn"
              aria-label="Toggle navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(value => !value)}
            >
              <Menu className="size-4" aria-hidden="true" />
            </button>
            <div className="header-plan-pill">
              <span>{workspace.session?.demoMode ? "Demo preview" : "Governed workspace"}</span>
              <span className="breadcrumb-divider" aria-hidden="true">
                ·
              </span>
              <span className="header-section-name">{active.label}</span>
            </div>
          </div>
          <div className="header-status">
            <span className="sr-only" role="status" aria-live="polite">
              {pending > 0
                ? `${pending} pending decision${pending === 1 ? "" : "s"} awaiting review in Chat.`
                : ""}
            </span>
            {pending > 0 ? (
              <span
                className="demo-badge"
                data-count={`${pending} pending`}
                aria-label={`${pending} pending decisions`}
              />
            ) : null}
            <span className="header-connection-label">
              {workspace.connection === "connected"
                ? "Connected"
                : workspace.connection === "reconnecting"
                  ? "Reconnecting"
                  : "Offline"}
            </span>
            <Link href="/activity" className="header-icon-btn" aria-label="Activity and tasks" title="Activity & Tasks">
              <Activity className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/settings" className="header-icon-btn" aria-label="Workspace settings" title="Settings">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
