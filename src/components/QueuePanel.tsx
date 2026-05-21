import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTexts, statusLabel, type Texts } from "../content/i18n";
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
import type { QueueSettings, QueueState, QueueTask, QueueWorkflow, TaskStatus, WorkflowMessage } from "../content/types";
import { getCurrentProvider } from "../content/providers";
import { clamp, createId } from "../utils/dom";
import { getErrorMessage } from "../utils/logger";
import { CollapseIcon, ExpandIcon, SettingsIcon } from "./Icons";
import { SettingsPanel } from "./SettingsPanel";
import { SteerBox } from "./SteerBox";
import { WorkflowCard } from "./WorkflowCard";

type PanelSection = "run" | "workflow" | "settings" | "support";

const GITHUB_REPO_URL = "https://github.com/hanx-777/PromptQueue";
const KOFI_URL = "https://ko-fi.com/hanx1221";

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

function makeWorkflow(name: string, messages: WorkflowMessage[]): QueueWorkflow {
  const timestamp = now();
  return {
    id: createId(),
    name,
    messages,
    createdAt: timestamp,
    updatedAt: timestamp
  };
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

function previewPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized;
}

function getSections(texts: Texts): Array<{ id: PanelSection; label: string }> {
  return [
    { id: "run", label: texts.navRun },
    { id: "workflow", label: texts.navWorkflow },
    { id: "settings", label: texts.navSettings },
    { id: "support", label: texts.navSupport }
  ];
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

export function QueuePanel(): JSX.Element {
  const [state, setState] = useState<QueueState>(DEFAULT_STATE);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_SETTINGS);
  const [workflows, setWorkflows] = useState<QueueWorkflow[]>([]);
  const [activeSection, setActiveSection] = useState<PanelSection>("run");
  const [promptDraft, setPromptDraft] = useState("");
  const [saveWorkflowOpen, setSaveWorkflowOpen] = useState(false);
  const [workflowNameDraft, setWorkflowNameDraft] = useState("");
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);
  const [draggedWorkflowId, setDraggedWorkflowId] = useState<string | null>(null);
  const [editingQueueTaskId, setEditingQueueTaskId] = useState<string | null>(null);
  const [queueTaskDraft, setQueueTaskDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [queueActionBusy, setQueueActionBusy] = useState(false);
  const [steerBusy, setSteerBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const runnerRef = useRef(new QueueRunner());
  const busyRef = useRef(false);
  const queueActionBusyRef = useRef(false);
  const steerBusyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizingRef = useRef(false);
  const draggedWorkflowIdRef = useRef<string | null>(null);

  const texts = useMemo(() => getTexts(settings.language), [settings.language]);
  const sections = useMemo(() => getSections(texts), [texts]);
  const theme = settings.theme === "system" ? "system" : settings.theme;
  const provider = useMemo(() => getCurrentProvider(), []);
  const providerLabel = provider.label;
  const providerClass = `provider-${provider.id}`;
  const donateImageUrl = useMemo(() => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("assets/donate-wechat.jpg");
    }
    return "";
  }, []);

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
    await persistState({
      ...latest,
      tasks: [...latest.tasks, ...prompts.map((prompt) => makeTask(prompt))],
      lastError: undefined
    });
    setPromptDraft("");
  }, [persistState, promptDraft, settings.batchSeparator, settings.language]);

  useEffect(() => {
    const toggleHandler = (): void => {
      void persistSettings({ ...settings, collapsed: !settings.collapsed });
    };
    const addHandler = (): void => {
      void addDraftToQueue();
    };

    window.addEventListener("gqs-toggle", toggleHandler);
    window.addEventListener("gqs-add", addHandler);
    return () => {
      window.removeEventListener("gqs-toggle", toggleHandler);
      window.removeEventListener("gqs-add", addHandler);
    };
  }, [addDraftToQueue, persistSettings, settings]);

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
  const queuePrimaryLabel = state.isRunning && !state.isPaused ? texts.pause : texts.startQueue;

  const updateTasks = async (tasks: QueueTask[], patch: Partial<QueueState> = {}): Promise<void> => {
    await persistState({
      ...state,
      ...patch,
      tasks
    });
  };

  const handleTaskEdit = (id: string, prompt: string): void => {
    void updateTasks(state.tasks.map((task) => (
      task.id === id ? { ...task, prompt, updatedAt: now(), error: undefined } : task
    )));
  };

  const handleTaskDelete = (id: string): void => {
    void updateTasks(state.tasks.filter((task) => task.id !== id), {
      currentTaskId: state.currentTaskId === id ? undefined : state.currentTaskId
    });
  };

  const toggleTaskStatus = (task: QueueTask): void => {
    if (task.status === "running") {
      return;
    }

    const nextStatus: TaskStatus = task.status === "pending" ? "done" : "pending";
    void updateTasks(state.tasks.map((item) => (
      item.id === task.id
        ? { ...item, status: nextStatus, updatedAt: now(), error: undefined }
        : item
    )));
  };

  const startQueueTaskEdit = (task: QueueTask): void => {
    setEditingQueueTaskId(task.id);
    setQueueTaskDraft(task.prompt);
  };

  const saveQueueTaskEdit = (): void => {
    const trimmed = queueTaskDraft.trim();
    if (!editingQueueTaskId || !trimmed) {
      return;
    }
    handleTaskEdit(editingQueueTaskId, trimmed);
    setEditingQueueTaskId(null);
    setQueueTaskDraft("");
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
    await persistState({ ...latest, tasks: nextTasks, lastError: clearError ? undefined : latest.lastError });
  };

  const stopAndSteer = async (prompt: string): Promise<void> => {
    await runSteer(async () => {
      await runnerRef.current.stopCurrent();
      await insertSteerTask(prompt, false);
      const latest = await loadState();
      if (latest.isRunning && !latest.currentTaskId && !latest.isPaused) {
        runQueueInBackground();
      }
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

  const tasksFromWorkflow = (workflow: QueueWorkflow): QueueTask[] => (
    workflow.messages.map((message) => makeTask(message.prompt))
  );

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
    if (!state.tasks.length) {
      throw new Error(texts.workflowSaveEmpty);
    }

    const trimmedName = workflowNameDraft.trim();
    if (!trimmedName) {
      throw new Error(texts.workflowNameRequired);
    }

    const latestWorkflows = await loadWorkflows();
    const name = getUniqueWorkflowName(trimmedName, latestWorkflows);
    const workflow = makeWorkflow(name, queueMessagesFromTasks(state.tasks));
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
    const workflow = makeWorkflow(name, messages);
    await persistWorkflows([...latestWorkflows, workflow]);
    setExpandedWorkflowId(null);
    setLocalMessage(`${texts.workflowImported}: ${name}`);
  };

  const renameWorkflow = async (id: string, name: string): Promise<void> => {
    const uniqueName = getUniqueWorkflowName(name, workflows, id);
    await persistWorkflows(workflows.map((workflow) => (
      workflow.id === id ? { ...workflow, name: uniqueName, updatedAt: now() } : workflow
    )));
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

  const runWorkflow = async (id: string): Promise<void> => {
    const workflow = workflows.find((item) => item.id === id);
    if (!workflow) {
      return;
    }
    const latest = await loadState();
    if (latest.isRunning || latest.currentTaskId) {
      throw new Error(texts.workflowRunBlocked);
    }

    await saveState({
      ...latest,
      tasks: tasksFromWorkflow(workflow),
      isRunning: false,
      isPaused: false,
      currentTaskId: undefined,
      lastError: undefined
    });
    setActiveSection("run");
    setExpandedWorkflowId(null);
    await runnerRef.current.start();
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
        : null;
  const displayMessage = localMessage ?? state.lastError ?? state.reloadWarning;

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
    }
  };

  if (settings.collapsed) {
    return (
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
    );
  }

  return (
    <aside
      className={`queue-shell theme-${theme} ${providerClass}`}
      style={{ width: settings.panelWidth }}
      aria-label="PromptQueue panel"
    >
      <div className="resize-handle" onMouseDown={startResize} title="Resize panel" />

      <header className="panel-header">
        <div className="header-brand">
          <h1>{texts.appTitle}</h1>
          <span className="provider-tag">{providerLabel}</span>
          <p>{texts.appSubtitle} · {providerLabel}</p>
        </div>
        <div className="header-actions">
          <span className={`run-status-pill run-status-${runStatus}`}>{runStatusText}</span>
          <div className="language-toggle" aria-label={texts.language}>
            <button
              type="button"
              className={settings.language === "zh" ? "active" : ""}
              aria-pressed={settings.language === "zh"}
              onClick={() => void persistSettings({ ...settings, language: "zh" })}
            >
              {"\u4e2d"}
            </button>
            <button
              type="button"
              className={settings.language === "en" ? "active" : ""}
              aria-pressed={settings.language === "en"}
              onClick={() => void persistSettings({ ...settings, language: "en" })}
            >
              EN
            </button>
          </div>
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
        <span>{texts.done}: {counters.done}</span>
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
            <section className="add-box" aria-label={texts.addQueuePrompt}>
              <div className="section-title-row compact">
                <h2>{texts.addPromptLabel}</h2>
              </div>
              <textarea
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
                placeholder={texts.addPlaceholder}
                rows={5}
              />
              <button
                type="button"
                onClick={() => void runBusy("add", addDraftToQueue)}
                disabled={Boolean(busyAction) || !promptDraft.trim()}
              >
                {texts.addToQueue}
              </button>
            </section>

            <SteerBox
              settings={settings}
              texts={texts}
              busy={steerBusy}
              onSettingsChange={(nextSettings) => void persistSettings(nextSettings)}
              onInsertNext={(prompt) => runSteer(() => insertSteerTask(prompt))}
              onStopAndSteer={stopAndSteer}
            />

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

            <section className="save-workflow-box" aria-label={texts.saveAsWorkflow}>
              <div className="section-title-row compact">
                <h2>{texts.saveAsWorkflow}</h2>
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => setSaveWorkflowOpen((value) => !value)}
                  disabled={!state.tasks.length}
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
                    disabled={Boolean(busyAction) || !workflowNameDraft.trim() || !state.tasks.length}
                  >
                    {texts.save}
                  </button>
                </div>
              ) : (
                <p className="helper-text">{texts.saveWorkflowHint}</p>
              )}
            </section>

            <section className="queue-messages-preview" aria-label={texts.queueMessages}>
              <div className="section-title-row compact">
                <h2>{texts.queueMessages}</h2>
                <button
                  type="button"
                  className="secondary mini-action"
                  onClick={() => setActiveSection("workflow")}
                  disabled={!state.tasks.length}
                >
                  {texts.manageWorkflow}
                </button>
              </div>
              {state.tasks.length ? (
                <ol className="queue-message-list">
                  {state.tasks.map((task, index) => (
                    <li key={task.id} className={`queue-message-row queue-message-${task.status}`}>
                      <div className="queue-message-main">
                        <div className="queue-message-meta">
                          <span className="queue-message-index">#{index + 1}</span>
                          <button
                            type="button"
                            className={`status-chip status-${task.status} status-toggle`}
                            onClick={() => toggleTaskStatus(task)}
                            disabled={task.status === "running"}
                            title={texts.toggleTaskStatus}
                          >
                            {statusLabel(task.status, texts)}
                          </button>
                        </div>
                        {editingQueueTaskId === task.id ? (
                          <div className="queue-message-edit">
                            <textarea
                              value={queueTaskDraft}
                              onChange={(event) => setQueueTaskDraft(event.target.value)}
                              rows={2}
                            />
                            <div className="task-actions">
                              <button type="button" onClick={saveQueueTaskEdit} disabled={!queueTaskDraft.trim()}>
                                {texts.save}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setEditingQueueTaskId(null);
                                  setQueueTaskDraft("");
                                }}
                              >
                                {texts.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p>{previewPrompt(task.prompt)}</p>
                        )}
                      </div>
                      <div className="queue-message-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startQueueTaskEdit(task)}
                          disabled={task.status === "running"}
                        >
                          {texts.edit}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleTaskDelete(task.id)}
                          disabled={task.status === "running"}
                        >
                          {texts.delete}
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state compact-empty">{texts.queueMessagesEmpty}</div>
              )}
            </section>
          </section>
        ) : null}

        {activeSection === "workflow" ? (
          <section className="workflow-library" aria-label={texts.workflowLabel}>
            <div className="section-title-row compact sticky-title">
              <h2>{texts.workflowLabel}</h2>
              <div className="section-title-actions">
                <button type="button" className="secondary mini-action" onClick={() => fileInputRef.current?.click()}>
                  {texts.importWorkflow}
                </button>
              </div>
            </div>
            {workflows.length ? (
              workflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  expanded={expandedWorkflowId === workflow.id}
                  texts={texts}
                  onToggle={(id) => setExpandedWorkflowId((current) => (current === id ? null : id))}
                  onRename={(id, name) => void runBusy("rename-workflow", () => renameWorkflow(id, name))}
                  onDelete={(id) => void runBusy("delete-workflow", () => deleteWorkflow(id))}
                  onRun={(id) => void runBusy("run-workflow", () => runWorkflow(id))}
                  onExport={exportWorkflowById}
                  runDisabled={Boolean(busyAction) || state.isRunning || workflow.messages.length === 0}
                  onUpdateMessages={(id, messages) => void runBusy("update-workflow", () => updateWorkflowMessages(id, messages))}
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
            ) : (
              <div className="empty-state">{texts.workflowEmptyState}</div>
            )}
          </section>
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

        {activeSection === "support" ? (
          <section className="panel-section support-section" aria-label={texts.navSupport}>
            <div className="donate-card expanded">
              <div className="donate-copy">
                <strong>{texts.supportTitle}</strong>
                <span>{texts.supportBody}</span>
              </div>
              <a
                className="github-star-link"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                {texts.githubStar}
              </a>
              <a
                className="github-star-link kofi-link"
                href={KOFI_URL}
                target="_blank"
                rel="noreferrer"
              >
                {texts.koFiSupport}
              </a>
              {donateImageUrl ? (
                <img src={donateImageUrl} alt={texts.wechatPayAlt} loading="lazy" />
              ) : null}
            </div>
          </section>
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
  );
}
