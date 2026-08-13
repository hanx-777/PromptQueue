import { clickSend, clickStop, setComposerText } from "./chatgptDom";
import { getProviderModelPreference } from "./modelSettings";
import { detectProviderHardBusy, ensureProviderComposerReady, getProviderPreflightFailureStage } from "./providerRuntime";
import { getCurrentProvider, getCurrentProviderLabel, type ProviderAdapter } from "./providers";
import { ReplyWatcher } from "./replyWatcher";
import { loadSettings, loadState, saveState } from "./storage";
import type { QueueFailureStage, QueueRunLogEntry, QueueRunLogStatus, QueueSettings, QueueState, QueueTask } from "./types";
import { createId, previewPrompt } from "../utils/dom";
import { delay } from "../utils/events";
import { getErrorMessage, logWarn } from "../utils/logger";
import { appendRunLogEntry } from "../utils/runLog";

type QueueLoopSignal = "continue" | "stop";

interface AttemptProgress {
  sendStarted: boolean;
  runningStateSaved: boolean;
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_SEND_THRESHOLD = 15;
let recentSendTimestamps: number[] = [];

function now(): number {
  return Date.now();
}

function notifyQueueComplete(): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }
  try {
    chrome.runtime.sendMessage({
      type: "SHOW_NOTIFICATION",
      title: "PromptQueue",
      message: "Queue finished running."
    });
  } catch (error) {
    logWarn("Failed to send queue-complete notification:", getErrorMessage(error));
  }
}

/** Records a send and returns a soft warning message if recent sends look unusually fast. */
function recordSendAndCheckRateLimit(settings: QueueSettings): string | undefined {
  if (!settings.rateLimitWarningEnabled) {
    return undefined;
  }

  const nowMs = now();
  const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;
  recentSendTimestamps = [...recentSendTimestamps.filter((timestamp) => timestamp > cutoff), nowMs];

  if (recentSendTimestamps.length > RATE_LIMIT_SEND_THRESHOLD) {
    const windowMinutes = Math.round(RATE_LIMIT_WINDOW_MS / 60000);
    return `Sent ${recentSendTimestamps.length} messages in the last ${windowMinutes} minutes. This may trigger the provider's rate limits.`;
  }

  return undefined;
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
  error?: string,
  failureStage?: QueueFailureStage
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
    error,
    failureStage
  };
}

function getFailureStage(sendStarted: boolean, providerStage: QueueFailureStage | null): QueueFailureStage {
  if (sendStarted) {
    return "reply-timeout";
  }
  return providerStage ?? "pre-send-failed";
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

  /**
   * Waits out a reply already in progress on the page (e.g. started outside the
   * queue) before this runner claims a task. Returns whether the caller should
   * loop again ("continue") or stop processing entirely ("stop").
   */
  private async waitOutHardBusyProvider(settings: QueueSettings): Promise<QueueLoopSignal> {
    try {
      const watcher = new ReplyWatcher({
        stableDelayMs: settings.stableDelayMs,
        maxWaitMs: settings.maxWaitMs
      });
      await watcher.waitUntilComplete();
      return "continue";
    } catch (error) {
      const latest = await loadState();
      await saveState({
        ...latest,
        isRunning: false,
        isPaused: true,
        currentTaskId: undefined,
        lastError: getErrorMessage(error)
      });
      return "stop";
    }
  }

  private async selectModelWithWarning(provider: ProviderAdapter, settings: QueueSettings): Promise<void> {
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
  }

  /**
   * Best-effort, opt-in capture of the completed reply's visible text. Never
   * throws: capture failures should not fail an otherwise-successful task.
   */
  private captureReplyIfEnabled(provider: ProviderAdapter, settings: QueueSettings): string | undefined {
    if (!settings.captureReplies) {
      return undefined;
    }
    try {
      if (provider.findStopButton()) {
        // Still streaming somehow; skip rather than risk capturing a partial reply.
        return undefined;
      }
      return provider.getLastAssistantMessage()?.text || undefined;
    } catch (error) {
      logWarn("Failed to capture assistant reply:", getErrorMessage(error));
      return undefined;
    }
  }

  /**
   * Sends the pending task and waits for the reply to complete. Mutates
   * `progress` as each step succeeds so a caller catching a thrown error can
   * still see how far the attempt got (needed by handleAttemptFailure).
   */
  private async runAttempt(
    pendingTask: QueueTask,
    runningTask: QueueTask,
    provider: ProviderAdapter,
    settings: QueueSettings,
    attemptStartedAt: number,
    attemptCount: number,
    progress: AttemptProgress
  ): Promise<"paused" | "continue"> {
    await this.selectModelWithWarning(provider, settings);

    await setComposerText(pendingTask.prompt);
    await ensureProviderComposerReady(provider);

    const latestBeforeSend = await loadState();
    const runningState: QueueState = {
      ...latestBeforeSend,
      currentTaskId: pendingTask.id,
      isRunning: true,
      isPaused: false,
      tasks: updateTask(latestBeforeSend.tasks, pendingTask.id, {
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
    progress.runningStateSaved = true;

    await clickSend();
    progress.sendStarted = true;
    const rateLimitWarning = recordSendAndCheckRateLimit(settings);

    const watcher = new ReplyWatcher({
      stableDelayMs: settings.stableDelayMs,
      maxWaitMs: settings.maxWaitMs,
      requireStart: true
    });

    await watcher.waitUntilComplete();

    const capturedReply = this.captureReplyIfEnabled(provider, settings);

    const completedState = await loadState();
    const currentTask = completedState.tasks.find((task) => task.id === pendingTask.id);
    const shouldMarkDone = currentTask?.status === "running";

    const nextState: QueueState = {
      ...completedState,
      currentTaskId: undefined,
      ...(rateLimitWarning ? { rateLimitWarning } : {}),
      tasks: shouldMarkDone
        ? updateTask(completedState.tasks, pendingTask.id, {
            status: "done",
            error: undefined,
            resultSummary: capturedReply
          })
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

    return pausedAfterCompletion ? "paused" : "continue";
  }

  /**
   * Decides how to react to a failed attempt (retry, mark failed, or resume
   * the loop) and persists the outcome. Returns whether processQueue should
   * loop again ("continue") or stop ("stop").
   */
  private async handleAttemptFailure(
    error: unknown,
    pendingTask: QueueTask,
    provider: ProviderAdapter,
    settings: QueueSettings,
    attemptCount: number,
    attemptStartedAt: number,
    progress: AttemptProgress
  ): Promise<QueueLoopSignal> {
    const { sendStarted, runningStateSaved } = progress;
    const message = getErrorMessage(error);
    const failedState = await loadState();
    const failedTask = failedState.tasks.find((task) => task.id === pendingTask.id);
    const taskStillOwnsRun = runningStateSaved && failedState.currentTaskId === pendingTask.id && failedTask?.status === "running";
    const failureStage = getFailureStage(sendStarted, getProviderPreflightFailureStage(provider));

    if (!taskStillOwnsRun) {
      if (failedTask?.status === "pending") {
        const failedPendingTask: QueueTask = {
          ...failedTask,
          attemptCount,
          lastAttemptAt: attemptStartedAt
        };
        if (shouldAutoRetryTask(failedPendingTask, settings, sendStarted)) {
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
            makeRunLogEntry(failedPendingTask, "retrying", provider.label, attemptStartedAt, now(), message, failureStage)
          );

          await saveState(retryState);
          await delay(settings.retryDelayMs);
          return "continue";
        }

        await saveState(appendRunLogEntry(
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
          makeRunLogEntry(failedPendingTask, "failed", provider.label, attemptStartedAt, now(), message, failureStage)
        ));
        return "stop";
      }

      if (failedState.isRunning && !failedState.isPaused && failedState.tasks.some((task) => task.status === "pending")) {
        await saveState({
          ...failedState,
          currentTaskId: failedState.currentTaskId === pendingTask.id ? undefined : failedState.currentTaskId
        });
        return "continue";
      }
      return "stop";
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
        makeRunLogEntry(failedRunningTask, "retrying", provider.label, attemptStartedAt, now(), message, failureStage)
      );

      await saveState(retryState);
      await delay(settings.retryDelayMs);
      return "continue";
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
        makeRunLogEntry(failedRunningTask, "failed", provider.label, attemptStartedAt, now(), message, failureStage)
      )
    });

    return "stop";
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
        if (settings.notifyOnQueueComplete) {
          notifyQueueComplete();
        }
        return;
      }

      const provider = getCurrentProvider();
      if (!state.currentTaskId && detectProviderHardBusy(provider)) {
        const signal = await this.waitOutHardBusyProvider(settings);
        if (signal === "continue") {
          continue;
        }
        return;
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
      const progress: AttemptProgress = { sendStarted: false, runningStateSaved: false };

      try {
        const result = await this.runAttempt(pendingTask, runningTask, provider, settings, attemptStartedAt, attemptCount, progress);
        if (result === "paused") {
          return;
        }
      } catch (error) {
        const signal = await this.handleAttemptFailure(error, pendingTask, provider, settings, attemptCount, attemptStartedAt, progress);
        if (signal === "continue") {
          continue;
        }
        return;
      }
    }
  }
}
