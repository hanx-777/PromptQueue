import { getCurrentProvider, getCurrentProviderLabel, type ProviderAdapter, type ProviderGenerationSnapshot } from "./providers";

interface ReplyWatcherOptions {
  stableDelayMs: number;
  maxWaitMs: number;
  requireStart?: boolean;
  startTimeoutMs?: number;
}

function getSnapshot(provider: ProviderAdapter): ProviderGenerationSnapshot | null {
  try {
    return provider.getGenerationSnapshot();
  } catch {
    return null;
  }
}

export class ReplyWatcher {
  private readonly stableDelayMs: number;
  private readonly maxWaitMs: number;
  private readonly requireStart: boolean;
  private readonly startTimeoutMs: number;
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
  }

  waitUntilComplete(): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.lastMutationAt = Date.now();

    const provider = getCurrentProvider();
    const target = provider.findMainArea();
    const startedAt = Date.now();
    const initialSnapshot = getSnapshot(provider);
    let lastSignature = initialSnapshot?.assistantSignature ?? "";
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
          this.lastMutationAt = Date.now();
          if (this.requireStart) {
            sawReplyActivity = true;
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
        const signatureChanged = Boolean(snapshot?.assistantSignature && snapshot.assistantSignature !== lastSignature);
        const replyGrew = Boolean(
          initialSnapshot &&
          snapshot &&
          (
            snapshot.assistantTextLength > initialSnapshot.assistantTextLength ||
            snapshot.assistantMediaCount > initialSnapshot.assistantMediaCount
          )
        );
        const replyIsActive = stopButtonExists || structuredBusy || signatureChanged || replyGrew;

        if (signatureChanged && snapshot) {
          lastSignature = snapshot.assistantSignature;
          this.lastMutationAt = Date.now();
        }
        if (replyIsActive) {
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
