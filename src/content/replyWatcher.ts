import { findChatMainArea, findStopButton } from "./chatgptDom";
import { getCurrentProviderLabel } from "./providers";

export class ReplyWatcher {
  private readonly stableDelayMs: number;
  private readonly maxWaitMs: number;
  private observer: MutationObserver | null = null;
  private intervalId: number | null = null;
  private timeoutId: number | null = null;
  private lastMutationAt = Date.now();
  private disposed = false;

  constructor(options: { stableDelayMs: number; maxWaitMs: number }) {
    this.stableDelayMs = Math.max(500, options.stableDelayMs);
    this.maxWaitMs = Math.max(5000, options.maxWaitMs);
  }

  waitUntilComplete(): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.lastMutationAt = Date.now();

    const target = findChatMainArea();

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

        const stopButtonExists = Boolean(findStopButton());
        const stableForMs = Date.now() - this.lastMutationAt;

        if (!stopButtonExists && stableForMs >= this.stableDelayMs) {
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
