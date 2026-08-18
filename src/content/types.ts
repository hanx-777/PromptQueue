export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type ProviderModelKey = "chatgpt" | "gemini" | "claude";

export type QueueTheme = "page" | "light" | "dark";

export type CollapsedDockSide = "left" | "right";

export type ModelPreferenceMode = "auto-highest" | "preset" | "custom";

export interface ProviderModelPreference {
  mode: ModelPreferenceMode;
  modelId?: string;
  customLabel?: string;
}

export type ProviderModelSettings = Record<ProviderModelKey, ProviderModelPreference>;

export interface QueueTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  resultSummary?: string;
  attemptCount?: number;
  lastAttemptAt?: number;
}

export interface WorkflowMessage {
  id: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface QueueWorkflow {
  id: string;
  name: string;
  messages: WorkflowMessage[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface QueueSettings {
  autoStartNext: boolean;
  stableDelayMs: number;
  maxWaitMs: number;
  autoRetryEnabled: boolean;
  maxAutoRetries: number;
  retryDelayMs: number;
  appendContextMode: boolean;
  batchSeparator: string;
  theme: QueueTheme;
  language: "zh" | "en";
  providerModels: ProviderModelSettings;
  collapsed: boolean;
  collapsedDockSide: CollapsedDockSide;
  collapsedDockYRatio: number;
  runDetailsExpanded: boolean;
  panelWidth: number;
  /** Opt-in: capture the visible text of each reply after a task completes, stored locally on the task. Default false. */
  captureReplies: boolean;
  notifyOnQueueComplete: boolean;
  rateLimitWarningEnabled: boolean;
}

export type QueueRunLogStatus = "started" | "done" | "failed" | "retrying" | "skipped";
export type QueueFailureStage =
  | "composer-missing"
  | "send-button-missing"
  | "model-select-warning"
  | "pre-send-failed"
  | "reply-timeout";

export interface QueueRunLogEntry {
  id: string;
  taskId: string;
  promptPreview: string;
  status: QueueRunLogStatus;
  provider: string;
  startedAt: number;
  endedAt?: number;
  attemptCount: number;
  error?: string;
  failureStage?: QueueFailureStage;
}

export interface ProviderHealthStatus {
  provider: string;
  composerFound: boolean;
  sendButtonFound: boolean;
  stopButtonFound: boolean;
  pageBusy: boolean;
  checkedAt: number;
}

export type ContextMenuActionType =
  | "queue-selection"
  | "summarize-selection"
  | "translate-selection"
  | "rewrite-selection"
  | "explain-selection"
  | "queue-page-context";

export interface PendingContextAction {
  id: string;
  type: ContextMenuActionType;
  selectionText?: string;
  pageTitle?: string;
  pageUrl?: string;
  createdAt: number;
}

export interface QueueState {
  tasks: QueueTask[];
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId?: string;
  lastError?: string;
  reloadWarning?: string;
  runLog?: QueueRunLogEntry[];
  /** Monotonic write counter used to detect concurrent writes from other tabs. Managed by storage.ts; callers should not set it directly. */
  revision?: number;
  /** Non-blocking soft warning (e.g. sending too fast); does not pause the queue. */
  rateLimitWarning?: string;
}
