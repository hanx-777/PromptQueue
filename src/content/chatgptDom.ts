import { closestVisibleButton, isHTMLElement, isVisible, uniqueElements } from "../utils/dom";
import { delay, dispatchInputLikeEvents, waitFor } from "../utils/events";

const COMPOSER_SELECTORS = [
  "form textarea",
  "form div[contenteditable='true']",
  "textarea",
  "div[contenteditable='true']",
  "[role='textbox']",
  "[data-testid*='composer' i] textarea",
  "[data-testid*='composer' i] div[contenteditable='true']",
  "[data-testid*='prompt' i] textarea",
  "[data-testid*='prompt' i] div[contenteditable='true']",
  "[data-testid*='composer' i]",
  "[data-testid*='prompt' i]"
];

const SEND_BUTTON_SELECTORS = [
  "button[aria-label*='send' i]",
  "button[data-testid*='send' i]",
  "form button[type='submit']",
  "[data-testid*='send' i] button"
];

const STOP_BUTTON_SELECTORS = [
  "button[aria-label*='stop' i]",
  "button[data-testid*='stop' i]",
  "[data-testid*='stop' i] button",
  "button[aria-label*='停止' i]",
  "button[data-testid*='停止' i]"
];

function queryAll<T extends Element>(selector: string, root: ParentNode = document): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
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

  const nested = element.querySelector<HTMLElement>("textarea, div[contenteditable='true'], [role='textbox']");
  return Boolean(nested && isVisible(nested));
}

function resolveComposerCandidate(element: HTMLElement): HTMLElement | null {
  if (element instanceof HTMLTextAreaElement || element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    return isUsableComposer(element) ? element : null;
  }

  const nested = element.querySelector<HTMLElement>(
    "textarea, div[contenteditable='true'], [role='textbox']"
  );
  return nested && isUsableComposer(nested) ? nested : null;
}

function scoreComposer(element: HTMLElement): number {
  let score = 0;
  const testId = element.getAttribute("data-testid")?.toLowerCase() ?? "";
  const label = element.getAttribute("aria-label")?.toLowerCase() ?? "";
  const form = element.closest("form");

  if (form) score += 25;
  if (element instanceof HTMLTextAreaElement) score += 20;
  if (element.isContentEditable) score += 20;
  if (testId.includes("composer") || testId.includes("prompt")) score += 30;
  if (label.includes("message") || label.includes("prompt")) score += 10;
  if (element.getAttribute("role") === "textbox") score += 10;

  const rect = element.getBoundingClientRect();
  if (rect.top > window.innerHeight * 0.45) score += 12;
  if (rect.width > 200) score += 8;

  return score;
}

function getComposerForm(): HTMLFormElement | null {
  const composer = findComposer();
  return composer?.closest("form") ?? null;
}

function isButtonCandidate(button: HTMLButtonElement): boolean {
  return isVisible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true";
}

function hasTextOrTitle(button: HTMLButtonElement, text: string): boolean {
  const haystack = [
    button.textContent,
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("data-testid"),
    ...Array.from(button.querySelectorAll("title")).map((title) => title.textContent)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(text.toLowerCase());
}

function isClearlyNotSendButton(button: HTMLButtonElement): boolean {
  return [
    "attach",
    "upload",
    "file",
    "voice",
    "microphone",
    "mic",
    "dictate",
    "tool",
    "search",
    "stop",
    "停止"
  ].some((word) => hasTextOrTitle(button, word));
}

function scoreSendButton(button: HTMLButtonElement, composer: HTMLElement | null): number {
  let score = 0;
  const label = button.getAttribute("aria-label")?.toLowerCase() ?? "";
  const testId = button.getAttribute("data-testid")?.toLowerCase() ?? "";
  const title = button.getAttribute("title")?.toLowerCase() ?? "";

  if (label.includes("send")) score += 40;
  if (testId.includes("send")) score += 40;
  if (title.includes("send")) score += 25;
  if (button.type === "submit") score += 20;
  if (button.closest("form")) score += 10;
  if (composer && button.closest("form") === composer.closest("form")) score += 35;
  if (isClearlyNotSendButton(button)) score -= 100;

  const rect = button.getBoundingClientRect();
  if (rect.top > window.innerHeight * 0.45) score += 8;

  return score;
}

export function findComposer(): HTMLElement | null {
  const candidates = uniqueElements(
    COMPOSER_SELECTORS.flatMap((selector) => queryAll<HTMLElement>(selector))
      .map(resolveComposerCandidate)
      .filter((element): element is HTMLElement => Boolean(element))
  );

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((a, b) => scoreComposer(b) - scoreComposer(a))[0] ?? null;
}

export function findSendButton(): HTMLButtonElement | null {
  const composer = findComposer();
  const composerForm = composer?.closest("form") ?? null;
  const scopedButtons = composerForm ? queryAll<HTMLButtonElement>("button", composerForm) : [];
  const selectorButtons = SEND_BUTTON_SELECTORS.flatMap((selector) => queryAll<HTMLButtonElement>(selector));

  const nearbyButtons: HTMLButtonElement[] = [];
  if (composer) {
    let current: HTMLElement | null = composer.parentElement;
    for (let depth = 0; current && depth < 5; depth += 1) {
      nearbyButtons.push(...queryAll<HTMLButtonElement>("button", current));
      current = current.parentElement;
    }
  }

  const explicitCandidates = uniqueElements(selectorButtons)
    .filter(isButtonCandidate)
    .filter((button) => !isClearlyNotSendButton(button));

  if (explicitCandidates.length) {
    return explicitCandidates.sort((a, b) => scoreSendButton(b, composer) - scoreSendButton(a, composer))[0] ?? null;
  }

  const fallbackCandidates = uniqueElements([...scopedButtons, ...nearbyButtons])
    .filter(isButtonCandidate)
    .filter((button) => !isClearlyNotSendButton(button))
    .filter((button) => button.type === "submit" || scoreSendButton(button, composer) >= 40);

  if (!fallbackCandidates.length) {
    return null;
  }

  return fallbackCandidates.sort((a, b) => scoreSendButton(b, composer) - scoreSendButton(a, composer))[0] ?? null;
}

export function findStopButton(): HTMLButtonElement | null {
  const selectorButtons = STOP_BUTTON_SELECTORS.flatMap((selector) => queryAll<HTMLButtonElement>(selector));
  const allButtons = queryAll<HTMLButtonElement>("button");
  const candidates = uniqueElements([...selectorButtons, ...allButtons])
    .filter((button) => isVisible(button) && button.getAttribute("aria-disabled") !== "true")
    .filter((button) => hasTextOrTitle(button, "stop") || hasTextOrTitle(button, "停止"));

  return candidates[0] ?? null;
}

async function focusComposer(composer: HTMLElement): Promise<void> {
  composer.focus();
  await delay(20);
}

function setTextareaValue(textarea: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) {
    throw new Error("Unable to set ChatGPT textarea value because the native setter was not found.");
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

export async function setComposerText(text: string): Promise<void> {
  const composer = findComposer();
  if (!composer) {
    throw new Error("ChatGPT composer was not found. Open a ChatGPT chat page and make sure the message box is visible.");
  }

  await focusComposer(composer);

  if (composer instanceof HTMLTextAreaElement) {
    setTextareaValue(composer, text);
    return;
  }

  if (composer.isContentEditable || composer.getAttribute("contenteditable") === "true") {
    setContentEditableValue(composer, text);
    return;
  }

  throw new Error("ChatGPT composer was found, but it is not a supported textarea or contenteditable element.");
}

export async function clickSend(): Promise<void> {
  const button = await waitFor(findSendButton, { timeoutMs: 2500, intervalMs: 100 });
  if (!button) {
    throw new Error("ChatGPT send button was not found or is disabled after filling the composer.");
  }

  button.click();
  await delay(100);
}

export async function clickStop(): Promise<boolean> {
  const button = findStopButton();
  if (!button) {
    return false;
  }
  button.click();
  await delay(100);
  return true;
}

export function isGenerating(): boolean {
  return Boolean(findStopButton());
}

export function findChatMainArea(): HTMLElement {
  const main = document.querySelector("main, [role='main']");
  return isHTMLElement(main) ? main : document.body;
}

export function findComposerFormForDiagnostics(): HTMLFormElement | null {
  return getComposerForm();
}
