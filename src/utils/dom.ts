export function isHTMLElement(value: Element | null | undefined): value is HTMLElement {
  return value instanceof HTMLElement;
}

export function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox"
  );
}

export function closestVisibleButton(element: Element | null): HTMLButtonElement | null {
  let current: Element | null = element;
  while (current) {
    if (current instanceof HTMLButtonElement && isVisible(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function uniqueElements<T extends Element>(elements: T[]): T[] {
  return Array.from(new Set(elements));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function previewPrompt(prompt: string, maxLen = 72): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}...` : normalized;
}

export function readEditableText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }

  if (element.isContentEditable || element.getAttribute("contenteditable") === "true" || element.getAttribute("role") === "textbox") {
    return element.innerText ?? element.textContent ?? "";
  }

  const nested = element.querySelector<HTMLElement>(
    "textarea, input, div[contenteditable='true'], [contenteditable='true'], [role='textbox']"
  );
  return nested ? readEditableText(nested) : "";
}
