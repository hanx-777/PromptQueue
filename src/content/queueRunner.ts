import { clickSend, clickStop, setComposerText } from "./chatgptDom";
import { getCurrentProviderLabel } from "./providers";
import { ReplyWatcher } from "./replyWatcher";
import { loadSettings, loadState, saveState } from "./storage";
import type { QueueState, QueueTask } from "./types";
import { getErrorMessage } from "../utils/logger";

function now(): number {
  return Date.now();
}

function updateTask(tasks: QueueTask[], id: string, patch: Partial<QueueTask>): QueueTask[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...patch, updatedAt: now() } : task));
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
    })();
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

  async stopCurrent(): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.stopping = true;
    try {
      const stopped = await clickStop();
      const state = await loadState();
      if (!stopped) {
        await saveState({
          ...state,
          lastError: `Stop button was not found. ${getCurrentProviderLabel()} may not be generating right now.`
        });
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
        resultSummary: undefined
      }),
      lastError: undefined
    });

    const latest = await loadState();
    if (latest.isRunning && !latest.isPaused) {
      await this.runNext();
    }
  }

  skipTask(id: string): void {
    void (async () => {
      const state = await loadState();
      await saveState({
        ...state,
        tasks: updateTask(state.tasks, id, {
          status: "skipped",
          error: undefined
        }),
        currentTaskId: state.currentTaskId === id ? undefined : state.currentTaskId
      });
    })();
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

      const runningState: QueueState = {
        ...state,
        currentTaskId: pendingTask.id,
        isRunning: true,
        isPaused: false,
        lastError: undefined,
        tasks: updateTask(state.tasks, pendingTask.id, {
          status: "running",
          error: undefined
        })
      };

      await saveState(runningState);

      try {
        await setComposerText(pendingTask.prompt);
        await clickSend();

        const watcher = new ReplyWatcher({
          stableDelayMs: settings.stableDelayMs,
          maxWaitMs: settings.maxWaitMs
        });

        await watcher.waitUntilComplete();

        const completedState = await loadState();
        const currentTask = completedState.tasks.find((task) => task.id === pendingTask.id);
        const shouldMarkDone = currentTask?.status === "running";

        const nextState: QueueState = {
          ...completedState,
          currentTaskId: undefined,
          tasks: shouldMarkDone
            ? updateTask(completedState.tasks, pendingTask.id, { status: "done", error: undefined })
            : completedState.tasks
        };

        const latestSettings = await loadSettings();
        const pausedAfterCompletion = nextState.isPaused || !latestSettings.autoStartNext;
        const hasMorePending = nextState.tasks.some((task) => task.status === "pending");

        await saveState({
          ...nextState,
          isRunning: nextState.isPaused ? hasMorePending : !pausedAfterCompletion && hasMorePending,
          isPaused: nextState.isPaused
        });

        if (pausedAfterCompletion) {
          return;
        }
      } catch (error) {
        const message = getErrorMessage(error);
        const failedState = await loadState();

        await saveState({
          ...failedState,
          isRunning: false,
          isPaused: true,
          currentTaskId: undefined,
          lastError: message,
          tasks: updateTask(failedState.tasks, pendingTask.id, {
            status: "failed",
            error: message
          })
        });

        return;
      }
    }
  }
}
