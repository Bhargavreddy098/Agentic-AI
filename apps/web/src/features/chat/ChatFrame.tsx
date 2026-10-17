"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "../shell/WorkspaceProvider";
import Composer from "./Composer";
import WelcomeComposer from "./WelcomeComposer";
import ConversationPanel from "./ConversationPanel";

export default function ChatFrame() {
  const workspace = useWorkspace();
  const router = useRouter();
  const mounted = useRef(true);
  const identity = JSON.stringify([workspace.session?.workspaceId, workspace.session?.subjectId]);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const { conversationId } = useParams<{ conversationId?: string }>();
  const state = useSyncExternalStore(workspace.store.subscribe, workspace.store.getSnapshot, workspace.store.getSnapshot);
  const currentSnapshot = conversationId && state.conversation && state.conversation.snapshot.conversationId === conversationId
    ? state.conversation.snapshot
    : null;
  const [error] = useState<string | null>(null);

  useEffect(() => {
    if (conversationId && workspace.session) void workspace.store.open(conversationId);
    return () => workspace.store.disconnect();
  }, [conversationId, workspace.store, workspace.session]);

  const refreshConversation = () => {
    if (conversationId) void workspace.store.open(conversationId);
  };

  const interactions = currentSnapshot?.interactions ?? [];
  const tasks = currentSnapshot?.tasks ?? [];
  const tools = currentSnapshot?.tools ?? [];
  const artifacts = currentSnapshot?.artifacts ?? [];
  const verifications = currentSnapshot?.verifications ?? [];
  const goals = currentSnapshot?.goals ?? [];
  const hasContent = Boolean(currentSnapshot && (currentSnapshot.messages.length + interactions.length + tasks.length + tools.length + artifacts.length + verifications.length + goals.length > 0));

  if (!conversationId) {
    return (
      <main className="chat-layout chat-welcome-layout">
        <div className="chat-welcome-container">
          <div className="welcome-symbol" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07l14.14-14.14"/>
            </svg>
          </div>
          <h1 className="welcome-heading">What do you want to know?</h1>
          <div className="welcome-composer-wrapper">
            <WelcomeComposer
              key={JSON.stringify([workspace.session?.workspaceId, workspace.session?.subjectId])}
              submissionFor={id => workspace.store.submissionFor(id)}
              client={workspace.client}
              session={workspace.session}
              onConversationCreated={async (id, remainingDraft) => {
                if (remainingDraft) {
                  await workspace.store.open(id);
                  if (!mounted.current || latestIdentity.current !== identity) return;
                  if (workspace.store.getSnapshot().conversation?.snapshot.conversationId !== id) throw new Error("Conversation state unavailable; retry opening it.");
                  workspace.store.setDraft(remainingDraft);
                }
                if (!mounted.current || latestIdentity.current !== identity) return;
                router.push(`/chat/${encodeURIComponent(id)}`);
                void workspace.refresh();
              }}
            />
          </div>
          {(error || state.error) && <p role="alert" className="chat-error-notice">{error ?? state.error}</p>}
          <small className="welcome-disclaimer">
            {workspace.session?.demoMode ? "Demo preview · No model or tool execution connected" : "Execution requires an authenticated Gateway"}
          </small>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-layout chat-active-layout">
      <h1 className="sr-only">Conversation workspace</h1>
      <section className={`chat-conversation-container ${hasContent ? "has-messages" : ""}`}>
        {hasContent ? (
          <ConversationPanel
            messages={currentSnapshot!.messages}
            connection={state.connection}
            notice={state.conversation?.notice ?? state.error}
            interactions={interactions}
            tasks={tasks}
            tools={tools}
            artifacts={artifacts}
            verifications={verifications}
            goals={goals}
            onAnswer={(questionId, answer) => workspace.client.answerClarification(questionId, answer)}
            onDecide={(approvalId, input) => workspace.client.decideApproval(approvalId, input)}
            onRefresh={refreshConversation}
          />
        ) : (
          <div className="chat-empty-conversation">
            <p className="conversation-status">
              Conversation state: {state.connection}. Ask anything to start.
            </p>
          </div>
        )}
        {state.conversation && state.conversation.snapshot.conversationId === conversationId && workspace.session ? (
          <div className="chat-composer-dock">
            <Composer
              key={conversationId}
              client={workspace.client}
              snapshot={state.conversation.snapshot}
              session={workspace.session}
              draft={state.draft}
              submission={workspace.store.submissionFor(conversationId)}
              onCancel={runId => workspace.store.cancel(runId)}
              onDraft={value => workspace.store.setDraft(value)}
              onRefresh={() => workspace.store.open(conversationId)}
            />
            <small className="welcome-disclaimer">
              {workspace.session?.demoMode ? "Demo preview · No model or tool execution connected" : "Execution requires an authenticated Gateway"}
            </small>
          </div>
        ) : null}
      </section>
    </main>
  );
}
