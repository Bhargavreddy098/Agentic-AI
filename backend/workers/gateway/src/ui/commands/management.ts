import type { UiCommandResult, UiMutationCommand } from "@asi/contracts";
import { normalizedError } from "../errors.js";
import type { UiAuthorizationPort, UiControlPort } from "../ports.js";

export const MANAGEMENT_MANAGE_ACTION = "catalog.manage";

const GATED_COMMANDS = new Set<UiMutationCommand["type"]>([
  "provider.connect",
  "provider.disconnect",
  "skill.install",
  "connection.connect",
  "settings.update",
]);

export interface CredentialStoreResult {
  status: "stored" | "rejected" | "unavailable";
  credentialRef?: string;
  label?: string;
  reason?: string;
}

export interface UiCredentialPort {
  store(workspaceId: string, providerId: string, credential: string): Promise<CredentialStoreResult>;
}

export function isGatedCommand(command: UiMutationCommand): boolean {
  return GATED_COMMANDS.has(command.type);
}

export function redactCommand(command: UiMutationCommand): Record<string, unknown> {
  if (command.type === "provider.connect") {
    return { type: command.type, commandId: command.commandId, providerId: command.providerId, credential: "[redacted]", expectedRevision: command.expectedRevision };
  }
  return { ...command };
}

export interface ManagementCommandOptions {
  control: UiControlPort;
  authorization: UiAuthorizationPort;
  credentials?: UiCredentialPort;
  manageAction?: string;
}

export type ManagementCommandHandler = (workspaceId: string, command: UiMutationCommand) => Promise<UiCommandResult>;

export function createManagementCommands(options: ManagementCommandOptions): ManagementCommandHandler {
  const manageAction = options.manageAction ?? MANAGEMENT_MANAGE_ACTION;
  return async (workspaceId, command) => {
    const actions = await options.authorization.allowedActions(workspaceId);
    if (!actions.includes(manageAction)) {
      return { status: "rejected", commandId: command.commandId, revision: command.expectedRevision, error: normalizedError("POLICY_DENIED", "Workspace is not authorized to manage configuration.") };
    }
    if (command.type === "provider.connect" && options.credentials) {
      let stored: CredentialStoreResult;
      try {
        stored = await options.credentials.store(workspaceId, command.providerId, command.credential);
      } catch {
        stored = { status: "unavailable", reason: "Credential service is unavailable." };
      }
      if (stored.status === "rejected") {
        return { status: "rejected", commandId: command.commandId, revision: command.expectedRevision, error: normalizedError("POLICY_DENIED", stored.reason ?? "Provider credential was rejected.") };
      }
      if (stored.status === "unavailable") {
        return { status: "rejected", commandId: command.commandId, revision: command.expectedRevision, error: normalizedError("DEPENDENCY_UNAVAILABLE", stored.reason ?? "Credential service is unavailable.", true) };
      }
    }
    return options.control.submitCommand(workspaceId, command);
  };
}
