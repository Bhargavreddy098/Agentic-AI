import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <div className="flex flex-1 items-center gap-2 text-sm">
        <span className="font-medium text-foreground">Console</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">Chat</span>
      </div>
      <AnimatedBadge status="info" size="sm">
        beUI + OpenUI
      </AnimatedBadge>
    </header>
  );
}
