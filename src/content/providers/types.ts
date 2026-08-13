import type { ProviderModelPreference } from "../types";

export type ProviderId = "chatgpt" | "gemini" | "claude" | "unknown";

export interface ModelSelectionResult {
  selected: boolean;
  warning?: string;
}

export interface ProviderGenerationSnapshot {
  composerReady: boolean;
  sendReady: boolean;
  stopButtonVisible: boolean;
  structuredBusyIndicators: number;
  generatingIndicators: number;
  pendingMedia: boolean;
  assistantSignature: string;
  assistantTextLength: number;
  assistantMediaCount: number;
  assistantMessageCount: number;
}

export interface AssistantMessage {
  text: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  hostnames: string[];
  findComposer(): HTMLElement | null;
  findComposerAnchor(): HTMLElement | null;
  findSendButton(): HTMLButtonElement | null;
  findStopButton(): HTMLButtonElement | null;
  setComposerText(text: string): Promise<void>;
  clickSend(): Promise<void>;
  clickStop(): Promise<boolean>;
  isGenerating(): boolean;
  findMainArea(): HTMLElement;
  getGenerationSnapshot(): ProviderGenerationSnapshot;
  selectModel(preference: ProviderModelPreference): Promise<ModelSelectionResult>;
  /** Best-effort read of the last assistant reply's visible text. Returns null if no reply is found. */
  getLastAssistantMessage(): AssistantMessage | null;
}
