import type { ProviderAdapter } from "./providers";
import type { ProviderHealthStatus, QueueFailureStage, QueueState } from "./types";
import { isEditableElement } from "../utils/dom";
import { waitFor } from "../utils/events";

export function hasActiveQueue(state: QueueState): boolean {
  return state.tasks.some((task) => task.status === "pending" || task.status === "running");
}

export function detectProviderHardBusy(provider: ProviderAdapter): boolean {
  try {
    const snapshot = provider.getGenerationSnapshot();
    return (
      provider.isGenerating() ||
      snapshot.stopButtonVisible ||
      snapshot.structuredBusyIndicators > 0
    );
  } catch {
    try {
      return provider.isGenerating();
    } catch {
      return false;
    }
  }
}

export function detectProviderSoftBusy(provider: ProviderAdapter): boolean {
  try {
    const snapshot = provider.getGenerationSnapshot();
    return (
      detectProviderHardBusy(provider) ||
      snapshot.generatingIndicators > 0 ||
      snapshot.pendingMedia
    );
  } catch {
    return detectProviderHardBusy(provider);
  }
}

export function detectProviderBusy(provider: ProviderAdapter): boolean {
  return detectProviderHardBusy(provider);
}

export function getProviderHealthStatus(provider: ProviderAdapter, checkedAt = Date.now()): ProviderHealthStatus {
  let composerFound = false;
  let sendButtonFound = false;
  let stopButtonFound = false;
  let pageBusy = false;

  try {
    composerFound = Boolean(provider.findComposer());
  } catch {
    composerFound = false;
  }

  try {
    sendButtonFound = Boolean(provider.findSendButton());
  } catch {
    sendButtonFound = false;
  }

  try {
    stopButtonFound = Boolean(provider.findStopButton());
  } catch {
    stopButtonFound = false;
  }

  try {
    pageBusy = detectProviderHardBusy(provider);
  } catch {
    pageBusy = false;
  }

  return {
    provider: provider.label,
    composerFound,
    sendButtonFound,
    stopButtonFound,
    pageBusy,
    checkedAt
  };
}

export function getProviderPreflightFailureStage(provider: ProviderAdapter): QueueFailureStage | null {
  const health = getProviderHealthStatus(provider);
  if (!health.composerFound) {
    return "composer-missing";
  }
  if (!health.sendButtonFound) {
    return "send-button-missing";
  }
  return null;
}

/** Waits for the composer/send button to be ready after filling text, throwing a descriptive error if they never appear. */
export async function ensureProviderComposerReady(provider: ProviderAdapter): Promise<void> {
  let preflightStage = getProviderPreflightFailureStage(provider);
  if (preflightStage === "send-button-missing") {
    await waitFor(
      () => getProviderPreflightFailureStage(provider) === "send-button-missing" ? null : true,
      { timeoutMs: 7000, intervalMs: 100 }
    );
    preflightStage = getProviderPreflightFailureStage(provider);
  }
  if (preflightStage) {
    throw new Error(preflightStage === "send-button-missing"
      ? `${provider.label} send button was not found or is disabled after filling the composer.`
      : `${provider.label} composer was not found.`);
  }
}

function containsNode(element: HTMLElement | null, target: Node): boolean {
  return Boolean(element && (element === target || element.contains(target)));
}

export function isEventInsideProviderComposer(event: Event, provider: ProviderAdapter): boolean {
  const target = event.target;
  if (!(target instanceof Node) || !isEditableElement(target)) {
    return false;
  }

  const composer = provider.findComposer();
  if (containsNode(composer, target)) {
    return true;
  }

  const anchor = provider.findComposerAnchor();
  return containsNode(anchor, target) && Boolean(composer && anchor?.contains(composer));
}

export function shouldQueueNativeEnter(event: KeyboardEvent, provider: ProviderAdapter, state: QueueState): boolean {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }

  return (
    isEventInsideProviderComposer(event, provider) &&
    (detectProviderHardBusy(provider) || state.isRunning || hasActiveQueue(state))
  );
}
