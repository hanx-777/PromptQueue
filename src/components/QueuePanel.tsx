import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTexts, type Texts } from "../content/i18n";
import {
  buildContextPrompt,
  CONTEXT_ACTION_EVENT,
  CONTEXT_ACTION_MESSAGE_TYPE,
  loadPendingContextActions,
  normalizePendingContextActions,
  savePendingContextActions
} from "../content/contextActions";
import { detectProviderHardBusy, getProviderHealthStatus, hasActiveQueue } from "../content/providerRuntime";
import { QueueRunner } from "../content/queueRunner";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  loadSettings,
  loadState,
  loadWorkflows,
  saveSettings,
  saveState,
  saveWorkflows,
  subscribeStorageChanges
} from "../content/storage";
import type { PendingContextAction, ProviderHealthStatus, QueueSettings, QueueState, QueueTask, QueueWorkflow, TaskStatus, WorkflowMessage } from "../content/types";
import { BUILT_IN_WORKFLOW_TEMPLATES, createWorkflowFromTemplate, type BuiltInWorkflowTemplate } from "../content/workflowTemplates";
import { getCurrentProvider, getCurrentProviderLabel } from "../content/providers";
import { runFanoutPrompt } from "../content/fanout";
import { clamp, createId, previewPrompt, readEditableText } from "../utils/dom";
import { getErrorMessage } from "../utils/logger";
import { formatRunLogMarkdown } from "../utils/runLog";
import { formatTaskResultsMarkdown, getDoneTasks } from "../utils/taskResults";
import { createFanoutResultRows, summarizeFanoutResults, type FanoutResult } from "../utils/fanoutResults";
import {
  applyWorkflowVariablesToMessages,
  extractWorkflowVariables,
  type WorkflowVariableValues
} from "../utils/workflowVariables";
import { getIncompleteRowCount, getMissingVariableColumns, parseVariableTable } from "../utils/csvVariables";
import { copyWorkflow, filterWorkflows, normalizeWorkflowTags } from "../utils/workflows";
import { CollapseIcon, ExpandIcon, SettingsIcon, SwapIcon } from "./Icons";
import { NativeQueueDock } from "./NativeQueueDock";
import { SettingsPanel } from "./SettingsPanel";
import { SteerBox } from "./SteerBox";
import { TaskItem } from "./TaskItem";
import { TextComparePanel } from "./TextComparePanel";
import { WorkflowCard } from "./WorkflowCard";

type PanelSection = "run" | "compare" | "workflow" | "settings";
type ResolvedTheme = Exclude<QueueSettings["theme"], "page">;

const DARK_THEME_QUERY = "(prefers-color-scheme: dark)";

function now(): number {
  return Date.now();
}

function makeTask(prompt: string, status: TaskStatus = "pending"): QueueTask {
  const timestamp = now();
  return {
    id: createId(),
    prompt,
    status,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeWorkflowMessage(prompt: string): WorkflowMessage {
  const timestamp = now();
  return {
    id: createId(),
    prompt,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function makeWorkflow(name: string, messages: WorkflowMessage[], tags: string[] = []): QueueWorkflow {
  const timestamp = now();
  return {
    id: createId(),
    name,
    messages,
    tags: normalizeWorkflowTags(tags),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function writeClipboardText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function splitPrompts(raw: string, customSeparator: string): string[] {
  const separators = Array.from(
    new Set(["---", "###", customSeparator].map((item) => item.trim()).filter(Boolean))
  );
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (separators.includes(line.trim())) {
      const chunk = current.join("\n").trim();
      if (chunk) {
        chunks.push(chunk);
      }
      current = [];
    } else {
      current.push(line);
    }
  }

  const tail = current.join("\n").trim();
  if (tail) {
    chunks.push(tail);
  }

  return chunks;
}

function countByStatus(tasks: QueueTask[]): Record<TaskStatus, number> {
  return tasks.reduce<Record<TaskStatus, number>>(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getImportedItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  if (Array.isArray(value.messages)) {
    return value.messages;
  }

  if (Array.isArray(value.tasks)) {
    return value.tasks;
  }

  if (isRecord(value.workflow)) {
    if (Array.isArray(value.workflow.messages)) {
      return value.workflow.messages;
    }
    if (Array.isArray(value.workflow.tasks)) {
      return value.workflow.tasks;
    }
  }

  return [];
}

function normalizeImportedMessages(value: unknown): WorkflowMessage[] {
  return getImportedItems(value)
    .map((item) => {
      if (typeof item === "string") {
        const prompt = item.trim();
        return prompt ? makeWorkflowMessage(prompt) : null;
      }
      if (!isRecord(item)) {
        return null;
      }

      const rawPrompt = item.prompt ?? item.content ?? item.message;
      const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
      if (!prompt) {
        return null;
      }

      return makeWorkflowMessage(prompt);
    })
    .filter((message): message is WorkflowMessage => Boolean(message));
}

function getImportedWorkflowName(value: unknown, fallbackName: string): string {
  if (isRecord(value) && typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }

  if (isRecord(value) && isRecord(value.workflow) && typeof value.workflow.name === "string" && value.workflow.name.trim()) {
    return value.workflow.name.trim();
  }

  return fallbackName;
}

function getImportedWorkflowTags(value: unknown): string[] {
  if (isRecord(value)) {
    if (Array.isArray(value.tags)) {
      return normalizeWorkflowTags(value.tags);
    }
    if (isRecord(value.workflow) && Array.isArray(value.workflow.tags)) {
      return normalizeWorkflowTags(value.workflow.tags);
    }
  }
  return [];
}

function getUniqueWorkflowName(name: string, workflows: QueueWorkflow[], excludeId?: string): string {
  const baseName = name.trim() || "Untitled Workflow";
  const existingNames = new Set(
    workflows
      .filter((workflow) => workflow.id !== excludeId)
      .map((workflow) => workflow.name.trim().toLowerCase())
  );
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  let candidate = `${baseName} (${index})`;
  while (existingNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${baseName} (${index})`;
  }
  return candidate;
}

function getSections(texts: Texts): Array<{ id: PanelSection; label: string }> {
  return [
    { id: "run", label: texts.navRun },
    { id: "workflow", label: texts.navWorkflow },
    { id: "settings", label: texts.navSettings }
  ];
}

function formatCountMessage(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function formatFanoutSummary(
  template: string,
  summary: ReturnType<typeof summarizeFanoutResults>
): string {
  return template
    .replace("{pending}", String(summary.pending))
    .replace("{done}", String(summary.done))
    .replace("{failed}", String(summary.error))
    .replace("{total}", String(summary.total));
}

/** Accessible name for a health chip. The chip itself renders only its label,
 *  so the state has to reach assistive tech through aria-label. */
function healthLabel(label: string, found: boolean, texts: Texts): string {
  return `${label}: ${found ? texts.providerHealthFound : texts.providerHealthMissing}`;
}

function healthClassName(found: boolean): string {
  return found ? "health-ok" : "health-missing";
}

function getContextActionsFromEvent(event: Event): PendingContextAction[] {
  if (!(event instanceof CustomEvent)) {
    return [];
  }

  const detail = event.detail;
  if (!isRecord(detail)) {
    return [];
  }

  return normalizePendingContextActions(detail.actions);
}

function getContextActionsFromMessage(message: unknown): PendingContextAction[] {
  if (!isRecord(message) || message.type !== CONTEXT_ACTION_MESSAGE_TYPE) {
    return [];
  }

  return normalizePendingContextActions([message.action]);
}

function reorderWorkflows(workflows: QueueWorkflow[], draggedId: string, targetId: string): QueueWorkflow[] {
  if (draggedId === targetId) {
    return workflows;
  }

  const draggedIndex = workflows.findIndex((workflow) => workflow.id === draggedId);
  const targetIndex = workflows.findIndex((workflow) => workflow.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return workflows;
  }

  const next = [...workflows];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function getVisibleQueueTasks(tasks: QueueTask[]): QueueTask[] {
  return tasks.filter((task) => task.status !== "done");
}

function reorderTasks(tasks: QueueTask[], draggedId: string, targetId: string): QueueTask[] {
  if (draggedId === targetId) {
    return tasks;
  }

  const draggedIndex = tasks.findIndex((task) => task.id === draggedId);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  const dragged = tasks[draggedIndex];
  const target = tasks[targetIndex];
  if (draggedIndex < 0 || targetIndex < 0 || dragged?.status !== "pending" || target?.status !== "pending") {
    return tasks;
  }

  const next = [...tasks];
  const [draggedTask] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, { ...draggedTask, updatedAt: now() });
  return next;
}

function movePendingTask(tasks: QueueTask[], id: string, direction: "up" | "down"): QueueTask[] {
  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const pendingIndex = pendingTasks.findIndex((task) => task.id === id);
  const target = pendingTasks[direction === "up" ? pendingIndex - 1 : pendingIndex + 1];
  return target ? reorderTasks(tasks, id, target.id) : tasks;
}

function prioritizePendingTask(tasks: QueueTask[], id: string, currentTaskId?: string): QueueTask[] {
  const target = tasks.find((task) => task.id === id);
  if (!target || target.status !== "pending") {
    return tasks;
  }

  return [
    { ...target, updatedAt: now() },
    ...tasks.filter((task) => task.id !== id && task.id !== currentTaskId)
  ];
}

function detectThemeKeyword(value: string | null | undefined): ResolvedTheme | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (/(^|[\s_-])(dark|night|black)([\s_-]|$)/.test(normalized)) {
    return "dark";
  }
  if (/(^|[\s_-])(light|day|white)([\s_-]|$)/.test(normalized)) {
    return "light";
  }
  return null;
}

function parseColorChannel(value: string): number | null {
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
}

function detectThemeFromColor(color: string): ResolvedTheme | null {
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }

  const channels = match[1].replace("/", " ").split(/[,\s]+/).filter(Boolean);
  const red = parseColorChannel(channels[0] ?? "");
  const green = parseColorChannel(channels[1] ?? "");
  const blue = parseColorChannel(channels[2] ?? "");
  const alpha = channels[3] === undefined ? 1 : Number(channels[3].trim());
  if (red === null || green === null || blue === null || alpha === 0) {
    return null;
  }

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.45 ? "dark" : "light";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_THEME_QUERY).matches ? "dark" : "light";
}

function detectPageTheme(): ResolvedTheme {
  const roots = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
  const hints = roots.flatMap((element) => [
    element.getAttribute("data-theme"),
    element.getAttribute("data-color-mode"),
    element.getAttribute("data-color-scheme"),
    element.getAttribute("data-mode"),
    element.className,
    window.getComputedStyle(element).colorScheme
  ]);

  for (const hint of hints) {
    const theme = detectThemeKeyword(typeof hint === "string" ? hint : String(hint));
    if (theme) {
      return theme;
    }
  }

  for (const element of [document.body, document.documentElement]) {
    if (!element) {
      continue;
    }
    const theme = detectThemeFromColor(window.getComputedStyle(element).backgroundColor);
    if (theme) {
      return theme;
    }
  }

  return getSystemTheme();
}

export function shouldRenderNativeQueueDock(collapsed: boolean): boolean {
  return collapsed;
}

export function QueuePanel(): JSX.Element {
  const [state, setState] = useState<QueueState>(DEFAULT_STATE);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_SETTINGS);
  const [workflows, setWorkflows] = useState<QueueWorkflow[]>([]);
  const [activeSection, setActiveSection] = useState<PanelSection>("run");
  const [promptDraft, setPromptDraft] = useState("");
  const [compareOldText, setCompareOldText] = useState("");
  const [compareNewText, setCompareNewText] = useState("");
  const [fanoutSessionId, setFanoutSessionId] = useState<string | null>(null);
  const [fanoutResults, setFanoutResults] = useState<FanoutResult[]>([]);
  const [fanoutBusy, setFanoutBusy] = useState(false);
  const [saveWorkflowOpen, setSaveWorkflowOpen] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState("");
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [workflowSearchDraft, setWorkflowSearchDraft] = useState("");
  const [workflowTagFilter, setWorkflowTagFilter] = useState("");
  const [pendingVariableWorkflow, setPendingVariableWorkflow] = useState<QueueWorkflow | null>(null);
  const [workflowVariableValues, setWorkflowVariableValues] = useState<WorkflowVariableValues>({});
  const [variableInputMode, setVariableInputMode] = useState<"single" | "table">("single");
  const [variableTableRaw, setVariableTableRaw] = useState("");
  const [draggedWorkflowId, setDraggedWorkflowId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [steerBusy, setSteerBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [pageTheme, setPageTheme] = useState<ResolvedTheme>(() => detectPageTheme());
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthStatus>(() => getProviderHealthStatus(getCurrentProvider()));
  const runnerRef = useRef(new QueueRunner());
  const busyRef = useRef(false);
  const queueActionBusyRef = useRef(false);
  const steerBusyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizingRef = useRef(false);
  const draggedWorkflowIdRef = useRef<string | null>(null);
  const draggedTaskIdRef = useRef<string | null>(null);

  const texts = useMemo(() => getTexts(settings.language), [settings.language]);
  const sections = useMemo(() => getSections(texts), [texts]);
  const theme = settings.theme === "page" ? pageTheme : settings.theme;
  const provider = useMemo(() => getCurrentProvider(), []);
  const providerLabel = provider.label;
  const providerClass = `provider-${provider.id}`;

  const refresh = useCallback(async () => {
    const [nextState, nextSettings, nextWorkflows] = await Promise.all([
      loadState(),
      loadSettings(),
      loadWorkflows()
    ]);
    setState(nextState);
    setSettings(nextSettings);
    setWorkflows(nextWorkflows);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeStorageChanges(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    const syncProviderBusy = (): void => {
      setProviderBusy(detectProviderHardBusy(provider));
      setProviderHealth(getProviderHealthStatus(provider));
    };
    let frameId: number | null = null;
    const scheduleSync = (): void => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncProviderBusy();
      });
    };

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);
    const intervalId = window.setInterval(syncProviderBusy, 700);
    syncProviderBusy();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      window.clearInterval(intervalId);
    };
  }, [provider]);

  useEffect(() => {
    const updatePageTheme = (): void => setPageTheme(detectPageTheme());
    const observer = new MutationObserver(updatePageTheme);
    const observerOptions: MutationObserverInit = {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme", "data-color-mode", "data-color-scheme", "data-mode"]
    };

    observer.observe(document.documentElement, observerOptions);
    if (document.body) {
      observer.observe(document.body, observerOptions);
    }

    const media = window.matchMedia?.(DARK_THEME_QUERY);
    if (media?.addEventListener) {
      media.addEventListener("change", updatePageTheme);
    } else {
      media?.addListener?.(updatePageTheme);
    }
    updatePageTheme();

    return () => {
      observer.disconnect();
      if (media?.removeEventListener) {
        media.removeEventListener("change", updatePageTheme);
      } else {
        media?.removeListener?.(updatePageTheme);
      }
    };
  }, []);

  const persistState = useCallback(async (nextState: QueueState) => {
    setState(nextState);
    await saveState(nextState);
  }, []);

  const persistSettings = useCallback(async (nextSettings: QueueSettings) => {
    setSettings(nextSettings);
    await saveSettings(nextSettings);
  }, []);

  const persistWorkflows = useCallback(async (nextWorkflows: QueueWorkflow[]) => {
    setWorkflows(nextWorkflows);
    await saveWorkflows(nextWorkflows);
  }, []);

  const runBusy = useCallback(async (label: string, action: () => Promise<void>) => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setBusyAction(label);
    setLocalMessage(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      const message = getErrorMessage(error);
      setLocalMessage(message);
      const latest = await loadState();
      await persistState({ ...latest, lastError: message });
    } finally {
      busyRef.current = false;
      setBusyAction(null);
    }
  }, [persistState, refresh]);

  const handleBackgroundQueueError = useCallback(async (error: unknown) => {
    const message = getErrorMessage(error);
    setLocalMessage(message);
    const latest = await loadState();
    await persistState({
      ...latest,
      isRunning: false,
      isPaused: true,
      currentTaskId: undefined,
      lastError: message
    });
  }, [persistState]);

  const runQueueInBackground = useCallback(() => {
    void runnerRef.current.runNext()
      .then(refresh)
      .catch((error: unknown) => {
        void handleBackgroundQueueError(error);
      });
  }, [handleBackgroundQueueError, refresh]);

  const persistStateAndRunQueue = useCallback(async (nextState: QueueState): Promise<void> => {
    await persistState({
      ...nextState,
      isRunning: true,
      isPaused: false
    });
    runQueueInBackground();
  }, [persistState, runQueueInBackground]);

  const runSteer = useCallback(async (action: () => Promise<void>) => {
    if (steerBusyRef.current) {
      return;
    }

    steerBusyRef.current = true;
    setSteerBusy(true);
    setLocalMessage(null);

    try {
      await action();
      await refresh();
    } catch (error) {
      const message = getErrorMessage(error);
      setLocalMessage(message);
      const latest = await loadState();
      await persistState({ ...latest, lastError: message });
    } finally {
      steerBusyRef.current = false;
      setSteerBusy(false);
    }
  }, [persistState, refresh]);

  const addDraftToQueue = useCallback(async () => {
    const prompts = splitPrompts(promptDraft, settings.batchSeparator);
    if (!prompts.length) {
      setLocalMessage(getTexts(settings.language).emptyPrompt);
      return;
    }

    const latest = await loadState();
    await persistStateAndRunQueue({
      ...latest,
      tasks: [...latest.tasks, ...prompts.map((prompt) => makeTask(prompt))],
      lastError: undefined
    });
    setPromptDraft("");
  }, [persistStateAndRunQueue, promptDraft, settings.batchSeparator, settings.language]);

  const startFanout = useCallback(async () => {
    const prompt = promptDraft.trim();
    if (!prompt || typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }

    setFanoutBusy(true);
    try {
      const response = await chrome.runtime.sendMessage({ type: "FANOUT_BROADCAST", prompt });
      if (!response || response.error || !response.fanoutSessionId) {
        setLocalMessage(typeof response?.error === "string" ? response.error : texts.fanoutBroadcastFailed);
        return;
      }

      const providers: string[] = Array.isArray(response.providers) ? response.providers : [];
      setFanoutSessionId(response.fanoutSessionId);
      setFanoutResults(createFanoutResultRows(providers, texts.fanoutMissingProvider));
    } catch (error) {
      setLocalMessage(getErrorMessage(error));
    } finally {
      setFanoutBusy(false);
    }
  }, [promptDraft, texts.fanoutBroadcastFailed, texts.fanoutMissingProvider]);

  const useFanoutResultAsCompare = (side: "old" | "new", text: string): void => {
    if (side === "old") {
      setCompareOldText(text);
    } else {
      setCompareNewText(text);
    }
    setActiveSection("compare");
  };

  const addNativeComposerToQueue = useCallback(async () => {
    const composer = provider.findComposer();
    const prompts = splitPrompts(composer ? readEditableText(composer) : "", settings.batchSeparator);
    if (!prompts.length) {
      setLocalMessage(texts.emptyPrompt);
      return;
    }

    const latest = await loadState();
    const latestHasActiveQueue = hasActiveQueue(latest);
    const pageIsBusy = detectProviderHardBusy(provider);
    if (!pageIsBusy && !latest.isRunning && !latestHasActiveQueue) {
      setLocalMessage(texts.nativeQueueUnavailable);
      return;
    }

    await persistState({
      ...latest,
      tasks: [...latest.tasks, ...prompts.map((prompt) => makeTask(prompt))],
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });
    await provider.setComposerText("");
    runQueueInBackground();
  }, [persistState, provider, runQueueInBackground, settings.batchSeparator, texts.emptyPrompt, texts.nativeQueueUnavailable]);

  const enqueueContextActions = useCallback(async (actions: PendingContextAction[]): Promise<number> => {
    const prompts = actions
      .map((action) => buildContextPrompt(action, settings.language))
      .filter((prompt): prompt is string => Boolean(prompt?.trim()));

    if (!prompts.length) {
      setLocalMessage(texts.contextQueueIgnored);
      return 0;
    }

    const latest = await loadState();
    await persistStateAndRunQueue({
      ...latest,
      tasks: [...latest.tasks, ...prompts.map((prompt) => makeTask(prompt))],
      lastError: undefined
    });
    setActiveSection("run");
    setLocalMessage(formatCountMessage(texts.contextQueuedMessage, prompts.length));
    return prompts.length;
  }, [persistStateAndRunQueue, settings.language, texts.contextQueueIgnored, texts.contextQueuedMessage]);

  useEffect(() => {
    const contextEventHandler = (event: Event): void => {
      const actions = getContextActionsFromEvent(event);
      if (actions.length) {
        void enqueueContextActions(actions);
      }
    };

    window.addEventListener(CONTEXT_ACTION_EVENT, contextEventHandler);

    const runtimeMessageHandler = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: { ok: boolean }) => void
    ): true | false => {
      const actions = getContextActionsFromMessage(message);
      if (!actions.length) {
        return false;
      }

      void enqueueContextActions(actions)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(runtimeMessageHandler);
    }

    void loadPendingContextActions()
      .then(async (actions) => {
        if (actions.length) {
          const addedCount = await enqueueContextActions(actions);
          if (addedCount > 0) {
            await savePendingContextActions([]);
          }
        }
      });

    return () => {
      window.removeEventListener(CONTEXT_ACTION_EVENT, contextEventHandler);
      if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(runtimeMessageHandler);
      }
    };
  }, [enqueueContextActions]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return;
    }

    const fanoutRunHandler = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: { ok: boolean }) => void
    ): true | false => {
      if (!isRecord(message) || message.type !== "promptqueue.fanoutRun") {
        return false;
      }

      const prompt = typeof message.prompt === "string" ? message.prompt : "";
      const sessionId = typeof message.fanoutSessionId === "string" ? message.fanoutSessionId : "";
      if (!prompt || !sessionId) {
        return false;
      }

      sendResponse({ ok: true });
      void runFanoutPrompt(prompt).then((result) => {
        return chrome.runtime.sendMessage({
          type: "FANOUT_RESULT",
          fanoutSessionId: sessionId,
          provider: getCurrentProviderLabel(),
          text: result.text,
          error: result.error
        });
      })
        .catch(() => undefined);
      return false;
    };

    chrome.runtime.onMessage.addListener(fanoutRunHandler);
    return () => {
      chrome.runtime.onMessage.removeListener(fanoutRunHandler);
    };
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage || !fanoutSessionId) {
      return;
    }

    const fanoutResultHandler = (message: unknown): false => {
      if (!isRecord(message) || message.type !== "promptqueue.fanoutResult") {
        return false;
      }
      if (message.fanoutSessionId !== fanoutSessionId) {
        return false;
      }

      const provider = typeof message.provider === "string" ? message.provider : "Unknown";
      const text = typeof message.text === "string" ? message.text : undefined;
      const error = typeof message.error === "string" ? message.error : undefined;

      setFanoutResults((current) => current.map((item) => (
        item.provider === provider
          ? { ...item, status: error ? "error" : "done", text, error }
          : item
      )));
      return false;
    };

    chrome.runtime.onMessage.addListener(fanoutResultHandler);
    return () => {
      chrome.runtime.onMessage.removeListener(fanoutResultHandler);
    };
  }, [fanoutSessionId]);

  useEffect(() => {
    const toggleHandler = (): void => {
      void persistSettings({ ...settings, collapsed: !settings.collapsed });
    };
    const addHandler = (): void => {
      void addDraftToQueue();
    };
    const addNativeHandler = (): void => {
      void runBusy("add-native", addNativeComposerToQueue);
    };

    window.addEventListener("gqs-toggle", toggleHandler);
    window.addEventListener("gqs-add", addHandler);
    window.addEventListener("gqs-add-native", addNativeHandler);
    return () => {
      window.removeEventListener("gqs-toggle", toggleHandler);
      window.removeEventListener("gqs-add", addHandler);
      window.removeEventListener("gqs-add-native", addNativeHandler);
    };
  }, [addDraftToQueue, addNativeComposerToQueue, persistSettings, runBusy, settings]);

  const visibleQueueTasks = useMemo(() => getVisibleQueueTasks(state.tasks), [state.tasks]);
  const doneQueueTasks = useMemo(() => getDoneTasks(state.tasks), [state.tasks]);
  const counters = useMemo(() => countByStatus(state.tasks), [state.tasks]);
  const runningIndex = state.currentTaskId
    ? state.tasks.findIndex((task) => task.id === state.currentTaskId) + 1
    : 0;
  const runStatus = state.isPaused ? "paused" : state.isRunning ? "running" : "idle";
  const runStatusText = state.isPaused
    ? texts.paused
    : state.isRunning
      ? `${texts.running}${runningIndex ? ` #${runningIndex}` : ""}`
      : texts.idle;
  const queuePrimaryLabel = state.isPaused ? texts.resume : state.isRunning ? texts.pause : texts.startQueue;
  const runLogEntries = state.runLog ?? [];
  const fanoutSummary = useMemo(() => summarizeFanoutResults(fanoutResults), [fanoutResults]);
  const fanoutSummaryText = fanoutResults.length
    ? formatFanoutSummary(
      fanoutSummary.running ? texts.fanoutSummaryRunning : texts.fanoutSummaryComplete,
      fanoutSummary
    )
    : "";
  const workflowTags = useMemo(() => {
    const tags = workflows.flatMap((workflow) => normalizeWorkflowTags(workflow.tags));
    return Array.from(new Set(tags.map((tag) => tag.toLowerCase())))
      .map((key) => tags.find((tag) => tag.toLowerCase() === key) ?? key)
      .sort((left, right) => left.localeCompare(right));
  }, [workflows]);
  const visibleWorkflows = useMemo(
    () => filterWorkflows(workflows, { query: workflowSearchDraft, tag: workflowTagFilter }),
    [workflowSearchDraft, workflowTagFilter, workflows]
  );
  const pendingWorkflowVariables = useMemo(
    () => pendingVariableWorkflow ? extractWorkflowVariables(pendingVariableWorkflow.messages) : [],
    [pendingVariableWorkflow]
  );
  const variablesReady = pendingWorkflowVariables.every((name) => workflowVariableValues[name]?.trim());
  const workflowVariablePreviewMessages = useMemo(() => {
    if (!pendingVariableWorkflow || !variablesReady) {
      return [];
    }
    try {
      return applyWorkflowVariablesToMessages(pendingVariableWorkflow.messages, workflowVariableValues);
    } catch {
      return [];
    }
  }, [pendingVariableWorkflow, variablesReady, workflowVariableValues]);

  const parsedVariableTable = useMemo(() => parseVariableTable(variableTableRaw), [variableTableRaw]);
  const variableTableMissingColumns = useMemo(
    () => getMissingVariableColumns(parsedVariableTable.headers, pendingWorkflowVariables),
    [parsedVariableTable.headers, pendingWorkflowVariables]
  );
  const variableTableIncompleteRowCount = useMemo(
    () => getIncompleteRowCount(parsedVariableTable.rows, pendingWorkflowVariables),
    [parsedVariableTable.rows, pendingWorkflowVariables]
  );
  const variableTableError = useMemo(() => {
    if (!variableTableRaw.trim()) {
      return null;
    }
    if (!parsedVariableTable.rows.length) {
      return texts.workflowVariableTableEmpty;
    }
    if (variableTableMissingColumns.length) {
      return texts.workflowVariableTableMissingColumns.replace("{names}", variableTableMissingColumns.join(", "));
    }
    if (variableTableIncompleteRowCount > 0) {
      return texts.workflowVariableTableIncompleteRows.replace("{count}", String(variableTableIncompleteRowCount));
    }
    return null;
  }, [
    parsedVariableTable.rows.length,
    texts,
    variableTableIncompleteRowCount,
    variableTableMissingColumns,
    variableTableRaw
  ]);
  const variableTableReady = Boolean(
    parsedVariableTable.rows.length &&
    !variableTableMissingColumns.length &&
    variableTableIncompleteRowCount === 0
  );
  const variableTableTaskCount = pendingVariableWorkflow
    ? parsedVariableTable.rows.length * pendingVariableWorkflow.messages.length
    : 0;

  const updateTasks = async (tasks: QueueTask[], patch: Partial<QueueState> = {}): Promise<void> => {
    await persistState({
      ...state,
      ...patch,
      tasks
    });
  };

  const handleTaskEdit = (id: string, prompt: string): void => {
    void updateTasks(state.tasks.map((task) => (
      task.id === id && task.status !== "running" ? { ...task, prompt, updatedAt: now(), error: undefined } : task
    )));
  };

  const handleTaskDelete = (id: string): void => {
    const target = state.tasks.find((task) => task.id === id);
    if (target?.status === "running") {
      return;
    }

    void updateTasks(state.tasks.filter((task) => task.id !== id), {
      currentTaskId: state.currentTaskId === id ? undefined : state.currentTaskId
    });
  };

  const handleTaskMove = (id: string, direction: "up" | "down"): void => {
    const nextTasks = movePendingTask(state.tasks, id, direction);
    if (nextTasks !== state.tasks) {
      void updateTasks(nextTasks);
    }
  };

  const handleTaskMoveTop = (id: string): void => {
    const firstPending = state.tasks.find((task) => task.status === "pending");
    if (firstPending && firstPending.id !== id) {
      void updateTasks(reorderTasks(state.tasks, id, firstPending.id));
    }
  };

  const handleTaskSkip = (id: string): void => {
    runnerRef.current.skipTask(id);
  };

  const handleTaskRetry = (id: string): void => {
    void runBusy("retry-task", () => runnerRef.current.retryTask(id));
  };

  const clearRunLog = async (): Promise<void> => {
    const latest = await loadState();
    await persistState({ ...latest, runLog: [] });
  };

  const copyRunLog = async (): Promise<void> => {
    try {
      await writeClipboardText(formatRunLogMarkdown(runLogEntries));
      setLocalMessage(texts.runLogCopied);
    } catch {
      setLocalMessage(texts.runLogCopyFailed);
    }
  };

  const exportResults = (): void => {
    const markdown = formatTaskResultsMarkdown(state.tasks);
    const exportedAt = new Date().toISOString();
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `promptqueue-results-${exportedAt.replace(/[:.]/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClearDone = (): void => {
    void updateTasks(state.tasks.filter((task) => task.status !== "done"));
  };

  const prioritizeTaskAndStopCurrent = async (id: string): Promise<void> => {
    await runnerRef.current.stopCurrent({ suppressMissingStopError: true });
    const latest = await loadState();
    const target = latest.tasks.find((task) => task.id === id);
    if (!target || target.status !== "pending") {
      return;
    }

    await persistState({
      ...latest,
      tasks: prioritizePendingTask(latest.tasks, id, latest.currentTaskId),
      currentTaskId: undefined,
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });
    runQueueInBackground();
  };

  const handleNativeTaskSteer = (id: string): void => {
    void runSteer(() => prioritizeTaskAndStopCurrent(id));
  };

  const handleTaskDragStart = (id: string): void => {
    const task = state.tasks.find((item) => item.id === id);
    draggedTaskIdRef.current = task?.status === "pending" ? id : null;
  };

  const handleTaskDrop = (targetId: string): void => {
    const draggedId = draggedTaskIdRef.current;
    draggedTaskIdRef.current = null;
    if (!draggedId) {
      return;
    }

    const nextTasks = reorderTasks(state.tasks, draggedId, targetId);
    if (nextTasks !== state.tasks) {
      void updateTasks(nextTasks);
    }
  };

  const insertSteerTask = async (prompt: string, clearError = true): Promise<void> => {
    const latest = await loadState();
    const currentIndex = latest.currentTaskId
      ? latest.tasks.findIndex((task) => task.id === latest.currentTaskId)
      : -1;
    const firstPendingIndex = latest.tasks.findIndex((task) => task.status === "pending");
    const insertAt = currentIndex >= 0
      ? currentIndex + 1
      : firstPendingIndex >= 0
        ? firstPendingIndex
        : latest.tasks.length;
    const nextTasks = [...latest.tasks];
    nextTasks.splice(insertAt, 0, makeTask(prompt));
    await persistStateAndRunQueue({
      ...latest,
      tasks: nextTasks,
      lastError: clearError ? undefined : latest.lastError
    });
  };

  const stopAndSteer = async (prompt: string): Promise<void> => {
    await runSteer(async () => {
      await runnerRef.current.stopCurrent();
      await insertSteerTask(prompt, false);
    });
  };

  const handleQueuePrimaryAction = async (): Promise<void> => {
    const latest = await loadState();
    if (latest.isRunning && !latest.isPaused) {
      await persistState({ ...latest, isPaused: true });
      return;
    }
    if (latest.isPaused) {
      await persistState({
        ...latest,
        isRunning: true,
        isPaused: false,
        lastError: undefined
      });
      runQueueInBackground();
      return;
    }

    await persistState({
      ...latest,
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });
    runQueueInBackground();
  };

  const handleQueuePrimaryClick = (): void => {
    if (queueActionBusyRef.current) {
      return;
    }

    queueActionBusyRef.current = true;
    setQueueActionBusy(true);
    setLocalMessage(null);

    void (async () => {
      try {
        await handleQueuePrimaryAction();
        await refresh();
      } catch (error) {
        const message = getErrorMessage(error);
        setLocalMessage(message);
        const latest = await loadState();
        await persistState({ ...latest, lastError: message });
      } finally {
        queueActionBusyRef.current = false;
        setQueueActionBusy(false);
      }
    })();
  };

  const queueMessagesFromTasks = (tasks: QueueTask[]): WorkflowMessage[] => (
    tasks.map((task) => makeWorkflowMessage(task.prompt))
  );

  const tasksFromWorkflow = (workflow: QueueWorkflow, values?: WorkflowVariableValues): QueueTask[] => {
    const messages = values
      ? applyWorkflowVariablesToMessages(workflow.messages, values)
      : workflow.messages;
    return messages.map((message) => makeTask(message.prompt));
  };

  const exportWorkflowFile = (workflow: QueueWorkflow): void => {
    const exportedAt = new Date().toISOString();
    const messages = workflow.messages.map((message, index) => ({
      id: message.id,
      order: index + 1,
      prompt: message.prompt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt
    }));
    const payload = {
      type: "promptqueue.workflow",
      version: 1,
      id: workflow.id,
      name: workflow.name,
      tags: normalizeWorkflowTags(workflow.tags),
      exportedAt,
      messages,
      settings: {
        stableDelayMs: settings.stableDelayMs,
        maxWaitMs: settings.maxWaitMs,
        autoStartNext: settings.autoStartNext,
        appendContextMode: settings.appendContextMode,
        batchSeparator: settings.batchSeparator,
        theme: settings.theme,
        language: settings.language,
        providerModels: settings.providerModels
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflow.name.replace(/[\\/:*?"<>|]+/g, "-")}-${exportedAt.replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveCurrentQueueAsWorkflow = async (): Promise<void> => {
    const workflowTasks = getVisibleQueueTasks(state.tasks);
    if (!workflowTasks.length) {
      throw new Error(texts.workflowSaveEmpty);
    }

    const trimmedName = workflowNameDraft.trim();
    if (!trimmedName) {
      throw new Error(texts.workflowNameRequired);
    }

    const latestWorkflows = await loadWorkflows();
    const name = getUniqueWorkflowName(trimmedName, latestWorkflows);
    const workflow = makeWorkflow(name, queueMessagesFromTasks(workflowTasks));
    await persistWorkflows([...latestWorkflows, workflow]);
    setWorkflowNameDraft("");
    setSaveWorkflowOpen(false);
    setExpandedWorkflowId(null);
    setLocalMessage(`${texts.workflowSaved}: ${name}`);
  };

  const importWorkflowFile = async (file: File): Promise<void> => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(texts.importInvalidJson);
    }

    const messages = normalizeImportedMessages(parsed);
    if (!messages.length) {
      throw new Error(texts.importNoValidTasks);
    }

    const latestWorkflows = await loadWorkflows();
    const importedName = getImportedWorkflowName(parsed, `${texts.untitledWorkflow} ${new Date().toLocaleDateString()}`);
    const name = getUniqueWorkflowName(importedName, latestWorkflows);
    const workflow = makeWorkflow(name, messages, getImportedWorkflowTags(parsed));
    await persistWorkflows([...latestWorkflows, workflow]);
    setExpandedWorkflowId(null);
    setLocalMessage(`${texts.workflowImported}: ${name}`);
  };

  const addWorkflowTemplate = async (template: BuiltInWorkflowTemplate): Promise<void> => {
    const latestWorkflows = await loadWorkflows();
    const workflow = createWorkflowFromTemplate(
      template,
      latestWorkflows.map((item) => item.name)
    );
    await persistWorkflows([...latestWorkflows, workflow]);
    setExpandedWorkflowId(workflow.id);
    setTemplatesOpen(false);
    setLocalMessage(`${texts.workflowTemplateAdded}: ${workflow.name}`);
  };

  const renameWorkflow = async (id: string, name: string): Promise<void> => {
    const uniqueName = getUniqueWorkflowName(name, workflows, id);
    await persistWorkflows(workflows.map((workflow) => (
      workflow.id === id ? { ...workflow, name: uniqueName, updatedAt: now() } : workflow
    )));
  };

  const copyWorkflowById = async (id: string): Promise<void> => {
    const latestWorkflows = await loadWorkflows();
    const workflow = latestWorkflows.find((item) => item.id === id);
    if (!workflow) {
      return;
    }

    const copied = copyWorkflow(workflow, latestWorkflows.map((item) => item.name));
    await persistWorkflows([...latestWorkflows, copied]);
    setExpandedWorkflowId(copied.id);
    setLocalMessage(`${texts.workflowCopied}: ${copied.name}`);
  };

  const addWorkflowTag = async (id: string, tag: string): Promise<void> => {
    const trimmed = tag.trim();
    if (!trimmed) {
      return;
    }

    await persistWorkflows(workflows.map((workflow) => (
      workflow.id === id
        ? {
            ...workflow,
            tags: normalizeWorkflowTags([...(workflow.tags ?? []), trimmed]),
            updatedAt: now()
          }
        : workflow
    )));
  };

  const removeWorkflowTag = async (id: string, tag: string): Promise<void> => {
    const target = tag.trim().toLowerCase();
    await persistWorkflows(workflows.map((workflow) => (
      workflow.id === id
        ? {
            ...workflow,
            tags: normalizeWorkflowTags(workflow.tags).filter((item) => item.toLowerCase() !== target),
            updatedAt: now()
          }
        : workflow
    )));
    if (workflowTagFilter.toLowerCase() === target) {
      setWorkflowTagFilter("");
    }
  };

  const updateWorkflowMessages = async (id: string, messages: WorkflowMessage[]): Promise<void> => {
    await persistWorkflows(workflows.map((workflow) => (
      workflow.id === id ? { ...workflow, messages, updatedAt: now() } : workflow
    )));
  };

  const deleteWorkflow = async (id: string): Promise<void> => {
    await persistWorkflows(workflows.filter((workflow) => workflow.id !== id));
    if (expandedWorkflowId === id) {
      setExpandedWorkflowId(null);
    }
  };

  const dropWorkflow = async (targetId: string): Promise<void> => {
    const draggedId = draggedWorkflowIdRef.current ?? draggedWorkflowId;
    if (!draggedId) {
      return;
    }

    await persistWorkflows(reorderWorkflows(workflows, draggedId, targetId));
    draggedWorkflowIdRef.current = null;
    setDraggedWorkflowId(null);
  };

  const runWorkflowWithValues = async (workflow: QueueWorkflow, values?: WorkflowVariableValues): Promise<void> => {
    const latest = await loadState();
    if (latest.isRunning || latest.currentTaskId) {
      throw new Error(texts.workflowRunBlocked);
    }

    await persistStateAndRunQueue({
      ...latest,
      tasks: tasksFromWorkflow(workflow, values),
      currentTaskId: undefined,
      lastError: undefined
    });
    setActiveSection("run");
    setExpandedWorkflowId(null);
    setPendingVariableWorkflow(null);
    setWorkflowVariableValues({});
    setVariableInputMode("single");
    setVariableTableRaw("");
  };

  const runWorkflow = async (id: string): Promise<void> => {
    const workflow = workflows.find((item) => item.id === id);
    if (!workflow) {
      return;
    }

    const latest = await loadState();
    if (latest.isRunning || latest.currentTaskId) {
      throw new Error(texts.workflowRunBlocked);
    }

    const variables = extractWorkflowVariables(workflow.messages);
    if (variables.length) {
      setPendingVariableWorkflow(workflow);
      setWorkflowVariableValues(Object.fromEntries(variables.map((name) => [name, ""])));
      setVariableInputMode("single");
      setVariableTableRaw("");
      return;
    }

    await runWorkflowWithValues(workflow);
  };

  const submitWorkflowVariables = async (): Promise<void> => {
    if (!pendingVariableWorkflow) {
      return;
    }
    await runWorkflowWithValues(pendingVariableWorkflow, workflowVariableValues);
  };

  const runWorkflowWithVariableRows = async (workflow: QueueWorkflow, rows: WorkflowVariableValues[]): Promise<void> => {
    const latest = await loadState();
    if (latest.isRunning || latest.currentTaskId) {
      throw new Error(texts.workflowRunBlocked);
    }

    await persistStateAndRunQueue({
      ...latest,
      tasks: rows.flatMap((row) => tasksFromWorkflow(workflow, row)),
      currentTaskId: undefined,
      lastError: undefined
    });
    setActiveSection("run");
    setExpandedWorkflowId(null);
    setPendingVariableWorkflow(null);
    setWorkflowVariableValues({});
    setVariableInputMode("single");
    setVariableTableRaw("");
  };

  const submitWorkflowVariableTable = async (): Promise<void> => {
    if (!pendingVariableWorkflow || !variableTableReady) {
      return;
    }
    await runWorkflowWithVariableRows(pendingVariableWorkflow, parsedVariableTable.rows);
  };

  const exportWorkflowById = (id: string): void => {
    const workflow = workflows.find((item) => item.id === id);
    if (workflow) {
      exportWorkflowFile(workflow);
    }
  };

  const startResize = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    resizingRef.current = true;
    const startX = event.clientX;
    const startWidth = settings.panelWidth;
    let latestWidth = startWidth;

    const onMove = (moveEvent: MouseEvent): void => {
      if (!resizingRef.current) {
        return;
      }
      latestWidth = clamp(startWidth + (startX - moveEvent.clientX), 300, Math.min(720, window.innerWidth - 24));
      setSettings((current) => ({ ...current, panelWidth: latestWidth }));
    };

    const onUp = (): void => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      void saveSettings({ ...settings, panelWidth: latestWidth });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const displayMessageSource = localMessage
    ? "local"
    : state.lastError
      ? "lastError"
      : state.reloadWarning
        ? "reloadWarning"
        : state.rateLimitWarning
          ? "rateLimitWarning"
          : null;
  const displayMessage = localMessage ?? state.lastError ?? state.reloadWarning ?? state.rateLimitWarning;

  const dismissMessage = (): void => {
    if (displayMessageSource === "local") {
      setLocalMessage(null);
      return;
    }

    if (displayMessageSource === "lastError") {
      void persistState({ ...state, lastError: undefined });
      return;
    }

    if (displayMessageSource === "reloadWarning") {
      void persistState({ ...state, reloadWarning: undefined });
      return;
    }

    if (displayMessageSource === "rateLimitWarning") {
      void persistState({ ...state, rateLimitWarning: undefined });
    }
  };

  const nativeQueueDock = shouldRenderNativeQueueDock(settings.collapsed) ? (
    <NativeQueueDock
      provider={provider}
      providerClass={providerClass}
      theme={theme}
      state={state}
      texts={texts}
      providerBusy={providerBusy}
      onEdit={handleTaskEdit}
      onDelete={handleTaskDelete}
      onSteer={handleNativeTaskSteer}
      onDragStart={handleTaskDragStart}
      onDropOn={handleTaskDrop}
      onDragEnd={() => {
        draggedTaskIdRef.current = null;
      }}
    />
  ) : null;

  if (settings.collapsed) {
    return (
      <>
        {nativeQueueDock}
        <aside className={`queue-shell collapsed theme-${theme} ${providerClass}`} style={{ width: 44 }}>
          <button
            type="button"
            className="collapse-tab"
            onClick={() => void persistSettings({ ...settings, collapsed: false })}
            aria-label={texts.expandPanel}
            title={`${texts.expandPanel} (Alt+Q)`}
          >
            <ExpandIcon />
            <span>PQ</span>
          </button>
        </aside>
      </>
    );
  }

  return (
    <>
      {nativeQueueDock}
      <aside
        className={`queue-shell theme-${theme} ${providerClass}`}
        style={{ width: settings.panelWidth }}
        aria-label={texts.appTitle}
      >
      <div
        className="resize-handle"
        onMouseDown={startResize}
        title={texts.resizePanel}
        role="separator"
        aria-orientation="vertical"
        aria-label={texts.resizePanel}
      />

      <header className="panel-header">
        <div className="header-brand">
          <h1>{texts.appTitle}</h1>
          <span className="provider-tag">{providerLabel}</span>
          <p>{texts.appSubtitle} · {providerLabel}</p>
        </div>
        <div className="header-actions">
          <span className={`run-status-pill run-status-${runStatus}`}>{runStatusText}</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => setActiveSection("compare")}
            aria-label={texts.openCompareTool}
            title={texts.openCompareTool}
          >
            <SwapIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setActiveSection("settings")}
            aria-label={texts.openSettings}
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => void persistSettings({ ...settings, collapsed: true })}
            aria-label={texts.collapsePanel}
            title={`${texts.collapsePanel} (Alt+Q)`}
          >
            <CollapseIcon />
          </button>
        </div>
      </header>

      <section className="status-bar" aria-label={texts.queueStatus}>
        <span>{texts.current}: {runningIndex || "-"}</span>
        <span>{texts.pending}: {counters.pending}</span>
        <span>{texts.failed}: {counters.failed}</span>
        <span>{texts.skipped}: {counters.skipped}</span>
      </section>

      {displayMessage ? (
        <div className="message-banner">
          <span>{displayMessage}</span>
          <button
            type="button"
            className="message-dismiss"
            onClick={dismissMessage}
            aria-label={texts.dismissMessage}
            title={texts.dismissMessage}
          >
            x
          </button>
        </div>
      ) : null}

      <nav className="panel-nav" aria-label={texts.panelNav}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSection === section.id ? "active" : ""}
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => {
              setActiveSection(section.id);
              if (section.id === "workflow") {
                setExpandedWorkflowId(null);
              }
            }}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <main className="panel-body">
        {activeSection === "run" ? (
          <section className="panel-section run-section" aria-label={texts.navRun}>
            <section className="provider-health-panel" aria-label={texts.providerHealthTitle}>
              <div className="section-title-row compact">
                <h2>{texts.providerHealthTitle}</h2>
                <span className="provider-health-provider">{providerHealth.provider}</span>
              </div>
              <div className="provider-health-list">
                <span
                  className={`provider-health-chip ${healthClassName(providerHealth.composerFound)}`}
                  aria-label={healthLabel(texts.providerHealthComposer, providerHealth.composerFound, texts)}
                >
                  {texts.providerHealthComposer}
                </span>
                <span
                  className={`provider-health-chip ${healthClassName(providerHealth.sendButtonFound)}`}
                  aria-label={healthLabel(texts.providerHealthSend, providerHealth.sendButtonFound, texts)}
                >
                  {texts.providerHealthSend}
                </span>
                <span
                  className={`provider-health-chip ${healthClassName(providerHealth.stopButtonFound)}`}
                  aria-label={healthLabel(texts.providerHealthStop, providerHealth.stopButtonFound, texts)}
                >
                  {texts.providerHealthStop}
                </span>
                <span
                  className={`provider-health-chip ${providerHealth.pageBusy ? "health-busy" : "health-ok"}`}
                  aria-label={`${texts.providerHealthBusy}: ${providerHealth.pageBusy ? texts.providerHealthBusyValue : texts.providerHealthIdle}`}
                >
                  {texts.providerHealthBusy}
                </span>
              </div>
            </section>

            <section className="controls" aria-label={texts.controls}>
              <div className="section-title-row compact">
                <h2>{texts.controls}</h2>
              </div>
              <div className="control-grid compact-controls">
                <button
                  type="button"
                  onClick={handleQueuePrimaryClick}
                  disabled={queueActionBusy || (!state.isRunning && (counters.pending === 0)) || (state.isPaused && counters.pending === 0 && !state.currentTaskId)}
                >
                  {queuePrimaryLabel}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void persistState({ ...DEFAULT_STATE })}
                  disabled={!state.tasks.length || state.currentTaskId !== undefined || (state.isRunning && !state.isPaused)}
                >
                  {texts.clearAll}
                </button>
              </div>
            </section>

            <section className="queue-messages-preview run-queue-list" aria-label={texts.queueMessages}>
              <div className="section-title-row compact">
                <h2>{texts.queueMessages}</h2>
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => setActiveSection("workflow")}
                  disabled={!visibleQueueTasks.length}
                >
                  {texts.manageWorkflow}
                </button>
              </div>
              {visibleQueueTasks.length ? (
                <div className="queue-task-list">
                  {visibleQueueTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      total={visibleQueueTasks.length}
                      texts={texts}
                      onEdit={handleTaskEdit}
                      onDelete={handleTaskDelete}
                      onMove={handleTaskMove}
                      onMoveTop={handleTaskMoveTop}
                      onSkip={handleTaskSkip}
                      onRetry={handleTaskRetry}
                      onDragStart={handleTaskDragStart}
                      onDropOn={handleTaskDrop}
                      onDragEnd={() => {
                        draggedTaskIdRef.current = null;
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">{texts.queueMessagesEmpty}</div>
              )}
            </section>

            <section className="queue-results-panel" aria-label={texts.resultsTitle}>
              <div className="section-title-row compact">
                <h2>{texts.resultsTitle}</h2>
                <div className="section-title-actions">
                  <button
                    type="button"
                    className="secondary mini-action"
                    onClick={exportResults}
                    disabled={!doneQueueTasks.length}
                  >
                    {texts.exportResults}
                  </button>
                  <button
                    type="button"
                    className="secondary mini-action"
                    onClick={handleClearDone}
                    disabled={!doneQueueTasks.length}
                  >
                    {texts.clearDone}
                  </button>
                </div>
              </div>
              {doneQueueTasks.length ? (
                <div className="queue-task-list">
                  {doneQueueTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      total={doneQueueTasks.length}
                      texts={texts}
                      onEdit={handleTaskEdit}
                      onDelete={handleTaskDelete}
                      onMove={handleTaskMove}
                      onMoveTop={handleTaskMoveTop}
                      onSkip={handleTaskSkip}
                      onRetry={handleTaskRetry}
                      onDragStart={handleTaskDragStart}
                      onDropOn={handleTaskDrop}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">{texts.resultsEmpty}</div>
              )}
            </section>

            <section className="run-log-panel" aria-label={texts.runLogTitle}>
              <div className="section-title-row compact">
                <h2>{texts.runLogTitle}</h2>
                <div className="section-title-actions">
                  <button
                    type="button"
                    className="secondary mini-action"
                    onClick={() => void copyRunLog()}
                    disabled={!runLogEntries.length}
                  >
                    {texts.copyRunLog}
                  </button>
                  <button
                    type="button"
                    className="secondary mini-action"
                    onClick={() => void runBusy("clear-run-log", clearRunLog)}
                    disabled={!runLogEntries.length || Boolean(busyAction)}
                  >
                    {texts.clearRunLog}
                  </button>
                </div>
              </div>
              {runLogEntries.length ? (
                <div className="run-log-list">
                  {runLogEntries.slice(-6).reverse().map((entry) => (
                    <div className={`run-log-entry run-log-entry-${entry.status}`} key={entry.id}>
                      <span className="run-log-status">{entry.status}</span>
                      <span className="run-log-prompt">{entry.promptPreview}</span>
                      <span className="run-log-meta">
                        {entry.provider} · {texts.runLogAttempt} {entry.attemptCount}
                        {entry.failureStage ? ` · ${texts.runLogFailureStage} ${entry.failureStage}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">{texts.runLogEmpty}</div>
              )}
            </section>

            <section className="save-workflow-box secondary-run-tool" aria-label={texts.saveAsWorkflow}>
              <div className="section-title-row compact">
                <h2>{texts.saveAsWorkflow}</h2>
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => setSaveWorkflowOpen((value) => !value)}
                  disabled={!visibleQueueTasks.length}
                  aria-expanded={saveWorkflowOpen}
                >
                  {saveWorkflowOpen ? texts.cancel : texts.saveAsWorkflow}
                </button>
              </div>
              {saveWorkflowOpen ? (
                <div className="save-workflow-form">
                  <input
                    value={workflowNameDraft}
                    onChange={(event) => setWorkflowNameDraft(event.target.value)}
                    placeholder={texts.workflowNamePlaceholder}
                  />
                  <button
                    type="button"
                    onClick={() => void runBusy("save-workflow", saveCurrentQueueAsWorkflow)}
                    disabled={Boolean(busyAction) || !workflowNameDraft.trim() || !visibleQueueTasks.length}
                  >
                    {texts.save}
                  </button>
                </div>
              ) : (
                <p className="helper-text">{texts.saveWorkflowHint}</p>
              )}
            </section>

            <div className="run-bottom-stack">
              <section className="add-box run-composer-box" aria-label={texts.addQueuePrompt}>
                <div className="section-title-row compact">
                  <h2>{texts.addPromptLabel}</h2>
                </div>
                <textarea
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  placeholder={texts.addPlaceholder}
                  rows={4}
                />
                <div className="run-composer-actions">
                  <button
                    type="button"
                    onClick={() => void runBusy("add", addDraftToQueue)}
                    disabled={Boolean(busyAction) || !promptDraft.trim()}
                  >
                    {texts.addToQueue}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void startFanout()}
                    disabled={fanoutBusy || !promptDraft.trim()}
                  >
                    {texts.fanoutButton}
                  </button>
                </div>
                <SteerBox
                  settings={settings}
                  texts={texts}
                  busy={steerBusy || Boolean(busyAction) || fanoutBusy}
                  prompt={promptDraft}
                  onSettingsChange={(nextSettings) => void persistSettings(nextSettings)}
                  onInsertNext={(prompt) => runSteer(() => insertSteerTask(prompt))}
                  onStopAndSteer={stopAndSteer}
                  onConsumed={() => setPromptDraft("")}
                />
              </section>

              {fanoutResults.length ? (
                <section className="fanout-results-panel" aria-label={texts.fanoutResultsTitle}>
                  <div className="section-title-row compact">
                    <div className="fanout-results-heading">
                      <h2>{texts.fanoutResultsTitle}</h2>
                      <span aria-live="polite">{fanoutSummaryText}</span>
                    </div>
                    <button
                      type="button"
                      className="secondary mini-action"
                      onClick={() => {
                        setFanoutResults([]);
                        setFanoutSessionId(null);
                      }}
                    >
                      {texts.fanoutClear}
                    </button>
                  </div>
                  <div className="fanout-result-list">
                    {fanoutResults.map((result) => (
                      <div className={`fanout-result-card fanout-result-${result.status}`} key={result.provider}>
                        <div className="section-title-row compact">
                          <strong>{result.provider}</strong>
                          <span className={`status-chip status-${result.status === "done" ? "done" : result.status === "error" ? "failed" : "running"}`}>
                            {result.status === "pending" ? texts.fanoutPending : result.status === "error" ? texts.failed : texts.done}
                          </span>
                        </div>
                        {result.status === "pending" ? <p className="fanout-pending-note">{texts.fanoutPendingDetail}</p> : null}
                        {result.text ? (
                          <>
                            <p className="task-result-text">{result.text}</p>
                            <div className="task-actions task-actions-wrap">
                              <button type="button" className="secondary" onClick={() => useFanoutResultAsCompare("old", result.text!)}>
                                {texts.fanoutUseAsOld}
                              </button>
                              <button type="button" className="secondary" onClick={() => useFanoutResultAsCompare("new", result.text!)}>
                                {texts.fanoutUseAsNew}
                              </button>
                            </div>
                          </>
                        ) : null}
                        {result.error ? <p className="task-error">{result.error}</p> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

        {activeSection === "workflow" ? (
          <section className="workflow-library" aria-label={texts.workflowLabel}>
            <div className="section-title-row compact sticky-title">
              <h2>{texts.workflowLabel}</h2>
              <div className="section-title-actions">
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => setTemplatesOpen((value) => !value)}
                  aria-expanded={templatesOpen}
                >
                  {templatesOpen ? texts.hideWorkflowTemplates : texts.addWorkflowTemplates}
                </button>
                <button type="button" className="secondary mini-action" onClick={() => fileInputRef.current?.click()}>
                  {texts.importWorkflow}
                </button>
              </div>
            </div>
            {templatesOpen ? (
              <div className="workflow-template-list" aria-label={texts.workflowTemplatesTitle}>
                {BUILT_IN_WORKFLOW_TEMPLATES.map((template) => (
                  <article className="workflow-template-item" key={template.id}>
                    <div>
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </div>
                    <button
                      type="button"
                      className="secondary mini-action"
                      onClick={() => void runBusy("add-template", () => addWorkflowTemplate(template))}
                      disabled={Boolean(busyAction)}
                    >
                      {texts.addWorkflowTemplate}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="workflow-filter-bar">
              <input
                value={workflowSearchDraft}
                onChange={(event) => setWorkflowSearchDraft(event.target.value)}
                placeholder={texts.workflowSearchPlaceholder}
                aria-label={texts.workflowSearchPlaceholder}
              />
              <select
                value={workflowTagFilter}
                onChange={(event) => setWorkflowTagFilter(event.target.value)}
                aria-label={texts.workflowTagFilter}
              >
                <option value="">{texts.workflowAllTags}</option>
                {workflowTags.map((tag) => (
                  <option value={tag} key={tag}>{tag}</option>
                ))}
              </select>
            </div>
            {visibleWorkflows.length ? (
              visibleWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  expanded={expandedWorkflowId === workflow.id}
                  texts={texts}
                  onToggle={(id) => setExpandedWorkflowId((current) => (current === id ? null : id))}
                  onRename={(id, name) => void runBusy("rename-workflow", () => renameWorkflow(id, name))}
                  onDelete={(id) => void runBusy("delete-workflow", () => deleteWorkflow(id))}
                  onCopy={(id) => void runBusy("copy-workflow", () => copyWorkflowById(id))}
                  onRun={(id) => void runBusy("run-workflow", () => runWorkflow(id))}
                  onExport={exportWorkflowById}
                  runDisabled={Boolean(busyAction) || state.isRunning || workflow.messages.length === 0}
                  onUpdateMessages={(id, messages) => void runBusy("update-workflow", () => updateWorkflowMessages(id, messages))}
                  onAddTag={(id, tag) => void runBusy("add-workflow-tag", () => addWorkflowTag(id, tag))}
                  onRemoveTag={(id, tag) => void runBusy("remove-workflow-tag", () => removeWorkflowTag(id, tag))}
                  onWorkflowDragStart={(id) => {
                    draggedWorkflowIdRef.current = id;
                    setDraggedWorkflowId(id);
                  }}
                  onWorkflowDrop={(id) => void runBusy("reorder-workflow", () => dropWorkflow(id))}
                  onWorkflowDragEnd={() => {
                    draggedWorkflowIdRef.current = null;
                    setDraggedWorkflowId(null);
                  }}
                />
              ))
            ) : workflows.length ? (
              <div className="empty-state">{texts.workflowNoMatches}</div>
            ) : (
              <div className="empty-state">{texts.workflowEmptyState}</div>
            )}
          </section>
        ) : null}

        {activeSection === "compare" ? (
          <TextComparePanel
            texts={texts}
            oldText={compareOldText}
            newText={compareNewText}
            language={settings.language}
            onOldTextChange={setCompareOldText}
            onNewTextChange={setCompareNewText}
            onClose={() => setActiveSection("run")}
          />
        ) : null}

        {activeSection === "settings" ? (
          <section className="panel-section" aria-label={texts.navSettings}>
            <SettingsPanel
              settings={settings}
              texts={texts}
              onChange={(nextSettings) => void persistSettings(nextSettings)}
              onClose={() => setActiveSection("run")}
            />
          </section>
        ) : null}

        {pendingVariableWorkflow ? (
          <div className="workflow-variable-backdrop" role="presentation">
            <section
              className="workflow-variable-modal"
              role="dialog"
              aria-modal="true"
              aria-label={texts.workflowVariablesTitle}
            >
              <div className="section-title-row compact">
                <h2>{texts.workflowVariablesTitle}</h2>
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => {
                    setPendingVariableWorkflow(null);
                    setWorkflowVariableValues({});
                    setVariableInputMode("single");
                    setVariableTableRaw("");
                  }}
                >
                  {texts.cancel}
                </button>
              </div>

              {/* role="tablist" requires role="tab" + aria-selected children;
                  these are aria-pressed toggle buttons, so the correct
                  container role is "group". */}
              <div className="workflow-variable-mode-toggle" role="group" aria-label={texts.workflowVariablesTitle}>
                <button
                  type="button"
                  className={variableInputMode === "single" ? "active" : ""}
                  aria-pressed={variableInputMode === "single"}
                  onClick={() => setVariableInputMode("single")}
                >
                  {texts.workflowVariableModeSingle}
                </button>
                <button
                  type="button"
                  className={variableInputMode === "table" ? "active" : ""}
                  aria-pressed={variableInputMode === "table"}
                  onClick={() => setVariableInputMode("table")}
                >
                  {texts.workflowVariableModeTable}
                </button>
              </div>

              {variableInputMode === "single" ? (
                <>
                  <p className="helper-text">{texts.workflowVariablesHint}</p>
                  <div className="workflow-variable-list">
                    {pendingWorkflowVariables.map((name) => (
                      <label className="field" key={name}>
                        <span>{name}</span>
                        <input
                          type="text"
                          value={workflowVariableValues[name] ?? ""}
                          onChange={(event) => setWorkflowVariableValues((current) => ({
                            ...current,
                            [name]: event.target.value
                          }))}
                          placeholder={`${texts.workflowVariablePlaceholder} ${name}`}
                        />
                      </label>
                    ))}
                  </div>
                  {workflowVariablePreviewMessages.length ? (
                    <div className="workflow-variable-preview">
                      <strong>{texts.workflowRunPreviewTitle}</strong>
                      <span>{formatCountMessage(texts.workflowRunPreviewCount, workflowVariablePreviewMessages.length)}</span>
                      <ol>
                        {workflowVariablePreviewMessages.map((message, index) => (
                          <li key={message.id || index}>{previewPrompt(message.prompt, 96)}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void runBusy("run-workflow-vars", submitWorkflowVariables)}
                    disabled={Boolean(busyAction) || !variablesReady}
                  >
                    {texts.runWithVariables}
                  </button>
                </>
              ) : (
                <>
                  <p className="helper-text">{texts.workflowVariableTableHint}</p>
                  <textarea
                    className="workflow-variable-table-input"
                    value={variableTableRaw}
                    onChange={(event) => setVariableTableRaw(event.target.value)}
                    placeholder={texts.workflowVariableTablePlaceholder}
                    rows={6}
                  />
                  {variableTableError ? (
                    <p className="task-error">{variableTableError}</p>
                  ) : null}
                  {variableTableReady ? (
                    <div className="workflow-variable-preview">
                      <strong>{texts.workflowRunPreviewTitle}</strong>
                      <span>
                        {texts.workflowVariableTableSummary
                          .replace("{rows}", String(parsedVariableTable.rows.length))
                          .replace("{perRow}", String(pendingVariableWorkflow.messages.length))
                          .replace("{total}", String(variableTableTaskCount))}
                      </span>
                      <ol>
                        {parsedVariableTable.rows.slice(0, 5).map((row, index) => (
                          <li key={index}>{Object.values(row).join(" / ")}</li>
                        ))}
                      </ol>
                      {parsedVariableTable.rows.length > 5 ? (
                        <span className="field-hint">
                          {texts.workflowVariableTablePreviewMore.replace("{count}", String(parsedVariableTable.rows.length - 5))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void runBusy("run-workflow-var-table", submitWorkflowVariableTable)}
                    disabled={Boolean(busyAction) || !variableTableReady}
                  >
                    {texts.runWithVariableTable}
                  </button>
                </>
              )}
            </section>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              void runBusy("import", () => importWorkflowFile(file));
            }
          }}
        />
      </main>
      </aside>
    </>
  );
}
