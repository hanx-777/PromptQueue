import type { ProviderAdapter } from "./providers";
import type { QueueState } from "./types";
import { isEditableElement } from "../utils/dom";

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
