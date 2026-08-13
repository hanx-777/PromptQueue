import { getCurrentProvider, getCurrentProviderLabel, type ProviderAdapter, type ProviderGenerationSnapshot } from "./providers";

interface ReplyWatcherOptions {
  stableDelayMs: number;
  maxWaitMs: number;
  requireStart?: boolean;
  startTimeoutMs?: number;
  baselineSnapshot?: ProviderGenerationSnapshot | null;
}

interface ObservedReplySnapshot {
  assistantSignature: string;
  assistantTextLength: number;
  assistantMediaCount: number;
  assistantMessageCount: number;
}

interface ReplySnapshotActivity {
  changedSinceLastPoll: boolean;
  grewFromBaseline: boolean;
  observedSnapshot: ObservedReplySnapshot;
}

function getSnapshot(provider: ProviderAdapter): ProviderGenerationSnapshot | null {
  try {
    return provider.getGenerationSnapshot();
  } catch {
    return null;
  }
}

function getObservedSnapshot(snapshot: ProviderGenerationSnapshot | null): ObservedReplySnapshot {
  return {
    assistantSignature: snapshot?.assistantSignature ?? "",
    assistantTextLength: snapshot?.assistantTextLength ?? 0,
    assistantMediaCount: snapshot?.assistantMediaCount ?? 0,
    assistantMessageCount: snapshot?.assistantMessageCount ?? 0
  };
}

export function evaluateReplySnapshotActivity(
  baseline: ProviderGenerationSnapshot | null,
  lastObserved: ObservedReplySnapshot,
  snapshot: ProviderGenerationSnapshot | null
): ReplySnapshotActivity {
  const observedSnapshot = getObservedSnapshot(snapshot);
  const changedSinceLastPoll = Boolean(
    snapshot &&
    (
      observedSnapshot.assistantSignature !== lastObserved.assistantSignature ||
      observedSnapshot.assistantTextLength !== lastObserved.assistantTextLength ||
      observedSnapshot.assistantMediaCount !== lastObserved.assistantMediaCount ||
      observedSnapshot.assistantMessageCount !== lastObserved.assistantMessageCount
    )
  );
  const grewFromBaseline = Boolean(
    baseline &&
    snapshot &&
    (
      snapshot.assistantTextLength > baseline.assistantTextLength ||
      snapshot.assistantMediaCount > baseline.assistantMediaCount ||
      snapshot.assistantMessageCount > baseline.assistantMessageCount
    )
  );

  return {
    changedSinceLastPoll,
    grewFromBaseline,
    observedSnapshot
  };
}

export class ReplyWatcher {
  private readonly stableDelayMs: number;
  private readonly maxWaitMs: number;
  private readonly requireStart: boolean;
  private readonly startTimeoutMs: number;
  private readonly baselineSnapshot: ProviderGenerationSnapshot | null | undefined;
  private observer: MutationObserver | null = null;
  private intervalId: number | null = null;
  private timeoutId: number | null = null;
  private lastMutationAt = Date.now();
  private disposed = false;

  constructor(options: ReplyWatcherOptions) {
    this.stableDelayMs = Math.max(500, options.stableDelayMs);
    this.maxWaitMs = Math.max(5000, options.maxWaitMs);
    this.requireStart = Boolean(options.requireStart);
    this.startTimeoutMs = Math.max(1500, Math.min(options.startTimeoutMs ?? 20000, this.maxWaitMs - 500));
    this.baselineSnapshot = options.baselineSnapshot;
  }

  waitUntilComplete(): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.lastMutationAt = Date.now();

    const provider = getCurrentProvider();
    const target = provider.findMainArea();
    const startedAt = Date.now();
    const initialSnapshot = this.baselineSnapshot ?? getSnapshot(provider);
    let lastObservedSnapshot = getObservedSnapshot(initialSnapshot);
    let sawReplyActivity = !this.requireStart;

    return new Promise((resolve, reject) => {
      const cleanupResolve = (): void => {
        this.dispose();
        resolve();
      };

      const cleanupReject = (error: Error): void => {
        this.dispose();
        reject(error);
      };

      this.observer = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "characterData")) {
          if (!sawReplyActivity) {
            this.lastMutationAt = Date.now();
          }
        }
      });

      this.observer.observe(target, {
        childList: true,
        characterData: true,
        subtree: true
      });

      this.intervalId = window.setInterval(() => {
        if (this.disposed) {
          return;
        }

        const snapshot = getSnapshot(provider);
        const stopButtonExists = Boolean(provider.findStopButton());
        const structuredBusy = (snapshot?.structuredBusyIndicators ?? 0) > 0;
        const snapshotActivity = evaluateReplySnapshotActivity(initialSnapshot, lastObservedSnapshot, snapshot);
        const replyIsActive = stopButtonExists || structuredBusy || snapshotActivity.changedSinceLastPoll || snapshotActivity.grewFromBaseline;

        if (snapshotActivity.changedSinceLastPoll) {
          lastObservedSnapshot = snapshotActivity.observedSnapshot;
          this.lastMutationAt = Date.now();
        }
        if (stopButtonExists || structuredBusy) {
          sawReplyActivity = true;
          this.lastMutationAt = Date.now();
        } else if (replyIsActive) {
          sawReplyActivity = true;
        }

        if (!sawReplyActivity) {
          if (Date.now() - startedAt >= this.startTimeoutMs) {
            cleanupReject(new Error(`Timed out waiting for ${getCurrentProviderLabel()} reply to start after ${Math.round(this.startTimeoutMs / 1000)} seconds.`));
          }
          return;
        }

        const stableForMs = Date.now() - this.lastMutationAt;

        if (!stopButtonExists && !structuredBusy && stableForMs >= this.stableDelayMs) {
          cleanupResolve();
        }
      }, 250);

      this.timeoutId = window.setTimeout(() => {
        cleanupReject(new Error(`Timed out waiting for ${getCurrentProviderLabel()} reply after ${Math.round(this.maxWaitMs / 1000)} seconds.`));
      }, this.maxWaitMs);
    });
  }

  dispose(): void {
    this.disposed = true;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
