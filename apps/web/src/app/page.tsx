import { Button, Message, MessageContent, Textarea } from "@asi/ui";
export default function FoundationPage() {
  return <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
    <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-primary" />ASI WORKSPACE<span className="rounded-full border px-3 py-1">Foundation preview</span></div>
    <h1 className="text-4xl font-semibold tracking-tight">A clear workspace.<br />A governed execution flow.</h1>
    <p className="max-w-xl text-muted-foreground">The shared presentation layer is ready. Chat, inline questions and approvals follow the same Gateway contracts.</p>
    <section aria-label="Component qualification preview" className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <Message from="assistant"><MessageContent><p>This preview uses pinned AI Elements message components and shadcn controls. Agent execution is not connected.</p></MessageContent></Message>
      <div className="mt-8 space-y-3"><Textarea aria-label="Preview composer" placeholder="Chat will be available after the Gateway simulator is built" disabled /><Button disabled>Send unavailable</Button></div>
    </section>
    <p className="text-xs text-muted-foreground">No model credentials or external actions are enabled.</p>
  </main>;
}
