import { clickSend, clickStop, setComposerText } from "./chatgptDom";
import { getProviderModelPreference } from "./modelSettings";
import { detectProviderHardBusy } from "./providerRuntime";
import { getCurrentProvider, getCurrentProviderLabel } from "./providers";
import { ReplyWatcher } from "./replyWatcher";
import { loadSettings, loadState, saveState } from "./storage";
import type { QueueRunLogEntry, QueueRunLogStatus, QueueSettings, QueueState, QueueTask } from "./types";
import { createId, previewPrompt } from "../utils/dom";
import { delay } from "../utils/events";
import { getErrorMessage, logWarn } from "../utils/logger";
import { appendRunLogEntry } from "../utils/runLog";

function now(): number {
  return Date.now();
}

function updateTask(tasks: QueueTask[], id: string, patch: Partial<QueueTask>): QueueTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: now() } : task));
}

export function shouldAutoRetryTask(task: QueueTask, settings: QueueSettings, sendStarted: boolean): boolean {
  if (!settings.autoRetryEnabled || sendStarted) {
    return false;
  }

  const attemptCount = task.attemptCount ?? 0;
  return attemptCount > 0 && attemptCount <= settings.maxAutoRetries;
}

function makeRunLogEntry(
  task: QueueTask,
  status: QueueRunLogStatus,
  provider: string,
  startedAt: number,
  endedAt?: number,
  error?: string
): QueueRunLogEntry {
  return {
    id: createId(),
    taskId: task.id,
    promptPreview: previewPrompt(task.prompt, 120),
    status,
    provider,
    startedAt,
    endedAt,
    attemptCount: task.attemptCount ?? 1,
    error
  };
}

export class QueueRunner {
  private processing: Promise<void> | null = null;
  private stopping = false;

  async start(): Promise<void> {
    if (this.processing) {
      return this.processing;
    }

    const state = await loadState();
    await saveState({
      ...state,
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });

    return this.runNext();
  }

  pause(): void {
    void (async () => {
      const state = await loadState();
      await saveState({
        ...state,
        isPaused: true
      });
    })().catch((error) => {
      logWarn("Failed to pause queue:", getErrorMessage(error));
    });
  }

  async resume(): Promise<void> {
    const state = await loadState();
    await saveState({
      ...state,
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });

    return this.runNext();
  }

  async stopCurrent(options: { suppressMissingStopError?: boolean } = {}): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.stopping = true;
    try {
      const stopped = await clickStop();
      const state = await loadState();
      if (!stopped) {
        if (!options.suppressMissingStopError) {
          await saveState({
            ...state,
            lastError: `Stop button was not found. ${getCurrentProviderLabel()} may not be generating right now.`
          });
        }
      } else {
        await saveState({
          ...state,
          lastError: undefined
        });
      }
    } finally {
      this.stopping = false;
    }
  }

  async runNext(): Promise<void> {
    if (this.processing) {
      return this.processing;
    }

    this.processing = this.processQueue();
    try {
      await this.processing;
    } finally {
      this.processing = null;
    }
  }

  async retryTask(id: string): Promise<void> {
    const state = await loadState();
    await saveState({
      ...state,
      tasks: updateTask(state.tasks, id, {
        status: "pending",
        error: undefined,
        resultSummary: undefined,
        attemptCount: undefined,
        lastAttemptAt: undefined
      }),
      isRunning: true,
      isPaused: false,
      lastError: undefined
    });

    await this.runNext();
  }

  skipTask(id: string): void {
    void (async () => {
      const state = await loadState();
      const task = state.tasks.find((item) => item.id === id);
      const skippedState: QueueState = {
        ...state,
        tasks: updateTask(state.tasks, id, {
          status: "skipped",
          error: undefined
        }),
        currentTaskId: state.currentTaskId === id ? undefined : state.currentTaskId
      };
      await saveState(task
        ? appendRunLogEntry(
            skippedState,
            makeRunLogEntry(
              { ...task, attemptCount: task.attemptCount ?? 1 },
              "skipped",
              getCurrentProviderLabel(),
              now(),
              now()
            )
          )
        : skippedState);
    })().catch((error) => {
      logWarn("Failed to skip task:", getErrorMessage(error));
    });
  }

  private async processQueue(): Promise<void> {
    while (true) {
      const state = await loadState();
      const settings = await loadSettings();

      if (!state.isRunning || state.isPaused) {
        return;
      }

      const pendingTask = state.tasks.find((task) => task.status === "pending");
      if (!pendingTask) {
        await saveState({
          ...state,
          isRunning: false,
          isPaused: false,
          currentTaskId: undefined
        });
        return;
      }

      const provider = getCurrentProvider();
      if (!state.currentTaskId && detectProviderHardBusy(provider)) {
        try {
          const watcher = new ReplyWatcher({
            stableDelayMs: settings.stableDelayMs,
            maxWaitMs: settings.maxWaitMs
          });
          await watcher.waitUntilComplete();
          continue;
        } catch (error) {
          const latest = await loadState();
          await saveState({
            ...latest,
            isRunning: false,
            isPaused: true,
            currentTaskId: undefined,
            lastError: getErrorMessage(error)
          });
          return;
        }
      }

      const attemptStartedAt = now();
      const attemptCount = (pendingTask.attemptCount ?? 0) + 1;
      const runningTask: QueueTask = {
        ...pendingTask,
        status: "running",
        error: undefined,
        attemptCount,
        lastAttemptAt: attemptStartedAt,
        updatedAt: attemptStartedAt
      };
      const runningState: QueueState = {
        ...state,
        currentTaskId: pendingTask.id,
        isRunning: true,
        isPaused: false,
        lastError: undefined,
        tasks: updateTask(state.tasks, pendingTask.id, {
          status: "running",
          error: undefined,
          attemptCount,
          lastAttemptAt: attemptStartedAt
        })
      };

      await saveState(appendRunLogEntry(
        runningState,
        makeRunLogEntry(runningTask, "started", provider.label, attemptStartedAt)
      ));

      let sendStarted = false;
      try {
        try {
          const modelResult = await provider.selectModel(getProviderModelPreference(settings, provider.id));
          if (modelResult.warning) {
            const latest = await loadState();
            await saveState({
              ...latest,
              lastError: modelResult.warning
            });
          }
        } catch (modelError) {
          const latest = await loadState();
          await saveState({
            ...latest,
            lastError: `Model selection warning: ${getErrorMessage(modelError)}. Continuing with the current visible model.`
          });
        }

        await setComposerText(pendingTask.prompt);
        await clickSend();
        sendStarted = true;

        const watcher = new ReplyWatcher({
          stableDelayMs: settings.stableDelayMs,
          maxWaitMs: settings.maxWaitMs,
          requireStart: true
        });

        await watcher.waitUntilComplete();

        const completedState = await loadState();
        const currentTask = completedState.tasks.find((task) => task.id === pendingTask.id);
        const shouldMarkDone = currentTask?.status === "running";

        const nextState: QueueState = {
          ...completedState,
          currentTaskId: undefined,
          tasks: shouldMarkDone
            ? completedState.tasks.filter((task) => task.id !== pendingTask.id)
            : completedState.tasks
        };
        const loggedNextState = shouldMarkDone
          ? appendRunLogEntry(
              nextState,
              makeRunLogEntry(runningTask, "done", provider.label, attemptStartedAt, now())
            )
          : nextState;

        const pausedAfterCompletion = loggedNextState.isPaused;
        const hasMorePending = loggedNextState.tasks.some((task) => task.status === "pending");

        await saveState({
          ...loggedNextState,
          isRunning: loggedNextState.isPaused ? hasMorePending : !pausedAfterCompletion && hasMorePending,
          isPaused: loggedNextState.isPaused
        });

        if (pausedAfterCompletion) {
          return;
        }
      } catch (error) {
        const message = getErrorMessage(error);
        const failedState = await loadState();
        const failedTask = failedState.tasks.find((task) => task.id === pendingTask.id);
        const taskStillOwnsRun = failedState.currentTaskId === pendingTask.id && failedTask?.status === "running";

        if (!taskStillOwnsRun) {
          if (failedState.isRunning && !failedState.isPaused && failedState.tasks.some((task) => task.status === "pending")) {
            await saveState({
              ...failedState,
              currentTaskId: failedState.currentTaskId === pendingTask.id ? undefined : failedState.currentTaskId
            });
            continue;
          }
          return;
        }

        const failedRunningTask: QueueTask = {
          ...(failedTask ?? pendingTask),
          attemptCount,
          lastAttemptAt: attemptStartedAt
        };
        if (shouldAutoRetryTask(failedRunningTask, settings, sendStarted)) {
          const retryState = appendRunLogEntry(
            {
              ...failedState,
              isRunning: true,
              isPaused: false,
              currentTaskId: undefined,
              lastError: `${message} Retrying...`,
              tasks: updateTask(failedState.tasks, pendingTask.id, {
                status: "pending",
                error: message,
                attemptCount,
                lastAttemptAt: attemptStartedAt
              })
            },
            makeRunLogEntry(failedRunningTask, "retrying", provider.label, attemptStartedAt, now(), message)
          );

          await saveState(retryState);
          await delay(settings.retryDelayMs);
          continue;
        }

        await saveState({
          ...appendRunLogEntry(
            {
              ...failedState,
              isRunning: false,
              isPaused: true,
              currentTaskId: undefined,
              lastError: message,
              tasks: updateTask(failedState.tasks, pendingTask.id, {
                status: "failed",
                error: message,
                attemptCount,
                lastAttemptAt: attemptStartedAt
              })
            },
            makeRunLogEntry(failedRunningTask, "failed", provider.label, attemptStartedAt, now(), message)
          )
        });

        return;
      }
    }
  }
}
