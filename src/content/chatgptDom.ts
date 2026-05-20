import { getCurrentProvider } from "./providers";

export function findComposer(): HTMLElement | null {
  return getCurrentProvider().findComposer();
}

export function findSendButton(): HTMLButtonElement | null {
  return getCurrentProvider().findSendButton();
}

export function findStopButton(): HTMLButtonElement | null {
  return getCurrentProvider().findStopButton();
}

export async function setComposerText(text: string): Promise<void> {
  await getCurrentProvider().setComposerText(text);
}

export async function clickSend(): Promise<void> {
  await getCurrentProvider().clickSend();
}

export async function clickStop(): Promise<boolean> {
  return getCurrentProvider().clickStop();
}

export function isGenerating(): boolean {
  return getCurrentProvider().isGenerating();
}

export function findChatMainArea(): HTMLElement {
  return getCurrentProvider().findMainArea();
}

export function findComposerFormForDiagnostics(): HTMLFormElement | null {
  return findComposer()?.closest("form") ?? null;
}
