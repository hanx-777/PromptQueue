import { isHTMLElement, isVisible, uniqueElements } from "../../utils/dom";
import { delay, dispatchInputLikeEvents, waitFor } from "../../utils/events";
import type { ProviderAdapter, ProviderId } from "./types";

interface DomProviderConfig {
  id: ProviderId;
  label: string;
  hostnames: string[];
  composerSelectors: string[];
  sendButtonSelectors: string[];
  stopButtonSelectors: string[];
  sendPositiveWords: string[];
  stopPositiveWords: string[];
  notSendWords: string[];
  mainSelectors: string[];
  composerError: string;
  sendError: string;
}

function queryAll<T extends Element>(selector: string, root: ParentNode = document): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

function textHaystack(element: Element): string {
  return [
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-testid"),
    element.getAttribute("data-test-id"),
    element.getAttribute("data-test"),
    ...Array.from(element.querySelectorAll("title")).map((title) => title.textContent)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(element: Element, words: string[]): boolean {
  const haystack = textHaystack(element);
  return words.some((word) => haystack.includes(word.toLowerCase()));
}

function isUsableComposer(element: HTMLElement): boolean {
  if (!isVisible(element)) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    return true;
  }

  const nested = element.querySelector<HTMLElement>(
    "textarea, div[contenteditable='true'], [contenteditable='true'], [role='textbox']"
  );
  return Boolean(nested && isVisible(nested));
}

function resolveComposerCandidate(element: HTMLElement): HTMLElement | null {
  if (
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true"
  ) {
    return isUsableComposer(element) ? element : null;
  }

  const nested = element.querySelector<HTMLElement>(
    "textarea, div[contenteditable='true'], [contenteditable='true'], [role='textbox']"
  );
  return nested && isUsableComposer(nested) ? nested : null;
}

function scoreComposer(element: HTMLElement): number {
  let score = 0;
  const testId = element.getAttribute("data-testid")?.toLowerCase() ?? "";
  const label = element.getAttribute("aria-label")?.toLowerCase() ?? "";
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const form = element.closest("form");

  if (form) score += 22;
  if (element instanceof HTMLTextAreaElement) score += 22;
  if (element.isContentEditable) score += 20;
  if (role === "textbox") score += 16;
  if (testId.includes("composer") || testId.includes("prompt") || testId.includes("input")) score += 30;
  if (label.includes("message") || label.includes("prompt") || label.includes("ask")) score += 14;

  const rect = element.getBoundingClientRect();
  if (rect.top > window.innerHeight * 0.35) score += 12;
  if (rect.width > 200) score += 8;
  if (rect.height > 16) score += 4;

  return score;
}

function isEnabledButton(button: HTMLButtonElement): boolean {
  return isVisible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true";
}

function scoreSendButton(button: HTMLButtonElement, composer: HTMLElement | null, config: DomProviderConfig): number {
  let score = 0;
  const haystack = textHaystack(button);

  if (config.sendPositiveWords.some((word) => haystack.includes(word.toLowerCase()))) score += 42;
  if (button.type === "submit") score += 22;
  if (button.closest("form")) score += 10;
  if (composer && button.closest("form") === composer.closest("form")) score += 34;
  if (config.notSendWords.some((word) => haystack.includes(word.toLowerCase()))) score -= 100;

  const rect = button.getBoundingClientRect();
  if (rect.top > window.innerHeight * 0.35) score += 8;

  return score;
}

function setTextareaValue(textarea: HTMLTextAreaElement, text: string, providerLabel: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) {
    throw new Error(`Unable to set ${providerLabel} textarea value because the native setter was not found.`);
  }
  setter.call(textarea, text);
  dispatchInputLikeEvents(textarea, text);
}

function setContentEditableValue(element: HTMLElement, text: string): void {
  const selection = window.getSelection();
  const range = document.createRange();

  element.textContent = text;
  range.selectNodeContents(element);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);

  dispatchInputLikeEvents(element, text);
}

async function focusComposer(composer: HTMLElement): Promise<void> {
  composer.focus();
  await delay(20);
}

export function createDomProvider(config: DomProviderConfig): ProviderAdapter {
  function findComposer(): HTMLElement | null {
    const candidates = uniqueElements(
      config.composerSelectors
        .flatMap((selector) => queryAll<HTMLElement>(selector))
        .map(resolveComposerCandidate)
        .filter((element): element is HTMLElement => Boolean(element))
    );

    return candidates.sort((a, b) => scoreComposer(b) - scoreComposer(a))[0] ?? null;
  }

  function findSendButton(): HTMLButtonElement | null {
    const composer = findComposer();
    const composerForm = composer?.closest("form") ?? null;
    const scopedButtons = composerForm ? queryAll<HTMLButtonElement>("button", composerForm) : [];
    const selectorButtons = config.sendButtonSelectors.flatMap((selector) => queryAll<HTMLButtonElement>(selector));
    const nearbyButtons: HTMLButtonElement[] = [];

    if (composer) {
      let current: HTMLElement | null = composer.parentElement;
      for (let depth = 0; current && depth < 6; depth += 1) {
        nearbyButtons.push(...queryAll<HTMLButtonElement>("button", current));
        current = current.parentElement;
      }
    }

    const explicitCandidates = uniqueElements(selectorButtons)
      .filter(isEnabledButton)
      .filter((button) => !includesAny(button, config.notSendWords));

    if (explicitCandidates.length) {
      return explicitCandidates.sort((a, b) => scoreSendButton(b, composer, config) - scoreSendButton(a, composer, config))[0] ?? null;
    }

    const fallbackCandidates = uniqueElements([...scopedButtons, ...nearbyButtons])
      .filter(isEnabledButton)
      .filter((button) => !includesAny(button, config.notSendWords))
      .filter((button) => button.type === "submit" || scoreSendButton(button, composer, config) >= 38);

    return fallbackCandidates.sort((a, b) => scoreSendButton(b, composer, config) - scoreSendButton(a, composer, config))[0] ?? null;
  }

  function findStopButton(): HTMLButtonElement | null {
    const selectorButtons = config.stopButtonSelectors.flatMap((selector) => queryAll<HTMLButtonElement>(selector));
    const allButtons = queryAll<HTMLButtonElement>("button");
    const candidates = uniqueElements([...selectorButtons, ...allButtons])
      .filter((button) => isVisible(button) && button.getAttribute("aria-disabled") !== "true")
      .filter((button) => includesAny(button, config.stopPositiveWords));

    return candidates[0] ?? null;
  }

  async function setComposerText(text: string): Promise<void> {
    const composer = findComposer();
    if (!composer) {
      throw new Error(config.composerError);
    }

    await focusComposer(composer);

    if (composer instanceof HTMLTextAreaElement) {
      setTextareaValue(composer, text, config.label);
      return;
    }

    if (composer.isContentEditable || composer.getAttribute("contenteditable") === "true" || composer.getAttribute("role") === "textbox") {
      setContentEditableValue(composer, text);
      return;
    }

    throw new Error(`${config.label} composer was found, but it is not a supported textarea or contenteditable element.`);
  }

  async function clickSend(): Promise<void> {
    const button = await waitFor(findSendButton, { timeoutMs: 2500, intervalMs: 100 });
    if (!button) {
      throw new Error(config.sendError);
    }

    button.click();
    await delay(100);
  }

  async function clickStop(): Promise<boolean> {
    const button = findStopButton();
    if (!button) {
      return false;
    }
    button.click();
    await delay(100);
    return true;
  }

  function findMainArea(): HTMLElement {
    const main = config.mainSelectors
      .map((selector) => document.querySelector(selector))
      .find(isHTMLElement);
    return main ?? document.body;
  }

  return {
    id: config.id,
    label: config.label,
    hostnames: config.hostnames,
    findComposer,
    findSendButton,
    findStopButton,
    setComposerText,
    clickSend,
    clickStop,
    isGenerating: () => Boolean(findStopButton()),
    findMainArea
  };
}
