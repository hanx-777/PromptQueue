import type {
  QueueRunLogEntry,
  QueueRunLogStatus,
  QueueSettings,
  QueueState,
  QueueTask,
  QueueWorkflow,
  TaskStatus,
  WorkflowMessage
} from "./types";
import { DEFAULT_PROVIDER_MODELS, normalizeProviderModels } from "./modelSettings";
import { getErrorMessage, logWarn } from "../utils/logger";

const STATE_KEY = "chatgptQueueSteer.state";
const SETTINGS_KEY = "chatgptQueueSteer.settings";
const WORKFLOWS_KEY = "chatgptQueueSteer.workflows";

const VALID_STATUSES: TaskStatus[] = ["pending", "running", "done", "failed", "skipped"];
const VALID_RUN_LOG_STATUSES: QueueRunLogStatus[] = ["started", "done", "failed", "retrying", "skipped"];
const MAX_RUN_LOG_ENTRIES = 100;

export const DEFAULT_SETTINGS: QueueSettings = {
  autoStartNext: true,
  stableDelayMs: 2000,
  maxWaitMs: 10 * 60 * 1000,
  autoRetryEnabled: false,
  maxAutoRetries: 1,
  retryDelayMs: 3000,
  appendContextMode: true,
  batchSeparator: "---",
  theme: "page",
  language: "zh",
  providerModels: DEFAULT_PROVIDER_MODELS,
  collapsed: false,
  panelWidth: 380
};

export const DEFAULT_STATE: QueueState = {
  tasks: [],
  isRunning: false,
  isPaused: false
};

export const DEFAULT_WORKFLOWS: QueueWorkflow[] = [];

let didNormalizeReloadState = false;
let memoryState: QueueState = DEFAULT_STATE;
let memorySettings: QueueSettings = DEFAULT_SETTINGS;
let memoryWorkflows: QueueWorkflow[] = DEFAULT_WORKFLOWS;

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  if (!hasChromeStorage()) {
    return {
      [STATE_KEY]: memoryState,
      [SETTINGS_KEY]: memorySettings,
      [WORKFLOWS_KEY]: memoryWorkflows
    };
  }

  try {
    return await chrome.storage.local.get(keys);
  } catch (error) {
    logWarn("chrome.storage.local.get failed; using in-memory fallback.", error);
    return {
      [STATE_KEY]: memoryState,
      [SETTINGS_KEY]: memorySettings,
      [WORKFLOWS_KEY]: memoryWorkflows
    };
  }
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  if (!hasChromeStorage()) {
    if (STATE_KEY in items) {
      memoryState = items[STATE_KEY] as QueueState;
    }
    if (SETTINGS_KEY in items) {
      memorySettings = items[SETTINGS_KEY] as QueueSettings;
    }
    if (WORKFLOWS_KEY in items) {
      memoryWorkflows = items[WORKFLOWS_KEY] as QueueWorkflow[];
    }
    return;
  }

  try {
    await chrome.storage.local.set(items);
  } catch (error) {
    logWarn("chrome.storage.local.set failed.", error);
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizeTask(value: unknown): QueueTask | null {
  if (!isObject(value)) {
    return null;
  }

  const prompt = typeof value.prompt === "string" ? value.prompt : "";
  if (!prompt.trim()) {
    return null;
  }

  const now = Date.now();
  const status = VALID_STATUSES.includes(value.status as TaskStatus)
    ? (value.status as TaskStatus)
    : "pending";

  return {
    id: typeof value.id === "string" && value.id ? value.id : `${now}-${Math.random().toString(36).slice(2)}`,
    prompt,
    status,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now,
    error: typeof value.error === "string" ? value.error : undefined,
    resultSummary: typeof value.resultSummary === "string" ? value.resultSummary : undefined,
    attemptCount: normalizeNumber(value.attemptCount, 0, 0, 100) || undefined,
    lastAttemptAt: typeof value.lastAttemptAt === "number" ? value.lastAttemptAt : undefined
  };
}

function normalizeRunLogEntry(value: unknown): QueueRunLogEntry | null {
  if (!isObject(value)) {
    return null;
  }

  const taskId = typeof value.taskId === "string" && value.taskId ? value.taskId : "";
  const promptPreview = typeof value.promptPreview === "string" ? value.promptPreview : "";
  if (!taskId || !promptPreview) {
    return null;
  }

  const now = Date.now();
  const status = VALID_RUN_LOG_STATUSES.includes(value.status as QueueRunLogStatus)
    ? (value.status as QueueRunLogStatus)
    : "failed";

  return {
    id: typeof value.id === "string" && value.id ? value.id : `${now}-${Math.random().toString(36).slice(2)}`,
    taskId,
    promptPreview,
    status,
    provider: typeof value.provider === "string" && value.provider ? value.provider : "Unknown",
    startedAt: typeof value.startedAt === "number" ? value.startedAt : now,
    endedAt: typeof value.endedAt === "number" ? value.endedAt : undefined,
    attemptCount: normalizeNumber(value.attemptCount, 1, 1, 100),
    error: typeof value.error === "string" ? value.error : undefined
  };
}

function normalizeRunLog(value: unknown): QueueRunLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeRunLogEntry)
    .filter((entry): entry is QueueRunLogEntry => Boolean(entry))
    .slice(-MAX_RUN_LOG_ENTRIES);
}

function normalizeWorkflowMessage(value: unknown): WorkflowMessage | null {
  if (!isObject(value)) {
    return null;
  }

  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt) {
    return null;
  }

  const now = Date.now();
  return {
    id: typeof value.id === "string" && value.id ? value.id : `${now}-${Math.random().toString(36).slice(2)}`,
    prompt,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now
  };
}

function normalizeWorkflow(value: unknown): QueueWorkflow | null {
  if (!isObject(value)) {
    return null;
  }

  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim()
    : "Untitled Workflow";
  const messages = Array.isArray(value.messages)
    ? value.messages
        .map(normalizeWorkflowMessage)
        .filter((message): message is WorkflowMessage => Boolean(message))
    : [];

  const now = Date.now();
  return {
    id: typeof value.id === "string" && value.id ? value.id : `${now}-${Math.random().toString(36).slice(2)}`,
    name,
    messages,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : now
  };
}

function normalizeWorkflows(value: unknown): QueueWorkflow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeWorkflow)
    .filter((workflow): workflow is QueueWorkflow => Boolean(workflow));
}

function normalizeSettings(value: unknown): QueueSettings {
  if (!isObject(value)) {
    return { ...DEFAULT_SETTINGS };
  }

  const theme = value.theme === "light" || value.theme === "dark" || value.theme === "page"
    ? value.theme
    : value.theme === "system"
      ? "page"
      : DEFAULT_SETTINGS.theme;
  const language = value.language === "zh" || value.language === "en"
    ? value.language
    : DEFAULT_SETTINGS.language;

  return {
    autoStartNext: typeof value.autoStartNext === "boolean" ? value.autoStartNext : DEFAULT_SETTINGS.autoStartNext,
    stableDelayMs: normalizeNumber(value.stableDelayMs, DEFAULT_SETTINGS.stableDelayMs, 500, 30000),
    maxWaitMs: normalizeNumber(value.maxWaitMs, DEFAULT_SETTINGS.maxWaitMs, 5000, 60 * 60 * 1000),
    autoRetryEnabled: typeof value.autoRetryEnabled === "boolean" ? value.autoRetryEnabled : DEFAULT_SETTINGS.autoRetryEnabled,
    maxAutoRetries: normalizeNumber(value.maxAutoRetries, DEFAULT_SETTINGS.maxAutoRetries, 0, 5),
    retryDelayMs: normalizeNumber(value.retryDelayMs, DEFAULT_SETTINGS.retryDelayMs, 500, 60000),
    appendContextMode: typeof value.appendContextMode === "boolean" ? value.appendContextMode : DEFAULT_SETTINGS.appendContextMode,
    batchSeparator: typeof value.batchSeparator === "string" && value.batchSeparator.trim()
      ? value.batchSeparator
      : DEFAULT_SETTINGS.batchSeparator,
    theme,
    language,
    providerModels: normalizeProviderModels(value.providerModels),
    collapsed: typeof value.collapsed === "boolean" ? value.collapsed : DEFAULT_SETTINGS.collapsed,
    panelWidth: normalizeNumber(value.panelWidth, DEFAULT_SETTINGS.panelWidth, 300, 720)
  };
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    ) as T;
  }

  return value;
}

function normalizeState(value: unknown, normalizeReload: boolean): QueueState {
  if (!isObject(value)) {
    return { ...DEFAULT_STATE };
  }

  let hadRunningTask = false;
  const tasks = Array.isArray(value.tasks)
    ? value.tasks
        .map(normalizeTask)
        .filter((task): task is QueueTask => Boolean(task))
        .map((task) => {
          if (normalizeReload && task.status === "running") {
            hadRunningTask = true;
            return {
              ...task,
              status: "pending" as TaskStatus,
              updatedAt: Date.now(),
              error: "Task was restored after a page reload before completion."
            };
          }
          return task;
        })
    : [];

  const reloadWarning = hadRunningTask
    ? "A task was running when the page last unloaded. It was restored to pending."
    : typeof value.reloadWarning === "string"
      ? value.reloadWarning
      : undefined;

  return {
    tasks,
    isRunning: normalizeReload && hadRunningTask ? false : Boolean(value.isRunning),
    isPaused: normalizeReload && hadRunningTask ? true : Boolean(value.isPaused),
    currentTaskId: normalizeReload && hadRunningTask
      ? undefined
      : typeof value.currentTaskId === "string"
        ? value.currentTaskId
        : undefined,
    lastError: typeof value.lastError === "string" ? value.lastError : undefined,
    reloadWarning,
    runLog: normalizeRunLog(value.runLog)
  };
}

export async function loadState(): Promise<QueueState> {
  const raw = await storageGet([STATE_KEY]);
  const shouldNormalizeReload = !didNormalizeReloadState;
  didNormalizeReloadState = true;
  const state = normalizeState(raw[STATE_KEY], shouldNormalizeReload);

  if (shouldNormalizeReload && state.reloadWarning) {
    await saveState(state);
  }

  return state;
}

export async function saveState(state: QueueState): Promise<void> {
  const safeState = normalizeState(state, false);
  memoryState = safeState;
  await storageSet({ [STATE_KEY]: stripUndefined(safeState) });
}

export async function loadSettings(): Promise<QueueSettings> {
  const raw = await storageGet([SETTINGS_KEY]);
  return normalizeSettings(raw[SETTINGS_KEY]);
}

export async function saveSettings(settings: QueueSettings): Promise<void> {
  const safeSettings = normalizeSettings(settings);
  memorySettings = safeSettings;
  await storageSet({ [SETTINGS_KEY]: stripUndefined(safeSettings) });
}

export async function loadWorkflows(): Promise<QueueWorkflow[]> {
  const raw = await storageGet([WORKFLOWS_KEY]);
  return normalizeWorkflows(raw[WORKFLOWS_KEY]);
}

export async function saveWorkflows(workflows: QueueWorkflow[]): Promise<void> {
  const safeWorkflows = normalizeWorkflows(workflows);
  memoryWorkflows = safeWorkflows;
  await storageSet({ [WORKFLOWS_KEY]: stripUndefined(safeWorkflows) });
}

export function subscribeStorageChanges(callback: () => void): () => void {
  if (!hasChromeStorage()) {
    return () => undefined;
  }

  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== "local") {
      return;
    }
    if (STATE_KEY in changes || SETTINGS_KEY in changes || WORKFLOWS_KEY in changes) {
      try {
        callback();
      } catch (error) {
        logWarn(`Storage change callback failed: ${getErrorMessage(error)}`);
      }
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
