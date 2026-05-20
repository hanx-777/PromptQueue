import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTexts, type Texts } from "../content/i18n";
import { QueueRunner } from "../content/queueRunner";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  loadSettings,
  loadState,
  saveSettings,
  saveState,
  subscribeStorageChanges
} from "../content/storage";
import type { QueueSettings, QueueState, QueueTask, TaskStatus } from "../content/types";
import { clamp, createId } from "../utils/dom";
import { getErrorMessage } from "../utils/logger";
import { CollapseIcon, SettingsIcon } from "./Icons";
import { SettingsPanel } from "./SettingsPanel";
import { SteerBox } from "./SteerBox";
import { TaskItem } from "./TaskItem";

type PanelSection = "run" | "workflow" | "settings" | "support";

const VALID_IMPORT_STATUSES: TaskStatus[] = ["pending", "running", "done", "failed", "skipped"];
const GITHUB_REPO_URL = "https://github.com/hanx-777/chatgpt-queue-steer-extension";

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

function normalizeImportedTasks(value: unknown): QueueTask[] {
  const rawTasks = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { tasks?: unknown }).tasks)
      ? (value as { tasks: unknown[] }).tasks
      : [];

  return rawTasks
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
      if (!prompt) {
        return null;
      }
      const status = VALID_IMPORT_STATUSES.includes(record.status as TaskStatus)
        ? (record.status as TaskStatus)
        : "pending";
      return makeTask(prompt, status === "running" ? "pending" : status);
    })
    .filter((task): task is QueueTask => Boolean(task));
}

function reorderTasks(tasks: QueueTask[], draggedId: string, targetId: string): QueueTask[] {
  if (draggedId === targetId) {
    return tasks;
  }

  const draggedIndex = tasks.findIndex((task) => task.id === draggedId);
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) {
    return tasks;
  }

  const next = [...tasks];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next.map((task) => ({ ...task, updatedAt: task.id === draggedId ? now() : task.updatedAt }));
}

function getSections(texts: Texts): Array<{ id: PanelSection; label: string }> {
  return [
    { id: "run", label: texts.navRun },
    { id: "workflow", label: texts.navWorkflow },
    { id: "settings", label: texts.navSettings },
    { id: "support", label: texts.navSupport }
  ];
}

export function QueuePanel(): JSX.Element {
  const [state, setState] = useState<QueueState>(DEFAULT_STATE);
  const [settings, setSettings] = useState<QueueSettings>(DEFAULT_SETTINGS);
  const [activeSection, setActiveSection] = useState<PanelSection>("run");
  const [promptDraft, setPromptDraft] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const runnerRef = useRef(new QueueRunner());
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizingRef = useRef(false);

  const texts = useMemo(() => getTexts(settings.language), [settings.language]);
  const sections = useMemo(() => getSections(texts), [texts]);
  const theme = settings.theme === "system" ? "system" : settings.theme;
  const donateImageUrl = useMemo(() => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("assets/donate-wechat.jpg");
    }
    return "";
  }, []);

  const refresh = useCallback(async () => {
    const [nextState, nextSettings] = await Promise.all([loadState(), loadSettings()]);
    setState(nextState);
    setSettings(nextSettings);
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

  const handleMove = (id: string, direction: "up" | "down"): void => {
    const index = state.tasks.findIndex((task) => task.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= state.tasks.length) {
      return;
    }
    const next = [...state.tasks];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    void updateTasks(next);
  };

  const handleMoveTop = (id: string): void => {
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index <= 0) {
      return;
    }
    const next = [...state.tasks];
    const [task] = next.splice(index, 1);
    next.unshift(task);
    void updateTasks(next);
  };

  const handleDropOn = (targetId: string): void => {
    if (!draggedTaskId) {
      return;
    }
    void updateTasks(reorderTasks(state.tasks, draggedTaskId, targetId));
    setDraggedTaskId(null);
  };

  const handleSkip = (id: string): void => {
    runnerRef.current.skipTask(id);
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (
        task.id === id ? { ...task, status: "skipped", updatedAt: now(), error: undefined } : task
      )),
      currentTaskId: current.currentTaskId === id ? undefined : current.currentTaskId
    }));
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
    await runBusy("stop-steer", async () => {
      await runnerRef.current.stopCurrent();
      await insertSteerTask(prompt, false);
      const latest = await loadState();
      if (latest.isRunning && !latest.currentTaskId && !latest.isPaused) {
        await runnerRef.current.runNext();
      }
    });
  };

  const exportQueue = (): void => {
    const payload = {
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      settings: {
        stableDelayMs: settings.stableDelayMs,
        maxWaitMs: settings.maxWaitMs,
        autoStartNext: settings.autoStartNext,
        appendContextMode: settings.appendContextMode,
        batchSeparator: settings.batchSeparator,
        theme: settings.theme,
        language: settings.language
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chatgpt-queue-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importQueueFile = async (file: File): Promise<void> => {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(texts.importInvalidJson);
    }

    const importedTasks = normalizeImportedTasks(parsed);
    if (!importedTasks.length) {
      throw new Error(texts.importNoValidTasks);
    }

    const latest = await loadState();
    await persistState({
      ...latest,
      tasks: [...latest.tasks, ...importedTasks],
      lastError: undefined
    });
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

  const displayMessage = localMessage ?? state.lastError ?? state.reloadWarning;

  if (settings.collapsed) {
    return (
      <aside className={`queue-shell collapsed theme-${theme}`} style={{ width: 44 }}>
        <button
          type="button"
          className="collapse-tab"
          onClick={() => void persistSettings({ ...settings, collapsed: false })}
          aria-label={texts.expandPanel}
          title={`${texts.expandPanel} (Alt+Q)`}
        >
          Q
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`queue-shell theme-${theme}`}
      style={{ width: settings.panelWidth }}
      aria-label="ChatGPT Queue Steer panel"
    >
      <div className="resize-handle" onMouseDown={startResize} title="Resize panel" />

      <header className="panel-header">
        <div>
          <h1>{texts.appTitle}</h1>
          <p>
            {texts.appSubtitle} - {state.isRunning ? texts.running : texts.idle}
            {state.isPaused ? ` - ${texts.paused}` : ""}
          </p>
        </div>
        <div className="header-actions">
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

      {displayMessage ? <div className="message-banner">{displayMessage}</div> : null}

      <nav className="panel-nav" aria-label={texts.panelNav}>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={activeSection === section.id ? "active" : ""}
            aria-current={activeSection === section.id ? "page" : undefined}
            onClick={() => setActiveSection(section.id)}
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
              busy={Boolean(busyAction)}
              onSettingsChange={(nextSettings) => void persistSettings(nextSettings)}
              onInsertNext={(prompt) => runBusy("steer", () => insertSteerTask(prompt))}
              onStopAndSteer={stopAndSteer}
            />

            <section className="controls" aria-label={texts.controls}>
              <div className="section-title-row compact">
                <h2>{texts.controls}</h2>
              </div>
              <div className="control-grid">
                <button type="button" onClick={() => void runBusy("start", () => runnerRef.current.start())} disabled={Boolean(busyAction) || counters.pending === 0}>
                  {texts.startQueue}
                </button>
                <button type="button" className="secondary" onClick={() => runnerRef.current.pause()} disabled={!state.isRunning || state.isPaused}>
                  {texts.pause}
                </button>
                <button type="button" onClick={() => void runBusy("resume", () => runnerRef.current.resume())} disabled={Boolean(busyAction) || counters.pending === 0 || (!state.isPaused && state.isRunning)}>
                  {texts.resume}
                </button>
                <button type="button" className="warning" onClick={() => void runBusy("stop", () => runnerRef.current.stopCurrent())} disabled={Boolean(busyAction)}>
                  {texts.stopCurrent}
                </button>
                <button type="button" className="secondary" onClick={() => void updateTasks(state.tasks.filter((task) => task.status !== "done"))} disabled={!counters.done}>
                  {texts.clearDone}
                </button>
                <button type="button" className="danger" onClick={() => void persistState({ ...DEFAULT_STATE })} disabled={!state.tasks.length || state.currentTaskId !== undefined}>
                  {texts.clearAll}
                </button>
                <button type="button" className="secondary" onClick={exportQueue} disabled={!state.tasks.length}>
                  {texts.exportQueue}
                </button>
                <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
                  {texts.importQueue}
                </button>
              </div>
              <input
                ref={fileInputRef}
                className="hidden-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    void runBusy("import", () => importQueueFile(file));
                  }
                }}
              />
            </section>
          </section>
        ) : null}

        {activeSection === "workflow" ? (
          <section className="task-list" aria-label={texts.workflowLabel}>
            <div className="section-title-row compact sticky-title">
              <h2>{texts.workflowLabel}</h2>
            </div>
            {state.tasks.length ? (
              state.tasks.map((task, index) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  index={index}
                  total={state.tasks.length}
                  texts={texts}
                  onEdit={handleTaskEdit}
                  onDelete={handleTaskDelete}
                  onMove={handleMove}
                  onMoveTop={handleMoveTop}
                  onSkip={handleSkip}
                  onRetry={(id) => void runBusy("retry", () => runnerRef.current.retryTask(id))}
                  onDragStart={setDraggedTaskId}
                  onDropOn={handleDropOn}
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
              {donateImageUrl ? (
                <img src={donateImageUrl} alt={texts.wechatPayAlt} loading="lazy" />
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </aside>
  );
}
