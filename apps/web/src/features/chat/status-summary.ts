export type RunStatus =
  | "accepted"
  | "queued"
  | "running"
  | "waiting_approval"
  | "suspended"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "budget_exhausted"
  | "unknown";

export interface StatusSummary {
  text: string;
  variant: "default" | "info" | "success" | "warning" | "error";
  icon?: string;
}

export interface StatusInput {
  status: RunStatus;
  progress?: number;
  currentStep?: string;
  error?: string;
  approvalSummary?: string;
}

const statusConfig: Record<RunStatus, { baseText: string; variant: StatusSummary["variant"]; icon: string }> = {
  accepted: { baseText: "Accepted", variant: "info", icon: "check-circle" },
  queued: { baseText: "Queued", variant: "info", icon: "clock" },
  running: { baseText: "Running", variant: "info", icon: "loader" },
  waiting_approval: { baseText: "Waiting for approval", variant: "warning", icon: "alert-circle" },
  suspended: { baseText: "Suspended", variant: "warning", icon: "pause-circle" },
  finalizing: { baseText: "Finalizing", variant: "info", icon: "check-circle-2" },
  completed: { baseText: "Completed", variant: "success", icon: "check-circle" },
  failed: { baseText: "Failed", variant: "error", icon: "x-circle" },
  cancelled: { baseText: "Cancelled", variant: "warning", icon: "slash" },
  budget_exhausted: { baseText: "Budget exhausted", variant: "error", icon: "dollar-sign" },
  unknown: { baseText: "Unknown outcome", variant: "warning", icon: "help-circle" }
};

export function formatStatusSummary(input: StatusInput): StatusSummary {
  const config = statusConfig[input.status];
  let text = config.baseText;

  if (input.status === "running" && input.progress !== undefined) {
    const percent = Math.round(input.progress * 100);
    if (input.currentStep) {
      text = `${config.baseText}: ${input.currentStep} (${percent}%)`;
    } else {
      text = `${config.baseText} (${percent}%)`;
    }
  }

  if (input.status === "waiting_approval" && input.approvalSummary) {
    text = `${config.baseText}: ${input.approvalSummary}`;
  }

  if (input.status === "failed" && input.error) {
    text = `${config.baseText}: ${input.error}`;
  }

  if (input.status === "suspended" && input.currentStep) {
    text = `${config.baseText}: ${input.currentStep}`;
  }

  return {
    text,
    variant: config.variant,
    icon: config.icon
  };
}

export function getStatusColor(variant: StatusSummary["variant"]): string {
  switch (variant) {
    case "success": return "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30";
    case "error": return "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30";
    case "warning": return "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30";
    case "info": return "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30";
    default: return "text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800";
  }
}

export function getStatusIcon(variant: StatusSummary["variant"]): string {
  switch (variant) {
    case "success": return "check-circle";
    case "error": return "x-circle";
    case "warning": return "alert-triangle";
    case "info": return "info";
    default: return "circle";
  }
}