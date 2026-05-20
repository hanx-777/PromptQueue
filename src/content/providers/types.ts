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
  generatingIndicators: number;
  pendingMedia: boolean;
  assistantSignature: string;
  assistantTextLength: number;
  assistantMediaCount: number;
}

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
  getGenerationSnapshot(): ProviderGenerationSnapshot;
  selectModel(preference: ProviderModelPreference): Promise<ModelSelectionResult>;
}
