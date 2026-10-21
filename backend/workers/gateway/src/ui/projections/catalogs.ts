import type {
  ActivityQuery,
  Catalog,
  ConnectionView,
  MemorySearchInput,
  MemoryView,
  ModelView,
  Page,
  ProviderView,
  SettingsView,
  SkillView,
  TaskView,
} from "@asi/contracts";
import type { UiAuthorizationPort, UiCatalogPorts } from "../ports.js";

export const CATALOG_READ_ACTION = "catalog.read";

export interface BackendProviderRecord {
  providerId: string;
  displayName: string;
  status: ProviderView["status"];
  credentialLabel?: string;
  revision: number;
  allowedActions: string[];
  credentialRef?: string;
  apiKey?: string;
  endpoint?: string;
}

export interface BackendModelRecord {
  modelId: string;
  providerId: string;
  displayName: string;
  locality: ModelView["locality"];
  status: ModelView["status"];
  preferred: boolean;
  revision: number;
  allowedActions: string[];
  costPerTokenMicroUsd?: number;
}

export interface BackendSkillRecord {
  skillId: string;
  displayName: string;
  description: string;
  skillVersion: string;
  status: SkillView["status"];
  trustStatus: SkillView["trustStatus"];
  requiredPermissions: string[];
  revision: number;
  allowedActions: string[];
  signingKeyRef?: string;
}

export interface BackendConnectionRecord {
  connectionId: string;
  displayName: string;
  kind: ConnectionView["kind"];
  status: ConnectionView["status"];
  permissions: string[];
  revision: number;
  allowedActions: string[];
  tokenRef?: string;
  secret?: string;
}

export interface BackendMemoryRecord {
  memoryId: string;
  scope: MemoryView["scope"];
  value: string;
  sourceIds: string[];
  confidence: number;
  revision: number;
  allowedActions: string[];
  embedding?: number[];
}

export interface BackendSettingsRecord {
  availability: SettingsView["availability"];
  privacyMode: SettingsView["privacyMode"];
  spendLimitMicroUsd: number | null;
  retentionDays: number | null;
  notifications: boolean;
  scheduleEnabled: boolean;
  revision: number;
  allowedActions: string[];
  encryptionKeyRef?: string;
}

const intersect = (actions: string[], allowed: string[]): string[] => actions.filter(action => allowed.includes(action));

function withRevision<T extends { revision: number }>(items: T[]): Catalog<T> {
  return { items, revision: items.reduce((highest, item) => Math.max(highest, item.revision), 0), availability: "ready" };
}

function unavailableCatalog<T>(reason: string): Catalog<T> {
  return { items: [], revision: 0, availability: "unavailable", reason };
}

function permissionDeniedCatalog<T>(reason: string): Catalog<T> {
  return { items: [], revision: 0, availability: "permission_denied", reason };
}

function unavailableSettings(availability: SettingsView["availability"] = "unavailable"): SettingsView {
  return { revision: 0, allowedActions: [], availability, privacyMode: "unavailable", spendLimitMicroUsd: null, retentionDays: null, notifications: false, scheduleEnabled: false };
}

export function projectProviderView(record: BackendProviderRecord, allowed: string[]): ProviderView {
  return {
    providerId: record.providerId,
    displayName: record.displayName,
    status: record.status,
    ...(record.credentialLabel ? { credentialLabel: record.credentialLabel } : {}),
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export function projectModelView(record: BackendModelRecord, allowed: string[]): ModelView {
  return {
    modelId: record.modelId,
    providerId: record.providerId,
    displayName: record.displayName,
    locality: record.locality,
    status: record.status,
    preferred: record.preferred,
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export function projectSkillView(record: BackendSkillRecord, allowed: string[]): SkillView {
  return {
    skillId: record.skillId,
    displayName: record.displayName,
    description: record.description,
    skillVersion: record.skillVersion,
    status: record.status,
    trustStatus: record.trustStatus,
    requiredPermissions: record.requiredPermissions,
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export function projectConnectionView(record: BackendConnectionRecord, allowed: string[]): ConnectionView {
  return {
    connectionId: record.connectionId,
    displayName: record.displayName,
    kind: record.kind,
    status: record.status,
    permissions: record.permissions,
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export function projectMemoryView(record: BackendMemoryRecord, allowed: string[]): MemoryView {
  return {
    memoryId: record.memoryId,
    scope: record.scope,
    value: record.value,
    sourceIds: record.sourceIds,
    confidence: record.confidence,
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export function projectSettingsView(record: BackendSettingsRecord, allowed: string[]): SettingsView {
  return {
    availability: record.availability,
    privacyMode: record.privacyMode,
    spendLimitMicroUsd: record.spendLimitMicroUsd,
    retentionDays: record.retentionDays,
    notifications: record.notifications,
    scheduleEnabled: record.scheduleEnabled,
    revision: record.revision,
    allowedActions: intersect(record.allowedActions, allowed),
  };
}

export interface CatalogAdapters {
  providers?(): Promise<BackendProviderRecord[]>;
  models?(): Promise<BackendModelRecord[]>;
  skills?(): Promise<BackendSkillRecord[]>;
  connections?(): Promise<BackendConnectionRecord[]>;
  memory?(input: MemorySearchInput): Promise<Page<BackendMemoryRecord>>;
  activity?(input: ActivityQuery): Promise<Page<TaskView>>;
  settings?(): Promise<BackendSettingsRecord>;
}

export interface CatalogPortOptions {
  authorization: UiAuthorizationPort;
  readAction?: string;
}

export interface PortTaskEntry {
  port: string;
  systemTasks: string[];
  featureIds: string[];
  note?: string;
}

export const PORT_TASK_MATRIX: PortTaskEntry[] = [
  { port: "providers.read", systemTasks: ["06", "07", "11"], featureIds: ["F03"] },
  { port: "models.read", systemTasks: ["06", "11"], featureIds: ["F03"] },
  { port: "skills.read", systemTasks: ["07", "13", "18"], featureIds: ["F13"] },
  { port: "connections.read", systemTasks: ["07", "13", "20"], featureIds: ["F13"] },
  { port: "connections.mcp", systemTasks: ["22"], featureIds: ["F13"], note: "Unavailable until system task 22 passes." },
  { port: "connections.a2a", systemTasks: ["23"], featureIds: ["F13"], note: "Unavailable until system task 23 passes." },
  { port: "memory.read", systemTasks: ["07", "09"], featureIds: ["F09"] },
  { port: "activity.read", systemTasks: ["04", "05", "10"], featureIds: ["F12"] },
  { port: "settings.read", systemTasks: ["06", "07", "21", "25"], featureIds: ["F17"] },
];

export function createCatalogPorts(adapters: CatalogAdapters, options: CatalogPortOptions): UiCatalogPorts {
  const readAction = options.readAction ?? CATALOG_READ_ACTION;
  const gate = async (workspaceId: string) => {
    const actions = await options.authorization.allowedActions(workspaceId);
    return { allowed: actions.includes(readAction), actions };
  };

  return {
    async providers(workspaceId) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed) return permissionDeniedCatalog("Provider catalog requires the catalog.read action.");
      if (!adapters.providers) return unavailableCatalog("Provider catalog is not available in this build.");
      return withRevision((await adapters.providers()).map(record => projectProviderView(record, actions)));
    },
    async models(workspaceId) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed) return permissionDeniedCatalog("Model catalog requires the catalog.read action.");
      if (!adapters.models) return unavailableCatalog("Model catalog is not available in this build.");
      return withRevision((await adapters.models()).map(record => projectModelView(record, actions)));
    },
    async skills(workspaceId) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed) return permissionDeniedCatalog("Skill catalog requires the catalog.read action.");
      if (!adapters.skills) return unavailableCatalog("Skill catalog is not available in this build.");
      return withRevision((await adapters.skills()).map(record => projectSkillView(record, actions)));
    },
    async connections(workspaceId) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed) return permissionDeniedCatalog("Connection catalog requires the catalog.read action.");
      if (!adapters.connections) return unavailableCatalog("Connection catalog is not available in this build.");
      return withRevision((await adapters.connections()).map(record => projectConnectionView(record, actions)));
    },
    async memory(workspaceId, input) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed || !adapters.memory) return { items: [], nextCursor: null };
      const page = await adapters.memory(input);
      return { items: page.items.map(record => projectMemoryView(record, actions)), nextCursor: page.nextCursor };
    },
    async activity(workspaceId, input) {
      const { allowed } = await gate(workspaceId);
      if (!allowed || !adapters.activity) return { items: [], nextCursor: null };
      return adapters.activity(input);
    },
    async settings(workspaceId) {
      const { allowed, actions } = await gate(workspaceId);
      if (!allowed) return unavailableSettings("permission_denied");
      if (!adapters.settings) return unavailableSettings();
      return projectSettingsView(await adapters.settings(), actions);
    },
  };
}
