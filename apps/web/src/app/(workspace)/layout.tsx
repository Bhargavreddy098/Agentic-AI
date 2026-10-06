import type { ReactNode } from "react";
import AppShell from "../../features/shell/AppShell";
import { WorkspaceProvider } from "../../features/shell/WorkspaceProvider";
export default function WorkspaceLayout({ children }: { children: ReactNode }) { return <WorkspaceProvider><AppShell>{children}</AppShell></WorkspaceProvider>; }
