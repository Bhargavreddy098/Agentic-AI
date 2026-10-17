"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, Monitor, Plus, Search } from "lucide-react";
import type { ConversationSnapshot, UiCommandResult } from "@asi/contracts";
import { AsiMark } from "../shell/AppShell";
import { useWorkspace } from "../shell/WorkspaceProvider";
import Composer from "./Composer";
import ConversationPanel from "./ConversationPanel";

export default function ChatFrame() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const state = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const currentSnapshot =
    conversationId && state.conversation && state.conversation.snapshot.conversationId === conversationId
      ? state.conversation.snapshot
      : null;
  const [error, setError] = useState<string | null>(null);
  const createCommandRef = useRef<string | null>(null);
  const createdConversationRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId && workspace.session) void workspace.store.open(conversationId);
    return () => workspace.store.disconnect();
  }, [conversationId, workspace.store, workspace.session]);

  const welcomeSnapshot = useMemo<ConversationSnapshot | null>(() => {
    if (!workspace.session) return null;
    return {
      conversationId: "__welcome__",
      workspaceId: workspace.session.workspaceId,
      revision: 0,
      lastEventSequence: 0,
      messages: [],
      interactions: [],
      tasks: [],
      tools: [],
      artifacts: [],
      verifications: [],
      goals: [],
      runStatus: null,
      effectiveModel: "Model",
      usage: { inputTokens: null, outputTokens: null, costMicroUsd: null },
      composerCapabilities: ["send"],
    };
  }, [workspace.session]);

  const createAndSend = async ({
    text,
    attachmentIds,
  }: {
    text: string;
    attachmentIds: string[];
  }): Promise<UiCommandResult> => {
    setError(null);
    let targetConversationId = createdConversationRef.current;
    if (!targetConversationId) {
      createCommandRef.current ??= crypto.randomUUID();
      const created = await workspace.client.createConversation(createCommandRef.current);
      createCommandRef.current = null;
      targetConversationId = created.conversationId;
      createdConversationRef.current = targetConversationId;
    }
    const submission = workspace.store.submissionFor(targetConversationId);
    const result = await submission.submit(() => ({
      commandId: crypto.randomUUID(),
      clientMessageId: crypto.randomUUID(),
      expectedConversationRevision: 0,
      text,
      attachmentIds,
      requestedSkillIds: [],
    }));
    if (result.status === "applied") {
      createdConversationRef.current = null;
      router.push(`/chat/${encodeURIComponent(targetConversationId)}`);
      await workspace.refresh();
    }
    return result;
  };

  const refreshConversation = async () => {
    if (conversationId) await workspace.store.open(conversationId);
  };

  const interactions = currentSnapshot?.interactions ?? [];
  const tasks = currentSnapshot?.tasks ?? [];
  const tools = currentSnapshot?.tools ?? [];
  const artifacts = currentSnapshot?.artifacts ?? [];
  const verifications = currentSnapshot?.verifications ?? [];
  const goals = currentSnapshot?.goals ?? [];
  const hasContent = Boolean(
    currentSnapshot &&
      currentSnapshot.messages.length +
        interactions.length +
        tasks.length +
        tools.length +
        artifacts.length +
        verifications.length +
        goals.length >
        0,
  );

  const activeSnapshot = currentSnapshot ?? welcomeSnapshot;

  return (
    <main className="chat-layout">
      <section className={`chat-welcome ${hasContent ? "has-messages" : ""}`}>
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
            onRefresh={() => {
              void refreshConversation();
            }}
          />
        ) : (
          <div className="welcome-hero">
            <div className="welcome-symbol" aria-hidden="true">
              <AsiMark className="welcome-mark-svg" />
            </div>
            <h1>What do you want to know?</h1>
            {(error || state.error) ? <p role="alert" className="welcome-error">{error ?? state.error}</p> : null}
          </div>
        )}

        {activeSnapshot && workspace.session ? (
          <Composer
            key={conversationId ?? "__welcome__"}
            client={workspace.client}
            snapshot={activeSnapshot}
            session={workspace.session}
            draft={state.draft}
            submission={workspace.store.submissionFor(conversationId ?? "__welcome__")}
            onCancel={runId => workspace.store.cancel(runId)}
            onDraft={value => workspace.store.setDraft(value)}
            onRefresh={refreshConversation}
            {...(!currentSnapshot ? { onCreateAndSend: createAndSend } : {})}
          />
        ) : (
          <div className="chat-composer is-loading" aria-label="Composer loading">
            <div className="composer-loading-area">Ask anything...</div>
            <div className="composer-actions" aria-hidden="true">
              <div className="composer-toolbar-left">
                <span className="composer-attach-btn is-disabled">
                  <Plus className="size-4" />
                </span>
                <div className="composer-mode-group">
                  <span className="composer-mode-pill is-active">
                    <Search className="size-3.5" />
                    <span>Search</span>
                    <ChevronDown className="size-3" />
                  </span>
                  <span className="composer-mode-pill is-muted">
                    <Monitor className="size-3.5" />
                    <span>Computer</span>
                  </span>
                </div>
              </div>
              <div className="composer-toolbar-right">
                <span className="composer-model-pill">
                  <span>Model</span>
                  <ChevronDown className="size-3.5" />
                </span>
                <span className="composer-send-btn is-disabled">
                  <ArrowUp className="size-4" />
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
