"use client";
import { useCallback, useEffect, useRef } from "react";
import type { ApprovalDecisionInput, ArtifactView, ClarificationAnswer, GoalView, Interaction, TaskView, ToolView, UiCommandResult, UiMessage, VerificationView } from "@asi/contracts";
import { MessageRenderer } from "./MessageRenderer";
import { ClarificationCard } from "./ClarificationCard";
import { ApprovalCard } from "./ApprovalCard";
import { TaskProgressCard } from "./TaskProgressCard";
import { ToolActivityCard } from "./ToolActivityCard";
import { ArtifactCard } from "./ArtifactCard";
import { VerificationCard } from "./cards/VerificationCard";
import { GoalCard } from "./cards/GoalCard";
import { cn } from "../../lib/utils/cn";

interface ConversationPanelProps {
  messages: UiMessage[];
  connection?: string;
  notice?: string | null;
  interactions?: Interaction[];
  tasks?: TaskView[];
  tools?: ToolView[];
  artifacts?: ArtifactView[];
  verifications?: VerificationView[];
  goals?: GoalView[];
  onAnswer?: (questionId: string, answer: ClarificationAnswer) => Promise<UiCommandResult>;
  onDecide?: (approvalId: string, input: ApprovalDecisionInput) => Promise<UiCommandResult>;
  onRefresh?: () => void;
  onFollowToggle?: (follow: boolean) => void;
  follow?: boolean;
  className?: string;
}

export function ConversationPanel({ messages, connection = "connected", notice, interactions = [], tasks = [], tools = [], artifacts = [], verifications = [], goals = [], onAnswer, onDecide, onRefresh, onFollowToggle, follow = true, className }: ConversationPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);
  const isUserScrollingRef = useRef(false);
  followRef.current = follow;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = endRef.current;
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior });
  }, []);

  useEffect(() => { if (followRef.current && !isUserScrollingRef.current) scrollToBottom(); }, [messages.length, interactions.length, tasks.length, tools.length, artifacts.length, verifications.length, goals.length, scrollToBottom]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    isUserScrollingRef.current = !isAtBottom;
    onFollowToggle?.(isAtBottom);
  }, [onFollowToggle]);

  const decisions = interactions.filter(item => item.type === "clarification" ? Boolean(onAnswer) : Boolean(onDecide));
  const hasActivity = decisions.length > 0 || tasks.length > 0 || tools.length > 0 || artifacts.length > 0 || verifications.length > 0 || goals.length > 0;

  return <div data-testid="conversation-panel" className={cn("conversation-panel", className)}>
    <p className="conversation-status" data-testid="connection-status" role="status">{connection}{notice ? ` · ${notice}` : ""}</p>
    <div className="conversation-log" onScroll={handleScroll} role="log" aria-live="polite" aria-label="Conversation">
      {messages.length === 0 ? <p className="conversation-status">No messages yet. Start a conversation by sending a message.</p> : messages.map(message => <MessageRenderer key={message.messageId} message={message} />)}
      <div ref={endRef} />
    </div>
    {hasActivity ? <div className="conversation-decisions" data-testid="conversation-decisions" aria-label="Decisions and activity">
      {decisions.map(item => item.type === "clarification"
        ? <ClarificationCard key={item.interactionId} question={item} onSubmit={onAnswer!} {...(onRefresh ? { onConflict: onRefresh } : {})} />
        : <ApprovalCard key={item.interactionId} approval={item} onDecide={onDecide!} {...(onRefresh ? { onChanged: onRefresh } : {})} />)}
      {tasks.map(task => <TaskProgressCard key={task.taskId} task={task} />)}
      {tools.map(tool => <ToolActivityCard key={tool.toolId} tool={tool} />)}
      {artifacts.map(artifact => <ArtifactCard key={artifact.artifactId} artifact={artifact} />)}
      {goals.map(goal => <GoalCard key={goal.goalId} goal={goal} verification={verifications.find(verification => verification.goalId === goal.goalId && verification.goalRevision === goal.revision) ?? null} />)}
      {verifications.map(verification => <VerificationCard key={verification.reportId} verification={verification} />)}
    </div> : null}
    <button type="button" className="conversation-follow" aria-pressed={followRef.current} onClick={() => onFollowToggle?.(!followRef.current)}>{followRef.current ? "Following" : "Follow"}</button>
  </div>;
}
export default ConversationPanel;
