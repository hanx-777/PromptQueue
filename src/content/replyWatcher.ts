import { getCurrentProvider, getCurrentProviderLabel } from "./providers";
import type { ProviderGenerationSnapshot } from "./providers";

const MIN_WAIT_AFTER_SEND_MS = 3000;
const LONG_REPLY_STABLE_DELAY_MS = 5000;
const MEDIA_STABLE_DELAY_MS = 8000;
const LONG_REPLY_TEXT_LENGTH = 2400;

export class ReplyWatcher {
  private readonly stableDelayMs: number;
  private readonly maxWaitMs: number;
  private observer: MutationObserver | null = null;
  private intervalId: number | null = null;
  private timeoutId: number | null = null;
  private lastMutationAt = Date.now();
  private lastAssistantChangeAt = Date.now();
  private startedAt = Date.now();
  private lastAssistantSignature = "";
  private sawAssistantMedia = false;
  private disposed = false;

  constructor(options: { stableDelayMs: number; maxWaitMs: number }) {
    this.stableDelayMs = Math.max(500, options.stableDelayMs);
    this.maxWaitMs = Math.max(5000, options.maxWaitMs);
  }

  waitUntilComplete(): Promise<void> {
    this.dispose();
    this.disposed = false;
    this.lastMutationAt = Date.now();
    this.lastAssistantChangeAt = Date.now();
    this.startedAt = Date.now();
    this.lastAssistantSignature = "";
    this.sawAssistantMedia = false;

    const provider = getCurrentProvider();
    const target = provider.findMainArea();

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

        const snapshot = provider.getGenerationSnapshot();
        const now = Date.now();
        this.sawAssistantMedia = this.sawAssistantMedia || snapshot.pendingMedia || snapshot.assistantMediaCount > 0;

        if (snapshot.assistantSignature !== this.lastAssistantSignature) {
          this.lastAssistantSignature = snapshot.assistantSignature;
          this.lastAssistantChangeAt = now;
        }

        if (this.isComplete(snapshot, now)) {
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

  private requiredStableDelay(snapshot: ProviderGenerationSnapshot): number {
    if (snapshot.pendingMedia || this.sawAssistantMedia || snapshot.assistantMediaCount > 0) {
      return Math.max(this.stableDelayMs, MEDIA_STABLE_DELAY_MS);
    }

    if (snapshot.assistantTextLength >= LONG_REPLY_TEXT_LENGTH) {
      return Math.max(this.stableDelayMs, LONG_REPLY_STABLE_DELAY_MS);
    }

    return this.stableDelayMs;
  }

  private isComplete(snapshot: ProviderGenerationSnapshot, now: number): boolean {
    if (now - this.startedAt < MIN_WAIT_AFTER_SEND_MS) {
      return false;
    }

    if (snapshot.stopButtonVisible || snapshot.generatingIndicators > 0 || snapshot.pendingMedia) {
      return false;
    }

    if (!snapshot.composerReady && !snapshot.sendReady) {
      return false;
    }

    const requiredStableDelay = this.requiredStableDelay(snapshot);
    const domStableForMs = now - this.lastMutationAt;
    const assistantStableForMs = now - this.lastAssistantChangeAt;

    return domStableForMs >= requiredStableDelay && assistantStableForMs >= requiredStableDelay;
  }
}
