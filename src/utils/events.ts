export function dispatchInputLikeEvents(target: HTMLElement, value?: string): void {
  const eventInit: InputEventInit = {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: value
  };

  try {
    target.dispatchEvent(new InputEvent("beforeinput", eventInit));
  } catch {
    target.dispatchEvent(new Event("beforeinput", { bubbles: true, cancelable: true }));
  }

  target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
  target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: value ?? "" }));

  try {
    target.dispatchEvent(new InputEvent("input", eventInit));
  } catch {
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitFor<T>(
  callback: () => T | null,
  options: { timeoutMs: number; intervalMs?: number }
): Promise<T | null> {
  const startedAt = Date.now();
  const intervalMs = options.intervalMs ?? 100;

  while (Date.now() - startedAt < options.timeoutMs) {
    const value = callback();
    if (value) {
      return value;
    }
    await delay(intervalMs);
  }

  return callback();
}
