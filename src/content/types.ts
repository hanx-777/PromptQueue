export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface QueueTask {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  resultSummary?: string;
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
  createdAt: number;
  updatedAt: number;
}

export interface QueueSettings {
  autoStartNext: boolean;
  stableDelayMs: number;
  maxWaitMs: number;
  appendContextMode: boolean;
  batchSeparator: string;
  theme: "light" | "dark" | "system";
  language: "zh" | "en";
  collapsed: boolean;
  panelWidth: number;
}

export interface QueueState {
  tasks: QueueTask[];
  isRunning: boolean;
  isPaused: boolean;
  currentTaskId?: string;
  lastError?: string;
  reloadWarning?: string;
}
