export type ProviderId = "chatgpt" | "gemini" | "claude" | "unknown";

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  hostnames: string[];
  findComposer(): HTMLElement | null;
  findSendButton(): HTMLButtonElement | null;
  findStopButton(): HTMLButtonElement | null;
  setComposerText(text: string): Promise<void>;
  clickSend(): Promise<void>;
  clickStop(): Promise<boolean>;
  isGenerating(): boolean;
  findMainArea(): HTMLElement;
}
