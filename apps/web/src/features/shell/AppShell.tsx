"use client";
import type { ReactNode } from "react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@asi/ui";
import { sections } from "../../lib/navigation";
import { useWorkspace } from "./WorkspaceProvider";

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const workspace = useWorkspace();
  const pending = workspace.conversations.reduce((total, item) => total + item.pendingDecisionCount, 0);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const close = () => { setOpen(false); menu.current?.focus(); };
  useEffect(() => {
    const query = window.matchMedia("(max-width:767px)");
    const update = () => setMobile(query.matches); update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    sidebar.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menu.current?.focus(); }
      if (event.key === "Tab") {
        const nodes = sidebar.current?.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
        const first = nodes?.[0], last = nodes?.[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [open, mobile]);
  const active = sections.find(section => path.startsWith(section.route));
  return <div className="workspace-shell">
    <aside ref={sidebar} inert={mobile && !open} className={`workspace-sidebar ${open ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      <Link href="/chat" className="workspace-brand" onClick={() => setOpen(false)}><span className="brand-symbol">a</span><span>ASI<span className="brand-caption">WORKSPACE</span></span></Link>
      <div className="workspace-pill"><span className="status-dot" />{workspace.session?.displayName ?? "Workspace unavailable"}</div>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Primary navigation" className="workspace-navigation">{sections.map(section => <Link key={section.route} href={section.route} aria-label={section.label} aria-current={path.startsWith(section.route) ? "page" : undefined} onClick={close}><span className="nav-mark" aria-hidden="true">{section.mark}</span><span>{section.label}</span>{section.route === "/chat" && pending > 0 && <span aria-label={`${pending} pending decisions`} className="demo-badge">{pending}</span>}{path.startsWith(section.route) && <span className="active-dot" />}</Link>)}</nav>
      <div className="sidebar-footer"><div className="demo-note"><strong>{workspace.session?.demoMode ? "Demo workspace" : "Gateway status"}</strong><p>{workspace.session?.demoMode ? "Execution is simulated. Your models and tools stay disconnected." : "Connect the authorized Gateway to enable execution."}</p></div><div className="profile-row"><span className="avatar">A</span><div><strong>{workspace.session?.displayName ?? "No authenticated workspace"}</strong><small>{workspace.connection}</small></div></div></div>
    </aside>
    {open && <button className="drawer-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={close} />}
    <div className="workspace-content"><header className="workspace-header"><div className="header-title"><Button ref={menu} className="mobile-menu" variant="ghost" size="icon" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(value => !value)}>☰</Button><Button className="desktop-menu" variant="ghost" size="icon" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} onClick={() => setCollapsed(value => !value)}>☰</Button><span className="header-breadcrumb">Workspace</span><span className="breadcrumb-divider">/</span><strong>{active?.label ?? "Overview"}</strong></div><div className="header-status">{workspace.session?.demoMode && <span className="demo-badge">DEMO</span>}<span className="status-dot" /><span>{workspace.connection}</span></div></header>{children}</div>
  </div>;
}
