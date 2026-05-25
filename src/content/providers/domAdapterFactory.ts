import { isHTMLElement, isVisible, uniqueElements } from "../../utils/dom";
import { delay, dispatchInputLikeEvents, waitFor } from "../../utils/events";
import { resolveModelSelectionTarget } from "../modelSettings";
import type { ProviderModelKey, ProviderModelPreference } from "../types";
import type { ModelSelectionResult, ProviderAdapter, ProviderGenerationSnapshot, ProviderId } from "./types";

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
  modelButtonSelectors: string[];
  modelOptionSelectors: string[];
  modelButtonWords: string[];
  modelOptionWords: string[];
  assistantSelectors: string[];
  generatingSelectors: string[];
  generatingWords: string[];
  pendingMediaSelectors: string[];
  pendingMediaWords: string[];
  composerError: string;
  sendError: string;
}

const HARD_BUSY_SELECTORS = ["[data-is-streaming='true']"];

function queryAll<T extends Element>(selector: string, root: ParentNode = document): T[] {
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

function querySelfAndDescendants<T extends Element>(selector: string, root: ParentNode = document): T[] {
  const descendants = queryAll<T>(selector, root);
  if (!(root instanceof Element)) {
    return descendants;
  }

  try {
    return root.matches(selector) ? [root as T, ...descendants] : descendants;
  } catch {
    return descendants;
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

function matchesAnySelector(element: Element, selectors: string[]): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}

function normalizedText(element: Element): string {
  return textHaystack(element).replace(/\s+/g, " ").trim();
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

function isComposerReadyElement(element: HTMLElement | null): boolean {
  if (!element || !isVisible(element)) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
    const ariaDisabled = element.getAttribute("aria-disabled");
    return ariaDisabled !== "true";
  }

  return false;
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

function scoreModelButton(button: HTMLButtonElement, config: DomProviderConfig): number {
  let score = 0;
  const haystack = textHaystack(button);

  if (config.modelButtonWords.some((word) => haystack.includes(word.toLowerCase()))) score += 45;
  if (haystack.includes("gpt") || haystack.includes("gemini") || haystack.includes("claude")) score += 24;
  if (haystack.includes("model")) score += 22;
  if (haystack.includes("pro") || haystack.includes("opus") || haystack.includes("sonnet")) score += 12;

  const rect = button.getBoundingClientRect();
  if (rect.top < window.innerHeight * 0.4) score += 8;
  if (rect.width > 40 && rect.width < 280) score += 6;

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

  function findComposerAnchor(): HTMLElement | null {
    const composer = findComposer();
    if (!composer) {
      return null;
    }

    const form = composer.closest("form");
    if (form instanceof HTMLElement && isVisible(form)) {
      return form;
    }

    let current = composer.parentElement;
    const composerRect = composer.getBoundingClientRect();
    for (let depth = 0; current && depth < 6; depth += 1) {
      if (isVisible(current)) {
        const rect = current.getBoundingClientRect();
        if (rect.width >= composerRect.width && rect.height >= composerRect.height) {
          return current;
        }
      }
      current = current.parentElement;
    }

    return composer;
  }

  function findStopButton(): HTMLButtonElement | null {
    const composer = findComposer();
    const anchor = findComposerAnchor();
    const composerForm = composer?.closest("form") ?? null;
    const assistantRoot = findLastAssistantContentRoot();
    const scopedButtons = uniqueElements([
      ...(anchor ? queryAll<HTMLButtonElement>("button", anchor) : []),
      ...(composerForm ? queryAll<HTMLButtonElement>("button", composerForm) : [])
    ]);
    const selectorButtons = config.stopButtonSelectors.flatMap((selector) => queryAll<HTMLButtonElement>(selector));
    const candidates = uniqueElements([...scopedButtons, ...selectorButtons])
      .filter(isEnabledButton)
      .filter((button) => includesAny(button, config.stopPositiveWords))
      .filter((button) => {
        const isNearComposer = Boolean(
          (anchor && anchor.contains(button)) ||
          (composerForm && composerForm.contains(button))
        );
        if (isNearComposer) {
          return true;
        }

        const isExplicitStop = matchesAnySelector(button, config.stopButtonSelectors);
        const assistantIsStreaming = Boolean(
          assistantRoot &&
          assistantRoot.contains(button) &&
          countStructuredBusyIndicators(assistantRoot) > 0
        );
        return (isExplicitStop && isInViewport(button) && button.getBoundingClientRect().top > window.innerHeight * 0.35) || assistantIsStreaming;
      });

    return candidates[0] ?? null;
  }

  function findModelButton(): HTMLButtonElement | null {
    const selectorButtons = config.modelButtonSelectors.flatMap((selector) => queryAll<HTMLButtonElement>(selector));
    const allButtons = queryAll<HTMLButtonElement>("button");
    const candidates = uniqueElements([...selectorButtons, ...allButtons])
      .filter(isEnabledButton)
      .filter((button) => scoreModelButton(button, config) >= 30);

    return candidates.sort((a, b) => scoreModelButton(b, config) - scoreModelButton(a, config))[0] ?? null;
  }

  function findModelOptions(): HTMLElement[] {
    const selectorOptions = config.modelOptionSelectors.flatMap((selector) => queryAll<HTMLElement>(selector));
    const roleOptions = queryAll<HTMLElement>("[role='menuitem'], [role='option'], [role='radio'], [role='button']");

    return uniqueElements([...selectorOptions, ...roleOptions])
      .filter((element) => isVisible(element))
      .filter((element) => {
        const text = normalizedText(element);
        if (text.length < 2 || text.length > 160) {
          return false;
        }
        return includesAny(element, config.modelOptionWords);
      });
  }

  function findMatchingModelOption(matchers: string[], allowFirstCredible: boolean): HTMLElement | null {
    const options = findModelOptions();
    for (const matcher of matchers) {
      const normalizedMatcher = matcher.toLowerCase().trim();
      const matched = options.find((option) => normalizedText(option).includes(normalizedMatcher));
      if (matched) {
        return matched;
      }
    }

    return allowFirstCredible ? options[0] ?? null : null;
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

  function findLastAssistantContentRoot(): HTMLElement | null {
    const selectorCandidates = config.assistantSelectors.flatMap((selector) => queryAll<HTMLElement>(selector));
    const genericCandidates = queryAll<HTMLElement>(
      "[data-message-author-role='assistant'], [data-testid*='assistant' i], article, [role='article']"
    );
    const candidates = uniqueElements([...selectorCandidates, ...genericCandidates])
      .filter((element) => isVisible(element))
      .filter((element) => normalizedText(element).length > 0 || element.querySelector("img, picture, video, canvas, svg"));

    return candidates[candidates.length - 1] ?? null;
  }

  function countGeneratingIndicators(): number {
    const selectorMatches = config.generatingSelectors.flatMap((selector) => queryAll<HTMLElement>(selector));
    const textMatches = queryAll<HTMLElement>(
      "[aria-label], [title], [data-testid], [data-test-id], [role='status'], [aria-live]"
    ).filter((element) => includesAny(element, config.generatingWords));

    return uniqueElements([...selectorMatches, ...textMatches])
      .filter((element) => isVisible(element))
      .length;
  }

  function countStructuredBusyIndicators(root: HTMLElement | null): number {
    const scope = root ?? findMainArea();
    const selectorMatches = HARD_BUSY_SELECTORS.flatMap((selector) =>
      querySelfAndDescendants<HTMLElement>(selector, scope)
    );

    return uniqueElements(selectorMatches)
      .filter((element) => isVisible(element))
      .length;
  }

  function hasPendingMediaGeneration(root: HTMLElement | null): boolean {
    if (!root) {
      return false;
    }

    const selectorMatches = config.pendingMediaSelectors.flatMap((selector) =>
      querySelfAndDescendants<HTMLElement>(selector, root)
    );

    return uniqueElements(selectorMatches)
      .some((element) => isVisible(element));
  }

  function getGenerationSnapshot(): ProviderGenerationSnapshot {
    const composer = findComposer();
    const sendButton = findSendButton();
    const stopButton = findStopButton();
    const assistantRoot = findLastAssistantContentRoot();
    const assistantText = assistantRoot?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    const mediaCount = assistantRoot?.querySelectorAll("img, picture, video, canvas, svg").length ?? 0;
    const structuredBusyIndicators = countStructuredBusyIndicators(assistantRoot);

    return {
      composerReady: isComposerReadyElement(composer),
      sendReady: Boolean(sendButton && isEnabledButton(sendButton)),
      stopButtonVisible: Boolean(stopButton),
      structuredBusyIndicators,
      generatingIndicators: countGeneratingIndicators(),
      pendingMedia: hasPendingMediaGeneration(assistantRoot),
      assistantSignature: `${assistantText.length}:${mediaCount}:${assistantRoot?.textContent?.length ?? 0}`,
      assistantTextLength: assistantText.length,
      assistantMediaCount: mediaCount
    };
  }

  async function selectModel(preference: ProviderModelPreference): Promise<ModelSelectionResult> {
    if (config.id !== "chatgpt" && config.id !== "gemini" && config.id !== "claude") {
      return { selected: false };
    }

    const target = resolveModelSelectionTarget(config.id as ProviderModelKey, preference);
    if (!target) {
      return { selected: false };
    }

    const button = findModelButton();
    if (!button) {
      return {
        selected: false,
        warning: `${config.label} model menu was not found. Continuing with the current visible model.`
      };
    }

    button.click();
    await delay(220);

    const option = await waitFor(
      () => findMatchingModelOption(target.matchers, target.allowFirstCredible),
      { timeoutMs: 1600, intervalMs: 100 }
    );

    if (!option) {
      return {
        selected: false,
        warning: `${config.label} model option "${target.label}" was not found. Continuing with the current visible model.`
      };
    }

    option.click();
    await delay(180);
    return { selected: true };
  }

  return {
    id: config.id,
    label: config.label,
    hostnames: config.hostnames,
    findComposer,
    findComposerAnchor,
    findSendButton,
    findStopButton,
    setComposerText,
    clickSend,
    clickStop,
    isGenerating: () => Boolean(findStopButton()),
    findMainArea,
    getGenerationSnapshot,
    selectModel
  };
}
