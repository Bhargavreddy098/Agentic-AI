import type {
  WorkspaceSession, Page, Catalog, ConversationSummary, ConversationSnapshot,
  ConversationPatch, SendMessageInput, UiCommandResult, UiEvent, ClarificationAnswer,
  ApprovalDecisionInput, UploadIntent, UploadView, ProviderView, ModelView, SkillView,
  ConnectionView, MemorySearchInput, MemoryView, ActivityQuery, TaskView, SettingsView, UiMutationCommand,
} from "@asi/contracts";

export interface GatewayClient {
  getMe(): Promise<WorkspaceSession>;
  listConversations(cursor?: string): Promise<Page<ConversationSummary>>;
  createConversation(commandId: string): Promise<ConversationSummary>;
  updateConversation(id: string, input: ConversationPatch): Promise<UiCommandResult>;
  getSnapshot(id: string): Promise<ConversationSnapshot>;
  sendMessage(id: string, input: SendMessageInput): Promise<UiCommandResult>;
  subscribe(id: string, after: number, signal: AbortSignal): AsyncIterable<UiEvent>;
  cancelRun(runId: string, commandId: string): Promise<UiCommandResult>;
  answerClarification(id: string, input: ClarificationAnswer): Promise<UiCommandResult>;
  decideApproval(id: string, input: ApprovalDecisionInput): Promise<UiCommandResult>;
  beginUpload(input: UploadIntent): Promise<UploadView>;
  uploadContent(id: string, file: File, signal: AbortSignal): Promise<void>;
  completeUpload(id: string, commandId: string): Promise<UploadView>;
  getModels(): Promise<Catalog<ModelView>>;
  getProviders(): Promise<Catalog<ProviderView>>;
  getSkills(): Promise<Catalog<SkillView>>;
  getConnections(): Promise<Catalog<ConnectionView>>;
  queryMemory(input: MemorySearchInput): Promise<Page<MemoryView>>;
  getActivity(input: ActivityQuery): Promise<Page<TaskView>>;
  getSettings(): Promise<SettingsView>;
  submitCommand(command: UiMutationCommand): Promise<UiCommandResult>;
}

export const gatewayBase = "/api/ui/v1";
export const gatewayEndpoints = {
  me: ["GET", "/me"], conversations: ["GET", "/conversations"], createConversation: ["POST", "/conversations"],
  updateConversation: ["PATCH", "/conversations/:id"], snapshot: ["GET", "/conversations/:id/snapshot"],
  sendMessage: ["POST", "/conversations/:id/messages"], events: ["GET", "/conversations/:id/events"],
  cancelRun: ["POST", "/runs/:id/cancel"], answerClarification: ["POST", "/clarifications/:id/answers"],
  decideApproval: ["POST", "/approvals/:id/decisions"], uploads: ["POST", "/uploads"],
  uploadContent: ["PUT", "/uploads/:id/content"], completeUpload: ["POST", "/uploads/:id/complete"],
  models: ["GET", "/models"], providers: ["GET", "/providers"], skills: ["GET", "/skills"],
  connections: ["GET", "/connections"], memory: ["GET", "/memory"], activity: ["GET", "/activity"],
  settings: ["GET", "/settings"], commands: ["POST", "/commands"],
} as const;
export function gatewayPath(endpoint: keyof typeof gatewayEndpoints, id?: string): string {
  const path = gatewayEndpoints[endpoint][1];
  if (path.includes(":id") && !id) throw new Error("Endpoint requires an opaque ID");
  return gatewayBase + path.replace(":id", encodeURIComponent(id ?? ""));
}
