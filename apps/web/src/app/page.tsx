import Link from "next/link";
import { Button, Message, MessageContent, Textarea } from "@asi/ui";

export default function FoundationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>ASI Workspace</span>
          <span aria-hidden="true">·</span>
          <span>Foundation preview</span>
        </div>
        <Link
          href="/chat"
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground no-underline"
        >
          Open Workspace →
        </Link>
      </div>
      <h1 className="foundation-heading text-4xl font-normal tracking-tight">
        A clear workspace.
        <br />A governed execution flow.
      </h1>
      <p className="max-w-xl text-sm text-muted-foreground">
        The shared presentation layer is ready. Chat, inline questions and approvals follow the same Gateway contracts.
      </p>
      <section
        aria-label="Component qualification preview"
        className="rounded-2xl border border-border bg-[var(--card)] p-6"
      >
        <Message from="assistant">
          <MessageContent>
            <p>
              This preview uses pinned AI Elements message components and shadcn controls. Agent execution is not
              connected.
            </p>
          </MessageContent>
        </Message>
        <div className="mt-8 space-y-3">
          <Textarea
            aria-label="Preview composer"
            placeholder="Chat will be available after the Gateway simulator is built"
            disabled
          />
          <Button disabled>Send unavailable</Button>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">No model credentials or external actions are enabled.</p>
    </main>
  );
}
