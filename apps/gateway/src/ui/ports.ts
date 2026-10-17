import type {
  ActivityQuery,
  ApprovalDecisionInput,
  ArtifactView,
  Catalog,
  ClarificationAnswer,
  ConnectionView,
  ConversationPatch,
  ConversationSummary,
  GoalView,
  Interaction,
  MemorySearchInput,
  MemoryView,
  ModelView,
  Page,
  PlanView,
  ProjectView,
  ProviderView,
  SendMessageInput,
  SettingsView,
  SkillView,
  TaskView,
  ToolView,
  UiCommandResult,
  UiEvent,
  UiMessage,
  UiMutationCommand,
  UsageView,
  VerificationView,
} from "@asi/contracts";

export type RunStatus = NonNullable<ConversationSummary["activeRun"]>;

export interface UiPrincipal {
  subjectId: string;
  workspaceId: string;
  displayName: string;
  allowedActions: string[];
}

export interface UiConversationRecord {
  conversationId: string;
  workspaceId: string;
  title: string;
  lastUpdatedAt: string;
  revision: number;
  lastEventSequence: number;
  pendingDecisionCount: number;
  runStatus: RunStatus | null;
  activeRunId: string | null;
  effectiveModel: string | null;
  messages: UiMessage[];
  interactions: Interaction[];
  tasks: TaskView[];
  tools: ToolView[];
  artifacts: ArtifactView[];
  goals?: GoalView[];
  plans?: PlanView[];
  verifications?: VerificationView[];
  projects?: ProjectView[];
  usage: UsageView;
  composerCapabilities: string[];
}

export interface UiControlPort {
  list(workspaceId: string, cursor?: string): Promise<Page<ConversationSummary>>;
  create(workspaceId: string, commandId: string): Promise<ConversationSummary>;
  read(workspaceId: string, conversationId: string): Promise<UiConversationRecord | null>;
  patch(workspaceId: string, conversationId: string, patch: ConversationPatch): Promise<UiCommandResult>;
  appendMessage(workspaceId: string, conversationId: string, input: SendMessageInput): Promise<UiCommandResult>;
  cancelRun(workspaceId: string, runId: string, commandId: string): Promise<UiCommandResult>;
  answerClarification(workspaceId: string, interactionId: string, input: ClarificationAnswer): Promise<UiCommandResult>;
  decideApproval(workspaceId: string, interactionId: string, input: ApprovalDecisionInput): Promise<UiCommandResult>;
  submitCommand(workspaceId: string, command: UiMutationCommand): Promise<UiCommandResult>;
}

export interface UiEpisodePort {
  readEvents(workspaceId: string, conversationId: string, after: number): Promise<UiEvent[]>;
}

export interface UiUploadScanInput {
  workspaceId: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  digest: string;
}

export interface UiUploadScanResult {
  status: "ready" | "rejected" | "unavailable";
  attachmentId?: string;
  reason?: string;
}

export interface UiUploadPort {
  scan(input: UiUploadScanInput): Promise<UiUploadScanResult>;
  discard(workspaceId: string, uploadId: string): Promise<void>;
}

export interface UiAuthPort {
  verifyAssertion(assertion: string): Promise<UiPrincipal | null>;
}

export interface UiAuthorizationPort {
  allowedActions(workspaceId: string): Promise<string[]>;
}

export interface UiCatalogPorts {
  providers?(workspaceId: string): Promise<Catalog<ProviderView>>;
  models?(workspaceId: string): Promise<Catalog<ModelView>>;
  skills?(workspaceId: string): Promise<Catalog<SkillView>>;
  connections?(workspaceId: string): Promise<Catalog<ConnectionView>>;
  memory?(workspaceId: string, input: MemorySearchInput): Promise<Page<MemoryView>>;
  activity?(workspaceId: string, input: ActivityQuery): Promise<Page<TaskView>>;
  settings?(workspaceId: string): Promise<SettingsView>;
}

export interface UiUploadLimits {
  maxMessageBytes: number;
  maxAttachmentBytes: number;
  maxAttachmentCount: number;
}

export const DEFAULT_UPLOAD_LIMITS: UiUploadLimits = {
  maxMessageBytes: 1_048_576,
  maxAttachmentBytes: 16_777_216,
  maxAttachmentCount: 16,
};
